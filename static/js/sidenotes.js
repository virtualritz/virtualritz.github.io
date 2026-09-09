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
 */
import { ready } from "./typography.js";
import {
  resolveColumn,
  pairReferences,
  footnoteLabel,
  isBackrefFor,
} from "./lib/sidenote-layout.js";

// Matches the @media (min-width: 1560px) breakpoint in sass/_layout.scss.
const MIN_WIDTH = 1560;

function build() {
  const left = document.getElementById("sidenote-column-left");
  const right = document.getElementById("sidenote-column-right");
  const article = document.getElementById("article");
  if (!left || !right || !article) return;

  const list = article.querySelector(".footnotes ol, ol.footnotes");
  if (!list) return;

  const wide = window.innerWidth >= MIN_WIDTH;
  if (!wide) {
    document.documentElement.classList.remove("has-sidenotes");
    left.replaceChildren();
    right.replaceChildren();
    return;
  }

  const refs = [...article.querySelectorAll("sup.footnote-reference a")];
  const items = [...list.querySelectorAll("li")];
  const pairing = pairReferences(
    items.map((li) => li.id),
    refs.map((a) => a.getAttribute("href") || ""),
  );

  const cols = [[], []];

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

    cols[i % 2].push({ note, ref });
  });

  [left, right].forEach((col, ci) => {
    col.replaceChildren(...cols[ci].map((e) => e.note));
  });

  if (!cols[0].length && !cols[1].length) {
    document.documentElement.classList.remove("has-sidenotes");
    return;
  }

  const articleTop = article.getBoundingClientRect().top + window.scrollY;
  [left, right].forEach((col, ci) => {
    const measured = cols[ci].map(({ note, ref }) => ({
      top: ref.getBoundingClientRect().top + window.scrollY - articleTop,
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
