import { test } from "node:test";
import assert from "node:assert/strict";
import { insertParaIndentMarkers } from "../static/js/lib/para-indent.js";

const MARKER = '<span class="para-indent" aria-hidden="true"></span>';

test("inserts the marker immediately after a self-closing <br />", () => {
  const html = "<p>one line<br />next line</p>";
  assert.equal(
    insertParaIndentMarkers(html),
    `<p>one line<br />${MARKER}next line</p>`,
  );
});

test("matches Zola's own <br /> output (self-closing with a space)", () => {
  // Confirmed against a real `zola build` of content/essays/typography.md
  // (pulldown-cmark's hard-break rendering).
  const html = "line one.<br />\nline two.";
  assert.equal(
    insertParaIndentMarkers(html),
    `line one.<br />${MARKER}\nline two.`,
  );
});

test("also matches bare <br> and <br/>, case-insensitively", () => {
  assert.equal(insertParaIndentMarkers("a<br>b"), `a<br>${MARKER}b`);
  assert.equal(insertParaIndentMarkers("a<br/>b"), `a<br/>${MARKER}b`);
  assert.equal(insertParaIndentMarkers("a<BR>b"), `a<BR>${MARKER}b`);
});

test("marks every <br> in a multi-break paragraph, not just the first", () => {
  const html = "a<br />b<br />c";
  assert.equal(
    insertParaIndentMarkers(html),
    `a<br />${MARKER}b<br />${MARKER}c`,
  );
});

test("idempotent: running it twice does not double the marker", () => {
  const html = "a<br />b";
  const once = insertParaIndentMarkers(html);
  const twice = insertParaIndentMarkers(once);
  assert.equal(twice, once);
  assert.equal(twice.match(/para-indent/g).length, 1);
});

test("idempotent across every <br> when some already carry a marker and some don't", () => {
  // Simulates a partial/mixed state rather than assuming the whole
  // fragment was produced by a single prior pass.
  const html = `a<br />${MARKER}b<br />c`;
  const result = insertParaIndentMarkers(html);
  assert.equal(result, `a<br />${MARKER}b<br />${MARKER}c`);
  assert.equal(result.match(/para-indent/g).length, 2);
});

test("no-op when there is no <br> at all", () => {
  const html = "<p>a plain paragraph with no hard break</p>";
  assert.equal(insertParaIndentMarkers(html), html);
});

test("does not touch a blank-line paragraph break (no <br> between <p>s)", () => {
  const html = "<p>first</p><p>second</p>";
  assert.equal(insertParaIndentMarkers(html), html);
});
