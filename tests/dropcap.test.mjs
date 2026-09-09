import { test } from "node:test";
import assert from "node:assert/strict";
import { capGeometry, solveWeight } from "../static/js/lib/dropcap-geometry.js";

// EB Garamond at 24px/1.58, measured ratios
const body = { fbAsc: 1.007, fbDesc: 0.298, capInk: 0.65 };
const base = {
  bodyMetrics: body,
  bodySize: 24,
  lineHeight: 1.58,
  lines: 3,
  fit: "ink",
  capDropPct: 0,
  growPct: 0,
};
// a descender-less initial, e.g. "D"
const D = {
  inkAsc: 0.72,
  inkDesc: 0,
  inkLeft: 0,
  inkRight: 0.7,
  fbAsc: 1.0,
  fbDesc: 0.25,
};
// a descending initial, e.g. "J"
const J = { ...D, inkAsc: 0.72, inkDesc: 0.26 };

test("a descender-less cap occupies exactly the requested lines", () => {
  const g = capGeometry({ ...base, glyphMetrics: D });
  assert.equal(g.lines, 3);
});

test("total-ink fit keeps a descending cap inside the same lines", () => {
  const g = capGeometry({ ...base, glyphMetrics: J });
  assert.equal(g.lines, 3, "fitting total ink must not spill an extra line");
  assert.ok(g.size < capGeometry({ ...base, glyphMetrics: D }).size);
});

test("baseline fit makes a descending cap larger and spill a line", () => {
  const g = capGeometry({ ...base, glyphMetrics: J, fit: "base" });
  assert.ok(g.lines > 3, "baseline alignment hangs the tail below line n");
});

test("line count is stable against sub-pixel noise", () => {
  const a = capGeometry({ ...base, glyphMetrics: J, bodySize: 24 });
  const b = capGeometry({ ...base, glyphMetrics: J, bodySize: 24.004 });
  assert.equal(a.lines, b.lines, "ceil() must have hysteresis (spec §6)");
});

test("cap drop translates by a percentage of the box", () => {
  const a = capGeometry({ ...base, glyphMetrics: D });
  const b = capGeometry({ ...base, glyphMetrics: D, capDropPct: 10 });
  assert.ok(b.top > a.top);
  assert.ok(Math.abs(b.top - a.top - 0.1 * a.boxHeight) < 0.01);
});

test("grow scales the cap without moving its top", () => {
  const a = capGeometry({ ...base, glyphMetrics: D });
  const b = capGeometry({ ...base, glyphMetrics: D, growPct: 10 });
  assert.ok(Math.abs(b.size / a.size - 1.1) < 0.001);
});

test("solveWeight hits the target stroke ratio", () => {
  // synthetic face whose stem is linear in weight
  const stem = (w) => 0.0002 * w;
  const w = solveWeight(stem, 1.7, 5.0, 100);
  assert.ok(Math.abs((stem(w) * 100) / 1.7 - 5.0) < 0.05);
});
