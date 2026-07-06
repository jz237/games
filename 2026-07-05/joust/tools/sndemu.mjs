#!/usr/bin/env node
// sndemu.mjs — Cycle-accurate Motorola 6800 emulator + Williams S4 sound board
// renderer for the original Joust sound effects.
//
// Renders the ORIGINAL Joust sound ROM (tools/vsndrm4.bin) to WAV files.
// No external dependencies: implements its own WAV writer and a minimal PNG
// writer (using Node's built-in zlib) for the waveform contact sheet.
//
// Authorized: site owner directed shipping the original Joust sounds; we have
// the sound-ROM source (notes/joust-src/VSNDRM4.ASM) and the binary was
// assembled from it with the open-source AS assembler.
//
// Usage:  node tools/sndemu.mjs         (runs self-tests + renders all sounds)
//         node tools/sndemu.mjs --test  (runs only the CPU/ROM self-tests)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
//  Hardware constants
// ============================================================================
const CPU_HZ = 3579545 / 4;      // 894886.25 Hz
const SAMPLE_RATE = 44100;
const FRAME_HZ = 60;             // 1/60 s frames for length caps
const HARD_CAP_SEC = 6;          // absolute safety cap

// Memory map addresses
const RAM_LO = 0x0000, RAM_HI = 0x007F;        // 128 bytes RAM (zero page + stack)
const PIA_BASE = 0x0400, PIA_END = 0x0403;     // MC6821 PIA
const ROM_BASE = 0xF000, ROM_END = 0xFFFF;     // 4096-byte ROM

// ============================================================================
//  CC (condition code) register bit layout for the 6800:
//    bit0 = C (carry)
//    bit1 = V (overflow)
//    bit2 = Z (zero)
//    bit3 = N (negative)
//    bit4 = I (interrupt mask)
//    bit5 = H (half carry)
//    bits 6,7 = always 1
// ============================================================================
const FC = 0x01, FV = 0x02, FZ = 0x04, FN = 0x08, FI = 0x10, FH = 0x20;

// ============================================================================
//  The 6800 CPU core
// ============================================================================
class CPU6800 {
  constructor(bus) {
    this.bus = bus;            // { read(addr), write(addr,val) }
    this.A = 0; this.B = 0;
    this.X = 0;
    this.SP = 0;
    this.PC = 0;
    this.CC = 0xC0 | FI;       // bits 6,7 set; start with I set
    this.cycles = 0;
    this.irqLine = false;      // external IRQ request level
    this.halted = false;       // WAI executed (waiting for interrupt)
    this.illegalOp = null;     // set to opcode if an undefined opcode is hit
  }

  // --- memory helpers ---
  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  rd16(a) { return (this.rd(a) << 8) | this.rd((a + 1) & 0xFFFF); }

  // --- flag helpers ---
  setNZ8(v) {
    v &= 0xFF;
    if (v & 0x80) this.CC |= FN; else this.CC &= ~FN;
    if (v === 0) this.CC |= FZ; else this.CC &= ~FZ;
  }
  setNZ16(v) {
    v &= 0xFFFF;
    if (v & 0x8000) this.CC |= FN; else this.CC &= ~FN;
    if (v === 0) this.CC |= FZ; else this.CC &= ~FZ;
  }
  setC(c) { if (c) this.CC |= FC; else this.CC &= ~FC; }
  setV(v) { if (v) this.CC |= FV; else this.CC &= ~FV; }
  setH(h) { if (h) this.CC |= FH; else this.CC &= ~FH; }
  getC() { return (this.CC & FC) ? 1 : 0; }

  // --- reset ---
  reset() {
    this.PC = this.rd16(0xFFFE);
    this.CC |= FI;
    this.cycles = 0;
  }

  // --- stack push/pull (SP points at next free; push writes then decrements) ---
  push8(v) { this.wr(this.SP, v); this.SP = (this.SP - 1) & 0xFFFF; }
  pull8() { this.SP = (this.SP + 1) & 0xFFFF; return this.rd(this.SP); }

  // ---- addressing-mode operand fetch ----
  // Immediate byte
  imm8() { const v = this.rd(this.PC); this.PC = (this.PC + 1) & 0xFFFF; return v; }
  imm16() { const v = this.rd16(this.PC); this.PC = (this.PC + 2) & 0xFFFF; return v; }
  // Direct (zero page) address
  dir() { return this.imm8(); }
  // Extended address
  ext() { return this.imm16(); }
  // Indexed address = X + unsigned offset byte
  idx() { const off = this.imm8(); return (this.X + off) & 0xFFFF; }
  // Relative branch target
  rel() { let off = this.imm8(); if (off & 0x80) off -= 0x100; return (this.PC + off) & 0xFFFF; }

  // ---- ALU operations (set flags like the 6800) ----
  add8(a, b, carryIn) {
    const r = a + b + carryIn;
    const r8 = r & 0xFF;
    this.setNZ8(r8);
    this.setC(r > 0xFF);
    // half carry from bit3->bit4
    this.setH(((a & 0xF) + (b & 0xF) + carryIn) > 0xF);
    // overflow
    this.setV((~(a ^ b) & (a ^ r8) & 0x80) !== 0);
    return r8;
  }
  sub8(a, b, borrowIn) {
    const r = a - b - borrowIn;
    const r8 = r & 0xFF;
    this.setNZ8(r8);
    this.setC(r < 0);                 // carry = borrow
    this.setV(((a ^ b) & (a ^ r8) & 0x80) !== 0);
    return r8;
  }
  // Compare: like sub but discard result
  cmp8(a, b) { this.sub8(a, b, 0); }
  // logical AND/OR/EOR set N,Z, clear V
  logic8(v) { v &= 0xFF; this.setNZ8(v); this.setV(false); return v; }

  // ---- read-modify-write helpers for memory/accumulator operands ----
  op_inc(v) { v = (v + 1) & 0xFF; this.setNZ8(v); this.setV(v === 0x80); return v; }
  op_dec(v) { const ov = v & 0xFF; v = (v - 1) & 0xFF; this.setNZ8(v); this.setV(ov === 0x80); return v; }
  op_com(v) { v = (~v) & 0xFF; this.setNZ8(v); this.setV(false); this.setC(true); return v; }
  op_neg(v) { const r = (0 - (v & 0xFF)) & 0xFF; this.setNZ8(r); this.setV((v & 0xFF) === 0x80); this.setC((v & 0xFF) !== 0); return r; }
  op_clr() { this.setNZ8(0); this.setV(false); this.setC(false); return 0; }
  op_tst(v) { v &= 0xFF; this.setNZ8(v); this.setV(false); this.setC(false); }
  op_asl(v) { const c = (v & 0x80) ? 1 : 0; const r = (v << 1) & 0xFF; this.setNZ8(r); this.setC(c); this.setV(((r & 0x80) >> 7) ^ c); return r; }
  op_lsr(v) { const c = v & 1; const r = (v >> 1) & 0xFF; this.setNZ8(r); this.setC(c); this.setV(((r & 0x80) >> 7) ^ c); return r; }
  op_asr(v) { const c = v & 1; const r = ((v >> 1) | (v & 0x80)) & 0xFF; this.setNZ8(r); this.setC(c); this.setV(((r & 0x80) >> 7) ^ c); return r; }
  op_rol(v) { const cin = this.getC(); const c = (v & 0x80) ? 1 : 0; const r = ((v << 1) | cin) & 0xFF; this.setNZ8(r); this.setC(c); this.setV(((r & 0x80) >> 7) ^ c); return r; }
  op_ror(v) { const cin = this.getC(); const c = v & 1; const r = ((v >> 1) | (cin << 7)) & 0xFF; this.setNZ8(r); this.setC(c); this.setV(((r & 0x80) >> 7) ^ c); return r; }

  // DAA — decimal adjust A after add
  daa() {
    let a = this.A;
    const lo = a & 0x0F;
    const hi = (a >> 4) & 0x0F;
    let correction = 0;
    const c = this.getC();
    const h = (this.CC & FH) ? 1 : 0;
    // low nibble
    if (h || lo > 9) correction |= 0x06;
    // high nibble
    if (c || hi > 9 || (hi >= 9 && lo > 9)) { correction |= 0x60; }
    const r = a + correction;
    if (r > 0xFF || c) this.setC(true); else this.setC(false);
    const r8 = r & 0xFF;
    this.setNZ8(r8);
    // V undefined on 6800; leave as-is-ish (commonly computed). We compute standard.
    this.A = r8;
  }

  // ---- interrupt handling ----
  serviceIRQ() {
    // Push machine state: PCL, PCH, XL, XH, A, B, CC
    this.push8(this.PC & 0xFF);
    this.push8((this.PC >> 8) & 0xFF);
    this.push8(this.X & 0xFF);
    this.push8((this.X >> 8) & 0xFF);
    this.push8(this.A);
    this.push8(this.B);
    this.push8(this.CC);
    this.CC |= FI;
    this.PC = this.rd16(0xFFF8);
    this.cycles += 12;   // interrupt sequence takes 12 cycles on the 6800
    this.halted = false;
  }

  rti() {
    this.CC = this.pull8() | 0xC0;      // bits 6,7 always read as 1
    this.B = this.pull8();
    this.A = this.pull8();
    const xh = this.pull8();
    const xl = this.pull8();
    this.X = ((xh << 8) | xl) & 0xFFFF;
    const pch = this.pull8();
    const pcl = this.pull8();
    this.PC = ((pch << 8) | pcl) & 0xFFFF;
    this.cycles += 10;
  }

  // Check & take an IRQ if line asserted and I clear
  maybeIRQ() {
    if (this.irqLine && !(this.CC & FI)) {
      this.serviceIRQ();
      return true;
    }
    return false;
  }

  // ---- single instruction step ----
  step() {
    // Interrupt check happens before instruction fetch
    if (this.maybeIRQ()) return;
    if (this.halted) { this.cycles += 1; return; } // WAI idle burns cycles until IRQ

    const op = this.imm8();
    const c = CYCLES[op];
    if (c === undefined) {
      this.illegalOp = op;
      // Treat as NOP-ish but flag it; advance to avoid infinite loop
      this.cycles += 2;
      return;
    }
    this.cycles += c;
    this.exec(op);
  }

