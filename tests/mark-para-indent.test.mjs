import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- mark-para-indent.js: the DOM wiring itself. No DOM is available
// under `node --test`, so this pins the invariants at the source level,
// the same way toc-move.test.mjs and dropcap.test.mjs do for their own
// DOM-touching modules. The pure insertion logic is tested for real,
// with no DOM at all, in para-indent.test.mjs. ---

const src = () =>
  readFileSync(
    new URL("../static/js/mark-para-indent.js", import.meta.url),
    "utf8",
  );

test("no-ops when .article-body is missing or has no <br>", () => {
  const s = src();
  assert.match(
    s,
    /if\s*\(\s*body\s*&&\s*body\.querySelector\(\s*["']br["']\s*\)\s*\)/,
    "must guard on both .article-body and the presence of at least one <br>",
  );
});

test("marker insertion never throws, so paraIndentMarked always resolves", () => {
  const s = src();
  // The DOM rewrite must be inside a try/catch, and the export must not
  // depend on anything inside that try succeeding.
  const tryIdx = s.indexOf("try {");
  const catchIdx = s.indexOf("} catch");
  const exportIdx = s.indexOf("export const paraIndentMarked");
  assert.ok(
    tryIdx >= 0 && catchIdx > tryIdx,
    "must wrap the rewrite in try/catch",
  );
  assert.ok(
    exportIdx > catchIdx,
    "the export must not be inside the try block, so a throw can't skip it",
  );
  assert.match(
    s,
    /export const paraIndentMarked = Promise\.resolve\(\)/,
    "must export an already-resolved promise: this module's work is " +
      "synchronous, and nothing about it may leave a pending/rejecting " +
      "promise in the pre-justify chain",
  );
});

// --- sequencing: typography.js must both (a) await paraIndentMarked
// before markPunctuation/justify (same invariant class as capPlaced and
// tocMoved — justif has no second pass), and (b) import mark-para-indent.js
// ahead of dropcaps.js and toc-move.js, so ES module evaluation order runs
// its synchronous innerHTML rewrite before either of them touches
// .article-body. (b) is a stronger requirement than the await in (a): the
// await only orders *this module's* async completion relative to
// markPunctuation/justify, not relative to dropcaps.js/toc-move.js's own
// synchronous top-level DOM writes, which run during module evaluation,
// before any await is even reached. ---

const typographySrc = () =>
  readFileSync(new URL("../static/js/typography.js", import.meta.url), "utf8");

test("typography.js awaits mark-para-indent.js's paraIndentMarked before marking punctuation or justifying", () => {
  const s = typographySrc();
  assert.match(
    s,
    /import\s*\{\s*paraIndentMarked\s*\}\s*from\s*"\.\/mark-para-indent\.js"/,
    "typography.js must import paraIndentMarked from mark-para-indent.js",
  );
  const awaitMatch = s.match(
    /await\s+(?:paraIndentMarked|Promise\.all\(\[[^\]]*paraIndentMarked[^\]]*\]\))/,
  );
  const punctIdx = s.indexOf("markPunctuation(body)");
  const justifyIdx = s.indexOf("justify(targets");
  assert.ok(
    awaitMatch,
    "run() must await paraIndentMarked, alone or alongside capPlaced/tocMoved",
  );
  const idx = awaitMatch.index;
  assert.ok(punctIdx >= 0 && justifyIdx >= 0);
  assert.ok(
    idx < punctIdx && idx < justifyIdx,
    "markers must be inserted (paraIndentMarked awaited) before " +
      "markPunctuation/justify run, not after",
  );
});

test("typography.js imports mark-para-indent.js ahead of dropcaps.js and toc-move.js", () => {
  const s = typographySrc();
  const paraIdx = s.indexOf('from "./mark-para-indent.js"');
  const dropcapsIdx = s.indexOf('from "./dropcaps.js"');
  const tocIdx = s.indexOf('from "./toc-move.js"');
  assert.ok(
    paraIdx >= 0 && dropcapsIdx >= 0 && tocIdx >= 0,
    "all three imports must be present",
  );
  assert.ok(
    paraIdx < dropcapsIdx && paraIdx < tocIdx,
    "mark-para-indent.js must be imported before dropcaps.js and " +
      "toc-move.js: ES modules evaluate each import's top-level body, in " +
      "source order, before the importing module's own body runs, and " +
      "mark-para-indent.js's innerHTML rewrite is only safe before " +
      "dropcaps.js/toc-move.js have touched .article-body",
  );
});
