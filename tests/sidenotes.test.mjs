import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  resolveColumn,
  assignColumns,
  pairReferences,
  footnoteLabel,
  isBackrefFor,
} from "../static/js/lib/sidenote-layout.js";
import { buildSite } from "./helpers/build.mjs";

test("notes that do not overlap keep their reference position", () => {
  const tops = resolveColumn([
    { top: 0, height: 40 },
    { top: 200, height: 40 },
  ]);
  assert.deepEqual(tops, [0, 200]);
});

test("an overlapping note is pushed down to clear its predecessor", () => {
  const tops = resolveColumn(
    [
      { top: 0, height: 100 },
      { top: 50, height: 40 },
    ],
    12,
  );
  assert.equal(tops[0], 0);
  assert.equal(tops[1], 112);
});

test("pushes cascade", () => {
  const tops = resolveColumn(
    [
      { top: 0, height: 100 },
      { top: 10, height: 100 },
      { top: 20, height: 40 },
    ],
    10,
  );
  assert.deepEqual(tops, [0, 110, 220]);
});

test("empty input is safe", () => {
  assert.deepEqual(resolveColumn([]), []);
});

// --- assignColumns ----------------------------------------------------
//
// Bug 2: a margin note has no reference to pair against, so it can't join
// the footnote-only per-list indexing sidenotes.js used to alternate
// columns with. assignColumns is the DOM-free replacement: it merges any
// kind of margin item (footnote sidenote, margin note, ...) into one
// left/right split ordered by real page position, so a footnote sidenote
// and a margin note authored right next to each other (as in
// content/essays/typography.md) can't land in the same column and
// collide — see resolveColumn above, which only resolves overlaps within
// a single column's own list.

test("assignColumns alternates left/right in top-to-bottom order, independent of input order", () => {
  const cols = assignColumns([
    { top: 50, id: "b" },
    { top: 0, id: "a" },
    { top: 150, id: "d" },
    { top: 100, id: "c" },
  ]);
  assert.deepEqual(
    cols[0].map((i) => i.id),
    ["a", "c"],
  );
  assert.deepEqual(
    cols[1].map((i) => i.id),
    ["b", "d"],
  );
});

test("assignColumns keeps input order for equal top values (stable sort)", () => {
  const cols = assignColumns([
    { top: 10, id: "first" },
    { top: 10, id: "second" },
  ]);
  assert.deepEqual(
    cols[0].map((i) => i.id),
    ["first"],
  );
  assert.deepEqual(
    cols[1].map((i) => i.id),
    ["second"],
  );
});

test("assignColumns does not mutate its input array", () => {
  const items = [{ top: 5 }, { top: 1 }];
  assignColumns(items);
  assert.deepEqual(
    items.map((i) => i.top),
    [5, 1],
  );
});

test("assignColumns is safe on empty input", () => {
  assert.deepEqual(assignColumns([]), [[], []]);
});

// --- pairReferences / footnoteLabel / isBackrefFor -------------------------
//
// The DOM-agnostic core of the hoist: matching references to definitions
// and deriving/checking labels, extracted so it can be unit-tested without
// a DOM (no jsdom dependency — see fix round 1 discussion). Fixtures below
// are the real hrefs captured from a Zola 0.23 build (see the scratch-build
// test further down for how they were obtained), plus one synthetic
// "1" vs "10" case to pin the prefix-collision guard.

const HOST = "https://virtualritz.github.io/essays/zz-scratch-sidenotes/";

test("pairReferences matches a real single-citation footnote by href suffix, not equality", () => {
  const idx = pairReferences(["fn-1"], [`${HOST}#fn-1`]);
  assert.deepEqual(idx, [0]);
});

test("pairReferences matches a non-integer label", () => {
  const idx = pairReferences(
    ["fn-1", "fn-long-label"],
    [`${HOST}#fn-1`, `${HOST}#fn-long-label`],
  );
  assert.deepEqual(idx, [0, 1]);
});

test("pairReferences returns the first citation when a footnote is cited twice", () => {
  // real fixture: fn-1 is cited at fr-1-1 (index 0) and again at fr-1-2
  // (index 2), with fn-long-label's single citation in between.
  const idx = pairReferences(
    ["fn-1", "fn-long-label"],
    [`${HOST}#fn-1`, `${HOST}#fn-long-label`, `${HOST}#fn-1`],
  );
  assert.deepEqual(idx, [0, 1]);
});

