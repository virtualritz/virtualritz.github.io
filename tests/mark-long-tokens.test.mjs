import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- mark-long-tokens.js: the DOM wiring itself. No DOM is available
// under `node --test`, so this pins the invariants at the source level,
// the same way mark-para-indent.test.mjs does for its own DOM-touching
// module. The pure break-insertion logic is tested for real, with no DOM
// at all, in break-long-tokens.test.mjs. ---

const src = () =>
  readFileSync(
    new URL("../static/js/mark-long-tokens.js", import.meta.url),
    "utf8",
  );

test("no-ops when .article-body is missing or has no <code>", () => {
  const s = src();
  assert.match(
    s,
    /if\s*\(\s*body\s*&&\s*body\.querySelector\(\s*["']code["']\s*\)\s*\)/,
    "must guard on both .article-body and the presence of at least one <code>",
  );
});

test("token marking never throws, so longTokensMarked always resolves", () => {
  const s = src();
  const tryIdx = s.indexOf("try {");
  const catchIdx = s.indexOf("} catch");
  const exportIdx = s.indexOf("export const longTokensMarked");
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
    /export const longTokensMarked = Promise\.resolve\(\)/,
    "must export an already-resolved promise: this module's work is " +
      "synchronous, and nothing about it may leave a pending/rejecting " +
      "promise in the pre-justify chain",
  );
});

test("registers a copy handler that strips soft hyphens from the clipboard payload, not the page", () => {
  const s = src();
  assert.match(s, /addEventListener\(\s*["']copy["']/);
  assert.match(
    s,
    /clipboardData\.setData\(\s*["']text\/plain["']\s*,\s*stripSoftHyphens\(/,
    "must rewrite the clipboard payload via stripSoftHyphens, not mutate the DOM",
  );
  assert.match(
    s,
    /preventDefault\(\)/,
    "must call preventDefault() so the browser doesn't also write its own (unstripped) payload",
  );
});

// --- sequencing: same invariant class as mark-para-indent.js in
// typography.js — see that module's tests for the full rationale. ---

const typographySrc = () =>
  readFileSync(new URL("../static/js/typography.js", import.meta.url), "utf8");

test("typography.js awaits mark-long-tokens.js's longTokensMarked before marking punctuation or justifying", () => {
  const s = typographySrc();
  assert.match(
    s,
    /import\s*\{\s*longTokensMarked\s*\}\s*from\s*"\.\/mark-long-tokens\.js"/,
    "typography.js must import longTokensMarked from mark-long-tokens.js",
  );
  const awaitMatch = s.match(
    /await\s+(?:longTokensMarked|Promise\.all\(\[[^\]]*longTokensMarked[^\]]*\]\))/,
  );
  const punctIdx = s.indexOf("markPunctuation(body)");
  const justifyIdx = s.indexOf("justify(targets");
  assert.ok(
    awaitMatch,
    "run() must await longTokensMarked, alone or alongside capPlaced/tocMoved/paraIndentMarked",
  );
  assert.ok(punctIdx >= 0 && justifyIdx >= 0);
  assert.ok(
    awaitMatch.index < punctIdx && awaitMatch.index < justifyIdx,
    "the token rewrite must be awaited before markPunctuation/justify run, not after",
  );
});

test("typography.js imports mark-long-tokens.js ahead of dropcaps.js and toc-move.js", () => {
  const s = typographySrc();
  const tokensIdx = s.indexOf('from "./mark-long-tokens.js"');
  const dropcapsIdx = s.indexOf('from "./dropcaps.js"');
  const tocIdx = s.indexOf('from "./toc-move.js"');
  assert.ok(
    tokensIdx >= 0 && dropcapsIdx >= 0 && tocIdx >= 0,
    "all three imports must be present",
  );
  assert.ok(
    tokensIdx < dropcapsIdx && tokensIdx < tocIdx,
    "mark-long-tokens.js must be imported before dropcaps.js and " +
      "toc-move.js: ES modules evaluate each import's top-level body, in " +
      "source order, before the importing module's own body runs, and " +
      "mark-long-tokens.js's innerHTML rewrite is only safe before " +
      "dropcaps.js/toc-move.js have touched .article-body",
  );
});