  // Big opcode dispatch
  exec(op) {
    const A = 'A', B = 'B';
    switch (op) {
      // ---- NOP / flag ops ----
      case 0x01: break;                                   // NOP
      case 0x06: this.CC = (this.A & 0x3F) | 0xC0; break; // TAP: A -> CC (bits 6,7 forced to 1)
      case 0x07: this.A = (this.CC & 0xFF) | 0xC0; break; // TPA: CC -> A (bits 6,7 read as 1)
      case 0x08: this.X = (this.X + 1) & 0xFFFF; this.setV(false); if (this.X === 0) this.CC |= FZ; else this.CC &= ~FZ; break; // INX
      case 0x09: this.X = (this.X - 1) & 0xFFFF; if (this.X === 0) this.CC |= FZ; else this.CC &= ~FZ; break; // DEX (Z only)
      case 0x0A: this.CC &= ~FV; break;                   // CLV
      case 0x0B: this.CC |= FV; break;                    // SEV
      case 0x0C: this.CC &= ~FC; break;                   // CLC
      case 0x0D: this.CC |= FC; break;                    // SEC
      case 0x0E: this.CC &= ~FI; break;                   // CLI
      case 0x0F: this.CC |= FI; break;                    // SEI
      case 0x10: this.A = this.sub8(this.A, this.B, 0); break; // SBA: A <- A - B
      case 0x11: this.cmp8(this.A, this.B); break;             // CBA
      case 0x16: this.B = this.A; this.setNZ8(this.B); this.setV(false); break; // TAB
      case 0x17: this.A = this.B; this.setNZ8(this.A); this.setV(false); break; // TBA
      case 0x19: this.daa(); break;                       // DAA
      case 0x1B: this.A = this.add8(this.A, this.B, 0); break; // ABA

      // ---- branches ----
      case 0x20: this.PC = this.rel(); break;             // BRA
      case 0x22: { const t = this.rel(); if (!((this.CC & FC) || (this.CC & FZ))) this.PC = t; break; } // BHI
      case 0x23: { const t = this.rel(); if ((this.CC & FC) || (this.CC & FZ)) this.PC = t; break; }    // BLS
      case 0x24: { const t = this.rel(); if (!(this.CC & FC)) this.PC = t; break; }                     // BCC/BHS
      case 0x25: { const t = this.rel(); if (this.CC & FC) this.PC = t; break; }                        // BCS/BLO
      case 0x26: { const t = this.rel(); if (!(this.CC & FZ)) this.PC = t; break; }                     // BNE
      case 0x27: { const t = this.rel(); if (this.CC & FZ) this.PC = t; break; }                        // BEQ
      case 0x28: { const t = this.rel(); if (!(this.CC & FV)) this.PC = t; break; }                     // BVC
      case 0x29: { const t = this.rel(); if (this.CC & FV) this.PC = t; break; }                        // BVS
      case 0x2A: { const t = this.rel(); if (!(this.CC & FN)) this.PC = t; break; }                     // BPL
      case 0x2B: { const t = this.rel(); if (this.CC & FN) this.PC = t; break; }                        // BMI
      case 0x2C: { const t = this.rel(); const n = (this.CC & FN) ? 1 : 0, v = (this.CC & FV) ? 1 : 0; if ((n ^ v) === 0) this.PC = t; break; } // BGE
      case 0x2D: { const t = this.rel(); const n = (this.CC & FN) ? 1 : 0, v = (this.CC & FV) ? 1 : 0; if ((n ^ v) === 1) this.PC = t; break; } // BLT
      case 0x2E: { const t = this.rel(); const n = (this.CC & FN) ? 1 : 0, v = (this.CC & FV) ? 1 : 0, z = (this.CC & FZ) ? 1 : 0; if ((z | (n ^ v)) === 0) this.PC = t; break; } // BGT
      case 0x2F: { const t = this.rel(); const n = (this.CC & FN) ? 1 : 0, v = (this.CC & FV) ? 1 : 0, z = (this.CC & FZ) ? 1 : 0; if ((z | (n ^ v)) === 1) this.PC = t; break; } // BLE
      case 0x8D: { const t = this.rel(); this.push8(this.PC & 0xFF); this.push8((this.PC >> 8) & 0xFF); this.PC = t; break; } // BSR

      // ---- stack / index transfers ----
      case 0x30: this.X = (this.SP + 1) & 0xFFFF; break;  // TSX  (X = SP+1)
      case 0x31: this.SP = (this.SP + 1) & 0xFFFF; break; // INS  (SP = SP+1)
      case 0x32: this.A = this.pull8(); break;            // PULA
      case 0x33: this.B = this.pull8(); break;            // PULB
      case 0x34: this.SP = (this.SP - 1) & 0xFFFF; break; // DES  (SP = SP-1)
      case 0x35: this.SP = (this.X - 1) & 0xFFFF; break;  // TXS  (SP = X-1)
      case 0x36: this.push8(this.A); break;               // PSHA
      case 0x37: this.push8(this.B); break;               // PSHB
      case 0x39: { const pch = this.pull8(); const pcl = this.pull8(); this.PC = ((pch << 8) | pcl) & 0xFFFF; break; } // RTS
      case 0x3B: this.rti(); break;                       // RTI
      case 0x3E: this.halted = true; break;               // WAI (push state? handled at IRQ)
      case 0x3F: /* SWI */ { this.push8(this.PC & 0xFF); this.push8((this.PC >> 8) & 0xFF); this.push8(this.X & 0xFF); this.push8((this.X >> 8) & 0xFF); this.push8(this.A); this.push8(this.B); this.push8(this.CC); this.CC |= FI; this.PC = this.rd16(0xFFFA); break; }

      // ---- accumulator A single-operand ----
      case 0x40: this.A = this.op_neg(this.A); break;     // NEGA
      case 0x43: this.A = this.op_com(this.A); break;     // COMA
      case 0x44: this.A = this.op_lsr(this.A); break;     // LSRA
      case 0x46: this.A = this.op_ror(this.A); break;     // RORA
      case 0x47: this.A = this.op_asr(this.A); break;     // ASRA
      case 0x48: this.A = this.op_asl(this.A); break;     // ASLA
      case 0x49: this.A = this.op_rol(this.A); break;     // ROLA
      case 0x4A: this.A = this.op_dec(this.A); break;     // DECA
      case 0x4C: this.A = this.op_inc(this.A); break;     // INCA
      case 0x4D: this.op_tst(this.A); break;              // TSTA
      case 0x4F: this.A = this.op_clr(); break;           // CLRA
      // ---- accumulator B single-operand ----
      case 0x50: this.B = this.op_neg(this.B); break;     // NEGB
      case 0x53: this.B = this.op_com(this.B); break;     // COMB
      case 0x54: this.B = this.op_lsr(this.B); break;     // LSRB
      case 0x56: this.B = this.op_ror(this.B); break;     // RORB
      case 0x57: this.B = this.op_asr(this.B); break;     // ASRB
      case 0x58: this.B = this.op_asl(this.B); break;     // ASLB
      case 0x59: this.B = this.op_rol(this.B); break;     // ROLB
      case 0x5A: this.B = this.op_dec(this.B); break;     // DECB
      case 0x5C: this.B = this.op_inc(this.B); break;     // INCB
      case 0x5D: this.op_tst(this.B); break;              // TSTB
      case 0x5F: this.B = this.op_clr(); break;           // CLRB

      // ---- indexed single-operand RMW (0x6x) ----
      case 0x60: { const a = this.idx(); this.wr(a, this.op_neg(this.rd(a))); break; } // NEG idx
      case 0x63: { const a = this.idx(); this.wr(a, this.op_com(this.rd(a))); break; } // COM idx
      case 0x64: { const a = this.idx(); this.wr(a, this.op_lsr(this.rd(a))); break; } // LSR idx
      case 0x66: { const a = this.idx(); this.wr(a, this.op_ror(this.rd(a))); break; } // ROR idx
      case 0x67: { const a = this.idx(); this.wr(a, this.op_asr(this.rd(a))); break; } // ASR idx
      case 0x68: { const a = this.idx(); this.wr(a, this.op_asl(this.rd(a))); break; } // ASL idx
      case 0x69: { const a = this.idx(); this.wr(a, this.op_rol(this.rd(a))); break; } // ROL idx
      case 0x6A: { const a = this.idx(); this.wr(a, this.op_dec(this.rd(a))); break; } // DEC idx
      case 0x6C: { const a = this.idx(); this.wr(a, this.op_inc(this.rd(a))); break; } // INC idx
      case 0x6D: { const a = this.idx(); this.op_tst(this.rd(a)); break; }             // TST idx
      case 0x6E: { const a = this.idx(); this.PC = a; break; }                         // JMP idx: PC = X + offset (direct, NOT indirect)
      case 0x6F: { const a = this.idx(); this.wr(a, this.op_clr()); break; }           // CLR idx

      // ---- extended single-operand RMW (0x7x) ----
      case 0x70: { const a = this.ext(); this.wr(a, this.op_neg(this.rd(a))); break; } // NEG ext
      case 0x73: { const a = this.ext(); this.wr(a, this.op_com(this.rd(a))); break; } // COM ext
      case 0x74: { const a = this.ext(); this.wr(a, this.op_lsr(this.rd(a))); break; } // LSR ext
      case 0x76: { const a = this.ext(); this.wr(a, this.op_ror(this.rd(a))); break; } // ROR ext
      case 0x77: { const a = this.ext(); this.wr(a, this.op_asr(this.rd(a))); break; } // ASR ext
      case 0x78: { const a = this.ext(); this.wr(a, this.op_asl(this.rd(a))); break; } // ASL ext
      case 0x79: { const a = this.ext(); this.wr(a, this.op_rol(this.rd(a))); break; } // ROL ext
      case 0x7A: { const a = this.ext(); this.wr(a, this.op_dec(this.rd(a))); break; } // DEC ext
      case 0x7C: { const a = this.ext(); this.wr(a, this.op_inc(this.rd(a))); break; } // INC ext
      case 0x7D: { const a = this.ext(); this.op_tst(this.rd(a)); break; }             // TST ext
      case 0x7E: { const a = this.ext(); this.PC = a; break; }                         // JMP ext
      case 0x7F: { const a = this.ext(); this.wr(a, this.op_clr()); break; }           // CLR ext

      // ---- JMP/JSR indexed(0x6E handled), ext JSR ----
      // NOTE: $9D is the UNDOCUMENTED but functional 6800 "JSR direct" opcode.
      // The AS assembler emits it for `JSR FVECT` (FVECT is a zero-page RAM cell
      // holding a self-modified JMP). The original Joust sound ROM depends on it
      // for the Walsh-function sounds (scream, skid). Semantics: push return
      // address (PC after the 2-byte instruction), jump to the direct address.
      case 0x9D: { const a = this.dir(); this.push8(this.PC & 0xFF); this.push8((this.PC >> 8) & 0xFF); this.PC = a; break; } // JSR direct (undoc)
      case 0xAD: { const a = this.idx(); this.push8(this.PC & 0xFF); this.push8((this.PC >> 8) & 0xFF); this.PC = a; break; } // JSR idx
      case 0xBD: { const a = this.ext(); this.push8(this.PC & 0xFF); this.push8((this.PC >> 8) & 0xFF); this.PC = a; break; } // JSR ext

      // ---- ACCA operations: immediate / direct / indexed / extended ----
      // ADDA
      case 0x8B: this.A = this.add8(this.A, this.imm8(), 0); break;
      case 0x9B: this.A = this.add8(this.A, this.rd(this.dir()), 0); break;
      case 0xAB: this.A = this.add8(this.A, this.rd(this.idx()), 0); break;
      case 0xBB: this.A = this.add8(this.A, this.rd(this.ext()), 0); break;
      // ADCA
      case 0x89: this.A = this.add8(this.A, this.imm8(), this.getC()); break;
      case 0x99: this.A = this.add8(this.A, this.rd(this.dir()), this.getC()); break;
      case 0xA9: this.A = this.add8(this.A, this.rd(this.idx()), this.getC()); break;
      case 0xB9: this.A = this.add8(this.A, this.rd(this.ext()), this.getC()); break;
      // SUBA
      case 0x80: this.A = this.sub8(this.A, this.imm8(), 0); break;
      case 0x90: this.A = this.sub8(this.A, this.rd(this.dir()), 0); break;
      case 0xA0: this.A = this.sub8(this.A, this.rd(this.idx()), 0); break;
      case 0xB0: this.A = this.sub8(this.A, this.rd(this.ext()), 0); break;
      // SBCA
      case 0x82: this.A = this.sub8(this.A, this.imm8(), this.getC()); break;
      case 0x92: this.A = this.sub8(this.A, this.rd(this.dir()), this.getC()); break;
      case 0xA2: this.A = this.sub8(this.A, this.rd(this.idx()), this.getC()); break;
      case 0xB2: this.A = this.sub8(this.A, this.rd(this.ext()), this.getC()); break;
      // CMPA
      case 0x81: this.cmp8(this.A, this.imm8()); break;
      case 0x91: this.cmp8(this.A, this.rd(this.dir())); break;
      case 0xA1: this.cmp8(this.A, this.rd(this.idx())); break;
      case 0xB1: this.cmp8(this.A, this.rd(this.ext())); break;
      // ANDA
      case 0x84: this.A = this.logic8(this.A & this.imm8()); break;
      case 0x94: this.A = this.logic8(this.A & this.rd(this.dir())); break;
      case 0xA4: this.A = this.logic8(this.A & this.rd(this.idx())); break;
      case 0xB4: this.A = this.logic8(this.A & this.rd(this.ext())); break;
      // BITA
      case 0x85: this.logic8(this.A & this.imm8()); break;
      case 0x95: this.logic8(this.A & this.rd(this.dir())); break;
      case 0xA5: this.logic8(this.A & this.rd(this.idx())); break;
      case 0xB5: this.logic8(this.A & this.rd(this.ext())); break;
      // ORAA
      case 0x8A: this.A = this.logic8(this.A | this.imm8()); break;
      case 0x9A: this.A = this.logic8(this.A | this.rd(this.dir())); break;
      case 0xAA: this.A = this.logic8(this.A | this.rd(this.idx())); break;
      case 0xBA: this.A = this.logic8(this.A | this.rd(this.ext())); break;
      // EORA
      case 0x88: this.A = this.logic8(this.A ^ this.imm8()); break;
      case 0x98: this.A = this.logic8(this.A ^ this.rd(this.dir())); break;
      case 0xA8: this.A = this.logic8(this.A ^ this.rd(this.idx())); break;
      case 0xB8: this.A = this.logic8(this.A ^ this.rd(this.ext())); break;
      // LDAA
      case 0x86: this.A = this.imm8(); this.setNZ8(this.A); this.setV(false); break;
      case 0x96: this.A = this.rd(this.dir()); this.setNZ8(this.A); this.setV(false); break;
      case 0xA6: this.A = this.rd(this.idx()); this.setNZ8(this.A); this.setV(false); break;
      case 0xB6: this.A = this.rd(this.ext()); this.setNZ8(this.A); this.setV(false); break;
      // STAA
      case 0x97: { const a = this.dir(); this.wr(a, this.A); this.setNZ8(this.A); this.setV(false); break; }
      case 0xA7: { const a = this.idx(); this.wr(a, this.A); this.setNZ8(this.A); this.setV(false); break; }
      case 0xB7: { const a = this.ext(); this.wr(a, this.A); this.setNZ8(this.A); this.setV(false); break; }

      // ---- ACCB operations: immediate / direct / indexed / extended ----
      // ADDB
      case 0xCB: this.B = this.add8(this.B, this.imm8(), 0); break;
      case 0xDB: this.B = this.add8(this.B, this.rd(this.dir()), 0); break;
      case 0xEB: this.B = this.add8(this.B, this.rd(this.idx()), 0); break;
      case 0xFB: this.B = this.add8(this.B, this.rd(this.ext()), 0); break;
      // ADCB
      case 0xC9: this.B = this.add8(this.B, this.imm8(), this.getC()); break;
      case 0xD9: this.B = this.add8(this.B, this.rd(this.dir()), this.getC()); break;
      case 0xE9: this.B = this.add8(this.B, this.rd(this.idx()), this.getC()); break;
      case 0xF9: this.B = this.add8(this.B, this.rd(this.ext()), this.getC()); break;
      // SUBB
      case 0xC0: this.B = this.sub8(this.B, this.imm8(), 0); break;
      case 0xD0: this.B = this.sub8(this.B, this.rd(this.dir()), 0); break;
      case 0xE0: this.B = this.sub8(this.B, this.rd(this.idx()), 0); break;
      case 0xF0: this.B = this.sub8(this.B, this.rd(this.ext()), 0); break;
      // SBCB
      case 0xC2: this.B = this.sub8(this.B, this.imm8(), this.getC()); break;
      case 0xD2: this.B = this.sub8(this.B, this.rd(this.dir()), this.getC()); break;
      case 0xE2: this.B = this.sub8(this.B, this.rd(this.idx()), this.getC()); break;
      case 0xF2: this.B = this.sub8(this.B, this.rd(this.ext()), this.getC()); break;
      // CMPB
      case 0xC1: this.cmp8(this.B, this.imm8()); break;
      case 0xD1: this.cmp8(this.B, this.rd(this.dir())); break;
      case 0xE1: this.cmp8(this.B, this.rd(this.idx())); break;
      case 0xF1: this.cmp8(this.B, this.rd(this.ext())); break;
      // ANDB
      case 0xC4: this.B = this.logic8(this.B & this.imm8()); break;
      case 0xD4: this.B = this.logic8(this.B & this.rd(this.dir())); break;
      case 0xE4: this.B = this.logic8(this.B & this.rd(this.idx())); break;
      case 0xF4: this.B = this.logic8(this.B & this.rd(this.ext())); break;
      // BITB
      case 0xC5: this.logic8(this.B & this.imm8()); break;
      case 0xD5: this.logic8(this.B & this.rd(this.dir())); break;
      case 0xE5: this.logic8(this.B & this.rd(this.idx())); break;
      case 0xF5: this.logic8(this.B & this.rd(this.ext())); break;
      // ORAB
      case 0xCA: this.B = this.logic8(this.B | this.imm8()); break;
      case 0xDA: this.B = this.logic8(this.B | this.rd(this.dir())); break;
      case 0xEA: this.B = this.logic8(this.B | this.rd(this.idx())); break;
      case 0xFA: this.B = this.logic8(this.B | this.rd(this.ext())); break;
      // EORB
      case 0xC8: this.B = this.logic8(this.B ^ this.imm8()); break;
      case 0xD8: this.B = this.logic8(this.B ^ this.rd(this.dir())); break;
      case 0xE8: this.B = this.logic8(this.B ^ this.rd(this.idx())); break;
      case 0xF8: this.B = this.logic8(this.B ^ this.rd(this.ext())); break;
      // LDAB
      case 0xC6: this.B = this.imm8(); this.setNZ8(this.B); this.setV(false); break;
      case 0xD6: this.B = this.rd(this.dir()); this.setNZ8(this.B); this.setV(false); break;
      case 0xE6: this.B = this.rd(this.idx()); this.setNZ8(this.B); this.setV(false); break;
      case 0xF6: this.B = this.rd(this.ext()); this.setNZ8(this.B); this.setV(false); break;
      // STAB
      case 0xD7: { const a = this.dir(); this.wr(a, this.B); this.setNZ8(this.B); this.setV(false); break; }
      case 0xE7: { const a = this.idx(); this.wr(a, this.B); this.setNZ8(this.B); this.setV(false); break; }
      case 0xF7: { const a = this.ext(); this.wr(a, this.B); this.setNZ8(this.B); this.setV(false); break; }

      // ---- 16-bit index / stack ops ----
      // LDX
      case 0xCE: this.X = this.imm16(); this.setNZ16(this.X); this.setV(false); break;
      case 0xDE: this.X = this.rd16(this.dir()); this.setNZ16(this.X); this.setV(false); break;
      case 0xEE: this.X = this.rd16(this.idx()); this.setNZ16(this.X); this.setV(false); break;
      case 0xFE: this.X = this.rd16(this.ext()); this.setNZ16(this.X); this.setV(false); break;
      // STX
      case 0xDF: { const a = this.dir(); this.wr(a, (this.X >> 8) & 0xFF); this.wr((a + 1) & 0xFFFF, this.X & 0xFF); this.setNZ16(this.X); this.setV(false); break; }
      case 0xEF: { const a = this.idx(); this.wr(a, (this.X >> 8) & 0xFF); this.wr((a + 1) & 0xFFFF, this.X & 0xFF); this.setNZ16(this.X); this.setV(false); break; }
      case 0xFF: { const a = this.ext(); this.wr(a, (this.X >> 8) & 0xFF); this.wr((a + 1) & 0xFFFF, this.X & 0xFF); this.setNZ16(this.X); this.setV(false); break; }
      // CPX (compares 16-bit; sets N,Z,V per 6800)
      case 0x8C: this.cpx(this.imm16()); break;
      case 0x9C: this.cpx(this.rd16(this.dir())); break;
      case 0xAC: this.cpx(this.rd16(this.idx())); break;
      case 0xBC: this.cpx(this.rd16(this.ext())); break;
      // LDS
      case 0x8E: this.SP = this.imm16(); this.setNZ16(this.SP); this.setV(false); break;
      case 0x9E: this.SP = this.rd16(this.dir()); this.setNZ16(this.SP); this.setV(false); break;
      case 0xAE: this.SP = this.rd16(this.idx()); this.setNZ16(this.SP); this.setV(false); break;
      case 0xBE: this.SP = this.rd16(this.ext()); this.setNZ16(this.SP); this.setV(false); break;
      // STS
      case 0x9F: { const a = this.dir(); this.wr(a, (this.SP >> 8) & 0xFF); this.wr((a + 1) & 0xFFFF, this.SP & 0xFF); this.setNZ16(this.SP); this.setV(false); break; }
      case 0xAF: { const a = this.idx(); this.wr(a, (this.SP >> 8) & 0xFF); this.wr((a + 1) & 0xFFFF, this.SP & 0xFF); this.setNZ16(this.SP); this.setV(false); break; }
      case 0xBF: { const a = this.ext(); this.wr(a, (this.SP >> 8) & 0xFF); this.wr((a + 1) & 0xFFFF, this.SP & 0xFF); this.setNZ16(this.SP); this.setV(false); break; }

      default:
        this.illegalOp = op;
        break;
    }
  }

