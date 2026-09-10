/**
 * Pure decision logic for resize-driven typography recompute.
 *
 * The drop cap (dropcaps.js) and justif's layout (typography.js) are both
 * measured against font-size/line-height and column width at the moment
 * they run. Neither is automatically correct after a *later* viewport
 * change: justif's own `observeResize` already re-lays out justification
 * on its own (measured: unaffected by mobile portrait/landscape rotation),
 * but the drop cap is measured once and never revisited, so after a
 * breakpoint flips --body-size (sass/_layout.scss's
 * `@media (max-width: 640px)`) the cap's box still reserves the old,
 * wrong line-height (measured: 95px box against a 38px line-height that
 * used to be 31.6px — 2.5 lines covered instead of 3).
 *
 * `materialLayoutChange` is the gate that decides whether a resize is
 * worth reacting to at all: only a change to line-height or column
 * measure can invalidate the cap's geometry (capGeometry() in
 * dropcap-geometry.js takes no other input), so a resize that leaves both
 * unchanged — a mobile URL bar showing/hiding and changing only viewport
 * *height*, a sub-pixel rounding wobble, a window drag that hasn't yet
 * crossed a breakpoint — must be a no-op. Reacting to every pixel of a
 * continuous drag-resize would otherwise mean tearing down and rebuilding
 * justif's layout dozens of times a second.
 *
 * `debounce` is what keeps a resize *gesture* (a drag, a rotation) down to
 * one recompute after it settles, rather than one per intermediate event.
 * Neither function touches the DOM: the caller (resize-recompute.js)
 * supplies freshly measured `{ lineHeightPx, measurePx }` and owns the
 * `window` event wiring, so this module stays testable under `node --test`
 * with no DOM emulator.
 */

// Comfortably above sub-pixel rounding noise (observed sub-0.1px jitter
// from browser zoom levels — see dropcap-geometry.js's own
// LINE_HYSTERESIS for the same class of problem), comfortably below any
// real breakpoint-driven change (this project's only line-height change,
// the 640px breakpoint, moves it 31.6px -> 37.92px, a 6.32px jump).
const DEFAULT_LINE_HEIGHT_EPSILON_PX = 0.5;

// The column measure can legitimately move by a handful of pixels for
// reasons that still matter here — a narrower device width shortens the
// first paragraph enough to change how many lines it wraps to, which is
// exactly the input capOverhangsParagraph cares about — so this stays
// tight rather than matching the line-height epsilon above.
const DEFAULT_MEASURE_EPSILON_PX = 1;

/**
 * Whether `next` differs from `prev` by more than noise, in a way that
 * could actually change drop-cap geometry or paragraph wrapping.
 *
 * `prev` may be `null` (no baseline measured yet), which always counts as
 * a material change so the first call after `ready` establishes one.
 */
export function materialLayoutChange(
  prev,
  next,
  {
    lineHeightEpsilonPx = DEFAULT_LINE_HEIGHT_EPSILON_PX,
    measureEpsilonPx = DEFAULT_MEASURE_EPSILON_PX,
  } = {},
) {
  if (!prev) return true;
  return (
    Math.abs(next.lineHeightPx - prev.lineHeightPx) > lineHeightEpsilonPx ||
    Math.abs(next.measurePx - prev.measurePx) > measureEpsilonPx
  );
}

/**
 * Trailing-edge debounce: `fn` runs once, `waitMs` after the last call.
 * Returns the debounced function, with a `.cancel()` to drop a pending
 * call outright (used when a caller needs to tear down its listeners).
 */
export function debounce(fn, waitMs) {
  let timer = null;
  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
