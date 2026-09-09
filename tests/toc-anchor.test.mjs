import { test } from "node:test";
import assert from "node:assert/strict";
import { tocAnchor } from "../static/js/lib/toc-anchor.js";

// --- tocAnchor: pure decision logic behind toc-move.js's DOM move. Unlike
// the source-pinning tests in toc-move.test.mjs (no DOM under `node
// --test`), this is real DOM-free logic and can be exercised directly. ---

test("the TOC lands after the cap's host paragraph when a cap is placed", () => {
  // capHost stands in for whatever paragraph dropcaps.js's capPlaced
  // resolved with — not necessarily paragraph 0 (a short "TL;DR:" opener
  // is skipped in favour of the next paragraph that fits a 3-line cap).
  assert.equal(tocAnchor("p1", "p0"), "p1");
});

test("the TOC lands after the first paragraph when no cap was placed", () => {
  // capPlaced resolves null when no candidate paragraph could host a cap
  // (short pages) or the page has no essay article at all.
  assert.equal(tocAnchor(null, "p0"), "p0");
});

test("the TOC is left where it is when neither a cap host nor a first paragraph exists", () => {
  // No .article-body, or an .article-body with no <p> at all.
  assert.equal(tocAnchor(null, null), null);
});
