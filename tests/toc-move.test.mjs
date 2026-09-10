import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- toc-move.js: the DOM move itself. No DOM is available under
// `node --test`, so this pins the invariant at the source level, the same
// way dropcap.test.mjs pins dropcaps.js's insertion order. ---

const tocMoveSrc = () =>
  readFileSync(new URL("../static/js/toc-move.js", import.meta.url), "utf8");

test("toc-move.js moves #toc to a following sibling of the first paragraph", () => {
  const s = tocMoveSrc();
  assert.match(
    s,
    /firstPara\.after\(toc\)/,
    "must move #toc after the first paragraph: a preceding-sibling float " +
      "intrudes into that paragraph's box (measured: 6.15 lines instead of " +
      "2), a following sibling does not",
  );
  assert.match(
    s,
    /if\s*\(\s*toc\s*&&\s*firstPara\s*\)/,
    "must no-op when #toc or the first paragraph is missing (non-essay " +
      "pages, or an essay with no paragraphs)",
  );
  assert.match(
    s,
    /export const tocMoved/,
    "must export tocMoved for typography.js to await",
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

// --- the TOC must not be justified once it has been moved into the body ---

test("typography.js's SELECTOR excludes #toc descendants", () => {
  const src = typographySrc();
  const m = src.match(/const SELECTOR =\s*([\s\S]*?);/);
  assert.ok(m, "typography.js must define SELECTOR");
  const selector = m[1];
  // toc-move.js relocates <nav id="toc"> inside .article-body (that is the
  // whole point of the move — see the header comment there), so every TOC
  // <li> matches `.article-body li` and would otherwise be handed to
  // justif. Two reasons it must not be: a TOC entry is a single link that
  // should just wrap, and each <li> carries its section number as a
  // `::before` counter (sass/_layout.scss) whose advance justif does not
  // account for. Measured on the NSI essay before the exclusion: 7 of 27
  // entries — precisely the ones long enough to need three lines — left
  // their number stranded alone on the first line. After: 0 of 27.
  assert.match(
    selector,
    /\.article-body li[^,]*:not\(#toc \*\)/,
    "`.article-body li` must be qualified with :not(#toc *)",
  );
  // The footnote exclusion must survive alongside it.
  assert.match(selector, /\.article-body li[^,]*:not\(\.footnotes \*\)/);
});
