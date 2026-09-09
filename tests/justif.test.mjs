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

test("the vendored module set is complete and imports cleanly", async () => {
  // The chunk filenames are content-hashed, so file-existence checks alone
  // cannot prove the vendored set is self-consistent. Actually importing it
  // does: a missing transitive chunk fails here rather than silently in a
  // browser.
  const { justify } = await import("../static/js/lib/justif/index.js");
  const { hyphenateEnUS } =
    await import("../static/js/lib/justif/hyphenate/en-us.js");
  assert.equal(typeof justify, "function");
  assert.equal(typeof hyphenateEnUS, "function");
});

test("typography.js gates on a layout box and adds no ResizeObserver", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /waitForBox/,
    "must wait for a real box before running: justif declines elements reported as 'not rendered'",
  );
  const waitForBoxSrc = readFileSync(
    root + "static/js/lib/wait-for-box.js",
    "utf8",
  );
  assert.match(
    waitForBoxSrc,
    /getBoundingClientRect/,
    "the shared box-wait helper (used by both typography.js and dropcaps.js) must actually check for a real box",
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

test("typography.js exits early when the selector matches nothing", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /querySelectorAll\(SELECTOR\)\.length === 0/,
    "an image/embed-only page has no match at all; `ready` should resolve " +
      "synchronously in frame one, not after the ~4s rAF poll budget",
  );
});

test("declined paragraphs are reported with reasons, not just a count", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /onSkip:\s*\(p,\s*reason\)/,
    "onSkip must capture the reason, not just tally occurrences: spec " +
      "§14.8 requires verifying which paragraph was declined and why",
  );
  assert.match(
    src,
    /console\.warn/,
    "declined paragraphs must be surfaced somewhere a human can find them",
  );
});

test("a synchronous throw in run() still resolves `ready`", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /function run\(\)\s*\{\s*try\s*\{/,
    "run()'s body must be wrapped in try/catch: `ready` must not depend " +
      "on justif's current (undocumented) behaviour of turning internal " +
      "errors into a rejected controller.ready",
  );
});
