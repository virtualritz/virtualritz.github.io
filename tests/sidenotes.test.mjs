import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolveColumn } from "../static/js/lib/sidenote-layout.js";
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

// --- DOM shell: templates/page.html and the CSS positioning it depends on ---

test("page.html carries both sidenote columns inside #article", async () => {
  // Every essay uses page.html; none needs footnotes to prove the shell
  // is wired up.
  const html = (await buildSite()).read(
    "essays/nsi-vs-hydra-vs-riley/index.html",
  );
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
  assert.match(css, /\.has-sidenotes \.footnotes\[hidden\]\{display:none\}/);
});

// --- Real Zola footnote markup, verified against a scratch build ---
//
// No committed content page may carry footnotes before Task 12, so this
// builds one temporarily: a numeric label, a non-integer label, and a
// footnote cited twice (which Zola gives two backref arrows in its <li>).
// The scratch page is always removed, even if a later assertion throws.

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
});

// --- sidenotes.js source: behaviour the tests above cannot exercise ---
// (no DOM/browser is available under `node --test`; these pin the
// specific fixes ruled on top of the brief.)

const src = () =>
  readFileSync(new URL("../static/js/sidenotes.js", import.meta.url), "utf8");

test("sidenotes.js awaits `ready` before measuring anything", () => {
  assert.match(src(), /import\s*\{\s*ready\s*\}\s*from\s*"\.\/typography\.js"/);
  assert.match(src(), /ready\.then\(/);
});

test("sidenotes.js's breakpoint agrees with the 1560px media query, not 1400", () => {
  assert.match(src(), /MIN_WIDTH\s*=\s*1560/);
  assert.doesNotMatch(src(), /1400/);
});

test("references are paired to definitions by href suffix, not equality", () => {
  const s = src();
  assert.doesNotMatch(
    s,
    /href="#"\s*\+\s*li\.id/,
    "hrefs are absolute permalinks; equality against a bare #id never matches",
  );
  assert.match(s, /href\.slice\(href\.indexOf\("#"\)\s*\+\s*1\)/);
});

test("backref removal does not depend on a .footnote-backref class", () => {
  // The class doesn't exist in Zola's output (ruling 1c); only the
  // explanatory comment may mention its name.
  assert.doesNotMatch(src(), /querySelector(All)?\([^)]*footnote-backref/);
});

test("the footnote label is derived from li.id, not assumed to be an integer", () => {
  assert.match(src(), /li\.id\.slice\(/);
});

test("no ResizeObserver is added (global constraint: never wrap justif's container)", () => {
  assert.doesNotMatch(src(), /new ResizeObserver/);
});

test("sidenotes.js is a no-op guarded on #article's presence", () => {
  assert.match(src(), /getElementById\("article"\)/);
});
