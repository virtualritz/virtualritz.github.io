/**
 * Knuth-Plass justification via justif.
 *
 * Three findings from the spec (§7) are load-bearing here:
 *  1. justif declines elements with no layout box, reporting
 *     "<p> → not rendered". Wait for a real bounding box; DOMContentLoaded
 *     is not enough.
 *  2. It declines a padded <span> with no text content, which is why the
 *     punctuation pass pads the period rather than the space.
 *  3. Do NOT add a ResizeObserver. justif has observeResize:true, and
 *     observing its own container feeds its height changes back in as a
 *     relayout trigger, which oscillates at some zoom levels.
 *
 * Ordering invariant: the drop cap MUST be in the DOM, and the TOC MUST be
 * out of the first paragraph's box, before justify() is called on the
 * essay's first paragraph. justif has no second pass — inserting the cap
 * afterwards invalidates its already-computed layout for that paragraph
 * and nothing ever recomputes it (measured: only 9/15 paragraphs
 * justified, always missing the capped one), and a preceding-sibling float
 * (the TOC, see templates/page.html and sass/_layout.scss) that still
 * intrudes into that paragraph's box when justif measures it produces the
 * same kind of stuck layout (measured: 6.15 lines instead of 2, the cap
 * orphaned). So run() awaits dropcaps.js's `capPlaced` and toc-move.js's
 * `tocMoved` before ever calling justify(), rather than the other way
 * around. Do not reintroduce a "justify, then place the cap" order, and do
 * not "fix" a missed cap by calling `relayout()` afterwards instead —
 * `relayout()` calls controller.refresh(), which is actively harmful here
 * (measured: justified count went 9 → 7, and the capped paragraph still
 * wasn't justified).
 *
 * `ready` must resolve even when justif fails, or when drop-cap placement
 * throws: Task 9 and Task 10 both await it, and a hung promise would
 * silently disable drop caps and sidenotes with no error. `run()`
 * therefore owns that guarantee itself (try/catch around every
 * synchronous call and the `capPlaced` await, plus the existing
 * controller.ready rejection handler) rather than relying on justif
 * 0.9.1's current behaviour of turning internal errors into a rejected
 * controller.ready.
 *
 * mark-para-indent.js's `paraIndentMarked` and mark-long-tokens.js's
 * `longTokensMarked` join the same pre-justify await for the same "no
 * second pass" reason, but both are imported ahead of dropcaps.js and
 * toc-move.js below (not just awaited alongside them): each rewrites
 * .article-body's innerHTML wholesale, which must happen before either
 * dropcaps.js or toc-move.js touches that subtree — see their own header
 * comments. (The two rewrites don't interact with each other: one edits
 * <p> text around <br>/newlines, the other edits text inside <code>.)
 * Import position, not just await position, is what gives them that
 * ordering: ES modules evaluate each import's top-level body, in source
 * order, before the importing module's own body runs.
 *
 * The same ordering invariant applies after first load: resize-recompute.js
 * redoes capPlaced -> justify (tocMoved never needs redoing — the TOC's
 * position relative to the first paragraph doesn't depend on viewport
 * size) on a material viewport change, via `resetJustif()` and
 * `justifyAgain()` below. `resetJustif()` must run, and finish, before
 * dropcaps.js's `recomputeDropCap()` touches the paragraph, for the same
 * "justif has no second pass" reason: its "enhanced" markup is not the
 * plain text `place()` expects to walk.
 */
import { justify, hangingCharacters } from "./lib/justif/index.js";
import { hyphenateEnUS } from "./lib/justif/hyphenate/en-us.js";
import { markPunctuation } from "./lib/punctuation.js";
import { waitForBox } from "./lib/wait-for-box.js";
import { paraIndentMarked } from "./mark-para-indent.js";
import { longTokensMarked } from "./mark-long-tokens.js";
import { capPlaced } from "./dropcaps.js";
import { tocMoved } from "./toc-move.js";

// `:not(.footnotes *)` excludes Zola's collected footnote list: its
// visible form below the sidenote breakpoint is native browser reflow
// (never justified), and above it sidenotes.js hoists a clone into a
// 260px column. justif's output is fixed-width, non-reflowing segments
// (`white-space: nowrap` spans) computed for whatever width it measured
// — the ~895px .article-body measure, not the sidenote column's — and
// that frozen layout doesn't fit either destination, so the footnote
// source is excluded here rather than measured and thrown away. This is
// the whole fix for that overflow: nothing downstream needs to strip
// justif artifacts from a footnote clone, because none are ever applied.
// (A `.marginnote` span can't be excluded the same way — it sits inside
// an otherwise-normal paragraph that must still be justified — see the
// snapshot taken in run(), below.)
// `:not(#toc *)` excludes the table of contents. toc-move.js relocates
// <nav id="toc"> to just after the first paragraph — inside .article-body
// — so its <li>s match `.article-body li` and were being justified along
// with the prose. They are navigation, not running text, and justif is
// wrong for them twice over: a TOC entry is a single link that should
// simply wrap, and each <li> carries its section number as a `::before`
// counter (sass/_layout.scss), whose advance justif does not account for
// — the same generated-content bug patched in the vendored copy. The
// visible result was that any entry long enough to need three lines left
// its number stranded alone on the first line, the link starting a line
// below it (measured on the NSI essay: 7 of 27 entries, every one of them
// a 3-line entry, none of the 1- and 2-line ones).
const SELECTOR =
  ".article-body p:not(.footnotes *), .article-body li:not(.footnotes *):not(#toc *), .article-body blockquote p:not(.footnotes *)";