test("pairReferences returns -1 for a definition with no citation", () => {
  const idx = pairReferences(["fn-1", "fn-orphan"], [`${HOST}#fn-1`]);
  assert.deepEqual(idx, [0, -1]);
});

test("pairReferences does not confuse fn-1 with fn-10 (Map keys are exact strings)", () => {
  const idx = pairReferences(
    ["fn-1", "fn-10"],
    [`${HOST}#fn-10`, `${HOST}#fn-1`],
  );
  assert.deepEqual(idx, [1, 0]);
});

test("footnoteLabel strips the fn- prefix, including non-integer labels", () => {
  assert.equal(footnoteLabel("fn-1"), "1");
  assert.equal(footnoteLabel("fn-long-label"), "long-label");
});

test("isBackrefFor matches a real backref href", () => {
  assert.ok(isBackrefFor(`${HOST}#fr-1-1`, "1"));
  assert.ok(isBackrefFor(`${HOST}#fr-long-label-1`, "long-label"));
});

test("isBackrefFor matches every backref of a twice-cited footnote", () => {
  assert.ok(isBackrefFor(`${HOST}#fr-1-1`, "1"));
  assert.ok(isBackrefFor(`${HOST}#fr-1-2`, "1"));
});

test('isBackrefFor\'s trailing dash guards label "1" against label "10"\'s backrefs', () => {
  assert.equal(isBackrefFor(`${HOST}#fr-10-1`, "1"), false);
  assert.equal(isBackrefFor(`${HOST}#fr-100-1`, "1"), false);
  assert.ok(isBackrefFor(`${HOST}#fr-10-1`, "10"));
});

// --- DOM shell: templates/page.html and the CSS positioning it depends on ---

test("page.html carries both sidenote columns inside #article", async () => {
  // Every essay uses page.html; none needs footnotes to prove the shell
  // is wired up.
  const html = (await buildSite()).read("essays/typography/index.html");
  const article = html.match(
    /<article id="article"[^>]*>([\s\S]*)<\/article>/,
  )[1];
  assert.match(article, /<div id="sidenote-column-left" aria-hidden="true">/);
  assert.match(article, /<div id="sidenote-column-right" aria-hidden="true">/);
});

