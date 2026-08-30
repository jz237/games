import assert from "node:assert/strict";
import test from "node:test";

import {
  FIGHTER_KITS,
  FIGHTER_WIN_QUOTES,
  selectWinQuote,
} from "../engine/fighter-kits.mjs";
import {
  ARCADE_BOSS_DIALOGUE,
  ARCADE_RIVAL_DIALOGUE,
  ARCADE_RIVALS,
  auditArcadeDialogue,
  bossDialogueVariants,
  rivalDialogueVariants,
} from "../engine/arcade.mjs";
import {
  FIGHTER_ALT_PALETTES,
  auditAltPalettes,
  hslToRgb,
  isSkinTone,
  remapImageBytes,
  remapPixel,
  resolveMatchPalettes,
  rgbToHsl,
} from "../engine/palettes.mjs";
import { BLACK_BOOK_ENTRIES, blackBookObserve, createBlackBookProgress, evaluateBlackBook } from "../engine/progression.mjs";

// Wave 17: the Pinelands Devil joins the mains; the Commissioner stays the
// extra tenth voice.
const MAINS = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil"];
const EVERYONE = [...MAINS, "commissioner"];

// --- Context win-quote pools -------------------------------------------------

test("every fighter carries full win-quote pools with 3+ variants", () => {
  assert.deepEqual(Object.keys(FIGHTER_WIN_QUOTES), EVERYONE);
  for (const fighterId of EVERYONE) {
    const pools = FIGHTER_WIN_QUOTES[fighterId];
    for (const name of ["default", "rival", "fatality", "flawless", "comeback"]) {
      assert.ok(pools[name]?.length >= 3, `${fighterId}.${name} has 3+ variants`);
      assert.equal(new Set(pools[name]).size, pools[name].length, `${fighterId}.${name} lines are distinct`);
      for (const line of pools[name]) assert.equal(line, line.toUpperCase(), `${fighterId}.${name} caption-cased`);
    }
  }
  // The nine mains gloat over the beaten boss; the boss gloats at his mirror.
  for (const fighterId of MAINS) assert.ok(FIGHTER_WIN_QUOTES[fighterId].boss?.length >= 3, `${fighterId}.boss pool`);
  assert.ok(FIGHTER_WIN_QUOTES.commissioner.mirror?.length >= 3);
  // The rival pool names the SPECIFIC rival for every paired fighter (wave 17
  // rebalance: cyraxx↔devil, ali↔commissioner).
  const rivalNames = { deathblow: "ALLAN", jez: "POST", alan: "DEATHBLOW", post: "JEZ", benny: "DONALD", donald: "BENNY", cyraxx: "DEVIL", devil: "CYRAXX", ali: "COMMISSIONER", commissioner: "MR. G" };
  for (const [fighterId, rivalName] of Object.entries(rivalNames)) {
    assert.ok(
      FIGHTER_WIN_QUOTES[fighterId].rival.some((line) => line.includes(rivalName)),
      `${fighterId} rival pool addresses ${rivalName}`,
    );
  }
});

test("the win-quote selector honours context priority and never repeats back-to-back", () => {
  // Priority: fatality beats everything, then flawless, comeback, boss, rival.
  assert.equal(selectWinQuote("jez", { fatality: true, flawless: true, rival: true }, 0).pool, "fatality");
  assert.equal(selectWinQuote("jez", { flawless: true, comeback: true, rival: true }, 0).pool, "flawless");
  assert.equal(selectWinQuote("jez", { comeback: true, rival: true }, 0).pool, "comeback");
  assert.equal(selectWinQuote("jez", { boss: true, rival: true }, 0).pool, "boss");
  assert.equal(selectWinQuote("jez", { rival: true }, 0).pool, "rival");
  assert.equal(selectWinQuote("jez", {}, 0).pool, "default");
  assert.equal(selectWinQuote("commissioner", { mirror: true }, 0).pool, "mirror");
  // Unknown fighter -> null so the caller can fall back.
  assert.equal(selectWinQuote("nobody", {}, 0), null);
  // Deterministic in the roll: the same roll picks the same line.
  assert.deepEqual(selectWinQuote("alan", {}, 0.4), selectWinQuote("alan", {}, 0.4));
  // No-repeat: whatever was shown last is excluded while alternatives exist.
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const first = selectWinQuote("post", { rival: true }, roll);
    const second = selectWinQuote("post", { rival: true }, roll, first.key);
    assert.notEqual(second.key, first.key, `roll ${roll} must rotate`);
  }
});

// --- Rival & boss dialogue ---------------------------------------------------

test("dialogue data covers every rival pair and every FINAL BOUT challenger", () => {
  const audit = auditArcadeDialogue(EVERYONE);
  assert.deepEqual(audit.errors, []);
  // Wave 17: five full pairs across ten fighters, ten FINAL BOUT exchanges.
  assert.equal(audit.rivalPairs, 5);
  assert.equal(audit.bossExchanges, 10);
  // Both directions of a rivalry resolve to the same authored conversation.
  for (const [playerId, rivalId] of Object.entries(ARCADE_RIVALS)) {
    const variants = rivalDialogueVariants(playerId, rivalId);
    assert.ok(variants?.length >= 2, `${playerId}/${rivalId} has 2+ variants`);
    assert.equal(variants, rivalDialogueVariants(rivalId, playerId));
  }
  // Every challenger (and the mirror) gets a Commissioner exchange: he opens,
  // they answer, two cards each.
  for (const challengerId of EVERYONE) {
    const variants = bossDialogueVariants(challengerId);
    assert.ok(variants?.length >= 2, `${challengerId} boss exchange`);
    for (const variant of variants) {
      assert.equal(variant.length, 2);
      assert.equal(variant[0].id, "commissioner");
      assert.equal(variant[1].id, challengerId);
    }
  }
  assert.equal(rivalDialogueVariants("deathblow", "jez"), null, "non-rivals have no exchange");
});