let controller = null;
let resolveReady;
export const ready = new Promise((r) => (resolveReady = r));

// Pre-justify snapshot of each `.marginnote`'s markup, indexed by document
// order. sidenotes.js hoists a margin note's sidenote clone from this
// instead of the live span: unlike the footnotes case above, a margin
// note's paragraph is a normal justif target, so justif decomposes the
// note's own text into the same per-word `justif-seg`/`justif-hyphen`/
// `justif-joint` spans (with inline word-/letter-spacing) it applies to
// any other inline run in a justified paragraph — frozen at the
// ~895px measure, exactly like the footnote content above, and just as
// unable to reflow inside a 260px column. Captured once, right after
// markPunctuation and before justify() ever runs, so it's the last clean
// state; the authored text never changes with viewport, so this one
// snapshot stays valid across resize-recompute's rejustify too — nothing
// re-snapshots on that path, same as markPunctuation itself isn't
// re-run there.
let marginNoteSnapshots = [];

/** The pre-justify innerHTML of the nth `.marginnote` (document order), or
 * `undefined` if none was captured (e.g. run() bailed before reaching it) —
 * callers fall back to the live span's own innerHTML in that case. */
export function marginNoteHTML(index) {
  return marginNoteSnapshots[index];
}

// A short, inspectable label for a declined paragraph: "p#foo" or "li".
function describe(el) {
  return el.id
    ? `${el.tagName.toLowerCase()}#${el.id}`
    : el.tagName.toLowerCase();
}

async function run() {
  try {
    const body = document.querySelector(".article-body");
    if (!body) return resolveReady();

    // Must come before markPunctuation/justify — see the ordering
    // invariant in the header comment. All four are no-ops on non-essay
    // pages.
    await Promise.all([
      capPlaced,
      tocMoved,
      paraIndentMarked,
      longTokensMarked,
    ]);

    markPunctuation(body);

    marginNoteSnapshots = [...body.querySelectorAll(".marginnote")].map(
      (el) => el.innerHTML,
    );

    const targets = document.querySelectorAll(SELECTOR);
    if (!targets.length) return resolveReady();

    const skipped = [];
    controller = justify(targets, {
      hyphenate: hyphenateEnUS,
      // Keep justif's live, canvas-measured per-font protrusion
      // (chunk-WWMSGT6G.js's `opticalProtrusion`) on. This is more
      // robust to font-fallback than the static tables (it measures
      // whatever glyphs the browser actually rendered, not whichever
      // family name was first in the CSS list) — measured against the
      // static `{...latinProtrusion, ...fontProtrusion(family)}`
      // fallback on the demo page, "S" got 0.74px of measured protrusion
      // vs. 0 from the static table, so this isn't a wash.
      //
      // Adding a character justif doesn't already know about (the
      // ellipsis, below) looks like it needs a user protrusion table via
      // this option — but passing `protrusion` anything other than
      // `true`/`undefined` sets `resolveOptions`'s `measuredProtrusion`
      // to `false` (index.js ~4395: `options.protrusion === void 0 ||
      // options.protrusion === true`), which turns off live measurement
      // for every character, not just the one being added. There's no
      // option that supplies a user table and keeps measurement on.
      protrusion: true,
      // "…" (U+2026) hangs at a line end via hangingPunctuation's
      // `characters` field instead, which resolves on a path independent
      // of `protrusion` above: `resolveOptions` builds `hangChars` from
      // `options.hangingPunctuation.characters` a few lines before it
      // even looks at `options.protrusion`, and passes it straight into
      // `composeProtrusion(..., hangMode, hangChars)`
      // (chunk-WWMSGT6G.js's `classify(base, chars.end, "r", HANG)`) —
      // so this reaches justif's hanging-character set without touching
      // the protrusion model at all. `…` is in neither
      // `latinProtrusion` nor the default `hangingCharacters`
      // (chunk-WWMSGT6G.js: quotes + ".," + CJK), so it currently gets
      // zero protrusion and never hangs; `edges: "line-end-only"`
      // preserves the previous behaviour for everything already in that
      // default set. Extending justif's own exported `hangingCharacters`
      // rather than hand-copying its character list means this doesn't
      // silently go stale if a future justif version changes that set.
      //
      // ":", ";", "!", "?" are deliberately NOT added here, even though
      // they DO have base protrusion codes (500/300/100/100 via
      // `protrusion: true` above) — i.e. justif already treats "gets an
      // optical nudge at a line edge" and "fully hangs past the margin"
      // (this `characters.end` set: a HANG code, 1000 — the character's
      // *entire* advance width hangs) as different things, reserving the
      // latter for small, simple marks (quotes, period, comma). A
      // colon's two stacked dots, a semicolon's comma-tail, and the
      // vertical stroke of "!"/"?" all read as more visually complex
      // than a lone period or a round quote, so a full-width hang would
      // leave a more conspicuous, disconnected-looking mark sitting in
      // the margin. Left as justif's default rather than widened.
      hangingPunctuation: {
        edges: "line-end-only",
        characters: { end: hangingCharacters.end + "…" },
      },
      onSkip: (p, reason) => skipped.push([describe(p), reason]),
    });

    Promise.resolve(controller.ready)
      .catch((err) => {
        console.warn(
          "typography.js: justif failed, falling back to native justification",
          err,
        );
      })
      .then(() => {
        if (skipped.length) {
          // Count on the dataset for tests/telemetry; the full list on the
          // console for anyone debugging spec §14.8 (no .spec paragraph
          // may be declined).
          document.documentElement.dataset.justifSkipped = String(
            skipped.length,
          );
          console.warn(
            `typography.js: justif declined ${skipped.length} paragraph(s)`,
            skipped,
          );
        }
        resolveReady();
      });
  } catch (err) {
    console.warn(
      "typography.js: drop cap placement or justif threw, falling back to native justification",
      err,
    );
    resolveReady();
  }
}