  // CPX: 16-bit compare. 6800 sets N from result bit15, Z from 16-bit zero,
  // V from signed overflow of the subtraction. C not affected.
  cpx(m) {
    const r = (this.X - m) & 0xFFFF;
    if (r & 0x8000) this.CC |= FN; else this.CC &= ~FN;
    if (r === 0) this.CC |= FZ; else this.CC &= ~FZ;
    const xs = (this.X & 0x8000) ? 1 : 0, ms = (m & 0x8000) ? 1 : 0, rs = (r & 0x8000) ? 1 : 0;
    this.setV((xs ^ ms) && (xs ^ rs));
  }
}

// ============================================================================
//  6800 instruction cycle counts (undefined opcodes intentionally absent)
// ============================================================================
const CYCLES = (() => {
  const t = {};
  const set = (op, c) => { t[op] = c; };
  // Inherent / accumulator
  set(0x01, 2); // NOP
  set(0x06, 2); set(0x07, 2); // TAP,TPA
  set(0x08, 4); set(0x09, 4); // INX,DEX
  set(0x0A, 2); set(0x0B, 2); set(0x0C, 2); set(0x0D, 2); set(0x0E, 2); set(0x0F, 2); // CLV,SEV,CLC,SEC,CLI,SEI
  set(0x10, 2); set(0x11, 2); // SBA,CBA
  set(0x16, 2); set(0x17, 2); // TAB,TBA
  set(0x19, 2);               // DAA
  set(0x1B, 2);               // ABA
  // branches (all 4)
  for (const op of [0x20,0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x2A,0x2B,0x2C,0x2D,0x2E,0x2F]) set(op, 4);
  set(0x8D, 8); // BSR
  // stack/index
  set(0x30, 4); // TSX
  set(0x31, 4); // INS
  set(0x32, 4); set(0x33, 4); // PULA,PULB
  set(0x34, 4); // DES
  set(0x35, 4); // TXS
  set(0x36, 4); set(0x37, 4); // PSHA,PSHB
  set(0x39, 5); // RTS
  set(0x3B, 10); // RTI
  set(0x3E, 9);  // WAI
  set(0x3F, 12); // SWI
  // ACCA/ACCB single-operand inherent (0x4x, 0x5x): 2 cycles each
  for (const op of [0x40,0x43,0x44,0x46,0x47,0x48,0x49,0x4A,0x4C,0x4D,0x4F,
                    0x50,0x53,0x54,0x56,0x57,0x58,0x59,0x5A,0x5C,0x5D,0x5F]) set(op, 2);
  // indexed single-operand RMW (0x6x): 7 cycles, TST idx=7, JMP idx=4, CLR idx=7
  for (const op of [0x60,0x63,0x64,0x66,0x67,0x68,0x69,0x6A,0x6C,0x6F]) set(op, 7);
  set(0x6D, 7); // TST idx
  set(0x6E, 4); // JMP idx
  // extended single-operand RMW (0x7x): 6 cycles, TST ext=6, JMP ext=3, CLR ext=6
  for (const op of [0x70,0x73,0x74,0x76,0x77,0x78,0x79,0x7A,0x7C,0x7F]) set(op, 6);
  set(0x7D, 6); // TST ext
  set(0x7E, 3); // JMP ext
  // JSR
  set(0x9D, 5); // JSR direct (undocumented; 5 cycles on NMOS 6800)
  set(0xAD, 8); // JSR idx
  set(0xBD, 9); // JSR ext
  // ---- ACCA/ACCB ALU: immediate=2, direct=3, indexed=5, extended=4 ----
  // group opcodes: for base 0x80..0x8F immediate, 0x90.. direct, 0xA0.. indexed, 0xB0.. extended (ACCA)
  //                0xC0..0xCF immediate, 0xD0.. direct, 0xE0.. indexed, 0xF0.. extended (ACCB)
  const aluLow = [0x0,0x1,0x2,0x4,0x5,0x8,0x9,0xA,0xB]; // SUB,CMP,SBC,AND,BIT,EOR,ADC,ORA,ADD
  const ldLow = [0x6]; // LDA
  for (const half of [0x80, 0xC0]) {
    for (const low of aluLow) {
      set(half + low, 2);          // immediate
      set(half + 0x10 + low, 3);   // direct
      set(half + 0x20 + low, 5);   // indexed
      set(half + 0x30 + low, 4);   // extended
    }
    // LDA (0x6)
    set(half + 0x6, 2); set(half + 0x16, 3); set(half + 0x26, 5); set(half + 0x36, 4);
    // STA: no immediate; direct=4, indexed=6, extended=5 (0x7)
    set(half + 0x17, 4); set(half + 0x27, 6); set(half + 0x37, 5);
  }
  // ---- 16-bit ops ----
  // LDX: imm=3, dir=4, idx=6, ext=5
  set(0xCE, 3); set(0xDE, 4); set(0xEE, 6); set(0xFE, 5);
  // STX: dir=5, idx=7, ext=6
  set(0xDF, 5); set(0xEF, 7); set(0xFF, 6);
  // CPX: imm=3, dir=4, idx=6, ext=5
  set(0x8C, 3); set(0x9C, 4); set(0xAC, 6); set(0xBC, 5);
  // LDS: imm=3, dir=4, idx=6, ext=5
  set(0x8E, 3); set(0x9E, 4); set(0xAE, 6); set(0xBE, 5);
  // STS: dir=5, idx=7, ext=6
  set(0x9F, 5); set(0xAF, 7); set(0xBF, 6);
  return t;
})();

