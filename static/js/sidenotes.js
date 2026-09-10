/**
 * Hoists Zola's collected footnotes into the two margin columns on wide
 * viewports, leaving the native <section class="footnotes"> as the
 * fallback below the breakpoint.
 *
 * Must run after justif has settled (`ready`, Task 8): justif changes
 * paragraph heights, so the reference offsets measured below would be
 * wrong if taken before it finishes. Fonts must also have loaded before
 * measuring: .sidenote's line-height/height depends on the sans face
 * having actually been applied.
 *
 * Zola 0.23 emits (verified against a real build, not assumed):
 *   <sup class="footnote-reference" id="fr-LABEL-N"><a href="ABS#fn-LABEL">[n]</a></sup>
 *   <section class="footnotes"><ol class="footnotes-list">
 *     <li id="fn-LABEL"><p>note text <a href="ABS#fr-LABEL-1">↩</a> ...</p></li>
 *   </ol></section>
 * hrefs are absolute permalinks, LABEL is an arbitrary string (not
 * necessarily an integer), a footnote cited more than once gets one
 * backref <a> per citation in its <li>, and there is no
 * .footnote-backref class to key off.
 *
 * Accessibility: the native <section class="footnotes"> stays in the
 * accessibility tree at all times — [hidden] would remove it, and with
 * the sidenote columns marked aria-hidden (they duplicate it for sighted
 * layout only), that would delete the footnote text from every
 * accessible surface at once, and leave every in-text [n] reference
 * link pointing at a non-rendered target. Below the breakpoint it's
 * plainly visible; at/above it, sass/_sidenotes.scss clips it the same
 * way .sr hides the drop cap's duplicated letter (visually hidden, still
 * present and focusable), keyed off the `has-sidenotes` class this file
 * sets only once notes have actually been hoisted.
 *
 * `build` is exported so resize-recompute.js can call it once more, right
 * after it redoes the drop cap and rejustifies on a material viewport
 * change: that recompute can itself change paragraph heights (a rewrapped
 * first paragraph shifts every footnote reference below it), which would
 * leave the fixed 200ms-debounced listener below racing a slower
 * recompute and positioning against geometry that's about to move again.
 * Calling `build` twice in that case is harmless — it fully recomputes
 * positions from scratch each time — so this is a plain addition, not a
 * replacement for the listener (sidenotes still need to reposition on a
 * resize that changes nothing else about the essay's typography, e.g. one
 * that only changes viewport height).
 *
 * Margin notes (`.marginnote`, templates/shortcodes/marginnote.html) are
 * hoisted the same way and into the same two columns, but they carry no
 * reference mark or number — the component's whole point is an authored
 * aside, not a derived citation — so there is no reference-to-definition
 * pairing to do: every `.marginnote` on the page is always hoisted (when
 * wide), keyed to its own original position rather than some other
 * element's. Because a footnote sidenote and a margin note can legitimately
 * sit close together (see content/essays/typography.md), both kinds are
 * merged into one list and sorted by real page position before the
 * alternating left/right split (`assignColumns`, lib/sidenote-layout.js),
 * so which column an item lands in — and whether it clears the item above
 * it in that column — never depends on which kind it is. A margin note's
 * clone is sourced from typography.js's `marginNoteHTML` pre-justify
 * snapshot rather than the live span: like the footnote content this file
 * used to justify-then-clone (see that file's header comment for why that
 * broke sidenotes), a margin note's paragraph is a normal justif target,
 * so the live span carries the same non-reflowing per-word artifacts.
 *
 * Below the breakpoint, or on narrower viewports generally, a margin note
 * is left exactly where it was authored — inline, mid-sentence, in
 * `sass/_components.scss`'s `.marginnote` styling — which is also the
 * no-JS fallback.
 *
 * Rebuild safety: `has-sidenotes` is cleared before anything is measured
 * (not just in the narrow branch), because a rebuild — a resize, or this
 * file's own re-run from resize-recompute.js — can otherwise run while a
 * margin note is still clipped from the *previous* pass (see the CSS in
 * sass/_sidenotes.scss): measuring a clipped span's near-zero-size box
 * instead of its natural in-flow position would place its new clone at
 * the wrong height. Footnote references are unaffected by this (only the
 * collected `.footnotes` section is ever clipped, never an in-text `<sup>`
 * reference), but clearing unconditionally keeps one rule for both.
 */
