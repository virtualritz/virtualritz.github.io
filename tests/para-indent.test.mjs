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

// --- soft breaks: a plain newline inside a <p>, exactly what Zola emits
// for a CommonMark soft break, gets the same <br /> + marker treatment as
// an authored hard break. ---

test("converts a soft break (bare newline) inside a <p> into <br /> + marker", () => {
  const html = "<p>line one.\nline two.</p>";
  assert.equal(
    insertParaIndentMarkers(html),
    `<p>line one.<br />${MARKER}\nline two.</p>`,
  );
});

test("converts every soft break in a multi-line paragraph", () => {
  const html = "<p>a\nb\nc</p>";
  assert.equal(
    insertParaIndentMarkers(html),
    `<p>a<br />${MARKER}\nb<br />${MARKER}\nc</p>`,
  );
});

test("ignores a leading newline inside a <p>", () => {
  const html = "<p>\nfoo</p>";
  assert.equal(insertParaIndentMarkers(html), html);
});

test("ignores a trailing newline inside a <p>", () => {
  const html = "<p>foo\n</p>";
  assert.equal(insertParaIndentMarkers(html), html);
});

test("ignores a newline that would produce an empty line", () => {
  const html = "<p>a\n\nb</p>";
  assert.equal(insertParaIndentMarkers(html), html);
});

test("does not double up when a soft break sits right after an authored <br> (Zola's own hard-break shape)", () => {
  // Zola/pulldown-cmark renders a hard break as "<br />\n" — the literal
  // newline after the <br> must not also be treated as a separate soft
  // break.
  const html = "<p>a<br />\nb</p>";
  assert.equal(insertParaIndentMarkers(html), `<p>a<br />${MARKER}\nb</p>`);
});

test("leaves a newline between two <p> elements alone (structural, not a soft break)", () => {
  const html = "<p>first</p>\n<p>second</p>";
  assert.equal(insertParaIndentMarkers(html), html);
});

test("leaves a newline outside any <p> alone entirely", () => {
  const html = "just text\nmore text";
  assert.equal(insertParaIndentMarkers(html), html);
});

test("does not convert a newline inside a nested <code>, <pre> or <table>", () => {
  const html = "<p>text <code>a\nb</code> more\ntext</p>";
  assert.equal(
    insertParaIndentMarkers(html),
    `<p>text <code>a\nb</code> more<br />${MARKER}\ntext</p>`,
  );
});

test("soft-break conversion is idempotent", () => {
  const html = "<p>a\nb\nc</p>";
  const once = insertParaIndentMarkers(html);
  const twice = insertParaIndentMarkers(once);
  assert.equal(twice, once);
  assert.equal(twice.match(/para-indent/g).length, 2);
});

// --- breaking the invariant on purpose, to prove the tests have teeth:
// see docs/superpowers/reports/2026-09-09-soft-break-indents.md for the
// before/after run of `node --test tests/para-indent.test.mjs`. ---
