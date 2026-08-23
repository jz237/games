import assert from "node:assert/strict";
import test from "node:test";

import {
  GRAPHIC_FATALITIES,
  GRAPHIC_FATALITY_LIMBS,
  auditGraphicFatalities,
  getGraphicFatality,
  graphicFatalitySnapshot,
} from "../engine/fatalities.mjs";
import { FIGHTER_THROWABLES } from "../engine/throwables.mjs";

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];
const projectileFocusTokens = Object.freeze({
  deathblow: "PIZZA",
  jez: "MOUSE",
  alan: "LOOGIE",
  post: "WIRE",
  benny: "X-ACTO",
  donald: "GOLF",
  cyraxx: "BED-BUG",
  ali: "VINYL",
});

test("all eight fighters receive two unique graphic fatalities", () => {
  const audit = auditGraphicFatalities(fighters.map((id) => ({ id, projectile: FIGHTER_THROWABLES[id] })));
  assert.deepEqual(audit, { fighters: 8, fatalities: 16, errors: [] });
  assert.equal(Object.keys(GRAPHIC_FATALITIES).length, 8);
  for (const fighter of fighters) {
    for (const fatality of GRAPHIC_FATALITIES[fighter]) {
      assert.equal(fatality.special, FIGHTER_THROWABLES[fighter].name, `${fatality.id} must name the assigned projectile`);
      assert.equal(fatality.projectileId, FIGHTER_THROWABLES[fighter].id, `${fatality.id} must use the assigned projectile`);
      for (const field of ["caption", "projectileSetup", "projectileAction", "projectileFinale"]) {
        assert.match(fatality[field], new RegExp(projectileFocusTokens[fighter]),
          `${fatality.id} ${field} must make the assigned projectile the focus`);
      }
      assert.ok(GRAPHIC_FATALITY_LIMBS.includes(fatality.limb), `${fatality.id} must sever a complete limb`);
      assert.ok(fatality.device, `${fatality.id} must have a deliberate restraint device`);
      assert.equal(fatality.rating, "R");
    }
  }
});

test("the audit rejects a fatality that does not match the assigned projectile", () => {
  const audit = auditGraphicFatalities([{ id: "deathblow", projectile: { id: "brick", name: "PHILLY BRICK" } }]);
  assert.deepEqual(audit.errors, [
    "deathblow:wrong-projectile:faultline-rupture",
    "deathblow:wrong-projectile:aftershock-burial",
  ]);
});

test("variant selection is stable and wraps safely", () => {
  for (const fighter of fighters) {
    assert.equal(getGraphicFatality(fighter, 0), GRAPHIC_FATALITIES[fighter][0]);
    assert.equal(getGraphicFatality(fighter, 1), GRAPHIC_FATALITIES[fighter][1]);
    assert.equal(getGraphicFatality(fighter, 2), GRAPHIC_FATALITIES[fighter][0]);
  }
});

test("aftermath snapshot exposes bounded reveal and settle progress", () => {
  const before = graphicFatalitySnapshot("jez", 0, 3.5, 4);
  assert.equal(before.aftermath, 0);
  assert.equal(before.reveal, 0);
  const active = graphicFatalitySnapshot("jez", 1, 4.21, 4);
  assert.ok(active.reveal > 0 && active.reveal < 1);
  assert.ok(active.settle > 0 && active.settle < 1);
  const settled = graphicFatalitySnapshot("ali", 1, 6, 4);
  assert.equal(settled.reveal, 1);
  assert.equal(settled.settle, 1);
});
