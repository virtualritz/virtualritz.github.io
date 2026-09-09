import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- toc-move.js: the DOM move itself. No DOM is available under
// `node --test`, so this pins the invariant at the source level, the same
// way dropcap.test.mjs pins dropcaps.js's insertion order. ---

const tocMoveSrc = () =>
  readFileSync(new URL("../static/js/toc-move.js", import.meta.url), "utf8");

const dropcapsSrc = () =>
  readFileSync(new URL("../static/js/dropcaps.js", import.meta.url), "utf8");

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
    /if\s*\(\s*!toc\s*\|\|\s*!firstPara\s*\)\s*return;/,
    "must no-op when #toc is missing (every non-essay page), or when there " +
      "is no paragraph to anchor on (nothing was ever detached — see the " +
      "phase-1 guard)",
  );
  assert.match(
    s,
    /export const tocMoved/,
    "must export tocMoved for typography.js to await",
  );
});

// --- phase 1: detach. The whole point of this iteration is that nothing
// measures a paragraph's layout while #toc's original float is still in
// the DOM — see the header comment's measured-cycle explanation. ---

test("toc-move.js detaches #toc synchronously, at module evaluation, not inside an async function", () => {
  const s = tocMoveSrc();
  assert.match(
    s,
    /^if \(toc && firstPara\) toc\.remove\(\);$/m,
    "the detach must be a plain, synchronous statement at module top " +
      "level (column 0, no wrapping function/then callback), not deferred " +
      "behind a promise or invoked from inside moveToc() — dropcaps.js's " +
      "measurements must see a TOC-free DOM the moment it starts, not " +
      "whenever some later microtask gets to it",
  );
  const detachIdx = s.indexOf("toc.remove()");
  const moveTocFnIdx = s.indexOf("async function moveToc");
  assert.ok(
    detachIdx >= 0 && detachIdx < moveTocFnIdx,
    "the detach must happen before moveToc (the re-insertion) is even " +
      "defined, let alone called",
  );
  assert.match(
    s,
    /export const tocDetached = Promise\.resolve\(\)/,
    "tocDetached must resolve immediately: the detach it stands for is " +
      "already synchronous, so there is nothing left to wait for, and it " +
      "must never hang (see the header comment)",
  );
});

test("dropcaps.js awaits tocDetached before it measures anything", () => {
  const s = dropcapsSrc();
  assert.match(
    s,
    /import\s*\{\s*tocDetached\s*\}\s*from\s*"\.\/toc-move\.js"/,
    "dropcaps.js must import tocDetached from toc-move.js",
  );
  const capPlacedIdx = s.indexOf("export const capPlaced");
  const tocDetachedIdx = s.indexOf("tocDetached", capPlacedIdx);
  const waitForBoxCallIdx = s.indexOf(
    'waitForBox(".article-body > p")',
    capPlacedIdx,
  );
  const placeCallIdx = s.indexOf("place(article)", capPlacedIdx);
  assert.ok(
    capPlacedIdx >= 0 &&
      tocDetachedIdx >= 0 &&
      tocDetachedIdx < waitForBoxCallIdx &&
      waitForBoxCallIdx < placeCallIdx,
    "capPlaced must chain off tocDetached before it ever waits for a " +
      "paragraph's box or calls place() — measuring a candidate paragraph " +
      "while #toc's original float still intrudes into it produces a " +
      "shorter, wrong layout (measured: a cap that looked like it fit a " +
      "2-line paragraph overhung by 38px once the TOC actually moved)",
  );
});

// --- phase 3: guaranteed re-insertion. A detached #toc that never comes
// back loses the reader's table of contents entirely — strictly worse
// than the layout bug this file exists to fix. ---

test("the TOC is re-inserted even when capPlaced rejects", () => {
  const s = tocMoveSrc();
  const awaitIdx = s.indexOf("await capPlaced");
  const tryIdx = s.lastIndexOf("try {", awaitIdx);
  const catchIdx = s.indexOf("catch", awaitIdx);
  assert.ok(
    awaitIdx >= 0 && tryIdx >= 0 && tryIdx < awaitIdx && catchIdx > awaitIdx,
    "the `await capPlaced` must be wrapped in try/catch so a rejection " +
      "falls back to the first-paragraph anchor instead of leaving the " +
      "TOC stranded outside the document",
  );
});

test("the TOC is re-inserted even when the anchored insertion itself throws", () => {
  const s = tocMoveSrc();
  const anchorAfterIdx = s.indexOf("anchor.after(toc)");
  const catchIdx = s.indexOf("catch", anchorAfterIdx);
  const firstParaAfterIdx = s.indexOf("firstPara.after(toc)");
  const appendFallbackIdx = s.indexOf(
    'document.querySelector(".article-body")?.append(toc)',
  );
  assert.ok(
    anchorAfterIdx >= 0 && catchIdx > anchorAfterIdx,
    "the anchored insertion must be wrapped so a throw (e.g. the anchor " +
      "no longer being in the document) doesn't leave #toc detached",
  );
  assert.ok(
    firstParaAfterIdx > catchIdx,
    "the catch must retry with the simpler first-paragraph anchor",
  );
  assert.ok(
    appendFallbackIdx > firstParaAfterIdx,
    "and if even that throws, fall back to re-appending inside " +
      ".article-body — #toc must end up back in the document on every path",
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
