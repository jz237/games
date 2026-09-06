import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The 4.9/5.0 sheet pipeline is ONE directory (tools/swing) with one copy of
// the colour-match core and no hard-coded checkout path. The 4.9 copy in
// tools/inbetweens drifted from it (a `__main__` guard, a grammar argument)
// and both hard-coded a single checkout, so a run from another clone wrote
// the live tables here. These pins keep the collapse collapsed.

const testDir = dirname(fileURLToPath(import.meta.url));
const root = join(testDir, "..");
const swing = join(root, "tools", "swing");

function testOneCopy() {
  assert.ok(!existsSync(join(root, "tools", "inbetweens")), "tools/inbetweens is gone; its grammar is tools/swing/grammar-ext2.txt");
  for (const file of ["color_match.py", "measure_de.py", "fal_edit.py", "gen_all.py", "build_sheet.py", "skin_match.py", "repo_root.py",
    "grammar-ext2.txt", "grammar-ext3.txt", "grammar-ext4.txt", "grammar-ext5.txt"]) {
    assert.ok(existsSync(join(swing, file)), `tools/swing/${file}`);
  }
  // build_sheet owns every bank; there is no build_ext2.py twin.
  const buildSheet = readFileSync(join(swing, "build_sheet.py"), "utf8");
  assert.match(buildSheet, /"ext2": \(\[/);
  assert.match(buildSheet, /"ext3": \(\[/);
  assert.match(buildSheet, /"ext4": \(\[/);
  assert.match(buildSheet, /"ext5": \(\[/);
  assert.match(buildSheet, /ap\.add_argument\("--bank", default="ext2"\)/);
  assert.ok(!buildSheet.includes("build_ext2.py"), "the docstring names build_sheet, not its 4.9 ancestor");
  assert.ok(!existsSync(join(swing, "build_ext2.py")));
  // gen_all defaults to the ext2 grammar it inherited and takes the others by argument.
  const genAll = readFileSync(join(swing, "gen_all.py"), "utf8");
  assert.match(genAll, /GRAMMAR_FILE = sys\.argv\[3\] if len\(sys\.argv\) > 3 else "grammar-ext2\.txt"/);
}

function testNoHardCodedCheckout() {
  const scripts = readdirSync(swing).filter((name) => name.endsWith(".py"));
  assert.ok(scripts.length >= 8);
  for (const name of scripts) {
    const source = readFileSync(join(swing, name), "utf8");
    assert.ok(!/final-blow-(roadmap2|goal)/.test(source), `${name} names no checkout`);
    assert.ok(!/\/home\/[a-z0-9]+\//.test(source), `${name} carries no absolute home path`);
    if (/\bG\b/.test(source.replace(/^\s*#.*$/gm, "")) && name !== "repo_root.py") {
      assert.match(source, /from repo_root import G/, `${name} takes the checkout from repo_root`);
    }
  }
  const repoRoot = readFileSync(join(swing, "repo_root.py"), "utf8");
  assert.match(repoRoot, /os\.environ\.get\("FINAL_BLOW_ROOT"\)/);
  assert.match(repoRoot, /os\.path\.join\(here, "\.\.", "\.\."\)/);
  assert.match(repoRoot, /game\.js/, "refuses a root that is not a checkout");
}

function testDependencyDocs() {
  const requirements = readFileSync(join(root, "tools", "requirements.txt"), "utf8");
  assert.match(requirements, /^Pillow/m);
  assert.match(requirements, /^numpy/m);
  const readme = readFileSync(join(root, "tools", "README.md"), "utf8");
  assert.ok(!/No numpy, no other dependencies/.test(readme), "the README no longer claims the whole tree is numpy-free");
  assert.match(readme, /tools\/swing/);
  assert.match(readme, /requirements\.txt/);
  assert.match(readme, /--bank ext3/);
  assert.match(readme, /FINAL_BLOW_ROOT/);
  // No secret handling in the docs: the fal key is named as an env var only.
  assert.ok(!/FAL_KEY\s*=\s*["'][^"']+/.test(readme));
}

testOneCopy();
testNoHardCodedCheckout();
testDependencyDocs();

console.log("Final Blow tools layout tests passed");
