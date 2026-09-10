import { test } from "node:test";
import assert from "node:assert/strict";
import {
  materialLayoutChange,
  debounce,
} from "../static/js/lib/resize-watch.js";

// --- materialLayoutChange ---------------------------------------------

test("no baseline yet always counts as a material change", () => {
  assert.equal(
    materialLayoutChange(null, { lineHeightPx: 31.6, measurePx: 346 }),
    true,
  );
});

test("identical metrics are not material", () => {
  const m = { lineHeightPx: 31.6, measurePx: 346 };
  assert.equal(materialLayoutChange(m, { ...m }), false);
});

test("sub-epsilon jitter in line-height is not material", () => {
  assert.equal(
    materialLayoutChange(
      { lineHeightPx: 31.6, measurePx: 346 },
      { lineHeightPx: 31.604, measurePx: 346 },
    ),
    false,
    "0.004px is sub-pixel rounding noise, not a real change",
  );
});

test("a breakpoint-sized line-height jump is material", () => {
  // The real regression: portrait -> landscape crosses the 640px
  // breakpoint, --body-size 20px -> 24px, line-height 31.6px -> 37.92px.
  assert.equal(
    materialLayoutChange(
      { lineHeightPx: 31.6, measurePx: 346 },
      { lineHeightPx: 37.92, measurePx: 792 },
    ),
    true,
  );
});

test("sub-epsilon jitter in measure is not material", () => {
  assert.equal(
    materialLayoutChange(
      { lineHeightPx: 37.92, measurePx: 792.0 },
      { lineHeightPx: 37.92, measurePx: 792.4 },
    ),
    false,
  );
});

test("a real measure change with unchanged line-height is still material", () => {
  // e.g. a desktop window narrowed within the same breakpoint, short of
  // any font-size change: the column narrows enough to rewrap the first
  // paragraph, which can turn a previously-safe cap into an overhang.
  assert.equal(
    materialLayoutChange(
      { lineHeightPx: 37.92, measurePx: 792 },
      { lineHeightPx: 37.92, measurePx: 700 },
    ),
    true,
  );
});

test("a viewport-height-only change (e.g. a mobile URL bar) is not material", () => {
  // Neither line-height nor measure depends on viewport height, so a
  // resize event fired only because innerHeight changed must be inert.
  const m = { lineHeightPx: 31.6, measurePx: 346 };
  assert.equal(materialLayoutChange(m, { ...m }), false);
});

test("thresholds are configurable", () => {
  assert.equal(
    materialLayoutChange(
      { lineHeightPx: 31.6, measurePx: 346 },
      { lineHeightPx: 31.7, measurePx: 346 },
      { lineHeightEpsilonPx: 0.5 },
    ),
    false,
  );
  assert.equal(
    materialLayoutChange(
      { lineHeightPx: 31.6, measurePx: 346 },
      { lineHeightPx: 31.7, measurePx: 346 },
      { lineHeightEpsilonPx: 0.05 },
    ),
    true,
  );
});

// --- debounce ------------------------------------------------------------

test("debounce delays the call until the wait elapses", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const d = debounce(() => calls++, 200);
  d();
  t.mock.timers.tick(199);
  assert.equal(calls, 0, "must not fire before the wait elapses");
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
});

test("debounce collapses a burst of calls into one trailing call", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let lastArg;
  const d = debounce((x) => {
    calls++;
    lastArg = x;
  }, 200);
  d(1);
  t.mock.timers.tick(50);
  d(2);
  t.mock.timers.tick(50);
  d(3);
  t.mock.timers.tick(199);
  assert.equal(calls, 0, "the burst must not have fired yet");
  t.mock.timers.tick(1);
  assert.equal(calls, 1, "a burst of calls must collapse into exactly one");
  assert.equal(lastArg, 3, "the trailing call must see the latest arguments");
});

test("debounce.cancel drops a pending call", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const d = debounce(() => calls++, 200);
  d();
  d.cancel();
  t.mock.timers.tick(1000);
  assert.equal(calls, 0);
});

test("debounce fires again for a second, separate burst", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const d = debounce(() => calls++, 200);
  d();
  t.mock.timers.tick(200);
  assert.equal(calls, 1);
  d();
  t.mock.timers.tick(200);
  assert.equal(
    calls,
    2,
    "debounce must not permanently latch after firing once",
  );
});
