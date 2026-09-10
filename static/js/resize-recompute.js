/**
 * Recomputes the drop cap, and rejustifies the essay body, when the
 * viewport's typographically material metrics change after first load —
 * the fix for the reported bug: rotating a mobile viewport
 * portrait -> landscape crosses sass/_layout.scss's
 * `@media (max-width: 640px)` breakpoint, which changes --body-size (and
 * so line-height) from 20px to 24px. justif's own `observeResize` already
 * re-lays out justification correctly on its own (measured: 11/11
 * paragraphs justified at every width in the repro) — it is only the drop
 * cap that is wrong afterwards, because dropcaps.js measures it once, at
 * load, and nothing ever revisits it (measured: the cap's 95px-tall box
 * still reserved exactly 2.5 lines against the new 38px line-height,
 * instead of 3).
 *
 * Ordering, replaying the load-time invariant documented in typography.js
 * and dropcaps.js's header comments: `resetJustif()` MUST finish before
 * `recomputeDropCap()` touches the paragraph (justif's "enhanced" markup
 * is not the plain text dropcaps.js's `place()` expects to walk), and the
 * cap MUST be back in the DOM before `justifyAgain()` runs (justif has no
 * second pass). `resetJustif()` itself is synchronous; `recomputeDropCap()`
 * and `justifyAgain()` are awaited in sequence, never run concurrently.
 *
 * Why this can't cause a feedback loop: the only trigger here is the
 * `window`'s own `resize`/`orientationchange` events, which fire on an
 * actual viewport-dimension change — never merely because content inside
 * the page reflowed. Rejustifying and resizing the drop-cap box changes
 * paragraph/box heights, not the viewport, so it cannot itself fire
 * another `resize` event; there is no ResizeObserver anywhere in this
 * chain (forbidden by spec §7.3 — see typography.js) that could turn our
 * own DOM writes back into a new trigger. The `materialLayoutChange` gate
 * (lib/resize-watch.js) is a second, independent safeguard: even a
 * spurious extra `resize` event converges immediately once line-height and
 * measure stop changing, because the comparison is against the last
 * *settled* metrics, not the previous event.
 *
 * Debounce (200ms) and materiality thresholds (0.5px line-height, 1px
 * measure) live in lib/resize-watch.js — see the reasoning there. Recompute
 * work itself is idempotent (re-running it against unchanged metrics
 * reproduces the same cap and layout) and serialised: a resize landing
 * mid-recompute is coalesced into one more pass after the current one
 * finishes, rather than run concurrently with it.
 *
 * Sidenotes: sidenotes.js already repositions on any resize via its own
 * fixed 200ms-debounced listener, independent of this file. But this
 * file's recompute can itself change paragraph heights below the fold
 * (a rewrapped opening paragraph shifts every footnote reference after
 * it), which can finish after sidenotes' own listener has already
 * measured and positioned against the pre-recompute geometry. So this
 * file also calls sidenotes.js's exported `build()` once more, after its
 * own recompute settles, to reposition against final geometry — see the
 * comment on `build` in sidenotes.js. This never fires on the actual
 * reported bug's repro (sidenotes only exist at >=1560px, far above any
 * mobile viewport), but keeps the wide-viewport case correct too.
 *
 * Scope: gated on `#article.essay`, the same element dropcaps.js itself
 * gates on — the only page type with a drop cap to recompute. Plain
 * .article-body pages (about, projects) have nothing this file needs to
 * redo: justif already keeps them correctly justified across a resize on
 * its own, per the measurement above.
 */
import { ready, resetJustif, justifyAgain } from "./typography.js";
import { recomputeDropCap } from "./dropcaps.js";
import { build as repositionSidenotes } from "./sidenotes.js";
import { debounce, materialLayoutChange } from "./lib/resize-watch.js";

const DEBOUNCE_MS = 200;

function measureLayout(body, p) {
  return {
    lineHeightPx: p ? parseFloat(getComputedStyle(p).lineHeight) : 0,
    measurePx: body.getBoundingClientRect().width,
  };
}

function wire(article) {
  const body = article.querySelector(".article-body");
  if (!body) return;

  let last = null;
  let busy = false;
  let dirty = false;

  async function recompute() {
    if (busy) {
      dirty = true;
      return;
    }
    busy = true;
    try {
      resetJustif();
      await recomputeDropCap();
      await justifyAgain();
      repositionSidenotes();
    } catch (err) {
      console.warn("resize-recompute.js: recompute failed", err);
    } finally {
      busy = false;
      if (dirty) {
        dirty = false;
        // A resize landed mid-recompute: check once more against the
        // metrics as they stand now, rather than assume they still
        // differ from `last` by however much they did when it fired.
        const settled = measureLayout(body, body.querySelector(":scope > p"));
        if (materialLayoutChange(last, settled)) {
          last = settled;
          recompute();
        }
      }
    }
  }

  const onResize = debounce(() => {
    const next = measureLayout(body, body.querySelector(":scope > p"));
    if (!materialLayoutChange(last, next)) return;
    last = next;
    recompute();
  }, DEBOUNCE_MS);

  last = measureLayout(body, body.querySelector(":scope > p"));
  addEventListener("resize", onResize);
  addEventListener("orientationchange", onResize);
}

const article = document.querySelector("#article.essay");
if (article) ready.then(() => wire(article));
