export const CONTROL_STYLES = Object.freeze(["classic", "modern", "legend"]);

// R1.9 SCHOOL & POCKET: the one-button LEGEND style trades a flat slice of
// special-class damage for auto-motions. The scale is deterministic match
// config (state.controlStyle offline, matchConfig.controlStyles online), so
// both rollback peers always apply it identically.
export const LEGEND_DAMAGE_SCALE = 0.9;

// The five actions LEGEND reaches with a single button — exactly these carry
// the damage tax. Chorded EX moves still require the two-button press, so
// they stay full price.
const LEGEND_SCALED_ACTIONS = new Set([
  "special", "commandSpecial", "backSpecial", "launcher", "super",
]);

export function legendScaledAction(action) {
  return LEGEND_SCALED_ACTIONS.has(action);
}

// The approved four-button classic layout. Everything else in the game is reached
// through the directional control plus these four buttons.
export const ATTACK_BUTTONS = Object.freeze(["lp", "hp", "lk", "hk"]);

export const BUTTON_LABELS = Object.freeze({ lp: "LP", hp: "HP", lk: "LK", hk: "HK" });

export const BUTTON_NAMES = Object.freeze({
  lp: "JAB",
  hp: "HOOK",
  lk: "LIGHT KICK",
  hk: "ROUNDHOUSE",
});

export const REMAPPABLE_ACTIONS = Object.freeze([
  "left", "right", "up", "down", "lp", "hp", "lk", "hk",
]);

export const DEFAULT_KEY_MAPS = Object.freeze([
  Object.freeze({
    left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS",
    lp: "KeyJ", hp: "KeyK", lk: "KeyN", hk: "KeyM",
  }),
  Object.freeze({
    left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown",
    lp: "Numpad1", hp: "Numpad2", lk: "Numpad4", hk: "Numpad5",
  }),
]);

// Standard Gamepad API face-button order is 0=A, 1=B, 2=X, 3=Y, so the requested
// XInput mapping (X = LP, Y = HP, A = LK, B = HK) lands on these indices.
export const DEFAULT_PAD_MAP = Object.freeze({ lp: 2, hp: 3, lk: 0, hk: 1 });

export const PAD_BUTTON_LABELS = Object.freeze(["A", "B", "X", "Y", "LB", "RB", "LT", "RT"]);

export const PAD_LABEL_SETS = Object.freeze({
  xinput: PAD_BUTTON_LABELS,
  playstation: Object.freeze(["CROSS", "CIRCLE", "SQUARE", "TRIANGLE", "L1", "R1", "L2", "R2"]),
  nintendo: Object.freeze(["B", "A", "Y", "X", "L", "R", "ZL", "ZR"]),
});

export function detectPadLabelSet(id = "") {
  const text = String(id).toLowerCase();
  if (/dualsense|dualshock|playstation|\bps[345]\b|sony|054c/.test(text)) return "playstation";
  if (/nintendo|switch|joy-?con|pro controller|057e/.test(text)) return "nintendo";
  return "xinput";
}

export function padButtonLabel(index, labelSet = "xinput") {
  const labels = PAD_LABEL_SETS[labelSet] || PAD_BUTTON_LABELS;
  return labels[index] ?? PAD_BUTTON_LABELS[index] ?? `B${index}`;
}

export function buttonStrength(button) {
  return button === "hp" || button === "hk" ? "heavy" : "light";
}

export function buttonLimb(button) {
  return button === "lk" || button === "hk" ? "kick" : "punch";
}

export function normalizeControlStyle(style) {
  return CONTROL_STYLES.includes(style) ? style : "classic";
}

export function normalizeKeyMaps(value) {
  return DEFAULT_KEY_MAPS.map((defaults, player) => {
    const candidate = value?.[player] || {};
    const normalized = {};
    for (const action of REMAPPABLE_ACTIONS) {
      const code = candidate[action];
      normalized[action] = typeof code === "string" && code.length <= 32 ? code : defaults[action];
    }
    return normalized;
  });
}