// ============================================================================
//  MC6821 PIA + Williams sound board bus
// ============================================================================
class SoundBoard {
  constructor(rom, opts = {}) {
    this.rom = rom;                     // Uint8Array(4096)
    this.ram = new Uint8Array(128);
    this.logUnmapped = !!opts.logUnmapped;
    this.unmapped = new Set();
    this.mirrorUsed = false;

    // PIA state
    this.ddra = 0; this.pra = 0;        // port A data-dir / output reg
    this.cra = 0;
    this.ddrb = 0; this.prb = 0;        // port B data-dir / input latch (from main CPU)
    this.crb = 0;
    this.cb1 = false;                   // CB1 input level
    this.commandLatch = 0x7F;           // value presented on port B inputs

    // DAC capture
    this.dac = [];                      // {cycle, value}
    this.cpu = null;                    // set by renderer for cycle timestamp
    this.irqFromPIA = false;            // CB1 interrupt flag active
  }

  // CB1 active-transition sets IRQ flag if CRB enables it (bit0=1)
  strobeCB1() {
    this.irqFromPIA = true;
    this._updateIRQ();
  }
  _updateIRQ() {
    // IRQ asserted to CPU if PIA CB1 flag set and CRB bit0 (IRQ enable) set
    const enabled = (this.crb & 0x01) !== 0;
    if (this.cpu) this.cpu.irqLine = this.irqFromPIA && enabled;
  }

  read(addr) {
    if (addr >= RAM_LO && addr <= RAM_HI) return this.ram[addr];
    if (addr >= PIA_BASE && addr <= PIA_END) return this.readPIA(addr);
    if (addr >= ROM_BASE && addr <= ROM_END) return this.rom[addr - ROM_BASE];
    // ROM mirror check: some Williams boards mirror ROM. Add mirrors only if used.
    if (addr >= 0xB000 && addr <= 0xBFFF) { this.mirrorUsed = true; return this.rom[addr - 0xB000]; }
    if (addr >= 0x8000 && addr <= 0x8FFF) { this.mirrorUsed = true; return this.rom[addr - 0x8000]; }
    if (this.logUnmapped) this.unmapped.add('R:' + addr.toString(16));
    return 0;
  }

  write(addr, val) {
    val &= 0xFF;
    if (addr >= RAM_LO && addr <= RAM_HI) { this.ram[addr] = val; return; }
    if (addr >= PIA_BASE && addr <= PIA_END) { this.writePIA(addr, val); return; }
    if (addr >= ROM_BASE && addr <= ROM_END) return; // ROM: ignore writes
    if (this.logUnmapped) this.unmapped.add('W:' + addr.toString(16));
  }

  readPIA(addr) {
    switch (addr) {
      case 0x0400: // PRA / DDRA
        if (this.cra & 0x04) {
          // reading peripheral register A: reading the output register; clears CA flags
          return (this.pra & this.ddra) | (0 & ~this.ddra);
        }
        return this.ddra;
      case 0x0401: // CRA
        return this.cra;
      case 0x0402: // PRB / DDRB
        if (this.crb & 0x04) {
          // reading peripheral register B: input pins = commandLatch (for input bits)
          // Reading PRB clears the CB1/CB2 interrupt flags.
          this.irqFromPIA = false;
          this._updateIRQ();
          // For bits configured as inputs (ddrb=0), return latched command;
          // for outputs, return the output register.
          return (this.prb & this.ddrb) | (this.commandLatch & ~this.ddrb);
        }
        return this.ddrb;
      case 0x0403: // CRB
        // reflect CB1 IRQ flag in bit7
        return (this.crb & 0x3F) | (this.irqFromPIA ? 0x80 : 0);
      default: return 0;
    }
  }