import { ready, marginNoteHTML } from "./typography.js";
import {
  resolveColumn,
  assignColumns,
  pairReferences,
  footnoteLabel,
  isBackrefFor,
} from "./lib/sidenote-layout.js";

// Matches the @media (min-width: 1560px) breakpoint in sass/_layout.scss.
const MIN_WIDTH = 1560;

function footnoteEntries(article, anchorTop) {
  const list = article.querySelector(".footnotes ol, ol.footnotes");
  if (!list) return [];

  const refs = [...article.querySelectorAll("sup.footnote-reference a")];
  const items = [...list.querySelectorAll("li")];
  const pairing = pairReferences(
    items.map((li) => li.id),
    refs.map((a) => a.getAttribute("href") || ""),
  );

  const entries = [];
  items.forEach((li, i) => {
    const ref = refs[pairing[i]];
    if (!ref) return;

    const note = document.createElement("div");
    note.className = "sidenote";
    note.id = `sn-${li.id}`;
    const n = document.createElement("span");
    n.className = "sidenote-number";
    n.textContent = String(i + 1);
    note.append(n, ...li.cloneNode(true).childNodes);

    // Strip the return-arrow backref(s) — see isBackrefFor.
    const label = footnoteLabel(li.id);
    for (const a of note.querySelectorAll("a")) {
      if (isBackrefFor(a.getAttribute("href") || "", label)) a.remove();
    }

    entries.push({ top: anchorTop(ref), note });
  });
  return entries;
}

function marginNoteEntries(article, anchorTop) {
  const spans = [...article.querySelectorAll(".marginnote")];
  return spans.map((span, i) => {
    const note = document.createElement("div");
    note.className = "sidenote";
    // No reference mark and no pairing: a margin note has no citation to
    // match, only its own position. Prefer the pre-justify snapshot (see
    // typography.js) and fall back to the live span if none was captured
    // (e.g. justif never ran on this page at all, so there is nothing to
    // strip in the first place).
    const html = marginNoteHTML(i);
    note.innerHTML = html !== undefined ? html : span.innerHTML;
    return { top: anchorTop(span), note };
  });
}

export function build() {
  const left = document.getElementById("sidenote-column-left");
  const right = document.getElementById("sidenote-column-right");
  const article = document.getElementById("article");
  if (!left || !right || !article) return;

  // See the header comment: clear before measuring anything, not just in
  // the narrow branch below.
  document.documentElement.classList.remove("has-sidenotes");

  const wide = window.innerWidth >= MIN_WIDTH;
  if (!wide) {
    left.replaceChildren();
    right.replaceChildren();
    return;
  }

  const articleTop = article.getBoundingClientRect().top + window.scrollY;
  const anchorTop = (el) =>
    el.getBoundingClientRect().top + window.scrollY - articleTop;

  const entries = [
    ...footnoteEntries(article, anchorTop),
    ...marginNoteEntries(article, anchorTop),
  ];

  if (!entries.length) {
    left.replaceChildren();
    right.replaceChildren();
    return;
  }

  const cols = assignColumns(entries);

  [left, right].forEach((col, ci) => {
    col.replaceChildren(...cols[ci].map((e) => e.note));
  });

  [left, right].forEach((col, ci) => {
    const measured = cols[ci].map(({ top, note }) => ({
      top,
      height: note.getBoundingClientRect().height,
    }));
    const tops = resolveColumn(measured);
    cols[ci].forEach(({ note }, i) => {
      note.style.top = `${tops[i]}px`;
    });
  });

  document.documentElement.classList.add("has-sidenotes");
}

if (document.getElementById("article")) {
  ready.then(() => document.fonts.ready.then(build));
  let t;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(build, 200);
  });
}
