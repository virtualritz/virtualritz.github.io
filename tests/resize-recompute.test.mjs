import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- resize-recompute.js / dropcaps.js / typography.js source: the
// ordering and safety invariants driving Issue 1 (the drop cap is never
// recomputed on viewport change). No DOM is available under `node --test`,
// so — same pattern as dropcap.test.mjs and toc-move.test.mjs — these pin
// the invariants at the source level. ---

const readSrc = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const resizeSrc = () => readSrc("../static/js/resize-recompute.js");
const dropcapsSrc = () => readSrc("../static/js/dropcaps.js");
const typographySrc = () => readSrc("../static/js/typography.js");
const sidenotesSrc = () => readSrc("../static/js/sidenotes.js");

test("resize-recompute.js resets justif, then redoes the drop cap, then rejustifies — in that order", () => {
  // Anchor on the `recompute()` function body specifically, not the whole
  // file: the header comment above also names all three calls, in the
  // same order, purely as documentation — matching against the whole file
  // would pass even if the calls inside recompute() were reordered.
  const full = resizeSrc();
  const fnStart = full.indexOf("async function recompute()");
  assert.ok(fnStart >= 0, "expected a recompute() function");
  const s = full.slice(fnStart, full.indexOf("const onResize", fnStart));
  const resetIdx = s.indexOf("resetJustif()");
  const capIdx = s.indexOf("recomputeDropCap()");
  const justifyIdx = s.indexOf("justifyAgain()");
  assert.ok(
    resetIdx >= 0 && capIdx >= 0 && justifyIdx >= 0,
    "expected all three recompute steps to be called inside recompute()",
  );
  assert.ok(
    resetIdx < capIdx,
    "justif must be torn down before the cap is redone: its 'enhanced' " +
      "markup is not the plain text place() expects to walk",
  );
  assert.ok(
    capIdx < justifyIdx,
    "the cap must be back in the DOM before justify() runs again: justif " +
      "has no second pass",
  );
});

test("resize-recompute.js never calls relayout()/refresh() as the re-layout mechanism", () => {
  const s = resizeSrc();
  assert.doesNotMatch(
    s,
    /\brelayout\s*\(/,
    "relayout()/controller.refresh() is measured harmful here (justified " +
      "count 9 -> 7); a fresh justify() must be used instead",
  );
  assert.doesNotMatch(s, /\.refresh\s*\(/);
});

test("resize-recompute.js adds no ResizeObserver (global constraint: never wrap justif's container)", () => {
  assert.doesNotMatch(resizeSrc(), /new ResizeObserver/);
});

test("resize-recompute.js listens on window resize and orientationchange, debounced", () => {
  const s = resizeSrc();
  assert.match(s, /addEventListener\(\s*["'`]resize["'`]/);
  assert.match(s, /addEventListener\(\s*["'`]orientationchange["'`]/);
  assert.match(
    s,
    /debounce\(/,
    "must debounce: reacting to every pixel of a drag-resize would tear " +
      "down and rebuild justif's layout dozens of times a second",
  );
});

test("resize-recompute.js gates every recompute on materialLayoutChange before doing any work", () => {
  const s = resizeSrc();
  assert.match(
    s,
    /import\s*\{[^}]*materialLayoutChange[^}]*\}\s*from\s*["'`]\.\/lib\/resize-watch\.js["'`]/,
  );
  // The debounced resize handler must check materiality and bail before
  // ever calling recompute() — a resize that changes neither line-height
  // nor measure (e.g. a mobile URL bar changing only viewport height)
  // must be a complete no-op.
  const debounceCallIdx = s.indexOf("debounce(");
  const handlerBody = s.slice(debounceCallIdx, s.indexOf("}, DEBOUNCE_MS"));
  assert.match(handlerBody, /materialLayoutChange\(/);
  assert.match(handlerBody, /return;/);
});

test("resize-recompute.js serialises overlapping recomputes instead of running them concurrently", () => {
  const s = resizeSrc();
  assert.match(
    s,
    /busy/,
    "a resize landing mid-recompute must be coalesced, not raced against " +
      "an in-flight destroy/redo/justify cycle",
  );
});

test("resize-recompute.js is scoped to #article.essay, the same gate dropcaps.js uses", () => {
  const s = resizeSrc();
  assert.match(s, /querySelector\(\s*["'`]#article\.essay["'`]\s*\)/);
});

test("resize-recompute.js repositions sidenotes after its own recompute settles", () => {
  const s = resizeSrc();
  assert.match(
    s,
    /import\s*\{\s*build as repositionSidenotes\s*\}\s*from\s*["'`]\.\/sidenotes\.js["'`]/,
  );
  const idx = s.indexOf("repositionSidenotes()");
  const justifyIdx = s.indexOf("justifyAgain()");
  assert.ok(
    idx > justifyIdx,
    "sidenotes must reposition after rejustify, against final geometry",
  );
});

test("sidenotes.js's build is exported for resize-recompute.js to call", () => {
  assert.match(sidenotesSrc(), /export function build\(\)/);
});

test("typography.js's resetJustif calls controller.destroy(), not controller.refresh()", () => {
  const s = typographySrc();
  const fnIdx = s.indexOf("export function resetJustif()");
  assert.ok(fnIdx >= 0);
  const body = s.slice(fnIdx, s.indexOf("export async function justifyAgain"));
  assert.match(body, /controller\.destroy\(\)/);
  assert.doesNotMatch(body, /controller\.refresh\(\)/);
});

test("typography.js's justifyAgain re-selects targets and calls justify() again", () => {
  const s = typographySrc();
  const fnIdx = s.indexOf("export async function justifyAgain()");
  assert.ok(fnIdx >= 0);
  const body = s.slice(fnIdx);
  assert.match(body, /document\.querySelectorAll\(SELECTOR\)/);
  assert.match(body, /controller\s*=\s*justify\(targets,/);
});

test("dropcaps.js's recomputeDropCap reuses place()'s own undo path rather than duplicating it", () => {
  const s = dropcapsSrc();
  const fnIdx = s.indexOf("export async function recomputeDropCap()");
  assert.ok(fnIdx >= 0);
  const body = s.slice(fnIdx);
  assert.match(body, /box\.remove\(\)/);
  assert.match(body, /sr\.remove\(\)/);
  assert.match(body, /restoreLetter\(/);
  assert.match(
    body,
    /await place\(/,
    "must call place() again to derive fresh geometry, not patch the old box in place",
  );
});

test("dropcaps.js tracks placement state so an overhang clears it (nothing to redo) and success records it", () => {
  const s = dropcapsSrc();
  const overhangIdx = s.indexOf("if (overhangs) {");
  assert.ok(overhangIdx >= 0);
  const braceEnd = s.indexOf("}\n}", overhangIdx); // end of the if/else + place()
  const region = s.slice(overhangIdx, braceEnd + 3);
  assert.match(
    region,
    /current\s*=\s*null/,
    "an overhung cap leaves nothing to redo on resize",
  );
  assert.match(
    region,
    /current\s*=\s*\{[^}]*box[^}]*\}/s,
    "a successfully placed cap must be recorded for recomputeDropCap to undo",
  );
});