  writePIA(addr, val) {
    switch (addr) {
      case 0x0400:
        if (this.cra & 0x04) this.pra = val; else this.ddra = val;
        // When writing the peripheral output register A (the DAC), capture a sample.
        if (this.cra & 0x04) this.captureDAC(this.pra);
        break;
      case 0x0401:
        this.cra = val & 0x3F;   // bits 6,7 are read-only flags
        break;
      case 0x0402:
        if (this.crb & 0x04) { this.prb = val; } else this.ddrb = val;
        break;
      case 0x0403:
        this.crb = val & 0x3F;
        this._updateIRQ();
        break;
    }
  }

  captureDAC(v) {
    const cyc = this.cpu ? this.cpu.cycles : 0;
    this.dac.push({ cycle: cyc, value: v & 0xFF });
  }
}

// ============================================================================
//  WAV writer (16-bit PCM mono)
// ============================================================================
function writeWav(filepath, samplesFloat, sampleRate) {
  const n = samplesFloat.length;
  const bytesPerSample = 2;
  const dataSize = n * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);           // PCM chunk size
  buf.writeUInt16LE(1, 20);            // PCM format
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(bytesPerSample, 32); // block align
  buf.writeUInt16LE(16, 34);           // bits per sample
  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++) {
    let s = samplesFloat[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;
    const v = Math.round(s * 32767);
    buf.writeInt16LE(v, off); off += 2;
  }
  fs.writeFileSync(filepath, buf);
}

// ============================================================================
//  Minimal PNG writer (truecolor RGB, no filter) using zlib
// ============================================================================
function writePng(filepath, width, height, rgb /* Uint8Array w*h*3 */) {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type 2 = truecolor RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type none
    rgb.copy ? rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
             : Buffer.from(rgb.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filepath, png);
}

// ============================================================================
//  RENDERER: run a sound command and capture DAC output
// ============================================================================
function loadRom() {
  const romPath = path.join(__dirname, 'vsndrm4.bin');
  const rom = new Uint8Array(fs.readFileSync(romPath));
  if (rom.length !== 4096) throw new Error(`ROM size ${rom.length} != 4096`);
  return rom;
}

// Run SETUP until the CPU reaches the BRA * idle self-loop.
// Returns the PC of the idle loop (the SETUP "BRA *").
function runToIdle(cpu, board, maxCycles = 5000) {
  const startCycles = cpu.cycles;
  let prevPC = -1;
  while (cpu.cycles - startCycles < maxCycles) {
    const pcBefore = cpu.PC;
    cpu.step();
    if (cpu.illegalOp !== null) {
      throw new Error(`Illegal opcode $${cpu.illegalOp.toString(16)} at PC=$${pcBefore.toString(16)}`);
    }
    // Detect BRA * : a BRA whose target is itself (PC unchanged after executing the branch back to same instr)
    // The SETUP idle loop is `BRA *` => opcode 0x20 0xFE. After execution PC == pcBefore.
    if (cpu.PC === pcBefore) {
      // confirm it's a BRA to self
      const op = board.read(pcBefore);
      if (op === 0x20) {
        const off = board.read((pcBefore + 1) & 0xFFFF);
        if (off === 0xFE) return pcBefore;
      }
    }
    prevPC = pcBefore;
  }
  throw new Error('SETUP did not reach idle loop within ' + maxCycles + ' cycles');
}

// Render a single sound command N. Returns { dac:[{cycle,value}], cyclesRun, endedNaturally }
function renderSound(rom, N, lengthFrames, opts = {}) {
  const board = new SoundBoard(rom, { logUnmapped: true });
  const cpu = new CPU6800(board);
  board.cpu = cpu;
  cpu.reset();          // PC = reset vector = SETUP
  cpu.CC |= FI;

  // Run SETUP to idle
  const idlePC = runToIdle(cpu, board);

  // Deliver the command. Main CPU sends commands ACTIVE-LOW.
  // IRQ handler does LDAA $0402; COMA; ANDA #$3F to recover N.
  // So the port-B input latch = (~N) & 0x7F.
  board.commandLatch = (~N) & 0x7F;

  // Assert IRQ (as if CB1 strobed). The board raises IRQ to the CPU.
  board.strobeCB1();

  // Cap policy:
  //   Every Joust sound routine is a ONE-SHOT: it eventually finishes and the
  //   CPU returns to the handler's `BRA *` (IRQ3) idle self-loop. We therefore
  //   let each sound run to that natural end (the authentic full sound), bounded
  //   only by the hard 6-second safety cap. The per-sound frame cap from the
  //   spec is intended for looping sounds that never return; since none of our
  //   sounds loop forever, we keep the frame cap merely as a defensive ceiling
  //   (only relevant if a routine unexpectedly failed to terminate) and record
  //   it in the manifest. Set opts.respectFrameCap=true to force the tight cap.
  const hardCap = HARD_CAP_SEC * CPU_HZ;
  const frameCapCycles = lengthFrames * (CPU_HZ / FRAME_HZ);
  const limit = opts.respectFrameCap
    ? Math.min(frameCapCycles, hardCap)
    : hardCap;

  const startCyc = cpu.cycles;
  let endedNaturally = false;

  while (cpu.cycles - startCyc < limit) {
    const pcBefore = cpu.PC;
    cpu.step();
    if (cpu.illegalOp !== null) {
      throw new Error(`Illegal opcode $${cpu.illegalOp.toString(16)} at PC=$${pcBefore.toString(16)} while rendering N=$${N.toString(16)}`);
    }
    // Detect self-loop (BRA *) => sound handler finished (IRQ3: BRA *)
    if (cpu.PC === pcBefore) {
      const op = board.read(pcBefore);
      if (op === 0x20 && board.read((pcBefore + 1) & 0xFFFF) === 0xFE) {
        // reached an idle self-loop after the sound => natural end
        endedNaturally = true;
        break;
      }
    }
  }

  return {
    dac: board.dac,
    cyclesRun: cpu.cycles - startCyc,
    endedNaturally,
    unmapped: board.unmapped,
    mirrorUsed: board.mirrorUsed,
    idlePC,
  };
}

// ============================================================================
//  Signal processing: DAC step function -> 44.1kHz PCM
// ============================================================================
function dacToSamples(dac, cyclesRun, sampleRate = SAMPLE_RATE, opts = {}) {
  if (dac.length === 0) return { samples: new Float32Array(0), rms: 0, peak: 0, peakHz: 0 };

  // Build step function over cycles. The DAC holds each value until next write.
  // Determine time span in cycles.
  const firstCyc = dac[0].cycle;
  const lastCyc = dac[dac.length - 1].cycle;
  const spanCyc = Math.max(1, lastCyc - firstCyc);
  const durSec = spanCyc / CPU_HZ;
  const nOut = Math.max(1, Math.floor(durSec * sampleRate));

  // For each output sample, find DAC value in effect at that cycle.
  const raw = new Float32Array(nOut);
  let di = 0;
  for (let i = 0; i < nOut; i++) {
    const t = i / sampleRate;
    const cyc = firstCyc + Math.round(t * CPU_HZ);
    // advance di while next dac event cycle <= cyc
    while (di + 1 < dac.length && dac[di + 1].cycle <= cyc) di++;
    raw[i] = dac[di].value;
  }

  // DC-block: subtract mean
  let mean = 0;
  for (let i = 0; i < nOut; i++) mean += raw[i];
  mean /= nOut;
  const centered = new Float32Array(nOut);
  let peakAbs = 0;
  for (let i = 0; i < nOut; i++) {
    centered[i] = raw[i] - mean;
    const a = Math.abs(centered[i]);
    if (a > peakAbs) peakAbs = a;
  }

  // Normalize peak to ~0.9
  const norm = peakAbs > 0 ? 0.9 / peakAbs : 0;
  const out = new Float32Array(nOut);
  for (let i = 0; i < nOut; i++) out[i] = centered[i] * norm;

  // Trim trailing silence (below threshold)
  const thr = 0.01;
  let end = nOut;
  while (end > 1 && Math.abs(out[end - 1]) < thr) end--;
  // also trim leading silence a bit? Keep leading (attack). Just trailing.
  let trimmed = out.subarray(0, end);

  // Tiny fade-out (1.5ms) to avoid clicks
  const fadeN = Math.min(trimmed.length, Math.floor(0.0015 * sampleRate));
  const faded = Float32Array.from(trimmed);
  for (let i = 0; i < fadeN; i++) {
    const g = i / fadeN;
    faded[faded.length - 1 - i] *= g;
  }
  // small fade-in too (0.5ms)
  const finN = Math.min(faded.length, Math.floor(0.0005 * sampleRate));
  for (let i = 0; i < finN; i++) faded[i] *= (i / finN);

  // Stats
  let sumSq = 0, pk = 0;
  for (let i = 0; i < faded.length; i++) { sumSq += faded[i] * faded[i]; const a = Math.abs(faded[i]); if (a > pk) pk = a; }
  const rms = Math.sqrt(sumSq / Math.max(1, faded.length));

  // Dominant frequency via zero-crossing rate
  let zc = 0;
  for (let i = 1; i < faded.length; i++) {
    if ((faded[i - 1] < 0 && faded[i] >= 0) || (faded[i - 1] >= 0 && faded[i] < 0)) zc++;
  }
  const durS = faded.length / sampleRate;
  const peakHz = durS > 0 ? (zc / 2) / durS : 0;

  return { samples: faded, rms, peak: pk, peakHz, durationSec: durS };
}

