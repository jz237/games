import assert from "node:assert/strict";
import test from "node:test";

import {
  GRAPHIC_FATALITIES,
  auditGraphicFatalities,
  getGraphicFatality,
  graphicFatalitySnapshot,
} from "../engine/fatalities.mjs";

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];

test("all eight fighters receive two unique graphic fatalities", () => {
  const audit = auditGraphicFatalities(fighters);
  assert.deepEqual(audit, { fighters: 8, fatalities: 16, errors: [] });
  assert.equal(Object.keys(GRAPHIC_FATALITIES).length, 8);
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
