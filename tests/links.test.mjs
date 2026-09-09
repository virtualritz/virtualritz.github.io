import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build.mjs";

test("links use a gradient underline with zero-blur shadow cutouts", async () => {
  const css = (await buildSite()).read("style.css");
  const rule = css.match(/\.article-body\s+a\b[^{]*\{([^}]*)\}/)[1];
  assert.match(rule, /text-decoration:\s*none/);
  assert.match(rule, /linear-gradient/);
  // dots are 3px 1.5px (50% bigger than the original 2px 1px), vertically
  // re-centred so the thicker dot still sits under the baseline: old
  // centre was 1.9px - .5px = 1.4px above the box bottom, so the new top
  // offset is 1.4 + (1.5 / 2) = 2.15px.
  assert.match(rule, /background-size:\s*3px 1\.5px/);
  assert.match(rule, /background-position:\s*0 calc\(100% - 2\.15px\)/);
  // every shadow must be zero-blur and vertical-only, so justif still
  // protrudes glyphs through it (spec §7)
  const shadows = rule.match(/text-shadow:([^;]*)/)[1];
  assert.ok(shadows.split(",").length >= 7, "expected the 7-shadow cutout");
  // justif treats a blurred shadow as a painted halo and stops protruding
  // glyphs through it, so every shadow must be zero-blur: exactly two
  // length components before the colour, never a third.
  for (const s of shadows.split(",")) {
    const lengths =
      s.trim().match(/-?(?:0(?![\d.])|[\d.]+(?:px|em|rem))/g) || [];
    assert.equal(
      lengths.length,
      2,
      `shadow "${s.trim()}" must have exactly x and y, no blur radius`,
    );
  }
});

test("external links do not get an arrow keyed to the production host", async () => {
  const css = (await buildSite()).read("style.css");
  assert.ok(
    !css.includes("virtualritz.github.io"),
    "hard-coded host breaks under zola serve — use [rel] instead",
  );
});
