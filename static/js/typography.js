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
 * `ready` must resolve even when justif fails: Task 9 and Task 10 both
 * await it, and a hung promise would silently disable drop caps and
 * sidenotes with no error. `run()` therefore owns that guarantee itself
 * (try/catch around every synchronous call, plus the existing
 * controller.ready rejection handler) rather than relying on justif
 * 0.9.1's current behaviour of turning internal errors into a rejected
 * controller.ready.
 */
import { justify } from "./lib/justif/index.js";
import { hyphenateEnUS } from "./lib/justif/hyphenate/en-us.js";
import { markPunctuation } from "./lib/punctuation.js";

const SELECTOR =
  ".article-body p, .article-body li, .article-body blockquote p";

let controller = null;
let resolveReady;
export const ready = new Promise((r) => (resolveReady = r));

function hasBox() {
  const el = document.querySelector(SELECTOR);
  return !!el && el.getBoundingClientRect().width > 10;
}

// A short, inspectable label for a declined paragraph: "p#foo" or "li".
function describe(el) {
  return el.id
    ? `${el.tagName.toLowerCase()}#${el.id}`
    : el.tagName.toLowerCase();
}

function run() {
  try {
    const body = document.querySelector(".article-body");
    if (!body) return resolveReady();

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
      "typography.js: justif threw, falling back to native justification",
      err,
    );
    resolveReady();
  }
}

export function relayout() {
  if (controller) controller.refresh();
}

let tries = 0;
function waitForBox() {
  if (hasBox()) return run();
  if (++tries > 240) return resolveReady(); // ~4s; give up and degrade
  requestAnimationFrame(waitForBox);
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
  requestAnimationFrame(waitForBox);
}