export function remapKeyBinding(keyMaps, player, action, code) {
  const maps = normalizeKeyMaps(keyMaps);
  if (![0, 1].includes(player) || !REMAPPABLE_ACTIONS.includes(action) || typeof code !== "string") return maps;
  const previous = maps[player][action];
  const conflict = REMAPPABLE_ACTIONS.find((name) => name !== action && maps[player][name] === code);
  maps[player][action] = code;
  if (conflict) maps[player][conflict] = previous;
  return maps;
}

export function normalizePadMap(value) {
  const normalized = {};
  for (const [action, fallback] of Object.entries(DEFAULT_PAD_MAP)) {
    const button = Number(value?.[action]);
    normalized[action] = Number.isInteger(button) && button >= 0 && button < PAD_BUTTON_LABELS.length
      ? button : fallback;
  }
  return normalized;
}

export function remapPadBinding(padMap, action, button) {
  const map = normalizePadMap(padMap);
  if (!(action in DEFAULT_PAD_MAP) || !Number.isInteger(button) || button < 0 || button >= PAD_BUTTON_LABELS.length) return map;
  const previous = map[action];
  const conflict = Object.keys(DEFAULT_PAD_MAP).find((name) => name !== action && map[name] === button);
  map[action] = button;
  if (conflict) map[conflict] = previous;
  return map;
}

export function formatKeyCode(code) {
  return String(code)
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Numpad/, "NUM ")
    .replace(/^Arrow/, "")
    .replace("Space", "SPACE")
    .toUpperCase();
}

export const SUPER_GRIT_COST = 100;
export const ENHANCED_GRIT_COST = 25;

// A single public ordering shared by neutral starts, cancels and buffered
// wakeups. Motion attacks count as specials. This is intentionally explicit so
// a same-frame chord can never be eaten by the normal used to complete it.
export const TOURNAMENT_ACTION_PRIORITY = Object.freeze([
  "super",
  "enhancedLauncher", "enhancedBackSpecial", "enhancedCommandSpecial", "enhanced",
  "enhancedThrowObject",
  "throwObject", "launcher", "backSpecial", "driveHeavy", "commandSpecial", "special",
  "throw",
  "heavy", "light",
]);

export function hasFlowSkipInput(input = {}) {
  if (input.fourButton && ATTACK_BUTTONS.some((button) => input[button])) return true;
  return Boolean(input.jump || input.up || input.light || input.heavy || input.special
    || input.enhanced || input.throw || input.super || input.final);
}

/**
 * Translate the raw four-button pad/keyboard/touch reading into the engine's
 * action vocabulary. Nothing here needs a fifth button:
 *
 *  - direction only: walk, crouch, jump (up), block (away), crouch-block (down-away)
 *  - LP / HP / LK / HK: the four normals, selected by stance and direction
 *  - motion + punch: command specials; motion + kick: the kit's base special
 *  - LP+HP or LK+HK chord: enhanced (EX) version of whatever motion preceded it
 *  - HP+HK chord at full Grit, or a double-quarter-circle motion: super
 *  - double-tap Down (tauntArmed) + LK&HK chord: the punishable taunt. It is
 *    encoded as light+heavy+kick — a combination no other resolution emits —
 *    so it round-trips the existing 16-bit net input with no new bits.
 *  - during the finishing window LP selects Finisher A and LK selects Finisher B
 */
