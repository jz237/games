// Authored-facing metadata for the fighter sprite sheets.
//
// The renderer's convention is that every atlas cell is drawn facing RIGHT
// and mirrored by the fighter's numeric facing. Post's sheets break that
// assumption: most of his base-bank frames were generated facing LEFT while
// his attack actives extend RIGHT, so at facing +1 his head and body read
// backward while punches still travel toward the opponent (Jez's mobile
// report, 1.9E). This table records, per fighter / bank / frame, which way
// the AUTHORED art actually points; the renderer multiplies its mirror by
// this value so the drawn fighter always reads toward the opponent.
//
// Classification rule (documented so future art passes stay consistent):
// frames with a directional effect (a punch extension, a spray) are classed
// by the effect's direction, because hitboxes and projectiles must read as
// travelling toward the opponent; neutral frames are classed by the head and
// body read. Sequential rows are kept to one value where possible so a move
// does not flip mid-animation — the exception is post's specials row 3,
// whose art alternates direction frame to frame.
//
// Every fighter absent from this table is fully right-authored (verified
// frame by frame during the 1.9E fix). tests/atlas-facing.test.mjs locks the
// table's shape; the browser suite locks the ASSETS to this table with
// perceptual hashes, so silently re-exported art forces a human re-check.

const FRAMES_PER_BANK = 16;

export const ATLAS_FACING = Object.freeze({
  post: Object.freeze({
    // Idle 0-3, walk 4-7, windup 8, recovery 11, block/crouch 12, air 13 and
    // down 15 are left-authored; the punch actives 9-10 and the spray active
    // 14 extend right.
    base: Object.freeze([-1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, -1, -1, -1, 1, -1]),
    // Row 0 (0-3) is the straight spray, right. Rows 1-2 (4-11) read left.
    // Row 3 mixes per frame: 12 sprays left, 13 and 14 spray right, 15 is
    // the near-frontal victory pose that reads left.
    specials: Object.freeze([1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, -1]),
  }),
});

/**
 * The direction the authored art points for one atlas cell: +1 right
 * (the default convention), -1 left (the renderer must add a flip).
 */
export function atlasFrameFacing(fighterId, bank, frame) {
  return ATLAS_FACING[fighterId]?.[bank]?.[frame] ?? 1;
}

/** Sanity audit: every override table covers whole banks with ±1 entries. */
export function auditAtlasFacing() {
  const errors = [];
  for (const [fighterId, banks] of Object.entries(ATLAS_FACING)) {
    for (const [bank, frames] of Object.entries(banks)) {
      if (frames.length !== FRAMES_PER_BANK) {
        errors.push(`${fighterId}/${bank}: ${frames.length} entries, expected ${FRAMES_PER_BANK}`);
      }
      frames.forEach((value, index) => {
        if (value !== 1 && value !== -1) errors.push(`${fighterId}/${bank}[${index}]: ${value}`);
      });
    }
  }
  return Object.freeze({ fighters: Object.keys(ATLAS_FACING).length, errors: Object.freeze(errors) });
}
