// Fighter facing resolution.
//
// The rule the arena has to honour is simple to state and easy to break: two
// opposing fighters always face each other. The subtlety is that they must do
// it from a *single* shared decision. Resolving each fighter independently is
// what let the pair drift apart — one fighter locked mid-attack while the other
// turned freely, and the two sprites ended up pointing the same way with nobody
// looking at anybody.
//
// So this module resolves one axis for the pair and derives both fighters from
// it. A fighter that is free to turn always snaps to that axis; a fighter that
// is still committed to an attack keeps what it had until its hitboxes close.
// The pair can therefore never disagree except during a committed cross-up,
// which is deliberate.

export const FACING_RULES = Object.freeze({
  // Horizontal distance inside which the shared axis stops re-evaluating. At a
  // near-perfect overlap the sign of dx flips every frame, and re-facing on it
  // made sprites jitter left-right during cross-throughs and deep jump-ins.
  //
  // The deadband holds the *axis*, not each fighter's stale value. That
  // distinction is the whole fix: a fighter free to turn still snaps onto the
  // held axis, so it can no longer sit inside the overlap facing backwards.
  deadband: 14,
  // How long a committed attacker may hold a direction before a viewer reads it
  // as simply wrong. This is the same tolerance the browser suite's
  // sustained-wrong-facing guard uses when it counts a streak, so the two agree
  // on what "visible" means. A move is free to commit its direction for this
  // long no matter where the opponent is; only past it does reach matter.
  lockVisibilityFrames: 21,
});

// Facing is only ever +1 or -1. Zero is the dangerous value: the renderer flips
// sprites with ctx.scale(facing, 1), so a 0 would collapse a fighter to a
// zero-width sliver. Math.sign() on an exact tie returns exactly that, which is
// why nothing here is allowed to reach the caller unnormalized.
export function normalizeFacing(value, fallback = 1) {
  return value === 1 || value === -1 ? value : fallback;
}

// The shared axis points from fighter A (side 0) toward fighter B (side 1).
// Inside the deadband — including an exact positional tie — the previous axis
// carries over, which is what keeps a deep cross-through from strobing.
export function resolveFacingAxis(previousAxis, aX, bX, deadband = FACING_RULES.deadband) {
  const held = normalizeFacing(previousAxis, 1);
  const delta = bX - aX;
  if (!Number.isFinite(delta)) return held;
  if (Math.abs(delta) <= Math.max(0, deadband)) return held;
  return delta > 0 ? 1 : -1;
}

// Resolve both fighters at once. `aCanTurn`/`bCanTurn` are false while a
// fighter's attack can still connect, preserving a committed cross-up direction
// so whiffs stay punishable instead of auto-correcting the hitbox.
//
// Returns the axis alongside the two facings; callers must persist the axis
// (and roll it back with the rest of the simulation) so the deadband's memory
// resimulates identically on both peers.
export function resolvePairFacing({
  previousAxis = 1,
  aX = 0,
  bX = 0,
  aFacing = 1,
  bFacing = -1,
  aCanTurn = true,
  bCanTurn = true,
  deadband = FACING_RULES.deadband,
} = {}) {
  const axis = resolveFacingAxis(previousAxis, aX, bX, deadband);
  return {
    axis,
    // A turn-eligible fighter is snapped onto the axis unconditionally. It is
    // never left holding a stale value, which is what used to strand fighters
    // facing away from each other after an airborne crossover.
    aFacing: aCanTurn ? axis : normalizeFacing(aFacing, axis),
    bFacing: bCanTurn ? -axis : normalizeFacing(bFacing, -axis),
  };
}

// The frame after which a move can no longer touch anyone. For most moves this
// equals activeEndFrame; for single-window moves with long active tails it lets
// the fighter turn a few frames sooner.
export function attackLastHitboxFrame(attack) {
  if (!attack) return -1;
  const boxes = attack.hitboxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return attack.activeEndFrame ?? -1;
  let last = 0;
  for (const entry of boxes) last = Math.max(last, (entry.to ?? 0) + 1);
  const activeEnd = attack.activeEndFrame ?? Infinity;
  return Math.min(activeEnd, (attack.activeStartFrame ?? 0) + last);
}

// The body-local span a move's hitboxes cover, in world units, measured along
// the fighter's facing. `near` is the closest edge, `far` the furthest. Derived
// from the authored hitbox data so it tracks whatever the kits actually ship —
// no per-move or per-fighter exceptions.
//
// A move with no usable box data returns an unbounded span, which keeps the
// facing lock behaving exactly as it did before any reach test existed.
export function attackReachSpan(attack, scale = 1) {
  const unbounded = { near: -Infinity, far: Infinity };
  if (!attack) return unbounded;
  const boxes = attack.hitboxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return unbounded;
  let near = Infinity;
  let far = -Infinity;
  for (const entry of boxes) {
    const shape = entry?.box;
    if (!shape || !Number.isFinite(shape.x) || !Number.isFinite(shape.width)) continue;
    near = Math.min(near, shape.x * scale);
    far = Math.max(far, (shape.x + shape.width) * scale);
  }
  return Number.isFinite(near) && Number.isFinite(far) ? { near, far } : unbounded;
}

// Could this move still touch an opponent sitting `offset` world units away,
// where offset is signed along the attacker's facing (positive = in front)?
//
// `allowance` is how far the opponent's own body reaches toward the attacker,
// so a fighter whose origin sits outside the hitbox span but whose shoulder
// does not still counts as reachable.
export function opponentWithinAttackReach(attack, offset, scale = 1, allowance = 0) {
  if (!Number.isFinite(offset)) return true;
  const { near, far } = attackReachSpan(attack, scale);
  if (!Number.isFinite(near) || !Number.isFinite(far)) return true;
  const padding = Number.isFinite(allowance) ? Math.max(0, allowance) : 0;
  return offset >= near - padding && offset <= far + padding;
}

// A fighter may turn whenever it is not attacking, or once its last hitbox
// window has closed.
//
// It may also turn while still committed if the opponent is demonstrably
// outside what the move can reach. The lock exists to protect a committed
// cross-up hitbox; once the opponent is somewhere that hitbox cannot go, the
// lock protects nothing and only leaves the fighter visibly facing the wrong
// way — which is exactly what a long EX move looks like at range.
//
// `opponentOffset` must already be signed along the fighter's facing. Omitting
// it keeps the pure frame-window behaviour.
export function fighterCanTurn(fighter, {
  opponentOffset = null,
  scale = 1,
  allowance = 0,
  visibilityFrames = FACING_RULES.lockVisibilityFrames,
} = {}) {
  if (!fighter?.attacking) return true;
  if (fighter.attackFrame > attackLastHitboxFrame(fighter.attacking)) return true;
  if (opponentOffset === null) return false;
  // Every move gets to commit its direction unconditionally for the visibility
  // window. Short normals finish inside it and behave exactly as before, so a
  // teleporting opponent cannot rob a committed attack of its cross-up. Only a
  // move still swinging past that window — the long EX specials 1.9 added — is
  // asked whether it could actually still reach anybody.
  if (!(fighter.attackFrame > visibilityFrames)) return false;
  return !opponentWithinAttackReach(fighter.attacking, opponentOffset, scale, allowance);
}