export function resolveFourButtonInput(raw = {}, {
  facing = 1,
  style = "classic",
  meter = 0,
  finishing = false,
  finishArmed = true,
  tauntArmed = false,
} = {}) {
  const held = {
    lp: Boolean(raw.lpHeld ?? raw.lp),
    hp: Boolean(raw.hpHeld ?? raw.hp),
    lk: Boolean(raw.lkHeld ?? raw.lk),
    hk: Boolean(raw.hkHeld ?? raw.hk),
  };
  const edge = {
    lp: Boolean(raw.lp),
    hp: Boolean(raw.hp),
    lk: Boolean(raw.lk),
    hk: Boolean(raw.hk),
  };
  const out = {
    left: Boolean(raw.left),
    right: Boolean(raw.right),
    down: Boolean(raw.down),
    up: Boolean(raw.up),
    guard: false,
    jump: Boolean(raw.jump || raw.up),
    light: false,
    heavy: false,
    special: false,
    enhanced: false,
    throw: false,
    super: false,
    final: false,
    punch: false,
    kick: false,
    limb: "punch",
    button: "",
    anyAttackHeld: held.lp || held.hp || held.lk || held.hk,
  };

  const pressed = ATTACK_BUTTONS.filter((button) => edge[button]);
  if (!pressed.length) return out;

  // Finishers are deliberately restricted to one fresh light-button press:
  // LP selects A and LK selects B. HP/HK and multi-button chords are swallowed
  // by the finishing window so they cannot execute a finisher accidentally.
  if (finishing) {
    if (!finishArmed) return out;
    if (pressed.length !== 1 || (pressed[0] !== "lp" && pressed[0] !== "lk")) return out;
    out.final = true;
    out.button = pressed[0];
    out.finisherVariant = pressed[0] === "lk" ? 1 : 0;
    return out;
  }

  const punchChord = (edge.lp && held.hp) || (edge.hp && held.lp);
  const kickChord = (edge.lk && held.hk) || (edge.hk && held.lk);
  const heavyChord = (edge.hp && held.hk) || (edge.hk && held.hp);
  const lightChord = (edge.lp && held.lk) || (edge.lk && held.lp);

  // Release 1.7 wave 11: the taunt outranks the EX read only inside the
  // double-tap-Down arm window, and works at any meter. light+heavy+kick is
  // the wire encoding — no other path ever raises light and heavy together.
  if (kickChord && tauntArmed) {
    out.taunt = true;
    out.light = true;
    out.heavy = true;
    out.limb = "kick";
    out.button = "hk";
    return out;
  }
  if (heavyChord && meter >= SUPER_GRIT_COST) {
    out.super = true;
    out.button = "hp";
    return out;
  }
  if ((punchChord || kickChord) && meter >= ENHANCED_GRIT_COST) {
    out.enhanced = true;
    out.limb = punchChord ? "punch" : "kick";
    out.button = punchChord ? "hp" : "hk";
    return out;
  }
  if (normalizeControlStyle(style) === "modern" && lightChord) {
    // Simplified style: a light chord reaches the special without a motion.
    const absolute = (out.right ? 1 : 0) - (out.left ? 1 : 0);
    if (out.down) out.special = true;
    else if (absolute === -facing) out.backSpecial = true;
    else out.commandSpecial = true;
    out.button = "lp";
    return out;
  }
  if (normalizeControlStyle(style) === "legend" && pressed.length === 1 && (edge.hp || edge.hk)) {
    // LEGEND one-button style: HP is the special button (the super at full
    // Grit), HK the kit's base special; LP/LK stay honest normals so pokes,
    // proximity throws and finishers keep working unchanged. Everything here
    // emits only the standard 16-bit action vocabulary — `special` plus the
    // KICK limb bit — and applyControlStyle() resolves the held direction
    // into the concrete special identically on both rollback peers.
    if (edge.hp && meter >= SUPER_GRIT_COST) {
      out.super = true;
      out.button = "hp";
      return out;
    }
    out.special = true;
    out.limb = edge.hk ? "kick" : "punch";
    out.button = edge.hk ? "hk" : "hp";
    return out;
  }

  // Ordinary normal. One press produces exactly one deliberate attack.
  const button = edge.hp ? "hp" : edge.hk ? "hk" : edge.lp ? "lp" : "lk";
  const strength = buttonStrength(button);
  out[strength] = true;
  out.limb = buttonLimb(button);
  out.button = button;
  out[out.limb] = true;
  return out;
}

/**
 * Legacy control-style hook. Classic requires the authored motions; the
 * simplified style is handled inside resolveFourButtonInput, so this now only
 * normalizes and is kept so saved preferences and replays stay valid.
 *
 * R1.9: LEGEND expands its single `special` pulse here — this runs inside the
 * simulation for both fighters on both peers (remote inputs decode through
 * bitsToInput first), so the direction-to-special mapping needs no new wire
 * bits and can never diverge. `context.airborne` keeps the air special
 * reachable: an airborne pulse stays plain `special` (the air special path).
 */
