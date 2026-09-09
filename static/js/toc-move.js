/**
 * Moves the TOC to after the paragraph that hosts the drop cap.
 *
 * templates/page.html renders <nav id="toc"> as a preceding sibling of
 * .article-body, and sass/_layout.scss floats it left. That is fine on its
 * own, but it intrudes into the box of whatever paragraph follows it in
 * DOM order: justif accounts for a paragraph's own leading float (the drop
 * cap) but not a preceding sibling float, so it lays lines out at the full
 * measure, none fit beside both floats, and the browser pushes the whole
 * paragraph below the TOC (measured: 6.15 lines instead of 2, the drop cap
 * orphaned above empty space). Widening the measure doesn't help — the
 * shortfall is the TOC's fixed width, not the column's (measured at
 * 1200/1500/1900px, identical). Floating the TOC right instead just
 * mirrors the bug.
 *
 * Moving the TOC to a *following* sibling of the capped paragraph removes
 * it from that paragraph's box entirely — a float only intrudes into the
 * flow that comes after it in DOM order — while keeping `float: left` so
 * later paragraphs still wrap around it (measured: 2 lines, cap at the top
 * of the column, this is the variant the fix keeps). It must be the
 * *capped* paragraph specifically, not always the first one: dropcaps.js
 * places the cap on the first paragraph that actually fits, which is not
 * always paragraph 0 (a short opening paragraph — e.g. a "TL;DR:" line —
 * is skipped in favour of the next one that fits a 3-line cap). Anchoring
 * on the first paragraph regardless reproduces this file's original bug
 * one paragraph later: the TOC ends up a preceding sibling of the capped
 * paragraph again, just with an uncapped paragraph in between.
 *
 * So this awaits dropcaps.js's `capPlaced` — which resolves with the
 * paragraph that actually received the cap, or `null` if none did — and
 * anchors on that. Falls back to the essay's first paragraph when no cap
 * was placed (a short opening paragraph with no eligible candidate),
 * matching this file's original behaviour for that case, and no-ops when
 * neither exists. The decision itself is pure (see ./lib/toc-anchor.js);
 * only the DOM move happens here.
 *
 * Must run — like dropcaps.js's capPlaced — before typography.js calls
 * justify() on the essay's paragraphs, since justif has no second pass:
 * see the ordering invariant in typography.js's header comment. `tocMoved`
 * exists as a promise (rather than just running this file for its side
 * effect) so typography.js can await it in the same pre-justify phase as
 * capPlaced. Unlike before, order relative to capPlaced now matters: this
 * file needs capPlaced's resolved value, so it awaits capPlaced itself
 * rather than merely settling independently alongside it. `tocMoved` must
 * still always resolve, never reject or hang, even if capPlaced rejects
 * or the DOM move itself throws — a stuck or rejected promise here would
 * silently disable justification, drop caps and sidenotes together, same
 * as capPlaced. capPlaced already bounds its own settlement (see its
 * comment in dropcaps.js), so awaiting it here cannot hang; the try/catch
 * below only guards against it rejecting or the DOM move throwing.
 *
 * No-JS: templates/page.html still renders <nav id="toc"> before
 * .article-body, so the TOC exists and floats without this script; this
 * move is a layout enhancement, not a requirement.
 *
 * No-op (per project convention) when any DOM hook is missing: no #toc,
 * or no paragraph to anchor on (no cap placed and no first paragraph) —
 * including every non-essay page.
 */
import { tocAnchor } from "./lib/toc-anchor.js";
import { capPlaced } from "./dropcaps.js";

const toc = document.querySelector("#toc");
const firstPara = document.querySelector(".article-body > p");

async function moveToc() {
  if (!toc) return;
  let capHost = null;
  try {
    capHost = await capPlaced;
  } catch (err) {
    // capPlaced is documented to always resolve, but guard anyway: fall
    // back to the first-paragraph behaviour rather than leaving tocMoved
    // pending or rejected.
    console.warn("toc-move.js: capPlaced rejected", err);
  }
  try {
    const anchor = tocAnchor(capHost, firstPara);
    if (anchor) anchor.after(toc);
  } catch (err) {
    console.warn("toc-move.js: TOC move failed", err);
  }
}

export const tocMoved = moveToc();
