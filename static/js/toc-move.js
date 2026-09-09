/**
 * Detaches #toc before anything measures layout, then re-inserts it after
 * whichever paragraph ends up hosting the drop cap.
 *
 * templates/page.html renders <nav id="toc"> as a preceding sibling of
 * .article-body, and sass/_layout.scss floats it left. A preceding-sibling
 * float intrudes into whatever paragraph follows it in DOM order — justif
 * accounts for a paragraph's own leading float (the drop cap) but not one
 * on a preceding sibling, so it lays lines out at the full measure, none
 * fit beside both floats, and the browser pushes the whole paragraph below
 * the TOC (measured, pre-fix: 6.15 lines instead of 2, the cap orphaned
 * above empty space).
 *
 * Two earlier fixes routed around this by moving the TOC to a *following*
 * sibling of the capped paragraph (a following sibling's float doesn't
 * intrude backward): first always anchoring on paragraph 0, then anchoring
 * on dropcaps.js's actual host paragraph via `capPlaced`. Both still
 * measured the cap while the TOC's original float was still in the DOM,
 * because dropcaps.js's fit check ran before this file's move happened:
 * the intruding float squeezed the candidate paragraph into more lines
 * than it actually needs, so a cap that looked like it fit (measured host
 * height: 76px/2 lines, against the float) overhung once the TOC actually
 * moved away and the paragraph reflowed back down to 2 lines (measured
 * overhang: 38px, a full line). The cap's placement depended on the TOC's
 * position, and the TOC's position depended on the cap's placement — every
 * anchor fix just moved that cycle around instead of breaking it.
 *
 * The fix is to take the TOC out of the flow *before* dropcaps.js measures
 * anything, so no float can distort any paragraph's height, in three
 * phases, all before typography.js calls justify():
 *
 *   1. Detach (this file, synchronously, at module evaluation): pull #toc
 *      out of the document entirely, keeping a reference.
 *   2. Measure and place the cap (dropcaps.js, against clean, TOC-free
 *      layout) — see its header comment.
 *   3. Re-insert (this file, once the host is known): put #toc back
 *      immediately after the cap's host paragraph, or after the essay's
 *      first paragraph when no cap was placed.
 *
 * `tocDetached` (phase 1) and `tocMoved` (phase 3) make that an explicit
 * promise dependency rather than leaving it incidental to import order —
 * dropcaps.js awaits `tocDetached` before it measures anything, and this
 * file's own re-insertion awaits dropcaps.js's `capPlaced` to learn which
 * paragraph to anchor on. The dependency graph itself is acyclic —
 * tocDetached → cap measurement → capPlaced → tocMoved — even though this
 * module and dropcaps.js import from each other (dropcaps.js needs
 * `tocDetached`; this file needs `capPlaced`): that's a real ES-module
 * import cycle, but not a circular *data* dependency, since `tocDetached`
 * needs nothing from dropcaps.js.
 *
 * That module cycle has one sharp edge worth naming: whichever of these
 * two files is evaluated first "wins" the cycle and finishes its own
 * top-level code before the other gets to run any of its own (typography.js
 * imports dropcaps.js ahead of this file, so dropcaps.js enters the cycle
 * first and `tocDetached` below is fully defined by the time dropcaps.js's
 * top-level code reads it). `moveToc()` reads `capPlaced` the other way
 * around, so it must not run synchronously during that same evaluation
 * pass — dropcaps.js wouldn't have defined `capPlaced` yet, and the read
 * would throw a ReferenceError that the try/catch below would silently
 * swallow into an always-wrong permanent fallback rather than a loud
 * crash. Deferring the call with `Promise.resolve().then(moveToc)` pushes
 * it to a microtask, after the whole synchronous module graph — including
 * this cycle, in either direction — has finished evaluating, so
 * `capPlaced` is always a real value by the time `moveToc` reads it.
 *
 * The detach itself only happens when there is a paragraph to fall back on
 * (`firstPara`): with no paragraph at all, `tocAnchor` can never resolve
 * to anything (see lib/toc-anchor.js) and removing #toc would strand it
 * outside the document with nowhere to put it back — worse than this
 * file's original bug. `tocDetached` still always resolves in that case
 * (there's simply nothing to await for); it just means `moveToc()` has
 * nothing to do either.
 *
 * Both `tocDetached` and `tocMoved` must always resolve, never reject or
 * hang, on every path including a throw: a stuck or rejected promise here
 * would silently disable justification, drop caps and sidenotes together,
 * same as capPlaced (see dropcaps.js). `tocDetached` cannot hang — the
 * detach above is synchronous, so it is plain `Promise.resolve()`.
 * `tocMoved`'s nested try/catches guarantee the TOC is re-inserted
 * *somewhere* even if `capPlaced` rejects, or the anchored insertion
 * itself throws: a detached #toc that never comes back loses the reader's
 * table of contents entirely, which is worse than any layout bug this
 * file exists to fix.
 *
 * Must run — like dropcaps.js's capPlaced — before typography.js calls
 * justify() on the essay's paragraphs, since justif has no second pass:
 * see the ordering invariant in typography.js's header comment.
 *
 * No-JS: templates/page.html still renders <nav id="toc"> before
 * .article-body, so the TOC exists and floats without this script; this
 * move is a layout enhancement, not a requirement.
 *
 * No-op (per project convention) when any DOM hook is missing: no #toc, or
 * no paragraph to anchor on — including every non-essay page.
 */
import { tocAnchor } from "./lib/toc-anchor.js";
import { capPlaced } from "./dropcaps.js";

const toc = document.querySelector("#toc");
const firstPara = document.querySelector(".article-body > p");

// Phase 1 — detach, synchronously, before dropcaps.js (or anything else)
// ever measures a paragraph's layout. Skipped when there is no paragraph
// to eventually re-anchor on (see header comment): pulling #toc out of the
// document with nowhere to put it back would be worse than leaving it in
// its original, float-intruding position.
if (toc && firstPara) toc.remove();

// Always resolves immediately: the removal above (or the decision to skip
// it) has already happened, synchronously, by the time this line runs.
export const tocDetached = Promise.resolve();

// Phase 3 — re-insert once the cap's host is known.
async function moveToc() {
  if (!toc || !firstPara) return; // never detached; nothing to restore
  let capHost = null;
  try {
    capHost = await capPlaced;
  } catch (err) {
    // capPlaced is documented to always resolve, but guard anyway: fall
    // back to the first-paragraph anchor rather than leaving tocMoved
    // pending or rejected.
    console.warn("toc-move.js: capPlaced rejected", err);
  }
  try {
    // firstPara is truthy here (checked above), so tocAnchor always
    // resolves to a real element.
    const anchor = tocAnchor(capHost, firstPara);
    anchor.after(toc);
  } catch (err) {
    // The TOC must end up back in the document no matter what: retry with
    // the simpler first-paragraph anchor, then fall back to appending
    // inside .article-body itself, rather than ever leaving #toc detached.
    console.warn("toc-move.js: anchored insertion failed, retrying", err);
    try {
      firstPara.after(toc);
    } catch (err2) {
      console.warn("toc-move.js: fallback insertion failed too", err2);
      document.querySelector(".article-body")?.append(toc);
    }
  }
}

// Deferred to a microtask — see the header comment on the dropcaps.js /
// toc-move.js import cycle. Must not call moveToc() synchronously here.
export const tocMoved = Promise.resolve().then(moveToc);