export function applyControlStyle(input, style, facing = 1, context = {}) {
  const normalized = { ...input };
  const resolved = normalizeControlStyle(style);
  if (resolved === "legend") {
    if (input.special && !input.commandSpecial && !input.backSpecial
      && input.limb !== "kick" && !context.airborne) {
      const absolute = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      normalized.special = false;
      if (input.down) normalized.launcher = true;
      else if (absolute === -facing) normalized.backSpecial = true;
      else normalized.commandSpecial = true;
    }
    return normalized;
  }
  if (resolved !== "modern") return normalized;
  const absolute = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (input.special && !input.commandSpecial && !input.backSpecial) {
    if (input.down) {
      normalized.commandSpecial = true;
      normalized.special = false;
    } else if (absolute === -facing) {
      normalized.backSpecial = true;
      normalized.special = false;
    } else if (absolute === facing) {
      normalized.commandSpecial = true;
      normalized.special = false;
    }
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// R1.9 wave 15: thumb-slide sector math for the 3x3 touch movement pad.
// Pure geometry so it is unit-testable: given a pointer offset from the pad
// centre (screen coordinates, y grows downward) and the pad's half-extent,
// answer which direction tokens that thumb position means. The game layer
// diffs consecutive answers to swap tokens in the existing touch Set as the
// thumb crosses cells — no new inputs, no new net bits, just the same
// left/right/up/down vocabulary readInput already speaks. CONTROLS.md
// decision 5 (directions recorded on state change) is what makes the rolled
// QCF/DP sequences this produces recognisable.
// ---------------------------------------------------------------------------
export const TOUCH_PAD_RULES = Object.freeze({
  // Inside this fraction of the pad radius the thumb reads as neutral — the
  // resting spot over the centre cell.
  deadZoneRatio: 0.17,
  sectorDegrees: 45,
  // 5.x phone flick-to-dash (sweep #41). A flick is horizontal travel of at
  // least this fraction of the pad radius inside flickWindowMs (6 frames at
  // 60 Hz — the same 100 ms a keyboard double-tap comfortably fits in), that
  // LANDS at least flickLandRatio from the centre in the flick's direction.
  // The landing test is what keeps the thumb's return swing honest: coming
  // back from the pad edge to rest overshoots the centre by a cell at most,
  // never by 0.45R, so a snappy return does not read as a backdash. On the
  // 844x390 target the pad radius is ~75 px, so a flick is ~45 px of travel.
  flickDistanceRatio: 0.6,
  flickLandRatio: 0.45,
  flickWindowMs: 100,
});

// Pure flick read over the pointer's recent horizontal samples
// ([{ t: ms, x: offset-from-centre }] in arrival order, newest last). Returns
// +1 (flick toward screen right), -1 (toward screen left) or 0. The game layer
// clears the sample history once a flick lands, so the same sweep can never
// fire twice; a fresh flick needs fresh travel.
export function touchPadFlick(samples, radius, rules = TOUCH_PAD_RULES) {
  if (!Array.isArray(samples) || samples.length < 2 || !(radius > 0)) return 0;
  const latest = samples[samples.length - 1];
  if (!latest || !Number.isFinite(latest.x) || !Number.isFinite(latest.t)) return 0;
  const minTravel = radius * rules.flickDistanceRatio;
  const minLanding = radius * rules.flickLandRatio;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const sample = samples[index];
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.t)) continue;
    if (latest.t - sample.t > rules.flickWindowMs) break;
    const travel = latest.x - sample.x;
    if (Math.abs(travel) < minTravel) continue;
    const direction = travel > 0 ? 1 : -1;
    if (latest.x * direction >= minLanding) return direction;
  }
  return 0;
}

// Drops samples that have aged out of the flick window so a thumb resting on
// the pad for a whole round does not accumulate a history.
export function pruneFlickSamples(samples, now, rules = TOUCH_PAD_RULES) {
  while (samples.length && now - samples[0].t > rules.flickWindowMs) samples.shift();
  return samples;
}

// Octant index 0 is due east (screen +x), winding clockwise in y-down screen
// space, each sector 45 degrees wide and centred on its cardinal/diagonal.
const TOUCH_SECTOR_TOKENS = Object.freeze([
  Object.freeze(["right"]),
  Object.freeze(["down", "right"]),
  Object.freeze(["down"]),
  Object.freeze(["down", "left"]),
  Object.freeze(["left"]),
  Object.freeze(["up", "left"]),
  Object.freeze(["up"]),
  Object.freeze(["up", "right"]),
]);

