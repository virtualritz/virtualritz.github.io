import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  capGeometry,
  capOverhangsParagraph,
  restoreLetter,
  solveWeight,
  stripLetter,
} from "../static/js/lib/dropcap-geometry.js";
import {
  MAX_DROPCAP_CANDIDATES,
  selectDropcapCandidates,
} from "../static/js/lib/dropcap-candidates.js";

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

test("capOverhangsParagraph accepts a box that ends at or above the paragraph's bottom", () => {
  // The real essay's opener, after placement: box and paragraph both
  // settle at the same 3-line depth — no overhang.
  assert.equal(capOverhangsParagraph(113.8, 113.8), false);
  // Box bottom above the paragraph's is not overhang either.
  assert.equal(capOverhangsParagraph(100, 113.8), false);
});

test("capOverhangsParagraph rejects a box that overhangs past the paragraph's bottom", () => {
  // /about/'s opener, after placement: a 2-line opener against a 3-line
  // cap overhangs 38px into the following heading.
  assert.equal(capOverhangsParagraph(75.8 + 38, 75.8), true);
});

test("capOverhangsParagraph absorbs sub-pixel rounding within epsilon", () => {
  assert.equal(
    capOverhangsParagraph(113.8, 113.4),
    false,
    "0.4px is sub-pixel noise, not overhang",
  );
  assert.equal(
    capOverhangsParagraph(115.4, 113.8),
    true,
    "1.6px is a real overhang, not noise",
  );
});

test("stripLetter removes the first occurrence and reports where", () => {
  // <p> <em>A</em>lpha…</p>'s text node holding "A"
  assert.deepEqual(stripLetter("Alpha", "A"), { text: "lpha", index: 0 });
  assert.deepEqual(stripLetter(" Alpha", "A"), { text: " lpha", index: 1 });
});

test("stripLetter returns null when the letter isn't in this text node", () => {
  assert.equal(stripLetter(" ", "A"), null);
});

test("restoreLetter is the exact inverse of stripLetter", () => {
  for (const [text, letter] of [
    ["Alpha", "A"],
    [" Alpha", "A"],
    ["The A team", "A"],
    ["A", "A"],
  ]) {
    const stripped = stripLetter(text, letter);
    assert.ok(stripped, `expected "${letter}" to be found in "${text}"`);
    assert.equal(
      restoreLetter(stripped.text, letter, stripped.index),
      text,
      "restoring must reproduce the original text exactly",
    );
  }
});

test("undo round-trip: strip then restore leaves textContent unchanged, matching dropcaps.js's undo path", () => {
  // This is the pure logic behind the DOM undo in dropcaps.js: when a
  // placed cap overhangs, the letter must go back exactly where it came
  // from. No DOM is available under `node --test`, so this proves the
  // splice/unsplice arithmetic is exact rather than merely asserting on
  // dropcaps.js's source text.
  const original = " Alpha begins the essay.";
  const letter = "A";
  const stripped = stripLetter(original, letter);
  assert.equal(
    stripped.text,
    " lpha begins the essay.",
    "letter removed from the flow",
  );
  const restored = restoreLetter(stripped.text, letter, stripped.index);
  assert.equal(restored, original, "undo must restore the exact original text");
});

test("solveWeight hits the target stroke ratio", () => {
  // synthetic face whose stem is linear in weight
  const stem = (w) => 0.0002 * w;
  const w = solveWeight(stem, 1.7, 5.0, 100);
  assert.ok(Math.abs((stem(w) * 100) / 1.7 - 5.0) < 0.05);
});

// --- selectDropcapCandidates: which leading paragraph(s) are worth trying
// as a drop-cap host. DOM-free by design: it only ever sees the tag names
// of .article-body's direct children, in order. ---

test("selectDropcapCandidates picks the first paragraph when it's the only one before a heading", () => {
  const idx = selectDropcapCandidates(["P", "P", "H2"], 3);
  assert.deepEqual(
    idx,
    [0, 1],
    "both leading paragraphs are candidates; dropcaps.js tries index 0 first",
  );
});

test("selectDropcapCandidates stops at the first heading, however deep it is", () => {
  const idx = selectDropcapCandidates(["P", "P", "P", "H2", "P"], 5);
  assert.deepEqual(
    idx,
    [0, 1, 2],
    "the paragraph after the heading must not be offered as a candidate",
  );
});

test("selectDropcapCandidates is bounded even with no heading in sight", () => {
  const idx = selectDropcapCandidates(["P", "P", "P", "P", "P"], 3);
  assert.deepEqual(
    idx,
    [0, 1, 2],
    "a cap several paragraphs deep would look like a mistake, not intent",
  );
});

