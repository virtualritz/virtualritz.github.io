import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;

// Total size, in bytes, of every file under a directory (recursive).
function dirSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${name.name}`;
    total += name.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

test("justif is vendored at the pinned version", () => {
  assert.ok(existsSync(root + "static/js/lib/justif/index.js"));
  assert.equal(
    readFileSync(root + "static/js/lib/justif/VERSION", "utf8").trim(),
    "0.9.1",
  );
});

test("only the files justif's two entry points need are vendored", () => {
  // dist/index.js imports chunk-WWMSGT6G.js; dist/hyphenate/en-us.js
  // imports chunk-ZW2EUTPS.js. Both are required for a clean import.
  assert.ok(existsSync(root + "static/js/lib/justif/chunk-WWMSGT6G.js"));
  assert.ok(existsSync(root + "static/js/lib/justif/hyphenate/en-us.js"));
  assert.ok(existsSync(root + "static/js/lib/justif/chunk-ZW2EUTPS.js"));
  assert.ok(existsSync(root + "static/js/lib/justif/LICENSE"));
  // The full upstream dist/ is ~2.3 MiB, mostly hyphenation patterns for
  // languages we never load. Guard against a future vendor.sh regressing
  // to `cp -r dist/.`.
  const size = dirSize(root + "static/js/lib/justif");
  assert.ok(
    size < 500 * 1024,
    `vendored justif is ${Math.round(size / 1024)} KiB, expected < 500 KiB`,
  );
});

test("typography.js gates on a layout box and adds no ResizeObserver", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /getBoundingClientRect/,
    "must wait for a real box: justif declines elements reported as 'not rendered'",
  );
  assert.ok(
    !src.includes("new ResizeObserver"),
    "justif has observeResize:true; observing its container oscillates (spec §7.3)",
  );
  assert.match(
    src,
    /markPunctuation/,
    "punctuation must be marked before measuring",
  );
});
