import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- toc-move.js: the DOM move itself. No DOM is available under
// `node --test`, so this pins the invariant at the source level, the same
// way dropcap.test.mjs pins dropcaps.js's insertion order. ---

const tocMoveSrc = () =>
  readFileSync(new URL("../static/js/toc-move.js", import.meta.url), "utf8");

test("toc-move.js moves #toc to a following sibling of whatever tocAnchor picks", () => {
  const s = tocMoveSrc();
  assert.match(
    s,
    /import\s*\{\s*tocAnchor\s*\}\s*from\s*"\.\/lib\/toc-anchor\.js"/,
    "must delegate the host-paragraph decision to the pure lib/toc-anchor.js, " +
      "not always anchor on the first paragraph",
  );
  assert.match(
    s,
    /import\s*\{\s*capPlaced\s*\}\s*from\s*"\.\/dropcaps\.js"/,
    "must await dropcaps.js's capPlaced to learn which paragraph hosts the " +
      "cap (not always paragraph 0 — see dropcap-candidates.js)",
  );
  assert.match(
    s,
    /anchor\.after\(toc\)/,
    "must move #toc after the resolved anchor: a preceding-sibling float " +
      "intrudes into that paragraph's box (measured: 6.15 lines instead of " +
      "2), a following sibling does not",
  );
  assert.match(
    s,
    /if\s*\(\s*!toc\s*\)\s*return;/,
    "must no-op when #toc is missing (every non-essay page)",
  );
  assert.match(
    s,
    /if\s*\(\s*anchor\s*\)\s*anchor\.after\(toc\);/,
    "must no-op when tocAnchor resolves nothing (no cap placed and no " +
      "first paragraph)",
  );
  assert.match(
    s,
    /export const tocMoved/,
    "must export tocMoved for typography.js to await",
  );
});

test("toc-move.js never lets capPlaced rejecting (or the DOM move throwing) leave tocMoved unsettled", () => {
  const s = tocMoveSrc();
  // moveToc is async and awaits capPlaced; without a try/catch around that
  // await, a rejected capPlaced would reject tocMoved instead of falling
  // back to the first-paragraph behaviour.
  const awaitIdx = s.indexOf("await capPlaced");
  const tryIdx = s.lastIndexOf("try {", awaitIdx);
  const catchIdx = s.indexOf("catch", awaitIdx);
  assert.ok(
    awaitIdx >= 0 && tryIdx >= 0 && tryIdx < awaitIdx && catchIdx > awaitIdx,
    "the `await capPlaced` must be wrapped in try/catch so a rejection " +
      "falls back instead of leaving tocMoved rejected/pending",
  );
});

// --- sequencing: the TOC must be out of the first paragraph's box before
// justif ever scans it, same invariant class as the drop cap in
// dropcap.test.mjs. Demonstrated by breaking it: reverting typography.js's
// `await Promise.all([capPlaced, tocMoved])` to `await capPlaced` alone
// (i.e. dropping tocMoved from the awaited set) makes this test fail with
// "run() must await tocMoved before markPunctuation/justify", confirming
// the assertion is not a tautology. ---

const typographySrc = () =>
  readFileSync(new URL("../static/js/typography.js", import.meta.url), "utf8");

test("typography.js awaits toc-move.js's tocMoved before marking punctuation or justifying", () => {
  const s = typographySrc();
  assert.match(
    s,
    /import\s*\{\s*tocMoved\s*\}\s*from\s*"\.\/toc-move\.js"/,
    "typography.js must import tocMoved from toc-move.js",
  );
  const awaitMatch = s.match(
    /await\s+(?:tocMoved|Promise\.all\(\[[^\]]*tocMoved[^\]]*\]\))/,
  );
  const punctIdx = s.indexOf("markPunctuation(body)");
  const justifyIdx = s.indexOf("justify(targets");
  assert.ok(
    awaitMatch,
    "run() must await tocMoved before markPunctuation/justify",
  );
  const tocIdx = awaitMatch.index;
  assert.ok(punctIdx >= 0 && justifyIdx >= 0);
  assert.ok(
    tocIdx < punctIdx && tocIdx < justifyIdx,
    "the TOC must be moved (tocMoved awaited) before markPunctuation/" +
      "justify run, not after",
  );
});