test("dialogue lines are two-card exchanges in caption case", () => {
  for (const variants of [...Object.values(ARCADE_RIVAL_DIALOGUE), ...Object.values(ARCADE_BOSS_DIALOGUE)]) {
    for (const variant of variants) {
      assert.equal(variant.length, 2);
      for (const card of variant) {
        assert.ok(card.line.length >= 10, "real spoken lines");
        assert.equal(card.line, card.line.toUpperCase());
      }
    }
  }
});

// --- Alt palettes ------------------------------------------------------------

test("every fighter has an authored alt palette and the audit holds", () => {
  assert.deepEqual(Object.keys(FIGHTER_ALT_PALETTES), Object.keys(FIGHTER_KITS));
  assert.deepEqual(auditAltPalettes().errors, []);
});

test("palette remap is pure, deterministic and byte-stable", () => {
  const spec = FIGHTER_ALT_PALETTES.jez;
  // Purity: the same pixel maps to the same pixel every time.
  assert.deepEqual(remapPixel(20, 180, 220, spec), remapPixel(20, 180, 220, spec));
  // A signature-hue pixel moves; determinism across independent buffers.
  const bytes = () => new Uint8ClampedArray([
    20, 180, 220, 255, // saturated cyan — inside Jez's window
    200, 150, 120, 255, // skin tone — must never move
    10, 10, 10, 0, // transparent — must never move
  ]);
  const first = remapImageBytes(bytes(), spec);
  const second = remapImageBytes(bytes(), spec);
  assert.deepEqual([...first], [...second]);
  const source = bytes();
  assert.notDeepEqual([...first.slice(0, 3)], [...source.slice(0, 3)], "signature hue remaps");
  assert.deepEqual([...first.slice(4, 8)], [...source.slice(4, 8)], "skin pixels never remap");
  assert.deepEqual([...first.slice(8, 12)], [...source.slice(8, 12)], "transparent pixels untouched");
});

test("the skin band is protected for every fighter's spec", () => {
  // Sample the whole protected band: no spec may move any skin-band pixel.
  for (let hue = 8; hue <= 46; hue += 2) {
    for (const sat of [0.15, 0.3, 0.45, 0.6]) {
      for (const light of [0.3, 0.5, 0.7, 0.85]) {
        assert.ok(isSkinTone(hue, sat, light));
        const [r, g, b] = hslToRgb(hue, sat, light);
        for (const [fighterId, spec] of Object.entries(FIGHTER_ALT_PALETTES)) {
          assert.deepEqual(remapPixel(r, g, b, spec), [r, g, b], `${fighterId} must not touch skin h${hue} s${sat} l${light}`);
        }
      }
    }
  }
});

test("round-tripping color helpers stays within a rounding step", () => {
  for (const [r, g, b] of [[255, 0, 0], [18, 203, 232], [214, 181, 107], [102, 20, 33], [128, 128, 128]]) {
    const [h, s, l] = rgbToHsl(r, g, b);
    const [r2, g2, b2] = hslToRgb(h, s, l);
    assert.ok(Math.abs(r - r2) <= 2 && Math.abs(g - g2) <= 2 && Math.abs(b - b2) <= 2, `${r},${g},${b} round-trips`);
  }
});

test("match palette resolution applies the mirror auto-alt on both peers identically", () => {
  assert.deepEqual(resolveMatchPalettes(["jez", "alan"], [0, 0]), [0, 0]);
  assert.deepEqual(resolveMatchPalettes(["jez", "alan"], [1, 0]), [1, 0]);
  // A mirror with matching picks flips P2 to the other color.
  assert.deepEqual(resolveMatchPalettes(["jez", "jez"], [0, 0]), [0, 1]);
  assert.deepEqual(resolveMatchPalettes(["jez", "jez"], [1, 1]), [1, 0]);
  // A mirror with distinct picks is left alone.
  assert.deepEqual(resolveMatchPalettes(["jez", "jez"], [1, 0]), [1, 0]);
  // Garbage picks normalize to primary.
  assert.deepEqual(resolveMatchPalettes(["jez", "alan"], [7, undefined]), [0, 0]);
});

// --- Unlock gating (the progression rule the select screen keys off) --------

test("KEEPER'S KEYS inks exactly when a FINAL-difficulty arcade run ends", () => {
  const progress = createBlackBookProgress();
  const entry = BLACK_BOOK_ENTRIES.find(({ id }) => id === "keepers-keys");
  assert.ok(entry, "the ledger carries the unlock entry");
  // A normal-difficulty clear does not qualify.
  blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: "jez" });
  evaluateBlackBook(progress, "2026-08-30");
  assert.equal(progress.unlocked["keepers-keys"], undefined);
  assert.equal(entry.test(progress), false);
  // The FINAL clear does.
  blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: "jez", finalDifficulty: true });
  assert.equal(progress.tallies.finalArcadeClears, 1);
  assert.equal(entry.test(progress), true);
  const fresh = evaluateBlackBook(progress, "2026-08-30");
  assert.ok(fresh.some(({ id }) => id === "keepers-keys"));
});
