// bot.js — autopilot that plays through the area. Drives the attract-mode
// demo behind the title screen and the automated playthrough tests. It only
// produces the same intent a player's controller would.
import { clamp, angDiff } from './util.js';

const angOf = (dx, dp) => Math.atan2(dx, dp);

export class Bot {
  constructor(g) { this.g = g; this.stuckT = 0; this.bestP = -1e9; this.wander = 0; this.wanderDir = 1; this.grenCd = 0; this.skill = 1; }

  intent(dt) {
    const g = this.g, J = g.joe, col = g.col, T = g.T;
    const I = { mx: 0, mp: 0, aimX: 0, aimP: 0, aimDist: null, aimGround: null, fire: false, gren: false, strafe: true, pause: false, src: 'bot' };
    if (!J.alive) return I;
    this.grenCd -= dt;

    // ---- target: most threatening visible soldier
    let tgt = null, tgtScore = -1e9;
    for (const e of g.enemies) {
      if (!e.alive || !g.hittable(e)) continue;
      const dx = e.x - J.x, dp = e.p - J.p, d = Math.hypot(dx, dp);
      if (d > 21 || !g.onScreen(e.x, e.p, 0)) continue;
      if (!col.los(J.x, J.p, e.x, e.p)) continue;
      const s = -d + (e.state === 'aim' ? 8 : 0) + (e.sniper ? 6 : 0) + (dp > 0 ? 2 : 0);
      if (s > tgtScore) { tgtScore = s; tgt = e; }
    }

    // ---- grenade targets: mortar pits, bunkers, trench lines, clusters
    let gTgt = null;
    if (J.grenades > 0 && this.grenCd <= 0) {
      const cands = [];
      for (const e of g.enemies) {
        if (!e.alive) continue;
        if (e.mortar || e.trench || (e.cover && e.s.a.crouch > 0.6)) cands.push({ x: e.x, p: e.p, w: e.mortar ? 3 : 1.5 });
      }
      for (const b of g.bunkers || []) if (b.alive && b.active) cands.push({ x: b.x, p: b.p - 1.6, w: 3 });
      for (const tr of g.trucks) if (!tr.dead) cands.push({ x: tr.x, p: tr.p, w: 2 });
      for (const tk of g.tanks) if (!tk.dead) cands.push({ x: tk.x, p: tk.p, w: 5 });
      for (const c of cands) {
        const d = Math.hypot(c.x - J.x, c.p - J.p);
        if (d > 4.5 && d < 13 && c.p > J.p - 2) { if (!gTgt || c.w > gTgt.w || (c.w === gTgt.w && d < gTgt.d)) gTgt = { ...c, d }; }
      }
    }

    // ---- where to go
    const f = g.finale, A = g.area;
    let gx, gp;
    const pow = g.pows.find(w => w.state === 'tied' && w.p > J.p - 3 && w.p < J.p + 14 && Math.abs(w.x - J.x) < 16);
    const cage = g.world.dyn.cages.find(c => !c.open && c.p > J.p - 3 && c.p < J.p + 16);
    const tank = g.tanks.find(tk => !tk.dead);
    if (f && f.phase !== 'done') { gx = clamp(J.x, -6, 6); gp = A.wallP - 12.5; }
    else if (f && f.phase === 'done') { gx = 0; gp = A.wallP + 6; }
    else if (tank && Math.hypot(tank.x - J.x, tank.p - J.p) < 22) { gx = tank.x + (J.x > tank.x ? 5 : -5); gp = tank.p - 9; }   // circle at grenade range
    else if (cage) { gx = cage.x; gp = cage.p - 1.8; }
    else if (pow) { gx = pow.x; gp = pow.p; }
    else {
      const ahead = J.p + 8;
      gx = T.roadX(ahead) * 0.6 + this.wander * this.wanderDir; gp = ahead;
      // keep pushing, but sidestep anyone who gets right in our face
      if (tgt) { const d = Math.hypot(tgt.x - J.x, tgt.p - J.p); if (d < 6 && tgt.p > J.p) { gp = J.p + 0.5; gx = J.x + (J.x > tgt.x ? 3 : -3); } else if (d < 14) gp = J.p + 3; }
    }
    // progress watchdog → wander sideways when the planner can't find a way
    if (J.p > this.bestP + 0.5) { this.bestP = J.p; this.stuckT = 0; } else this.stuckT += dt;
    if (this.stuckT > 4) { this.wander = 8; this.wanderDir = -this.wanderDir; this.stuckT = 0; }
    this.wander = Math.max(0, this.wander - dt * 1.5);
    // route around walls, trenches and the river with a small local A*
    this.planT = (this.planT || 0) - dt;
    if (this.planT <= 0 || !this.path) { this.planT = 0.35; this.path = this.plan(gx, gp); }
    if (this.path && this.path.length) {
      while (this.path.length > 1 && Math.hypot(this.path[0][0] - J.x, this.path[0][1] - J.p) < 1.2) this.path.shift();
      const wp = this.path[Math.min(1, this.path.length - 1)];
      gx = wp[0]; gp = wp[1];
    }

    // ---- danger field: incoming rounds, telegraphed blasts, snipers
    const danger = (x, p) => {
      let d = 0;
      for (const b of g.ebullets) {
        if ((b.age || 0) < (1 - this.skill) * 0.45) continue;   // human-ish reaction time
        const vx = b.vx, vp = b.vp, s2 = vx * vx + vp * vp;
        const t = clamp(((x - b.x) * vx + (p - b.p) * vp) / s2, 0, 0.7);
        const cx = b.x + vx * t, cp = b.p + vp * t;
        const m = Math.hypot(x - cx, p - cp);
        if (m < 1.3) d += (1.3 - m) * 3;
      }
      for (const n of g.nades) {
        if (n.owner === 'joe') continue;
        const m = Math.hypot(x - n.tx, p - n.tp), R = n.owner === 'mortar' ? 3.4 : 3.1;
        if (m < R) d += (R - m) * 4;
      }
      for (const e of g.enemies) if (e.sniper && e.alive && e.laser > 0.5) { const m = Math.hypot(x - J.x, p - J.p); d += m < 0.6 ? 2 : 0; }
      // searchlight pools and oncoming motorcycles
      for (const sl of g.world.dyn.searchlights) if (sl.on) { const m = Math.hypot(x - sl.tx, p - sl.tp); if (m < 3.4) d += (3.4 - m) * 2 * this.skill; }
      for (const mo of g.motos) {
        if (mo.dead) continue;
        for (let k = 0.2; k < 1.2; k += 0.2) { const m = Math.hypot(x - (mo.x + mo.vx * k), p - (mo.p + mo.vp * k)); if (m < 1.8) d += (1.8 - m) * 3; }
      }
      return d;
    };

    // ---- choose a heading among 16 (plus standing still)
    const goalA = angOf(gx - J.x, gp - J.p), goalD = Math.hypot(gx - J.x, gp - J.p);
    let best = null, bestS = -1e9;
    const here = danger(J.x, J.p);
    for (let i = -1; i < 16; i++) {
      const a = i < 0 ? 0 : i / 16 * Math.PI * 2, step = i < 0 ? 0 : 1.1;
      const nx = J.x + Math.sin(a) * step, np = J.p + Math.cos(a) * step;
      let s = 0;
      if (i >= 0) {
        if (col.blocked(nx, np, 0.48, 'joe') || col.blocked(J.x + Math.sin(a) * 0.5, J.p + Math.cos(a) * 0.5, 0.45, 'joe')) continue;
        if (Math.abs(nx) > g.world.boundHalf(np)) continue;
        if (np < g.viewBottom() + 1.5) continue;
        s += Math.cos(angDiff(a, goalA)) * Math.min(1.5, goalD * 0.3);
        if (this.lastA !== undefined) s += Math.cos(angDiff(a, this.lastA)) * 0.15;   // hysteresis
      } else s += goalD < 1 ? 1 : -0.4;
      s -= danger(nx, np) * 1.5 * this.skill;
      if (s > bestS) { bestS = s; best = i < 0 ? null : a; }
    }
    if (best !== null) { I.mx = Math.sin(best); I.mp = Math.cos(best); this.lastA = best; }

    // ---- aim & fire
    if (gTgt) {
      I.aimX = gTgt.x - J.x; I.aimP = gTgt.p - J.p; I.aimDist = gTgt.d; I.gren = true; this.grenCd = 1.4;
    } else if (tgt) {
      const d = Math.hypot(tgt.x - J.x, tgt.p - J.p), lead = d / 36;
      I.aimX = tgt.x + (tgt.x - tgt.px) * 60 * lead - J.x; I.aimP = tgt.p + (tgt.p - tgt.pp) * 60 * lead - J.p;
      if (this.skill < 1) { const a = Math.atan2(I.aimX, I.aimP) + (Math.random() - 0.5) * (1 - this.skill) * 0.5, L = Math.hypot(I.aimX, I.aimP); I.aimX = Math.sin(a) * L; I.aimP = Math.cos(a) * L; }
      I.fire = true;
    } else {
      // shoot supply crates and red barrels near enemies occasionally? keep it simple: face travel
      I.aimX = I.mx; I.aimP = I.mp || 1;
      I.strafe = false;
    }
    return I;
  }

