/**
 * R2.0 FAMILY wave 16 — SF2-style alternate palettes.
 *
 * One authored alt per fighter, implemented as a hue remap of the shipped
 * atlases on an offscreen canvas (game.js owns the canvas; this module owns
 * the DATA and the pure pixel math so tests can hold determinism and the
 * skin-guard to account without a DOM).
 *
 * Authoring rules:
 *  - Windows target the fighter's SIGNATURE clothing/accent hues only.
 *  - Skin stays skin: a global guard skips the low/mid-saturation orange band
 *    every human tone in the cast lives in, and windows may not opt out of it.
 *  - Neutral (near-grey) clothing uses a `colorize` window instead of a
 *    rotation, because rotating a grey pixel's hue is a no-op.
 *
 * All math is deterministic integer-in/integer-out: the same bytes always
 * produce the same bytes, which is what lets both online peers build the
 * exact same alt atlas from the same shipped art.
 */

export const PALETTE_COUNT = 2; // 0 = primary art, 1 = the authored alt

// --- Pure color helpers ----------------------------------------------------

export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, light];
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0));
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return [hue * 60, sat, light];
}

function hueChannel(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToRgb(hue, sat, light) {
  const h = ((hue % 360) + 360) % 360 / 360;
  if (sat <= 0) {
    const v = Math.round(light * 255);
    return [v, v, v];
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return [
    Math.round(hueChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueChannel(p, q, h) * 255),
    Math.round(hueChannel(p, q, h - 1 / 3) * 255),
  ];
}

function hueDistance(a, b) {
  const delta = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(delta, 360 - delta);
}

/**
 * The band every skin tone in the cast sits in: low-to-mid saturation orange.
 * Windows can never remap it — "shift accents and clothing, never skin". The
 * band carries a half-degree/percent margin over the nominal 8-46° range so
 * 8-bit RGB rounding at the edges can never leak a skin pixel into a window.
 */
export function isSkinTone(hue, sat, light) {
  return hue >= 6.5 && hue <= 47.5 && sat >= 0.08 && sat <= 0.7 && light >= 0.18 && light <= 0.93;
}

// --- Authored alt palettes -------------------------------------------------

const window_ = (values) => Object.freeze({
  center: 0, width: 0, rotate: 0, satScale: 1, lightScale: 1, minSat: 0.3,
  maxSat: 1, minLight: 0.06, maxLight: 0.97, colorize: null,
  ...values,
});

export const FIGHTER_ALT_PALETTES = Object.freeze({
  deathblow: Object.freeze({
    name: "STEEL SHIFT",
    accent: "#3f6fe0",
    windows: Object.freeze([
      // Crimson work gear -> foreman blue. High sat floor keeps flushed skin out.
      window_({ center: 355, width: 32, rotate: 225, minSat: 0.52 }),
    ]),
  }),
  jez: Object.freeze({
    name: "MAGENTA MARQUEE",
    accent: "#ff3fae",
    windows: Object.freeze([
      // The blue gi and cyan sign-light trims swing to neon magenta.
      window_({ center: 200, width: 60, rotate: 130, minSat: 0.2 }),
    ]),
  }),
  alan: Object.freeze({
    name: "NIGHT SHIFT",
    accent: "#4a7bd0",
    windows: Object.freeze([
      // Alan dresses in neutrals: colorize the greys toward a navy work shirt.
      window_({ minSat: 0, maxSat: 0.14, minLight: 0.18, maxLight: 0.9, colorize: Object.freeze({ hue: 216, sat: 0.34 }) }),
    ]),
  }),
  post: Object.freeze({
    name: "FRESH CAN",
    accent: "#2fd9a8",
    windows: Object.freeze([
      // Signature magenta paint -> spearmint; deep purples ride along.
      window_({ center: 310, width: 48, rotate: 200, minSat: 0.25 }),
    ]),
  }),
  benny: Object.freeze({
    name: "HOT LEAD",
    accent: "#ff7a2f",
    windows: Object.freeze([
      // Electric blues -> hazard orange (target may be orange; source is not).
      window_({ center: 222, width: 52, rotate: 155, minSat: 0.22 }),
    ]),
  }),
  donald: Object.freeze({
    name: "PLATINUM PACKAGE",
    accent: "#c8d3e2",
    windows: Object.freeze([
      // The gold goes platinum: tight window, drained saturation, lifted light.
      window_({ center: 50, width: 10, rotate: 8, minSat: 0.5, satScale: 0.22, lightScale: 1.12 }),
    ]),
  }),
  cyraxx: Object.freeze({
    name: "BASEMENT GREEN",
    accent: "#5fae62",
    windows: Object.freeze([
      // The dusty blue tee -> dusty olive. Muted, per CYRAXX.md identity.
      window_({ center: 214, width: 42, rotate: -110, minSat: 0.1, maxSat: 0.8 }),
    ]),
  }),
  ali: Object.freeze({
    name: "STAINES PINK",
    accent: "#ff48aa",
    windows: Object.freeze([
      // The yellow tracksuit -> west-side hot pink. Sat floor guards skin.
      window_({ center: 52, width: 14, rotate: 250, minSat: 0.52 }),
    ]),
  }),
  devil: Object.freeze({
    name: "CRANBERRY BOG",
    accent: "#c23b52",
    windows: Object.freeze([
      // The moss-green wraps, shin bindings and charm glow swing to cranberry
      // crimson — the OTHER thing the barrens are famous for. His umber hide
      // and bone chest sit inside the protected skin band and never move.
      window_({ center: 95, width: 40, rotate: 255, minSat: 0.18, satScale: 1.15, lightScale: 0.95 }),
    ]),
  }),
  commissioner: Object.freeze({
    name: "MIDNIGHT DOCKET",
    accent: "#3a4f9e",
    windows: Object.freeze([
      // The maroon suit -> midnight blue. The gold cane tip stays gold.
      window_({ center: 350, width: 28, rotate: 245, minSat: 0.5 }),
    ]),
  }),
});

export function getAltPalette(fighterId) {
  return FIGHTER_ALT_PALETTES[fighterId] || null;
}

// --- Pure remap math -------------------------------------------------------

/**
 * Remap one opaque pixel through a palette spec. Returns the new [r, g, b].
 * Deterministic: pure integer/float math, no randomness, no state.
 */
export function remapPixel(r, g, b, spec) {
  const [hue, sat, light] = rgbToHsl(r, g, b);
  if (isSkinTone(hue, sat, light)) return [r, g, b];
  for (const win of spec?.windows || []) {
    if (sat < win.minSat || sat > win.maxSat) continue;
    if (light < win.minLight || light > win.maxLight) continue;
    if (win.colorize) {
      return hslToRgb(win.colorize.hue, win.colorize.sat, light);
    }
    if (hueDistance(hue, win.center) > win.width) continue;
    return hslToRgb(
      hue + win.rotate,
      Math.min(1, Math.max(0, sat * win.satScale)),
      Math.min(0.97, Math.max(0.03, light * win.lightScale)),
    );
  }
  return [r, g, b];
}

/**
 * Remap RGBA bytes in place (any array-like of length 4n). Transparent pixels
 * are untouched so atlas alpha, outlines and gutters survive byte-identical.
 */
export function remapImageBytes(bytes, spec) {
  for (let index = 0; index < bytes.length; index += 4) {
    if (bytes[index + 3] === 0) continue;
    const [r, g, b] = remapPixel(bytes[index], bytes[index + 1], bytes[index + 2], spec);
    bytes[index] = r;
    bytes[index + 1] = g;
    bytes[index + 2] = b;
  }
  return bytes;
}

/**
 * Resolve the palette pair a match should render, mirror-rule applied: when
 * both sides picked the same fighter AND the same palette, side 1 flips to
 * the other palette so mirrors are readable. Pure so both online peers (and
 * every rollback rebuild) derive the identical pair from the shared config.
 */
export function resolveMatchPalettes(fighterIds = [], picks = []) {
  const palettes = [0, 1].map((side) => (picks?.[side] === 1 ? 1 : 0));
  if (fighterIds[0] && fighterIds[0] === fighterIds[1] && palettes[0] === palettes[1]) {
    palettes[1] = palettes[0] === 1 ? 0 : 1;
  }
  return palettes;
}

export function auditAltPalettes(fighterIds = Object.keys(FIGHTER_ALT_PALETTES)) {
  const errors = [];
  for (const fighterId of fighterIds) {
    const spec = FIGHTER_ALT_PALETTES[fighterId];
    if (!spec) {
      errors.push(`${fighterId}: missing alt palette`);
      continue;
    }
    if (!spec.name || !/^#[0-9a-f]{6}$/iu.test(spec.accent || "")) errors.push(`${fighterId}: bad name/accent`);
    if (!spec.windows?.length) errors.push(`${fighterId}: no remap windows`);
    for (const win of spec.windows || []) {
      // No window may sit inside the protected skin band.
      if (!win.colorize && win.width > 0) {
        const lo = win.center - win.width;
        const hi = win.center + win.width;
        for (let hue = Math.floor(lo); hue <= Math.ceil(hi); hue += 1) {
          const wrapped = ((hue % 360) + 360) % 360;
          if (wrapped >= 8 && wrapped <= 46 && win.minSat < 0.5) {
            errors.push(`${fighterId}: window overlaps skin band without a high sat floor`);
            break;
          }
        }
      }
      if (win.colorize && win.maxSat > 0.2) errors.push(`${fighterId}: colorize window too greedy`);
    }
  }
  return { fighters: fighterIds.length, errors };
}
