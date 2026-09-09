import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_BREAKABLE_LENGTH,
  SOFT_HYPHEN,
  insertSoftBreaks,
  stripSoftHyphens,
  breakLongCodeTokens,
} from "../static/js/lib/break-long-tokens.js";

// --- insertSoftBreaks: the pure break-point logic ---

test("a long path gets a soft hyphen after every / and . (measured overflow case)", () => {
  const path = "3Delight/source/InteractiveRenderManager.cpp";
  const result = insertSoftBreaks(path);
  assert.equal(
    stripSoftHyphens(result),
    path,
    "must round-trip to the original text",
  );
  assert.equal(
    result,
    [
      "3",
      SOFT_HYPHEN, // digit-to-uppercase counts as a natural boundary too
      "Delight/",
      SOFT_HYPHEN,
      "source/",
      SOFT_HYPHEN,
      "Interactive",
      SOFT_HYPHEN,
      "Render",
      SOFT_HYPHEN,
      "Manager.",
      SOFT_HYPHEN,
      "cpp",
    ].join(""),
  );
});

test("a long camelCase identifier with no punctuation breaks at case transitions", () => {
  const word = "InteractiveRenderManager"; // 24 chars, no /,.,-,_
  assert.ok(word.length >= MIN_BREAKABLE_LENGTH);
  const result = insertSoftBreaks(word);
  assert.equal(stripSoftHyphens(result), word);
  assert.equal(
    result,
    ["Interactive", SOFT_HYPHEN, "Render", SOFT_HYPHEN, "Manager"].join(""),
  );
});

test("a short identifier below the length gate is left completely untouched", () => {
  // Measured already wrapping correctly at 344px in a 346px column —
  // must not be mutated at all, despite the Hd|RenderPass camelCase
  // boundary.
  const word = "HdRenderPass";
  assert.ok(word.length < MIN_BREAKABLE_LENGTH);
  assert.equal(insertSoftBreaks(word), word);
  assert.equal(insertSoftBreaks("Stop()"), "Stop()");
});

test("a long token with no natural boundary is left untouched (no invented mid-word break)", () => {
  const word = "abcdefghijklmnopqrstuvwxy"; // 25 chars, all lowercase, no punctuation
  assert.ok(word.length >= MIN_BREAKABLE_LENGTH);
  assert.equal(insertSoftBreaks(word), word);
});

test("an HTML entity is treated as one opaque unit: no break inside it, and it counts as one character", () => {
  // "-&gt;" is real content from this site's own essay (an arrow, ->,
  // HTML-escaped by pulldown-cmark). A break may land after the real "-",
  // never inside "&gt;".
  const word = "outputlayer.outputdrivers-&gt;outputdriver"; // long enough to qualify
  const result = insertSoftBreaks(word);
  assert.equal(stripSoftHyphens(result), word);
  assert.ok(
    !result.includes(`&${SOFT_HYPHEN}gt;`) &&
      !result.includes(`&g${SOFT_HYPHEN}t;`) &&
      !result.includes(`&gt${SOFT_HYPHEN};`),
    "must never break inside the &gt; entity",
  );
  assert.ok(
    result.includes(`-${SOFT_HYPHEN}&gt;`),
    "must break after the real - character, right before the entity",
  );
});

test("threshold counts decoded length, not raw HTML length: an entity-padded but short token stays untouched", () => {
  // Decodes to "a&b&c&d.e" — 9 characters, well under the gate — even
  // though the raw (entity-escaped) string is 21 characters long, over
  // it. It also contains a "." that a naive raw-length check would
  // wrongly treat as a qualifying boundary once (mis)judged "long".
  const word = "a&amp;b&amp;c&amp;d.e";
  assert.ok(word.length >= MIN_BREAKABLE_LENGTH, "raw string is long");
  assert.equal(insertSoftBreaks(word), word);
});

// --- stripSoftHyphens: the copy-clean half of the fix ---

test("stripSoftHyphens removes every soft hyphen and nothing else", () => {
  const withBreaks = insertSoftBreaks(
    "3Delight/source/InteractiveRenderManager.cpp",
  );
  assert.equal(
    stripSoftHyphens(withBreaks),
    "3Delight/source/InteractiveRenderManager.cpp",
  );
  assert.equal(stripSoftHyphens("no breaks here"), "no breaks here");
});

// --- breakLongCodeTokens: the HTML-level pass used by mark-long-tokens.js ---

test("transforms a long token inside inline <code>", () => {
  const html =
    "<li>See <code>3Delight/source/InteractiveRenderManager.cpp</code>.</li>";
  const out = breakLongCodeTokens(html);
  assert.ok(out.includes(SOFT_HYPHEN));
  assert.equal(
    stripSoftHyphens(out),
    html,
    "stripping the inserted characters must reproduce the original markup",
  );
});

test("leaves <code> inside <pre> completely alone", () => {
  const html =
    "<pre><code>3Delight/source/InteractiveRenderManager.cpp</code></pre>";
  assert.equal(breakLongCodeTokens(html), html);
});

test("leaves short inline <code> spans untouched", () => {
  const html = "<p>Call <code>Stop()</code> or <code>HdRenderPass</code>.</p>";
  assert.equal(breakLongCodeTokens(html), html);
});

test("preserves attributes on <code>", () => {
  const html =
    '<code class="lang-cpp">3Delight/source/InteractiveRenderManager.cpp</code>';
  const out = breakLongCodeTokens(html);
  assert.ok(out.startsWith('<code class="lang-cpp">'));
  assert.ok(out.includes(SOFT_HYPHEN));
});