export function touchPadTokens(dx, dy, radius, rules = TOUCH_PAD_RULES) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return [];
  if (Math.hypot(dx, dy) < radius * rules.deadZoneRatio) return [];
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const octant = ((Math.round(angle / rules.sectorDegrees) % 8) + 8) % 8;
  return [...TOUCH_SECTOR_TOKENS[octant]];
}

// ---------------------------------------------------------------------------
// 5.1 (sweep #29 / #31): one source of truth for "how do I do X in the active
// control style". Until now the move list, the school step labels, the
// options-dialog motion lines and the touch super prompt each hard-coded the
// CLASSIC motions, so a MODERN player was told to roll ↓ → for a special the
// LP&LK chord already gives them and a LEGEND player was never told HP is the
// special button. The table mirrors resolveFourButtonInput/applyControlStyle
// exactly: MODERN's chord reaches the command special (neutral or ↓), the back
// special (away) and nothing else — the base kick special, launcher and super
// motion stay classic; LEGEND's HP pulse is expanded by direction (↓ launcher,
// away back special, else command special), HK is the base special and an
// airborne HP/HK is the air special. EX chords and the taunt are style-free.
// ---------------------------------------------------------------------------
const CLASSIC_COMMANDS = Object.freeze({
  special: "↓ → + KICK",
  airSpecial: "↓ → + KICK IN THE AIR",
  commandSpecial: "↓ → + PUNCH",
  backSpecial: "↓ ← + PUNCH",
  launcher: "→ ↓ → + PUNCH",
  driveHeavy: "← → + KICK",
  enhanced: "MOTION + LP&HP OR LK&HK",
  enhancedCommandSpecial: "↓ → + LP&HP",
  enhancedBackSpecial: "↓ ← + LP&HP",
  enhancedLauncher: "→ ↓ → + LP&HP",
  super: "↓ → ↓ → + PUNCH OR HP&HK",
  throw: "CLOSE + TOWARD/AWAY + LP OR LK",
  throwObject: "↓ ← + KICK",
  enhancedThrowObject: "↓ ← + LK&HK",
  guardReversal: "IN BLOCKSTUN · LP&HP OR TOWARD + ↓ → + PUNCH",
  taunt: "↓ ↓ + LK&HK",
  dash: "DOUBLE-TAP ← OR →",
  stageWeapon: "↓ + HP OVER THE OBJECT",
  perfectGuard: "TAP AWAY AS THE HIT LANDS",
  airTech: "ANY BUTTON WHILE JUGGLED",
  quickRise: "↑ WHILE DOWN",
  delayWake: "HOLD ↓ WHILE DOWN",
});

export const CONTROL_STYLE_COMMANDS = Object.freeze({
  classic: CLASSIC_COMMANDS,
  modern: Object.freeze({
    ...CLASSIC_COMMANDS,
    commandSpecial: "LP&LK",
    backSpecial: "← + LP&LK",
    super: "HP&HK AT FULL GRIT",
    guardReversal: "IN BLOCKSTUN · LP&HP OR TOWARD + LP&LK",
  }),
  legend: Object.freeze({
    ...CLASSIC_COMMANDS,
    special: "HK",
    airSpecial: "HP OR HK IN THE AIR",
    commandSpecial: "HP",
    backSpecial: "← + HP",
    launcher: "↓ + HP",
    super: "HP AT FULL GRIT",
    guardReversal: "IN BLOCKSTUN · LP&HP OR TOWARD + HP",
  }),
});

/**
 * The command copy for `action` under `style`. Unknown actions fall back to
 * `fallback` (a kit's authored command string, say) and then to the action
 * name upper-cased, so a caller can never render an empty command cell.
 */
export function commandLabel(action, style = "classic", fallback = "") {
  const table = CONTROL_STYLE_COMMANDS[normalizeControlStyle(style)] || CLASSIC_COMMANDS;
  return table[action] || fallback || String(action || "").toUpperCase();
}

/**
 * Replaces `{action}` tokens in a copy template with the style's command —
 * school step labels and the dialog motion lines are authored once this way
 * and rendered for whichever style is live.
 */
export function styleCopy(template, style = "classic") {
  return String(template || "").replace(/\{([a-zA-Z]+)\}/g, (_, action) => commandLabel(action, style));
}