export function relayout() {
  if (controller) controller.refresh();
}

/**
 * Tears down the current justif layout, restoring every managed
 * paragraph's original DOM (text, and the drop-cap box if it has one) —
 * unlike `relayout()` above, which calls `controller.refresh()` and is
 * NOT a substitute for this (measured: refresh() after a DOM change
 * dropped justified paragraphs from 9 to 7, with the capped paragraph
 * still unjustified).
 *
 * Called by resize-recompute.js before dropcaps.js's `recomputeDropCap()`:
 * justif's "enhanced" markup for a paragraph is not the plain text
 * dropcaps.js's `place()` expects to walk, so the cap can only be safely
 * redone once justif has let go of it. `justifyAgain()` below re-applies
 * justif afterwards, replaying the same capPlaced -> tocMoved -> justify
 * ordering invariant documented above for a viewport change instead of
 * first load.
 */
export function resetJustif() {
  if (!controller) return;
  try {
    controller.destroy();
  } catch (err) {
    console.warn("typography.js: controller.destroy() failed", err);
  }
  controller = null;
}

/**
 * Re-applies justif from scratch to the current .article-body paragraphs.
 * Only meaningful after `resetJustif()` (or on first load, via `run()`):
 * justif has no second pass, so calling this while a controller is still
 * managing the paragraphs recomputes nothing for them.
 *
 * Options are kept by hand in sync with run()'s own justify() call above
 * (protrusion live-measured, "…" added to hangingCharacters.end) rather
 * than factored into a shared helper, so as not to disturb the tests that
 * anchor on run()'s literal `justify(targets, { ... })` call site.
 */
export async function justifyAgain() {
  const targets = document.querySelectorAll(SELECTOR);
  if (!targets.length) return;

  const skipped = [];
  try {
    controller = justify(targets, {
      hyphenate: hyphenateEnUS,
      protrusion: true,
      hangingPunctuation: {
        edges: "line-end-only",
        characters: { end: hangingCharacters.end + "…" },
      },
      onSkip: (p, reason) => skipped.push([describe(p), reason]),
    });
    await Promise.resolve(controller.ready).catch((err) => {
      console.warn(
        "typography.js: justif failed on rejustify, falling back to native justification",
        err,
      );
    });
  } catch (err) {
    console.warn("typography.js: justifyAgain threw", err);
    return;
  }

  if (skipped.length) {
    document.documentElement.dataset.justifSkipped = String(skipped.length);
    console.warn(
      `typography.js: justif declined ${skipped.length} paragraph(s) on rejustify`,
      skipped,
    );
  } else {
    delete document.documentElement.dataset.justifSkipped;
  }
}

// Checked once, synchronously, in frame one: an image/embed-only page has
// no .article-body match at all, so there is nothing to wait 4 seconds
// (the rAF poll budget below) to discover.
if (
  !document.querySelector(".article-body") ||
  document.querySelectorAll(SELECTOR).length === 0
) {
  resolveReady();
} else {
  waitForBox(SELECTOR).then((found) => (found ? run() : resolveReady()));
}
