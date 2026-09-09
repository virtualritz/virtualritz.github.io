/**
 * Moves the TOC to after the essay's first paragraph.
 *
 * templates/page.html renders <nav id="toc"> as a preceding sibling of
 * .article-body, and sass/_layout.scss floats it left. That is fine on its
 * own, but it intrudes into the *first* paragraph's box: justif accounts
 * for a paragraph's own leading float (the drop cap) but not a preceding
 * sibling float, so it lays lines out at the full measure, none fit beside
 * both floats, and the browser pushes the whole paragraph below the TOC
 * (measured: 6.15 lines instead of 2, the drop cap orphaned above empty
 * space). Widening the measure doesn't help — the shortfall is the TOC's
 * fixed width, not the column's (measured at 1200/1500/1900px, identical).
 * Floating the TOC right instead just mirrors the bug.
 *
 * Moving the TOC to a *following* sibling of the first paragraph removes it
 * from that paragraph's box entirely — a float only intrudes into the flow
 * that comes after it in DOM order — while keeping `float: left` so later
 * paragraphs still wrap around it (measured: 2 lines, cap at the top of
 * the column, this is the variant the fix keeps).
 *
 * This is a plain, synchronous DOM move: no layout box or font metrics are
 * needed to relocate a node, only that .article-body and its first <p>
 * exist, which they do as soon as the module graph has been evaluated (the
 * script is loaded as type="module", so it runs after the document has
 * parsed). It still must run — like dropcaps.js's capPlaced — before
 * typography.js calls justify() on the essay's paragraphs, since justif
 * has no second pass: see the ordering invariant in typography.js's header
 * comment. `tocMoved` exists as a promise (rather than just running this
 * file for its side effect) so typography.js can await it in the same
 * pre-justify phase as capPlaced, the same contract either module could
 * switch to internally without the other caring. Order relative to
 * capPlaced does not matter: this never touches the paragraph dropcaps.js
 * places its cap into, only the TOC.
 *
 * No-JS: templates/page.html still renders <nav id="toc"> before
 * .article-body, so the TOC exists and floats without this script; this
 * move is a layout enhancement, not a requirement.
 *
 * No-op (per project convention) when any DOM hook is missing: no #toc,
 * no .article-body, no first paragraph — including every non-essay page.
 */
const toc = document.querySelector("#toc");
const firstPara = document.querySelector(".article-body > p");

if (toc && firstPara) {
  firstPara.after(toc);
}

export const tocMoved = Promise.resolve();