test("#article is positioned, so the absolute columns and notes resolve against it, not main", async () => {
  const css = (await buildSite()).read("style.css");
  // #article carries two rules (max-width from _typography.scss, position
  // from _sidenotes.scss); assert the positioning one exists specifically,
  // since main also has position:relative and would otherwise mask a
  // regression here.
  assert.match(css, /#article\{position:relative\}/);
});

test("sidenote and sidenote-number styling is emitted", async () => {
  const css = (await buildSite()).read("style.css");
  assert.match(css, /\.sidenote\{[^}]*position:absolute/);
  assert.match(css, /\.sidenote-number\{/);
});

test("the collected footnote list is hidden visually, not via [hidden]/display:none, once hoisted", async () => {
  // [hidden]/display:none would remove the section from the accessibility
  // tree while the aria-hidden sidenote columns duplicate its content only
  // for sighted layout — a net content loss for AT users (fix round 1).
  // It must instead use the same still-present, clipped-to-1px technique
  // as .sr (sass/_dropcaps.scss), scoped to the `has-sidenotes` class
  // sidenotes.js sets only once notes are actually hoisted.
  const css = (await buildSite()).read("style.css");
  const rule = css.match(/\.has-sidenotes \.footnotes\{([^}]*)\}/)[1];
  assert.match(rule, /clip-path:\s*inset\(50%\)/);
  assert.match(rule, /width:\s*1px/);
  assert.doesNotMatch(css, /\.footnotes\[hidden\]/);
  assert.doesNotMatch(rule, /display:\s*none/);
});

// --- Real Zola footnote markup, verified against a scratch build ---
//
// No committed content page may carry footnotes before Task 12, so this
// builds one temporarily: a numeric label, a non-integer label, and a
// footnote cited twice (which Zola gives two backref arrows in its <li>).
// The scratch page is always removed, even if a later assertion throws.
// (This is also where the pure-function fixtures above were captured from.)

const SCRATCH = new URL(
  "../content/essays/zz-test-sidenotes-scratch.md",
  import.meta.url,
).pathname;
const SCRATCH_OUT = new URL("./.out/sidenotes-scratch/", import.meta.url)
  .pathname;

test("Zola's collected footnote markup matches what sidenotes.js expects", () => {
  writeFileSync(
    SCRATCH,
    `+++
title = "Scratch Sidenotes Verification"
date = 2024-01-01
+++

First paragraph with a numeric footnote[^1] and a non-integer label[^long-label].

Second paragraph re-uses the numeric footnote[^1] again.

[^1]: First note body.

[^long-label]: Second note body, with a non-integer label.
`,
  );
  process.on("exit", () => rmSync(SCRATCH, { force: true }));

  let html;
  try {
    rmSync(SCRATCH_OUT, { recursive: true, force: true });
    execFileSync("zola", ["build", "--output-dir", SCRATCH_OUT, "--force"], {
      cwd: new URL("../", import.meta.url).pathname,
      stdio: "pipe",
    });
    html = readFileSync(
      SCRATCH_OUT + "essays/zz-test-sidenotes-scratch/index.html",
      "utf8",
    );
  } finally {
    rmSync(SCRATCH, { force: true });
    rmSync(SCRATCH_OUT, { recursive: true, force: true });
  }
  assert.ok(!existsSync(SCRATCH), "scratch content page must not survive");

  // (a) definition ids are fn-LABEL, reference ids are fr-LABEL-N — not
  // fn1/fnref1.
  assert.match(html, /<li id="fn-1">/);
  assert.match(html, /<li id="fn-long-label">/);
  assert.match(
    html,
    /<sup class="footnote-reference" id="fr-1-1"><a href="[^"]*#fn-1">\[1\]<\/a><\/sup>/,
  );
  assert.match(
    html,
    /<sup class="footnote-reference" id="fr-long-label-1"><a href="[^"]*#fn-long-label">\[2\]<\/a><\/sup>/,
  );

  // (b) hrefs are absolute permalinks: the reference's href does not
  // equal "#fn-1", it ends with it.
  assert.doesNotMatch(html, /href="#fn-1"/);

  // (c) no .footnote-backref class exists to key off, and a footnote
  // cited twice gets one backref arrow per citation in its <li>.
  assert.doesNotMatch(html, /footnote-backref/);
  const li1 = html.match(/<li id="fn-1">([\s\S]*?)<\/li>/)[1];
  assert.equal(
    (li1.match(/<a href="[^"]*#fr-1-\d+">/g) || []).length,
    2,
    "the twice-cited footnote must carry two backref arrows",
  );

  // (d) labels are arbitrary strings, not necessarily integers.
  const liLong = html.match(/<li id="fn-long-label">([\s\S]*?)<\/li>/)[1];
  assert.match(liLong, /href="[^"]*#fr-long-label-1"/);

  // The reference links (and the footnotes section's own #fn-LABEL
  // targets) always resolve to a real, rendered element: nothing in the
  // static build ever carries [hidden] — that only gets applied to the
  // DOM at runtime by JS, and only via a visual clip, not [hidden]/
  // display:none (see the style.css assertions above).
  assert.doesNotMatch(html, /(?<!aria-)\bhidden\b/);
});

// --- sidenotes.js / sidenote-layout.js source: behaviour the tests above
// cannot exercise (no DOM/browser is available under `node --test`; these
// pin the specific fixes ruled on top of the brief). ---

const readSrc = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const src = () => readSrc("../static/js/sidenotes.js");
const layoutSrc = () => readSrc("../static/js/lib/sidenote-layout.js");

test("sidenotes.js awaits `ready` before measuring anything", () => {
  // sidenotes.js also imports marginNoteHTML from the same module (Bug 2
  // fix), so this only pins that `ready` is among the named imports,
  // rather than the only one.
  assert.match(
    src(),
    /import\s*\{[^}]*\bready\b[^}]*\}\s*from\s*"\.\/typography\.js"/,
  );
  assert.match(src(), /ready\.then\(/);
});

test("sidenotes.js's breakpoint agrees with the 1560px media query, not 1400", () => {
  assert.match(src(), /MIN_WIDTH\s*=\s*1560/);
  assert.doesNotMatch(src(), /1400/);
});

