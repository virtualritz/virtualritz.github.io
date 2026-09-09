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
 */
import { ready } from "./typography.js";
import { resolveColumn } from "./lib/sidenote-layout.js";

// Matches the @media (min-width: 1560px) breakpoint in sass/_layout.scss.
const MIN_WIDTH = 1560;

function build() {
  const left = document.getElementById("sidenote-column-left");
  const right = document.getElementById("sidenote-column-right");
  const article = document.getElementById("article");
  if (!left || !right || !article) return;

  const list = article.querySelector(".footnotes ol, ol.footnotes");
  if (!list) return;
  const section = list.closest(".footnotes, section");

  const wide = window.innerWidth >= MIN_WIDTH;
  document.documentElement.classList.toggle("has-sidenotes", wide);
  if (!wide) {
    left.replaceChildren();
    right.replaceChildren();
    section?.removeAttribute("hidden");
    return;
  }

  // Pair each reference to its definition by the "#fn-LABEL" suffix of
  // its href rather than equality (hrefs are absolute permalinks) or any
  // assumption that LABEL is an integer index.
  const refsByTarget = new Map();
  for (const a of article.querySelectorAll("sup.footnote-reference a")) {
    const href = a.getAttribute("href") || "";
    const target = href.slice(href.indexOf("#") + 1);
    if (!refsByTarget.has(target)) refsByTarget.set(target, a);
  }

  const cols = [[], []];
  const items = [...list.querySelectorAll("li")];

  items.forEach((li, i) => {
    const ref = refsByTarget.get(li.id);
    if (!ref) return;

    const note = document.createElement("div");
    note.className = "sidenote";
    note.id = `sn-${li.id}`;
    const n = document.createElement("span");
    n.className = "sidenote-number";
    n.textContent = String(i + 1);
    note.append(n, ...li.cloneNode(true).childNodes);

    // Strip the return-arrow backref(s): plain <a>s pointing back at this
    // note's reference id(s) (fr-LABEL-1, fr-LABEL-2, ... when the same
    // footnote is cited more than once). There is no .footnote-backref
    // class to key off.
    const label = li.id.slice("fn-".length);
    for (const a of note.querySelectorAll("a")) {
      if ((a.getAttribute("href") || "").includes(`#fr-${label}-`)) a.remove();
    }

    cols[i % 2].push({ note, ref });
  });

  [left, right].forEach((col, ci) => {
    col.replaceChildren(...cols[ci].map((e) => e.note));
  });

  if (!cols[0].length && !cols[1].length) {
    section?.removeAttribute("hidden");
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

  section?.setAttribute("hidden", "");
}

if (document.getElementById("article")) {
  ready.then(() => document.fonts.ready.then(build));
  let t;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(build, 200);
  });
}