test("selectDropcapCandidates skips non-paragraph, non-heading siblings without ending the search", () => {
  // The TL;DR essay's actual shape: two standfirst paragraphs, then an <hr>,
  // then the first real heading.
  const idx = selectDropcapCandidates(["P", "P", "P", "HR", "H2"], 3);
  assert.deepEqual(idx, [0, 1, 2]);
});

test("selectDropcapCandidates returns nothing when the article opens on a heading", () => {
  assert.deepEqual(selectDropcapCandidates(["H2", "P"], 3), []);
});

test("MAX_DROPCAP_CANDIDATES is the default bound", () => {
  const tags = new Array(10).fill("P");
  assert.deepEqual(
    selectDropcapCandidates(tags),
    selectDropcapCandidates(tags, MAX_DROPCAP_CANDIDATES),
  );
});

// --- dropcaps.js source: the DOM-insertion order that justif's leading-
// float check depends on. No DOM is available under `node --test`, so
// this pins the invariant at the source level instead (see sidenotes.test.mjs
// for the same pattern). ---

const dropcapsSrc = () =>
  readFileSync(new URL("../static/js/dropcaps.js", import.meta.url), "utf8");

test("the initial is stripped from the first text node that actually contains it, not just the first text node", () => {
  const s = dropcapsSrc();
  // <p> <em>A</em>lpha…</p> has a leading whitespace text node ahead of
  // the one holding "A". Blindly stripping from whatever nextNode()
  // returns first silently no-ops on that whitespace node and the
  // letter duplicates (shown once in the box, once still in the flow).
  assert.doesNotMatch(
    s,
    /const first = document\.createTreeWalker\(p, 4\)\.nextNode\(\);\s*\n\s*first\.data = first\.data\.replace\(letter, ""\);/,
    "must not strip the letter from whichever text node happens to come first",
  );
  assert.match(
    s,
    /stripLetter\(node\.data, letter\)/,
    "must walk forward to the text node that actually contains the letter before stripping it",
  );
});

test("the overhang check measures the box after it is placed, not the paragraph before placement", () => {
  const s = dropcapsSrc();
  // Regression: measuring p's height before the box exists compares
  // against a height placement itself is about to change (the float
  // narrows the column, which can add a line). The check must read
  // getBoundingClientRect() only after box.after(sr).
  const boxAfterSrIdx = s.indexOf("box.after(sr)");
  const overhangCallIdx = s.indexOf("capOverhangsParagraph(");
  assert.ok(boxAfterSrIdx >= 0 && overhangCallIdx >= 0);
  assert.ok(
    boxAfterSrIdx < overhangCallIdx,
    "must measure for overhang only after the box is in the DOM",
  );
  assert.match(
    s,
    /box\.getBoundingClientRect\(\)\.bottom/,
    "must read the placed box's real bottom edge",
  );
});

test("an overhanging cap is undone completely: box, .sr, and the stripped letter", () => {
  const s = dropcapsSrc();
  const overhangCallIdx = s.indexOf("capOverhangsParagraph(");
  const boxRemoveIdx = s.indexOf("box.remove()");
  const srRemoveIdx = s.indexOf("sr.remove()");
  const restoreIdx = s.indexOf("restoreLetter(");
  assert.ok(
    overhangCallIdx >= 0 &&
      boxRemoveIdx > overhangCallIdx &&
      srRemoveIdx > overhangCallIdx &&
      restoreIdx > overhangCallIdx,
    "the undo must remove the box, remove .sr, and restore the letter — " +
      "a half-removed cap leaves the paragraph missing its first letter",
  );
});

test("the undo path does not throw, so capPlaced still resolves (never rejects)", () => {
  const s = dropcapsSrc();
  // place()'s only try/catch is around font loading, well before the
  // undo branch: a throw inside `if (overhangs) { ... }` would reject
  // the promise .then() wraps it in, breaking dropcaps.js's own
  // contract that capPlaced must always resolve.
  assert.doesNotMatch(
    s,
    /if\s*\(overhangs\)\s*\{[^}]*throw/s,
    "the undo branch must not throw",
  );
});

