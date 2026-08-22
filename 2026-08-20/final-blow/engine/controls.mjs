export const CONTROL_STYLES = Object.freeze(["classic", "modern"]);

// The approved four-button classic layout. Everything else in the game is reached
// through the directional control plus these four buttons.
export const ATTACK_BUTTONS = Object.freeze(["lp", "hp", "lk", "hk"]);

export const BUTTON_LABELS = Object.freeze({ lp: "LP", hp: "HP", lk: "LK", hk: "HK" });

export const BUTTON_NAMES = Object.freeze({
  lp: "LIGHT PUNCH",
  hp: "HEAVY PUNCH",
  lk: "LIGHT KICK",
  hk: "HEAVY KICK",
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
 *  - during the finishing window a single fresh button executes a finisher
 */
export function resolveFourButtonInput(raw = {}, {
  facing = 1,
  style = "classic",
  meter = 0,
  finishing = false,
  finishArmed = true,
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

  // A fresh single press finishes the round; LP/LK pick finisher A, HP/HK pick B.
  if (finishing) {
    if (!finishArmed) return out;
    out.final = true;
    out.button = pressed[0];
    out.finisherVariant = (edge.hp || edge.hk) ? 1 : 0;
    return out;
  }

  const punchChord = (edge.lp && held.hp) || (edge.hp && held.lp);
  const kickChord = (edge.lk && held.hk) || (edge.hk && held.lk);
  const heavyChord = (edge.hp && held.hk) || (edge.hk && held.hp);
  const lightChord = (edge.lp && held.lk) || (edge.lk && held.lp);

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
 */
export function applyControlStyle(input, style, facing = 1) {
  const normalized = { ...input };
  if (normalizeControlStyle(style) !== "modern") return normalized;
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
