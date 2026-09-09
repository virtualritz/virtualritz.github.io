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
 * Ordering invariant: the drop cap MUST be in the DOM before justify() is
 * called on the essay's first paragraph. justif has no second pass —
 * inserting the cap afterwards invalidates its already-computed layout for
 * that paragraph and nothing ever recomputes it (measured: only 9/15
 * paragraphs justified, always missing the capped one). So run() awaits
 * dropcaps.js's `capPlaced` before ever calling justify(), rather than the
 * other way around. Do not reintroduce a "justify, then place the cap"
 * order, and do not "fix" a missed cap by calling `relayout()` afterwards
 * instead — `relayout()` calls controller.refresh(), which is actively
 * harmful here (measured: justified count went 9 → 7, and the capped
 * paragraph still wasn't justified).
 *
 * `ready` must resolve even when justif fails, or when drop-cap placement
 * throws: Task 9 and Task 10 both await it, and a hung promise would
 * silently disable drop caps and sidenotes with no error. `run()`
 * therefore owns that guarantee itself (try/catch around every
 * synchronous call and the `capPlaced` await, plus the existing
 * controller.ready rejection handler) rather than relying on justif
 * 0.9.1's current behaviour of turning internal errors into a rejected
 * controller.ready.
 */
import { justify } from "./lib/justif/index.js";
import { hyphenateEnUS } from "./lib/justif/hyphenate/en-us.js";
import { markPunctuation } from "./lib/punctuation.js";
import { waitForBox } from "./lib/wait-for-box.js";
import { capPlaced } from "./dropcaps.js";

const SELECTOR =
  ".article-body p, .article-body li, .article-body blockquote p";

let controller = null;
let resolveReady;
export const ready = new Promise((r) => (resolveReady = r));

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
    // invariant in the header comment. A no-op on non-essay pages.
    await capPlaced;

    markPunctuation(body);

    const targets = document.querySelectorAll(SELECTOR);
    if (!targets.length) return resolveReady();

    const skipped = [];
    controller = justify(targets, {
      hyphenate: hyphenateEnUS,
      protrusion: true,
      hangingPunctuation: "line-end-only",
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
