/**
 * Wires breakLongCodeTokens (./lib/break-long-tokens.js) into the DOM, and
 * strips the soft hyphens it inserts back out of anything copied from the
 * page.
 *
 * Ordering: like mark-para-indent.js, this rewrites .article-body's
 * innerHTML wholesale, so it must run, and finish, before dropcaps.js or
 * toc-move.js touch that subtree (a rewrite afterwards would serialize
 * and re-parse their DOM surgery too, destroying node identity for no
 * reason), and before markPunctuation/justify for the same "justif has no
 * second pass" reason documented in typography.js's header comment.
 * typography.js imports this module (after mark-para-indent.js, whose
 * <br>/newline rewrite touches disjoint content — <p> text, never
 * <code> — so the two rewrites don't interact) ahead of dropcaps.js and
 * toc-move.js, for the same import-order reason.
 *
 * No-op when .article-body is absent or contains no `<code>` at all —
 * including every non-essay page. Never throws: a failure here must not
 * stall `longTokensMarked`, which typography.js awaits before
 * markPunctuation/justify.
 */
import {
  breakLongCodeTokens,
  stripSoftHyphens,
} from "./lib/break-long-tokens.js";

try {
  const body = document.querySelector(".article-body");
  if (body && body.querySelector("code")) {
    body.innerHTML = breakLongCodeTokens(body.innerHTML);
  }
} catch (err) {
  console.warn("mark-long-tokens.js: token marking failed", err);
}

// The soft hyphens inserted above are real characters, so a plain
// selection copy would include them. Strip them from the clipboard
// payload only, leaving the rendered/selected text (and its invisible
// break points) untouched.
document.addEventListener("copy", (event) => {
  if (!event.clipboardData) return;
  const text = document.getSelection()?.toString() ?? "";
  if (!text.includes("­")) return;
  event.clipboardData.setData("text/plain", stripSoftHyphens(text));
  event.preventDefault();
});

export const longTokensMarked = Promise.resolve();