test("references are paired to definitions via the pure, href-suffix-matching helper", () => {
  const s = src();
  assert.doesNotMatch(
    s,
    /href="#"\s*\+\s*li\.id/,
    "hrefs are absolute permalinks; equality against a bare #id never matches",
  );
  assert.match(s, /pairReferences\(/, "must delegate to the pure helper");
  assert.match(
    layoutSrc(),
    /href\.slice\(href\.indexOf\("#"\)\s*\+\s*1\)/,
    "the suffix-matching logic itself lives in sidenote-layout.js",
  );
});

test("backref removal does not depend on a .footnote-backref class", () => {
  // The class doesn't exist in Zola's output (ruling 1c); only an
  // explanatory comment may mention its name.
  assert.doesNotMatch(src(), /querySelector(All)?\([^)]*footnote-backref/);
  assert.doesNotMatch(
    layoutSrc(),
    /querySelector(All)?\([^)]*footnote-backref/,
  );
  assert.match(src(), /isBackrefFor\(/, "must delegate to the pure helper");
});

test("the footnote label is derived from li.id, not assumed to be an integer", () => {
  assert.match(src(), /footnoteLabel\(/, "must delegate to the pure helper");
  assert.match(layoutSrc(), /definitionId\.slice\(/);
});

test("no ResizeObserver is added (global constraint: never wrap justif's container)", () => {
  assert.doesNotMatch(src(), /new ResizeObserver/);
});

test("sidenotes.js is a no-op guarded on #article's presence", () => {
  assert.match(src(), /getElementById\("article"\)/);
});

test("the native footnote section is never hidden via the hidden attribute", () => {
  // Fix round 1: [hidden] removes an element from the accessibility tree;
  // visibility is CSS-driven off the has-sidenotes class instead (see the
  // style.css assertion above).
  assert.doesNotMatch(src(), /setAttribute\("hidden"/);
  assert.doesNotMatch(src(), /removeAttribute\("hidden"\)/);
  assert.match(src(), /classList\.(add|remove)\("has-sidenotes"\)/);
});

// --- Bug 1: sidenote overflow from justif's frozen segments ----------------

const typographySrc = () => readSrc("../static/js/typography.js");

test("justif's target selector excludes Zola's collected footnote list", () => {
  // The footnote <li>/<p> would otherwise be justified at the ~895px
  // .article-body measure before sidenotes.js ever clones it into a
  // 260px column; justif's output doesn't reflow at a narrower width
  // (fixed-width, non-wrapping segments), so it overflowed the column and
  // spilled onto the body text. Excluding the source is the fix (rather
  // than stripping justif's markup back out of the clone afterwards):
  // nothing is ever applied to it in the first place.
  const m = typographySrc().match(/const SELECTOR =\s*([\s\S]*?);/);
  assert.ok(m, "SELECTOR constant not found in typography.js");
  assert.match(m[1], /:not\(\.footnotes \*\)/);
});

test("sidenotes.js never needs to strip justif markup from a footnote clone", () => {
  // With the footnote source excluded from SELECTOR above, li.cloneNode's
  // result is always plain, reflowable Zola markup — asserting the
  // absence of any justif-stripping logic here pins that this is the only
  // fix in place, not a second one layered on top of it.
  assert.doesNotMatch(src(), /justif-seg/);
  assert.doesNotMatch(src(), /data-justif/);
});

// --- Bug 2: marginnote hoisting ---------------------------------------

test("typography.js snapshots each .marginnote's markup before justify() runs", () => {
  const t = typographySrc();
  const markPunctIdx = t.indexOf("markPunctuation(body)");
  // The reassignment inside run(), not the `let marginNoteSnapshots = []`
  // module-scope declaration further up the file.
  const snapshotIdx = t.indexOf("marginNoteSnapshots = [...body");
  const justifyIdx = t.indexOf("controller = justify(targets");
  assert.ok(markPunctIdx !== -1 && snapshotIdx !== -1 && justifyIdx !== -1);
  assert.ok(
    markPunctIdx < snapshotIdx && snapshotIdx < justifyIdx,
    "the snapshot must be taken after markPunctuation and before justify()",
  );
  assert.match(t, /export function marginNoteHTML\(/);
});

test("sidenotes.js sources a margin note's clone from the pre-justify snapshot, not the live (possibly justified) span", () => {
  const s = src();
  assert.match(s, /import\s*\{[^}]*\bmarginNoteHTML\b[^}]*\}/);
  assert.match(s, /marginNoteHTML\(/);
});

test("a hoisted margin note carries no reference mark or number", () => {
  // "sidenote-number" must appear exactly once in the whole file: the
  // footnote path's own `n.className = "sidenote-number"`. A margin note
  // has nothing to number — it is authored, not derived from a citation.
  const matches = src().match(/sidenote-number/g) || [];
  assert.equal(matches.length, 1);
});

test("margin notes and footnote sidenotes share one column assignment", () => {
  // Both content/essays/typography.md's footnote and its marginnote sit in
  // the same short section; if the two kinds were assigned to columns
  // independently, a footnote sidenote and a margin note could land in
  // the same column with no shared collision check between them.
  assert.match(src(), /assignColumns\(/);
});

test("sidenotes.js clears has-sidenotes unconditionally, before branching on viewport width", () => {
  // A rebuild (resize, or resize-recompute.js's extra call) can run while a
  // margin note is still clipped from the previous pass; measuring its
  // clipped near-zero-size box instead of its true in-flow position would
  // place the new clone at the wrong height. The clear must happen before
  // the `if (!wide)` branch is even reached — putting/leaving it *inside*
  // that branch (so it only fires on the narrow path) would textually
  // still land "before" every getBoundingClientRect() call below, so this
  // checks position relative to the wide/narrow branch point itself, not
  // relative to the first measurement.
  const s = src();
  const removeIdx = s.indexOf('classList.remove("has-sidenotes")');
  const wideIdx = s.indexOf("const wide = window.innerWidth");
  assert.ok(removeIdx !== -1, "has-sidenotes must be cleared somewhere");
  assert.ok(wideIdx !== -1, "the wide/narrow branch point must exist");
  assert.ok(
    removeIdx < wideIdx,
    "has-sidenotes must be cleared before the wide/narrow branch, not only inside it",
  );
});

test("no stray second has-sidenotes removal reintroduces the narrow-only bug", () => {
  // Guards against a future edit moving the clear call back inside the
  // `if (!wide)` branch only, which would reintroduce the stale-clip
  // measurement bug on a wide-viewport rebuild.
  assert.equal(
    (src().match(/classList\.remove\("has-sidenotes"\)/g) || []).length,
    1,
  );
});

// --- Build-based: real Zola output for the demo page -----------------------

test("the demo page's marginnote sits inline inside a paragraph in the static build (the no-JS/narrow-viewport fallback)", async () => {
  const html = (await buildSite()).read("essays/typography/index.html");
  const idx = html.indexOf('class="marginnote"');
  assert.ok(idx !== -1, "demo page must contain a marginnote");
  // No server-side hoisting exists — the sidenote column classes/ids only
  // ever appear via client-side JS, never in Zola's own output.
  assert.doesNotMatch(html, /class="sidenote"/);
  assert.doesNotMatch(html, /id="sn-/);
});

test(".has-sidenotes clips a hoisted .marginnote the same way it clips .footnotes", async () => {
  const css = (await buildSite()).read("style.css");
  const rule = css.match(/\.has-sidenotes \.marginnote\{([^}]*)\}/)?.[1];
  assert.ok(rule, ".has-sidenotes .marginnote rule not found");
  assert.match(rule, /clip-path:\s*inset\(50%\)/);
  assert.match(rule, /width:\s*1px/);
  assert.doesNotMatch(css, /\.marginnote\[hidden\]/);
  assert.doesNotMatch(rule, /display:\s*none/);
});

test(".marginnote's narrow/no-JS fallback is plain inline styling, not the old block layout", async () => {
  const css = (await buildSite()).read("style.css");
  // The base (unscoped) rule is the one that applies below the sidenote
  // breakpoint / without JS; it must not carry the block-era declarations
  // that used to split the authoring paragraph into three pieces, nor
  // reintroduce display:block.
  const rules = [...css.matchAll(/(?:^|\})(\.marginnote\{[^}]*\})/g)].map(
    (m) => m[1],
  );
  const base = rules.find((r) => !r.startsWith(".has-sidenotes"));
  assert.ok(base, "base .marginnote rule not found");
  assert.doesNotMatch(base, /display:\s*block/);
  assert.doesNotMatch(base, /border-left/);
});
