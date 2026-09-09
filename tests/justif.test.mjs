import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;

// Extract the text spanning a balanced `{ ... }` or `( ... )` region that
// opens at or after `fromIndex` in `src`, starting at the first `openChar`
// found. Used below to pull out a function body or an if-condition by
// structure rather than by a brittle literal-text regex, so a syntactic
// rewrite that preserves behaviour (e.g. `!x.length` for `x.length === 0`)
// doesn't break the assertion built on top of it.
function extractBalanced(src, fromIndex, openChar) {
  const closeChar = openChar === "{" ? "}" : ")";
  const start = src.indexOf(openChar, fromIndex);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === openChar) depth++;
    else if (src[i] === closeChar) {
      depth--;
      if (depth === 0) return { start, end: i, text: src.slice(start, i + 1) };
    }
  }
  return null;
}

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
  // Anchor on the module-level fork between resolving synchronously and
  // waiting for a box, then pull out the guarding `if (...)` condition by
  // brace-matching rather than pinning its exact comparison syntax: the
  // old regex (`querySelectorAll(SELECTOR).length === 0`) would fail on a
  // behaviour-preserving rewrite to `!querySelectorAll(SELECTOR).length`.
  const anchor = src.indexOf("waitForBox(SELECTOR).then(");
  assert.ok(anchor !== -1, "expected the selector-gated waitForBox call");
  const ifIdx = src.lastIndexOf("if (", anchor);
  assert.ok(ifIdx !== -1, "expected an `if` guarding the waitForBox branch");
  const cond = extractBalanced(src, ifIdx, "(");
  assert.ok(cond, "could not find the balanced condition of the `if`");

  assert.match(
    cond.text,
    /document\.querySelector\(["'`]\.article-body["'`]\)/,
    "the guard must check whether .article-body exists at all",
  );
  assert.match(
    cond.text,
    /querySelectorAll\(SELECTOR\)/,
    "the guard must also check SELECTOR's matches, not just .article-body",
  );
  assert.match(
    cond.text,
    /(querySelectorAll\(SELECTOR\)\.length\s*(===|<=?)\s*0)|(!\s*document\.querySelectorAll\(SELECTOR\)\.length)/,
    "the guard must treat zero SELECTOR matches as the early-exit case " +
      "(an image/embed-only page has no match at all; `ready` should " +
      "resolve synchronously in frame one, not after the ~4s rAF poll budget)",
  );

  // The branch taken on that condition must resolve synchronously, not
  // fall through to the ~4s rAF poll.
  const braceStart = src.indexOf("{", cond.end);
  const thenBranch = extractBalanced(src, braceStart, "{");
  assert.ok(thenBranch);
  assert.match(
    thenBranch.text,
    /resolveReady\(\)/,
    "the early-exit branch must call resolveReady() synchronously",
  );
  assert.doesNotMatch(
    thenBranch.text,
    /waitForBox/,
    "the early-exit branch must not also wait for a box",
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

test("a synchronous throw in run() still resolves `ready`, and so does every early return", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  const fnIdx = src.indexOf("async function run()");
  assert.ok(fnIdx !== -1, "expected run() to be defined");
  const fn = extractBalanced(src, fnIdx, "{");
  assert.ok(fn, "could not find the balanced body of run()");

  // The old assertion (`function run() { try {`) passed for a catch block
  // that never called resolveReady() — exactly the hang this test exists
  // to prevent, since that's undetectable from the opening brace alone.
  // Find run()'s own try/catch (not markPunctuation's or justify's
  // internals) by locating the `} catch (...) {` that closes out run()'s
  // outermost try, i.e. the one whose closing brace is run()'s own.
  const catchMatch = fn.text.match(
    /\}\s*catch\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/,
  );
  assert.ok(catchMatch, "run() must wrap its body in try/catch");
  assert.match(
    catchMatch[1],
    /resolveReady\(\)/,
    "run()'s catch block must itself call resolveReady() — a try/catch " +
      "shell whose catch only logs leaves `ready` hanging on a synchronous throw",
  );

  // Every early `return ...;` inside the try block must itself resolve
  // ready, since nothing after an early return will reach the async
  // .then()/.catch() chain that resolves it later.
  const tryText = fn.text.slice(0, fn.text.indexOf(catchMatch[0]));
  const earlyReturns = tryText.match(/return\b[^;]*;/g) || [];
  assert.ok(
    earlyReturns.length > 0,
    "expected at least one early return in run() (e.g. no .article-body, no targets)",
  );
  for (const ret of earlyReturns) {
    assert.match(
      ret,
      /resolveReady\(\)/,
      `early return "${ret.trim()}" must resolve ready itself, not rely on later code`,
    );
  }
});