// ============================================================================
//  6800 CPU UNIT TESTS
// ============================================================================
function runCpuTests() {
  const results = [];
  let pass = 0, fail = 0;
  const assert = (name, cond, detail = '') => {
    results.push({ name, ok: !!cond, detail });
    if (cond) pass++; else fail++;
  };

  // Helper: build a CPU over a flat 64K RAM bus for isolated opcode tests.
  const makeCpu = (prog, org = 0x0100) => {
    const mem = new Uint8Array(0x10000);
    for (let i = 0; i < prog.length; i++) mem[(org + i) & 0xFFFF] = prog[i];
    const bus = { read: (a) => mem[a & 0xFFFF], write: (a, v) => { mem[a & 0xFFFF] = v & 0xFF; } };
    const cpu = new CPU6800(bus);
    cpu.PC = org; cpu.SP = 0x01FF; cpu.CC = 0xC0; // clear flags
    cpu.mem = mem;
    return cpu;
  };
  const flags = (cpu) => ({
    H: (cpu.CC & FH) ? 1 : 0, N: (cpu.CC & FN) ? 1 : 0, Z: (cpu.CC & FZ) ? 1 : 0,
    V: (cpu.CC & FV) ? 1 : 0, C: (cpu.CC & FC) ? 1 : 0,
  });

  // 1) ADDA immediate: 0x2B + 0x14 (with half carry). $2B+$14=$3F, no half carry (B+4=F ok)
  {
    const cpu = makeCpu([0x8B, 0x14]); cpu.A = 0x2B; cpu.step();
    assert('ADDA #$14 -> A', cpu.A === 0x3F, `A=$${cpu.A.toString(16)}`);
    const f = flags(cpu);
    assert('ADDA flags NZVC', f.N === 0 && f.Z === 0 && f.V === 0 && f.C === 0, JSON.stringify(f));
  }
  // 1b) ADDA with half-carry: $0F + $01 = $10, H=1
  {
    const cpu = makeCpu([0x8B, 0x01]); cpu.A = 0x0F; cpu.step();
    assert('ADDA half-carry H', (cpu.CC & FH) !== 0 && cpu.A === 0x10, `A=$${cpu.A.toString(16)} H=${(cpu.CC&FH)?1:0}`);
  }
  // 1c) ADDA overflow: $7F + $01 = $80 => V=1, N=1
  {
    const cpu = makeCpu([0x8B, 0x01]); cpu.A = 0x7F; cpu.step();
    const f = flags(cpu);
    assert('ADDA overflow V,N', cpu.A === 0x80 && f.V === 1 && f.N === 1, JSON.stringify(f));
  }
  // 2) SUBA: $50 - $30 = $20, C=0, V=0
  {
    const cpu = makeCpu([0x80, 0x30]); cpu.A = 0x50; cpu.step();
    const f = flags(cpu);
    assert('SUBA #$30 -> $20', cpu.A === 0x20 && f.C === 0 && f.Z === 0, `A=$${cpu.A.toString(16)}`);
  }
  // 2b) SUBA with borrow: $10 - $20 = $F0, C=1 (borrow)
  {
    const cpu = makeCpu([0x80, 0x20]); cpu.A = 0x10; cpu.step();
    const f = flags(cpu);
    assert('SUBA borrow C=1', cpu.A === 0xF0 && f.C === 1 && f.N === 1, `A=$${cpu.A.toString(16)} C=${f.C}`);
  }
  // 3) ADCB with carry-in: B=$10, +$05 +C(1) = $16
  {
    const cpu = makeCpu([0xC9, 0x05]); cpu.B = 0x10; cpu.CC |= FC; cpu.step();
    assert('ADCB with carry', cpu.B === 0x16, `B=$${cpu.B.toString(16)}`);
  }
  // 4) SBCB with borrow-in: B=$20 - $05 - C(1) = $1A
  {
    const cpu = makeCpu([0xC2, 0x05]); cpu.B = 0x20; cpu.CC |= FC; cpu.step();
    assert('SBCB with borrow-in', cpu.B === 0x1A, `B=$${cpu.B.toString(16)}`);
  }
  // 5) CMPA: A=$40 cmp $40 => Z=1, C=0
  {
    const cpu = makeCpu([0x81, 0x40]); cpu.A = 0x40; cpu.step();
    const f = flags(cpu);
    assert('CMPA equal Z=1', f.Z === 1 && f.C === 0 && cpu.A === 0x40, JSON.stringify(f));
  }
  // 6) ANDA/ORAA/EORA
  {
    let cpu = makeCpu([0x84, 0x0F]); cpu.A = 0xF3; cpu.step();
    assert('ANDA #$0F', cpu.A === 0x03 && (cpu.CC & FV) === 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x8A, 0xF0]); cpu.A = 0x0C; cpu.step();
    assert('ORAA #$F0', cpu.A === 0xFC && (cpu.CC & FN) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x88, 0xFF]); cpu.A = 0xAA; cpu.step();
    assert('EORA #$FF', cpu.A === 0x55, `A=$${cpu.A.toString(16)}`);
  }
  // 7) INC/DEC/COM/NEG
  {
    let cpu = makeCpu([0x4C]); cpu.A = 0x7F; cpu.step();
    assert('INCA $7F->$80 V=1', cpu.A === 0x80 && (cpu.CC & FV) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x4A]); cpu.A = 0x80; cpu.step();
    assert('DECA $80->$7F V=1', cpu.A === 0x7F && (cpu.CC & FV) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x43]); cpu.A = 0x55; cpu.step();
    assert('COMA $55->$AA C=1', cpu.A === 0xAA && (cpu.CC & FC) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x40]); cpu.A = 0x01; cpu.step();
    assert('NEGA $01->$FF C=1', cpu.A === 0xFF && (cpu.CC & FC) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x40]); cpu.A = 0x00; cpu.step();
    assert('NEGA $00->$00 C=0', cpu.A === 0x00 && (cpu.CC & FC) === 0, `A=$${cpu.A.toString(16)}`);
  }
  // 8) ASL/LSR/ROR/ROL
  {
    let cpu = makeCpu([0x48]); cpu.A = 0x81; cpu.step(); // ASLA: 0x81<<1=0x02,C=1,V=(N^C)=(0^1)=1
    assert('ASLA $81->$02 C=1', cpu.A === 0x02 && (cpu.CC & FC) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x44]); cpu.A = 0x01; cpu.step(); // LSRA: ->0, C=1, Z=1
    assert('LSRA $01->$00 C=1 Z=1', cpu.A === 0x00 && (cpu.CC & FC) !== 0 && (cpu.CC & FZ) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x46]); cpu.A = 0x01; cpu.CC |= FC; cpu.step(); // RORA with C=1: ->0x80, C=1
    assert('RORA $01 C=1 ->$80 C=1', cpu.A === 0x80 && (cpu.CC & FC) !== 0, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x49]); cpu.A = 0x80; cpu.CC &= ~FC; cpu.step(); // ROLA C=0: ->0x00, C=1
    assert('ROLA $80 C=0 ->$00 C=1', cpu.A === 0x00 && (cpu.CC & FC) !== 0, `A=$${cpu.A.toString(16)}`);
  }
  // 9) LDX/STX/CPX
  {
    const cpu = makeCpu([0xCE, 0x12, 0x34]); cpu.step();
    assert('LDX #$1234', cpu.X === 0x1234, `X=$${cpu.X.toString(16)}`);
    // STX direct at $50
    const cpu2 = makeCpu([0xDF, 0x50]); cpu2.X = 0xABCD; cpu2.step();
    assert('STX $50', cpu2.mem[0x50] === 0xAB && cpu2.mem[0x51] === 0xCD, `${cpu2.mem[0x50].toString(16)}${cpu2.mem[0x51].toString(16)}`);
    // CPX equal
    const cpu3 = makeCpu([0x8C, 0x12, 0x34]); cpu3.X = 0x1234; cpu3.step();
    assert('CPX equal Z=1', (cpu3.CC & FZ) !== 0, `CC=$${cpu3.CC.toString(16)}`);
    const cpu4 = makeCpu([0x8C, 0x00, 0x01]); cpu4.X = 0x0000; cpu4.step();
    assert('CPX $0-$1 N=1', (cpu4.CC & FN) !== 0 && (cpu4.CC & FZ) === 0, `CC=$${cpu4.CC.toString(16)}`);
  }
  // 10) indexed & extended addressing
  {
    // LDAA indexed: X=$0200, offset $05 -> read mem[$0205]
    const cpu = makeCpu([0xA6, 0x05]); cpu.X = 0x0200; cpu.mem[0x0205] = 0x42; cpu.step();
    assert('LDAA idx X+5', cpu.A === 0x42, `A=$${cpu.A.toString(16)}`);
    // LDAA extended
    const cpu2 = makeCpu([0xB6, 0x03, 0x00]); cpu2.mem[0x0300] = 0x99; cpu2.step();
    assert('LDAA ext $0300', cpu2.A === 0x99, `A=$${cpu2.A.toString(16)}`);
    // STAA extended
    const cpu3 = makeCpu([0xB7, 0x04, 0x00]); cpu3.A = 0x77; cpu3.step();
    assert('STAA ext $0400', cpu3.mem[0x0400] === 0x77, '');
  }
  // 11) PSH/PUL round-trip
  {
    const cpu = makeCpu([0x36, 0x32]); // PSHA then PULA
    cpu.A = 0x5A; cpu.step(); // PSHA
    const spAfterPush = cpu.SP;
    cpu.A = 0x00; cpu.step(); // PULA
    assert('PSHA/PULA round-trip', cpu.A === 0x5A && cpu.SP === spAfterPush + 1, `A=$${cpu.A.toString(16)}`);
  }
  // 12) JSR/RTS round-trip
  {
    // JSR ext to $0110, at $0110 place RTS (0x39)
    const cpu = makeCpu([0xBD, 0x01, 0x10]); // JSR $0110 at org $0100
    cpu.mem[0x0110] = 0x39; // RTS
    const retAddr = 0x0103; // after JSR ext (3 bytes)
    cpu.step(); // JSR
    assert('JSR pushes return', cpu.PC === 0x0110, `PC=$${cpu.PC.toString(16)}`);
    cpu.step(); // RTS
    assert('RTS returns', cpu.PC === retAddr, `PC=$${cpu.PC.toString(16)}`);
  }
  // 13) DAA: $19 + $28 = $41 decimal-adjusted. Do ADDA then DAA.
  {
    const cpu = makeCpu([0x8B, 0x28, 0x19]); // ADDA #$28 ; DAA
    cpu.A = 0x19; cpu.step(); // binary 0x19+0x28=0x41 with H=1 (9+8>0xF); DAA adds 6 -> 0x47 (19+28=47 dec)
    cpu.step(); // DAA
    assert('DAA 19+28=47(BCD)', cpu.A === 0x47, `A=$${cpu.A.toString(16)}`);
    // carry case: $99 + $01 = $9A -> DAA -> $00 with C=1
    const cpu2 = makeCpu([0x8B, 0x01, 0x19]); cpu2.A = 0x99; cpu2.step(); cpu2.step();
    assert('DAA 99+01=00 C=1', cpu2.A === 0x00 && (cpu2.CC & FC) !== 0, `A=$${cpu2.A.toString(16)} C=${(cpu2.CC&FC)?1:0}`);
  }
  // 14) branch conditions: BEQ taken when Z=1
  {
    const cpu = makeCpu([0x27, 0x02, 0x01, 0x01, 0x01]); // BEQ +2
    cpu.CC |= FZ; cpu.step();
    assert('BEQ taken Z=1', cpu.PC === 0x0104, `PC=$${cpu.PC.toString(16)}`);
    const cpu2 = makeCpu([0x27, 0x02]); cpu2.CC &= ~FZ; cpu2.step();
    assert('BEQ not taken Z=0', cpu2.PC === 0x0102, `PC=$${cpu2.PC.toString(16)}`);
    // BHI: taken when C=0 and Z=0
    const cpu3 = makeCpu([0x22, 0x02]); cpu3.CC &= ~(FC | FZ); cpu3.step();
    assert('BHI taken', cpu3.PC === 0x0104, `PC=$${cpu3.PC.toString(16)}`);
  }
  // 15) IRQ push + RTI round-trip
  {
    const mem = new Uint8Array(0x10000);
    // IRQ vector -> $2000
    mem[0xFFF8] = 0x20; mem[0xFFF9] = 0x00;
    mem[0x2000] = 0x3B; // RTI at handler
    const bus = { read: (a) => mem[a], write: (a, v) => { mem[a] = v & 0xFF; } };
    const cpu = new CPU6800(bus);
    cpu.PC = 0x0500; cpu.SP = 0x007F; cpu.A = 0x11; cpu.B = 0x22; cpu.X = 0x3344;
    cpu.CC = 0xC0; // I clear
    cpu.irqLine = true;
    const savedPC = cpu.PC, savedA = cpu.A, savedB = cpu.B, savedX = cpu.X, savedCC = cpu.CC;
    cpu.step(); // takes IRQ
    assert('IRQ jumps to vector', cpu.PC === 0x2000, `PC=$${cpu.PC.toString(16)}`);
    assert('IRQ sets I flag', (cpu.CC & FI) !== 0, `CC=$${cpu.CC.toString(16)}`);
    // clear irqLine so RTI doesn't immediately re-enter (I set anyway)
    cpu.irqLine = false;
    cpu.step(); // RTI
    assert('RTI restores PC', cpu.PC === savedPC, `PC=$${cpu.PC.toString(16)} exp=$${savedPC.toString(16)}`);
    assert('RTI restores A,B,X', cpu.A === savedA && cpu.B === savedB && cpu.X === savedX,
      `A=$${cpu.A.toString(16)} B=$${cpu.B.toString(16)} X=$${cpu.X.toString(16)}`);
    assert('RTI restores CC', (cpu.CC | 0xC0) === (savedCC | 0xC0), `CC=$${cpu.CC.toString(16)}`);
  }
  // extra: SBA / CBA / ABA / TAB / TBA
  {
    let cpu = makeCpu([0x10]); cpu.A = 0x50; cpu.B = 0x30; cpu.step(); // SBA: A=A-B? No: SBA is B=A-B? Datasheet: SBA => A = A - B
    // 6800 SBA: A <- A - B
    assert('SBA A-B', cpu.A === 0x20, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x1B]); cpu.A = 0x14; cpu.B = 0x22; cpu.step(); // ABA: A=A+B
    assert('ABA A+B', cpu.A === 0x36, `A=$${cpu.A.toString(16)}`);
    cpu = makeCpu([0x16]); cpu.A = 0x9A; cpu.step(); // TAB
    assert('TAB', cpu.B === 0x9A && (cpu.CC & FN) !== 0, `B=$${cpu.B.toString(16)}`);
    // TAP: A -> CC (bits 6,7 forced 1). A=$01 sets C only.
    cpu = makeCpu([0x06]); cpu.A = 0x01; cpu.CC = 0xC0; cpu.step();
    assert('TAP A->CC', (cpu.CC & FC) !== 0 && (cpu.CC & 0xC0) === 0xC0, `CC=$${cpu.CC.toString(16)}`);
    // TPA: CC -> A. CC has C set -> A bit0 set, bits6,7 set.
    cpu = makeCpu([0x07]); cpu.CC = 0xC0 | FC; cpu.step();
    assert('TPA CC->A', (cpu.A & FC) !== 0 && (cpu.A & 0xC0) === 0xC0, `A=$${cpu.A.toString(16)}`);
  }

  return { results, pass, fail };
}

