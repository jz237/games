export const CONTROL_STYLES = Object.freeze(["classic", "modern"]);
export const REMAPPABLE_ACTIONS = Object.freeze([
  "left", "right", "jump", "down", "guard", "light", "heavy", "special", "final",
]);

export const DEFAULT_KEY_MAPS = Object.freeze([
  Object.freeze({ left: "KeyA", right: "KeyD", jump: "KeyW", down: "KeyS", guard: "KeyI", light: "KeyJ", heavy: "KeyK", special: "KeyL", final: "KeyU" }),
  Object.freeze({ left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", down: "ArrowDown", guard: "Numpad5", light: "Numpad1", heavy: "Numpad2", special: "Numpad3", final: "Numpad0" }),
]);

export const DEFAULT_PAD_MAP = Object.freeze({
  jump: 0,
  guard: 1,
  light: 2,
  heavy: 3,
  special: 4,
  final: 7,
});

export const PAD_BUTTON_LABELS = Object.freeze(["A", "B", "X", "Y", "LB", "RB", "LT", "RT"]);

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

export function applyControlStyle(input, style, facing = 1) {
  const normalized = { ...input };
  if (normalizeControlStyle(style) !== "modern") return normalized;
  const absolute = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (input.special) {
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
  if (input.heavy && input.down && !input.special) {
    normalized.launcher = true;
    normalized.heavy = false;
  }
  return normalized;
}
