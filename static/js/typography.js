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

function run() {
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
    onSkip: (...args) => skipped.push(args),
  });

  Promise.resolve(controller.ready)
    .catch(() => {})
    .then(() => {
      if (skipped.length) {
        document.documentElement.dataset.justifSkipped = String(skipped.length);
      }
      resolveReady();
    });
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

if (document.querySelector(".article-body")) requestAnimationFrame(waitForBox);
else resolveReady();