// ============================================================================
//  ROM sanity checks
// ============================================================================
function romSanity(rom) {
  const out = {};
  const board = new SoundBoard(rom, { logUnmapped: true });
  const cpu = new CPU6800(board);
  board.cpu = cpu;
  cpu.reset();
  cpu.CC |= FI;
  let reached = false, illegal = null, stepsPC = [];
  const startCyc = cpu.cycles;
  try {
    const idle = runToIdle(cpu, board, 5000);
    reached = true;
    out.idlePC = idle;
  } catch (e) {
    out.error = e.message;
    if (cpu.illegalOp !== null) illegal = cpu.illegalOp;
  }
  out.reached = reached;
  out.cyclesToIdle = cpu.cycles - startCyc;
  out.illegalOp = cpu.illegalOp;
  out.unmapped = [...board.unmapped];
  out.mirrorUsed = board.mirrorUsed;

  // Checksum: the ROM's CKSUM routine does ADCB over the ROM (carry included),
  // starting CLRB (which clears carry). Replicate: clrb; for X from $FFFF down:
  // ADCB [X]; DEX; CPX #$F000; BNE. That loop sums $F001..$FFFF (byte at $F000
  // itself excluded — it's the checksum slot) and STABs the result at $F000.
  // The prompt asks for the ADC-sum over $F000..$FFFF inclusive; we compute both.
  const adcSum = (lo, hi) => {
    let b = 0, carry = 0;
    for (let a = hi; a >= lo; a--) {
      const v = rom[a - 0xF000];
      const sum = b + v + carry;
      b = sum & 0xFF; carry = sum > 0xFF ? 1 : 0;
    }
    return b;
  };
  out.checksumB = adcSum(0xF000, 0xFFFF);       // full $F000..$FFFF (prompt's request)
  out.checksumBody = adcSum(0xF001, 0xFFFF);    // body only, as the CKSUM/NMI loop does
  out.firstByte = rom[0];                        // byte at $F000 (stored checksum slot, $74)
  // The in-ROM NMI diagnostic computes adcSum($F001..$FFFF) and CMPB against byte[$F000];
  // it passes when they're equal. (The actual CKSUM generator lives at CKORG=$EF00,
  // outside this 4K ROM image, so the stored $74 was produced by the original tooling.)
  out.bodyMatchesStored = out.checksumBody === out.firstByte;
  return out;
}

// ============================================================================
//  MAIN
// ============================================================================
const SOUNDS = [
  { name: 'flap_down', cmd: 0x20, frames: 9 },
  { name: 'flap_up', cmd: 0x21, frames: 9 },
  { name: 'run1', cmd: 0x22, frames: 8 },
  { name: 'run2', cmd: 0x23, frames: 8 },
  { name: 'skid', cmd: 0x26, frames: 24 },
  { name: 'skid_end', cmd: 0x27, frames: 16 },
  { name: 'thud', cmd: 0x08, frames: 30 },
  { name: 'cliff_thud', cmd: 0x06, frames: 12 },
  { name: 'egg', cmd: 0x03, frames: 30 },
  { name: 'egg_hatch', cmd: 0x02, frames: 30 },
  { name: 'die', cmd: 0x16, frames: 20 },
  { name: 'ptero_scream', cmd: 0x24, frames: 120 },
  { name: 'ptero_intro', cmd: 0x25, frames: 30 },
  { name: 'troll', cmd: 0x09, frames: 30 },
  { name: 'lava', cmd: 0x0D, frames: 30 },
  { name: 'transporter_enemy', cmd: 0x07, frames: 90 },
  { name: 'transporter_player', cmd: 0x12, frames: 40 },
  { name: 'mount', cmd: 0x0C, frames: 30 },
  { name: 'bounty', cmd: 0x1C, frames: 60 },
  { name: 'cliff', cmd: 0x19, frames: 90 },
  { name: 'extra_man', cmd: 0x0B, frames: 90 },
  { name: 'game_start', cmd: 0x1B, frames: 20 },
  { name: 'credit', cmd: 0x0A, frames: 40 },
];

function fmt(n, d = 3) { return Number(n).toFixed(d); }