  // local A* over a 1 m grid around Joe; returns [[x,p], ...] toward the goal
  plan(gx, gp) {
    const g = this.g, J = g.joe, col = g.col;
    const R = 1.0, W = 38, H = 34;
    const x0 = -W / 2 * R, p0 = Math.floor(J.p) - 6;
    const blocked = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      const p = p0 + j * R, hw = g.world.boundHalf(p);
      for (let i = 0; i < W; i++) {
        const x = x0 + i * R;
        blocked[j * W + i] = (Math.abs(x) > hw || p < g.viewBottom() + 1.2 || col.blocked(x, p, 0.5, 'joe')) ? 1 : 0;
      }
    }
    const cell = (x, p) => [clamp(Math.round((x - x0) / R), 0, W - 1), clamp(Math.round((p - p0) / R), 0, H - 1)];
    let [si, sj] = cell(J.x, J.p), [ti, tj] = cell(gx, gp);
    blocked[sj * W + si] = 0;
    // nearest open cell to the goal
    if (blocked[tj * W + ti]) {
      let best = null, bd = 1e9;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (!blocked[j * W + i]) { const d = Math.hypot(i - ti, (j - tj) * 1.2); if (d < bd) { bd = d; best = [i, j]; } }
      if (!best) return null; [ti, tj] = best;
    }
    const N = W * H, gs = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [sj * W + si]; gs[open[0]] = 0;
    const hfn = (k) => Math.hypot((k % W) - ti, ((k / W) | 0) - tj);
    let found = -1, iter = 0;
    while (open.length && iter++ < 4000) {
      let bi = 0, bf = 1e9;
      for (let q = 0; q < open.length; q++) { const f = gs[open[q]] + hfn(open[q]); if (f < bf) { bf = f; bi = q; } }
      const k = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (closed[k]) continue; closed[k] = 1;
      const i = k % W, j = (k / W) | 0;
      if (i === ti && j === tj) { found = k; break; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni; if (blocked[nk] || closed[nk]) continue;
        if (di && dj && (blocked[j * W + ni] || blocked[nj * W + i])) continue;
        const c = gs[k] + (di && dj ? 1.414 : 1);
        if (c < gs[nk]) { gs[nk] = c; from[nk] = k; open.push(nk); }
      }
    }
    if (found < 0) return null;
    const path = [];
    for (let k = found; k >= 0; k = from[k]) path.push([x0 + (k % W) * R, p0 + ((k / W) | 0) * R]);
    path.reverse();
    return path;
  }
}
