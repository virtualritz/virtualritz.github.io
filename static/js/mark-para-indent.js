/**
 * Wires insertParaIndentMarkers (./lib/para-indent.js) into the DOM.
 *
 * Ordering: this rewrites .article-body's innerHTML wholesale, which is
 * only safe while that element still holds nothing but Zola's own
 * server-rendered markup — a rewrite after dropcaps.js or toc-move.js have
 * touched it would serialize and re-parse their DOM surgery too (the
 * dropcap box, the moved #toc), destroying node identity for no reason.
 * So this must run, and finish, before either of them. typography.js
 * imports this module first among the three .article-body-touching
 * modules (ahead of dropcaps.js and toc-move.js) specifically so ES
 * module evaluation order runs this one's top-level body first — see the
 * comment there. It must also run before markPunctuation/justify, same as
 * capPlaced/tocMoved, for the unrelated reason documented in
 * typography.js's header comment (justif has no second pass).
 *
 * No-op (per project convention) when .article-body is absent or contains
 * no `<br>` at all — including every non-essay page and every essay
 * written without a hard line break. Never throws: a failure here must
 * not stall `paraIndentMarked`, which typography.js awaits before
 * markPunctuation/justify — see the ordering invariant in typography.js's
 * header comment.
 */
import { insertParaIndentMarkers } from "./lib/para-indent.js";

try {
  const body = document.querySelector(".article-body");
  if (body && body.querySelector("br")) {
    body.innerHTML = insertParaIndentMarkers(body.innerHTML);
  }
} catch (err) {
  console.warn("mark-para-indent.js: marker insertion failed", err);
}

export const paraIndentMarked = Promise.resolve();