function main() {
  const onlyTest = process.argv.includes('--test');
  const rom = loadRom();

  console.log('='.repeat(70));
  console.log('JOUST SOUND BOARD EMULATOR — verification & render');
  console.log('='.repeat(70));

  // (A) CPU unit tests
  console.log('\n[A] 6800 CPU unit tests');
  const t = runCpuTests();
  for (const r of t.results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '   << ' + r.detail}`);
  }
  console.log(`  --> ${t.pass} passed, ${t.fail} failed`);
  if (t.fail > 0) {
    console.log('\n!!! CPU UNIT TESTS FAILED — aborting. Fix the CPU core. !!!');
    process.exitCode = 1;
    return;
  }

  // (B) ROM sanity
  console.log('\n[B] ROM sanity');
  const s = romSanity(rom);
  console.log(`  Reached SETUP idle loop: ${s.reached} (PC=$${(s.idlePC||0).toString(16)}, ${s.cyclesToIdle} cycles)`);
  console.log(`  Illegal opcode during SETUP: ${s.illegalOp === null ? 'none' : '$' + s.illegalOp.toString(16)}`);
  console.log(`  ROM checksum (ADC-sum $F000..$FFFF into B): $${s.checksumB.toString(16).padStart(2, '0')}`);
  console.log(`  ROM checksum (ADC-sum $F001..$FFFF, as CKSUM/NMI loop): $${s.checksumBody.toString(16).padStart(2, '0')}`);
  console.log(`  Byte at $F000 (stored checksum): $${s.firstByte.toString(16).padStart(2, '0')} (expected $74)`);
  console.log(`  Stored $74 present: ${s.firstByte === 0x74 ? 'YES' : 'NO'}; NMI-diag body sum matches stored byte? ${s.bodyMatchesStored ? 'YES' : 'no'}`);
  console.log(`  Unmapped accesses during SETUP: ${s.unmapped.length ? s.unmapped.join(', ') : 'none'}`);
  console.log(`  ROM mirror used: ${s.mirrorUsed}`);
  if (!s.reached) {
    console.log('\n!!! SETUP did not reach idle. Debug CPU/PIA. !!!');
    process.exitCode = 1;
    return;
  }

  if (onlyTest) return;

  // (C) Render each sound
  console.log('\n[C] Rendering sounds');
  const outDir = path.join(__dirname, 'snd');
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = [];
  const plotData = []; // { name, samples }
  const statsRows = [];
  let anyMirror = false;
  const allUnmapped = new Set();

  for (const snd of SOUNDS) {
    let res, proc;
    let err = null;
    try {
      res = renderSound(rom, snd.cmd, snd.frames);
      proc = dacToSamples(res.dac, res.cyclesRun);
    } catch (e) {
      err = e.message;
    }
    if (err) {
      console.log(`  FAIL ${snd.name} (N=$${snd.cmd.toString(16)}): ${err}`);
      statsRows.push({ name: snd.name, cmd: snd.cmd, error: err });
      continue;
    }
    for (const u of res.unmapped) allUnmapped.add(u);
    if (res.mirrorUsed) anyMirror = true;

    const nDac = res.dac.length;
    const file = `${snd.name}.wav`;
    const filepath = path.join(outDir, file);

    if (nDac === 0 || proc.samples.length === 0) {
      console.log(`  FAIL ${snd.name} (N=$${snd.cmd.toString(16)}): SILENT — ${nDac} DAC writes`);
      statsRows.push({ name: snd.name, cmd: snd.cmd, dacWrites: nDac, silent: true });
      plotData.push({ name: snd.name + ' (SILENT)', samples: new Float32Array(1) });
      continue;
    }

    writeWav(filepath, proc.samples, SAMPLE_RATE);
    plotData.push({ name: snd.name, samples: proc.samples });

    const row = {
      name: snd.name, cmd: snd.cmd, file,
      dacWrites: nDac,
      durationSec: proc.durationSec,
      rms: proc.rms,
      peak: proc.peak,
      peakHz: proc.peakHz,
      ended: res.endedNaturally,
    };
    statsRows.push(row);
    manifest.push({
      name: snd.name,
      cmd: snd.cmd,
      file,
      durationSec: Number(proc.durationSec.toFixed(4)),
      rms: Number(proc.rms.toFixed(4)),
      peakHz: Math.round(proc.peakHz),
    });
  }

  // Write manifest
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // (D) Contact sheet PNG
  makeContactSheet(path.join(outDir, 'plots.png'), plotData);

  // Print stats table
  console.log('\n  Per-sound stats:');
  console.log('  ' + 'name'.padEnd(20) + 'cmd  ' + 'DACwr'.padStart(7) + 'dur(s)'.padStart(9) +
    'rms'.padStart(8) + 'peak'.padStart(8) + 'domHz'.padStart(8) + '  end');
  console.log('  ' + '-'.repeat(74));
  for (const r of statsRows) {
    if (r.error) { console.log(`  ${r.name.padEnd(20)}  ERROR: ${r.error}`); continue; }
    if (r.silent) { console.log(`  ${r.name.padEnd(20)}$${r.cmd.toString(16).padStart(2, '0')}   SILENT (0 DAC writes) — FAIL`); continue; }
    console.log('  ' + r.name.padEnd(20) +
      ('$' + r.cmd.toString(16).padStart(2, '0')).padEnd(5) +
      String(r.dacWrites).padStart(7) +
      fmt(r.durationSec).padStart(9) +
      fmt(r.rms).padStart(8) +
      fmt(r.peak).padStart(8) +
      String(Math.round(r.peakHz)).padStart(8) +
      (r.ended ? '  yes' : '  cap'));
  }

  console.log('\n  Global: ROM mirror ever used: ' + anyMirror);
  console.log('  Global unmapped accesses: ' + (allUnmapped.size ? [...allUnmapped].join(', ') : 'none'));
  console.log(`\n  Wrote ${manifest.length} WAVs to ${outDir}`);
  console.log(`  Wrote manifest.json and plots.png`);
}

// ============================================================================
//  Contact sheet PNG rendering
// ============================================================================
function makeContactSheet(filepath, plots) {
  const cols = 3;
  const rows = Math.ceil(plots.length / cols);
  const cellW = 320, cellH = 120;
  const pad = 8, labelH = 16;
  const W = cols * cellW;
  const H = rows * cellH;
  const rgb = new Uint8Array(W * H * 3);
  // background dark
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = 18; rgb[i * 3 + 1] = 18; rgb[i * 3 + 2] = 24; }

  const setPx = (x, y, r, g, b) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const o = (y * W + x) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
  };
  const hline = (x0, x1, y, r, g, b) => { for (let x = x0; x <= x1; x++) setPx(x, y, r, g, b); };
  const vline = (x, y0, y1, r, g, b) => { for (let y = y0; y <= y1; y++) setPx(x, y, r, g, b); };

  // tiny 5x7 pixel font for labels (uppercase, digits, few symbols)
  const FONT = miniFont();
  const drawText = (s, x, y, r, g, b) => {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const glyph = FONT[ch] || FONT['?'];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row] & (1 << (4 - col))) setPx(cx + col, y + row, r, g, b);
        }
      }
      cx += 6;
    }
  };

  for (let i = 0; i < plots.length; i++) {
    const cx = (i % cols) * cellW;
    const cy = Math.floor(i / cols) * cellH;
    const plotX0 = cx + pad;
    const plotX1 = cx + cellW - pad;
    const plotY0 = cy + labelH + pad;
    const plotY1 = cy + cellH - pad;
    const plotW = plotX1 - plotX0;
    const plotH = plotY1 - plotY0;
    const midY = Math.floor((plotY0 + plotY1) / 2);

    // cell border
    hline(cx, cx + cellW - 1, cy, 40, 40, 55);
    hline(cx, cx + cellW - 1, cy + cellH - 1, 40, 40, 55);
    vline(cx, cy, cy + cellH - 1, 40, 40, 55);
    vline(cx + cellW - 1, cy, cy + cellH - 1, 40, 40, 55);

    // zero line
    hline(plotX0, plotX1, midY, 55, 55, 70);

    // label
    drawText(plots[i].name, cx + pad, cy + 4, 180, 200, 255);

    // waveform: downsample to plotW columns, min/max envelope
    const samp = plots[i].samples;
    const n = samp.length;
    if (n > 1) {
      for (let px = 0; px < plotW; px++) {
        const a = Math.floor(px * n / plotW);
        const b = Math.max(a + 1, Math.floor((px + 1) * n / plotW));
        let mn = Infinity, mx = -Infinity;
        for (let k = a; k < b && k < n; k++) { const v = samp[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
        if (mn === Infinity) continue;
        const yTop = midY - Math.round(mx * (plotH / 2));
        const yBot = midY - Math.round(mn * (plotH / 2));
        for (let y = Math.min(yTop, yBot); y <= Math.max(yTop, yBot); y++) {
          setPx(plotX0 + px, y, 90, 220, 130);
        }
      }
    }
  }

  writePng(filepath, W, H, rgb);
}

// A compact 5x7 bitmap font (rows are 5-bit patterns). Enough glyphs for labels.
function miniFont() {
  // Each glyph: array of 7 rows, each a 5-bit number (bit4=leftmost).
  const F = {};
  const def = (ch, rows) => { F[ch] = rows; };
  def(' ', [0,0,0,0,0,0,0]);
  def('?', [0b01110,0b10001,0b00001,0b00110,0b00100,0b00000,0b00100]);
  def('_', [0,0,0,0,0,0,0b11111]);
  def('(', [0b00010,0b00100,0b01000,0b01000,0b01000,0b00100,0b00010]);
  def(')', [0b01000,0b00100,0b00010,0b00010,0b00010,0b00100,0b01000]);
  def('.', [0,0,0,0,0,0,0b00100]);
  def('A', [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001]);
  def('B', [0b11110,0b10001,0b11110,0b10001,0b10001,0b10001,0b11110]);
  def('C', [0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110]);
  def('D', [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110]);
  def('E', [0b11111,0b10000,0b11110,0b10000,0b10000,0b10000,0b11111]);
  def('F', [0b11111,0b10000,0b11110,0b10000,0b10000,0b10000,0b10000]);
  def('G', [0b01110,0b10001,0b10000,0b10111,0b10001,0b10001,0b01111]);
  def('H', [0b10001,0b10001,0b11111,0b10001,0b10001,0b10001,0b10001]);
  def('I', [0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110]);
  def('J', [0b00111,0b00010,0b00010,0b00010,0b10010,0b10010,0b01100]);
  def('K', [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001]);
  def('L', [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111]);
  def('M', [0b10001,0b11011,0b10101,0b10101,0b10001,0b10001,0b10001]);
  def('N', [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001]);
  def('O', [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110]);
  def('P', [0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000]);
  def('Q', [0b01110,0b10001,0b10001,0b10001,0b10101,0b10010,0b01101]);
  def('R', [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001]);
  def('S', [0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110]);
  def('T', [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100]);
  def('U', [0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110]);
  def('V', [0b10001,0b10001,0b10001,0b10001,0b10001,0b01010,0b00100]);
  def('W', [0b10001,0b10001,0b10001,0b10101,0b10101,0b11011,0b10001]);
  def('X', [0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001]);
  def('Y', [0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100]);
  def('Z', [0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111]);
  def('0', [0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110]);
  def('1', [0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110]);
  def('2', [0b01110,0b10001,0b00001,0b00110,0b01000,0b10000,0b11111]);
  def('3', [0b11111,0b00010,0b00100,0b00010,0b00001,0b10001,0b01110]);
  def('4', [0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010]);
  def('5', [0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110]);
  def('6', [0b00110,0b01000,0b10000,0b11110,0b10001,0b10001,0b01110]);
  def('7', [0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000]);
  def('8', [0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110]);
  def('9', [0b01110,0b10001,0b10001,0b01111,0b00001,0b00010,0b01100]);
  return F;
}

// Only run the full pipeline when invoked directly (not when imported for debugging).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}

export { CPU6800, SoundBoard, CYCLES, loadRom, runToIdle, renderSound, dacToSamples, FI, FC, FZ, FN, FV, FH };