test("the candidate loop stops at the first paragraph whose cap actually fits", () => {
  const s = dropcapsSrc();
  assert.match(
    s,
    /for \(const \{ p, letter \} of candidates\) \{/,
    "must walk candidates in order",
  );
  assert.match(
    s,
    /if \(tryPlaceCap\(p, letter, opts, initial, weight\)\) return p;/,
    "must stop at the first candidate that fits rather than trying the rest, " +
      "returning that paragraph as the cap's host",
  );
});

test("place() resolves capPlaced with the host paragraph, or null when no cap was placed", () => {
  const s = dropcapsSrc();
  assert.match(
    s,
    /if \(!container\) return null;/,
    "must resolve null, not undefined, when .article-body is missing",
  );
  assert.match(
    s,
    /if \(candidates\.length === 0\) return null;/,
    "must resolve null when no candidate paragraph has a capitalisable letter",
  );
  assert.match(
    s,
    /if \(tryPlaceCap\(p, letter, opts, initial, weight\)\) return p;\s*\n\s*\}\s*\n\s*return null;/,
    "must resolve null when every candidate overhangs, not just fall through " +
      "to undefined",
  );
});

test("the font-load await happens once for all candidates, not once per candidate", () => {
  const s = dropcapsSrc();
  // Regression: repeating the font-load-vs-timeout race per candidate
  // would let a slow/blocked font multiply the ~2s budget by up to
  // MAX_DROPCAP_CANDIDATES, since a stalled request neither resolves nor
  // rejects on its own.
  const loadCalls = s.match(/document\.fonts\.load\(/g) || [];
  assert.equal(
    loadCalls.length,
    2,
    "exactly one font.load call for --initial and one for --serif, total, " +
      "not one pair per candidate",
  );
  const loadIdx = s.indexOf("document.fonts.load(");
  const loopIdx = s.indexOf("for (const { p, letter } of candidates)");
  assert.ok(
    loadIdx >= 0 && loopIdx > loadIdx,
    "font loading must happen before the candidate loop, not inside it",
  );
});

test("the .sr span is inserted after the box, not prepended to the paragraph", () => {
  const s = dropcapsSrc();
  // p.prepend(box) makes .dropcap-box p's first child. justif declines any
  // paragraph whose floated element isn't the leading direct child, so
  // nothing may be inserted ahead of the box afterwards. p.prepend(sr) is
  // exactly that bug: it runs after p.prepend(box) and reinserts .sr in
  // front of it, demoting the box to second child.
  assert.doesNotMatch(
    s,
    /p\.prepend\(sr\)/,
    "prepending .sr to p would displace the float from p's first-child position",
  );
  assert.match(
    s,
    /box\.after\(sr\)/,
    "must insert .sr immediately after the box so the box stays p's first child",
  );
});

// --- sequencing: the cap must land in the DOM before justif ever scans the
// paragraph. justif has no second pass, so a cap inserted afterwards
// invalidates that paragraph's already-computed layout forever (measured:
// only 9/15 paragraphs justified, always missing the capped one). No DOM is
// available under `node --test`, so this pins the invariant at the source
// level, the same way as the box-order test above. ---

const typographySrc = () =>
  readFileSync(new URL("../static/js/typography.js", import.meta.url), "utf8");

test("typography.js awaits dropcaps.js's capPlaced before marking punctuation or justifying", () => {
  const s = typographySrc();
  assert.match(
    s,
    /import\s*\{\s*capPlaced\s*\}\s*from\s*"\.\/dropcaps\.js"/,
    "typography.js must import capPlaced from dropcaps.js",
  );
  const awaitMatch = s.match(
    /await\s+(?:capPlaced|Promise\.all\(\[[^\]]*capPlaced[^\]]*\]\))/,
  );
  const punctIdx = s.indexOf("markPunctuation(body)");
  const justifyIdx = s.indexOf("justify(targets");
  assert.ok(
    awaitMatch,
    "run() must await capPlaced, alone or alongside other pre-justify work",
  );
  const capIdx = awaitMatch.index;
  assert.ok(punctIdx >= 0 && justifyIdx >= 0);
  assert.ok(
    capIdx < punctIdx && capIdx < justifyIdx,
    "the drop cap must be placed (capPlaced awaited) before markPunctuation/" +
      "justify run, not after",
  );
});

test("dropcaps.js does not await typography's `ready` (that would reintroduce the justify-then-cap order)", () => {
  const s = dropcapsSrc();
  assert.doesNotMatch(
    s,
    /from\s*"\.\/typography\.js"/,
    "dropcaps.js must not depend on typography.js: the cap is placed " +
      "before justification runs, not after it",
  );
  assert.match(
    s,
    /export const capPlaced/,
    "dropcaps.js must export capPlaced for typography.js to await",
  );
});
