import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;

// Extract the text spanning a balanced `{ ... }` or `( ... )` region that
// opens at or after `fromIndex` in `src`, starting at the first `openChar`
// found. Used below to pull out a function body or an if-condition by
// structure rather than by a brittle literal-text regex, so a syntactic
// rewrite that preserves behaviour (e.g. `!x.length` for `x.length === 0`)
// doesn't break the assertion built on top of it.
function extractBalanced(src, fromIndex, openChar) {
  const closeChar = openChar === "{" ? "}" : ")";
  const start = src.indexOf(openChar, fromIndex);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === openChar) depth++;
    else if (src[i] === closeChar) {
      depth--;
      if (depth === 0) return { start, end: i, text: src.slice(start, i + 1) };
    }
  }
  return null;
}

// Total size, in bytes, of every file under a directory (recursive).
function dirSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${name.name}`;
    total += name.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

test("justif is vendored at the pinned version", () => {
  assert.ok(existsSync(root + "static/js/lib/justif/index.js"));
  assert.equal(
    readFileSync(root + "static/js/lib/justif/VERSION", "utf8").trim(),
    "0.9.1",
  );
});

test("only the files justif's two entry points need are vendored", () => {
  // dist/index.js imports chunk-WWMSGT6G.js; dist/hyphenate/en-us.js
  // imports chunk-ZW2EUTPS.js. Both are required for a clean import.
  assert.ok(existsSync(root + "static/js/lib/justif/chunk-WWMSGT6G.js"));
  assert.ok(existsSync(root + "static/js/lib/justif/hyphenate/en-us.js"));
  assert.ok(existsSync(root + "static/js/lib/justif/chunk-ZW2EUTPS.js"));
  assert.ok(existsSync(root + "static/js/lib/justif/LICENSE"));
  // The full upstream dist/ is ~2.3 MiB, mostly hyphenation patterns for
  // languages we never load. Guard against a future vendor.sh regressing
  // to `cp -r dist/.`.
  const size = dirSize(root + "static/js/lib/justif");
  assert.ok(
    size < 500 * 1024,
    `vendored justif is ${Math.round(size / 1024)} KiB, expected < 500 KiB`,
  );
});

test("the vendored module set is complete and imports cleanly", async () => {
  // The chunk filenames are content-hashed, so file-existence checks alone
  // cannot prove the vendored set is self-consistent. Actually importing it
  // does: a missing transitive chunk fails here rather than silently in a
  // browser.
  const { justify } = await import("../static/js/lib/justif/index.js");
  const { hyphenateEnUS } =
    await import("../static/js/lib/justif/hyphenate/en-us.js");
  assert.equal(typeof justify, "function");
  assert.equal(typeof hyphenateEnUS, "function");
});

test("typography.js gates on a layout box and adds no ResizeObserver", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /waitForBox/,
    "must wait for a real box before running: justif declines elements reported as 'not rendered'",
  );
  const waitForBoxSrc = readFileSync(
    root + "static/js/lib/wait-for-box.js",
    "utf8",
  );
  assert.match(
    waitForBoxSrc,
    /getBoundingClientRect/,
    "the shared box-wait helper (used by both typography.js and dropcaps.js) must actually check for a real box",
  );
  assert.ok(
    !src.includes("new ResizeObserver"),
    "justif has observeResize:true; observing its container oscillates (spec §7.3)",
  );
  assert.match(
    src,
    /markPunctuation/,
    "punctuation must be marked before measuring",
  );
});

test("typography.js exits early when the selector matches nothing", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  // Anchor on the module-level fork between resolving synchronously and
  // waiting for a box, then pull out the guarding `if (...)` condition by
  // brace-matching rather than pinning its exact comparison syntax: the
  // old regex (`querySelectorAll(SELECTOR).length === 0`) would fail on a
  // behaviour-preserving rewrite to `!querySelectorAll(SELECTOR).length`.
  const anchor = src.indexOf("waitForBox(SELECTOR).then(");
  assert.ok(anchor !== -1, "expected the selector-gated waitForBox call");
  const ifIdx = src.lastIndexOf("if (", anchor);
  assert.ok(ifIdx !== -1, "expected an `if` guarding the waitForBox branch");
  const cond = extractBalanced(src, ifIdx, "(");
  assert.ok(cond, "could not find the balanced condition of the `if`");

  assert.match(
    cond.text,
    /document\.querySelector\(["'`]\.article-body["'`]\)/,
    "the guard must check whether .article-body exists at all",
  );
  assert.match(
    cond.text,
    /querySelectorAll\(SELECTOR\)/,
    "the guard must also check SELECTOR's matches, not just .article-body",
  );
  assert.match(
    cond.text,
    /(querySelectorAll\(SELECTOR\)\.length\s*(===|<=?)\s*0)|(!\s*document\.querySelectorAll\(SELECTOR\)\.length)/,
    "the guard must treat zero SELECTOR matches as the early-exit case " +
      "(an image/embed-only page has no match at all; `ready` should " +
      "resolve synchronously in frame one, not after the ~4s rAF poll budget)",
  );

  // The branch taken on that condition must resolve synchronously, not
  // fall through to the ~4s rAF poll.
  const braceStart = src.indexOf("{", cond.end);
  const thenBranch = extractBalanced(src, braceStart, "{");
  assert.ok(thenBranch);
  assert.match(
    thenBranch.text,
    /resolveReady\(\)/,
    "the early-exit branch must call resolveReady() synchronously",
  );
  assert.doesNotMatch(
    thenBranch.text,
    /waitForBox/,
    "the early-exit branch must not also wait for a box",
  );
});

test("declined paragraphs are reported with reasons, not just a count", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  assert.match(
    src,
    /onSkip:\s*\(p,\s*reason\)/,
    "onSkip must capture the reason, not just tally occurrences: spec " +
      "§14.8 requires verifying which paragraph was declined and why",
  );
  assert.match(
    src,
    /console\.warn/,
    "declined paragraphs must be surfaced somewhere a human can find them",
  );
});

test("a synchronous throw in run() still resolves `ready`, and so does every early return", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  const fnIdx = src.indexOf("async function run()");
  assert.ok(fnIdx !== -1, "expected run() to be defined");
  const fn = extractBalanced(src, fnIdx, "{");
  assert.ok(fn, "could not find the balanced body of run()");

  // The old assertion (`function run() { try {`) passed for a catch block
  // that never called resolveReady() — exactly the hang this test exists
  // to prevent, since that's undetectable from the opening brace alone.
  // Find run()'s own try/catch (not markPunctuation's or justify's
  // internals) by locating the `} catch (...) {` that closes out run()'s
  // outermost try, i.e. the one whose closing brace is run()'s own.
  const catchMatch = fn.text.match(
    /\}\s*catch\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/,
  );
  assert.ok(catchMatch, "run() must wrap its body in try/catch");
  assert.match(
    catchMatch[1],
    /resolveReady\(\)/,
    "run()'s catch block must itself call resolveReady() — a try/catch " +
      "shell whose catch only logs leaves `ready` hanging on a synchronous throw",
  );

  // Every early `return ...;` inside the try block must itself resolve
  // ready, since nothing after an early return will reach the async
  // .then()/.catch() chain that resolves it later.
  const tryText = fn.text.slice(0, fn.text.indexOf(catchMatch[0]));
  const earlyReturns = tryText.match(/return\b[^;]*;/g) || [];
  assert.ok(
    earlyReturns.length > 0,
    "expected at least one early return in run() (e.g. no .article-body, no targets)",
  );
  for (const ret of earlyReturns) {
    assert.match(
      ret,
      /resolveReady\(\)/,
      `early return "${ret.trim()}" must resolve ready itself, not rely on later code`,
    );
  }
});

// Pull out the options object literal passed to justify(targets, { ... })
// by structure, so reordering/reformatting the call doesn't break these.
function justifyOptionsText() {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  const anchor = src.indexOf("controller = justify(targets, ");
  assert.ok(anchor !== -1, "expected the justify(targets, {...}) call");
  const obj = extractBalanced(src, anchor, "{");
  assert.ok(obj, "could not find the balanced options object");
  return obj.text;
}

test("protrusion stays live-measured, not swapped for a static user table", () => {
  const opts = justifyOptionsText();
  // Passing options.protrusion anything other than `true`/`undefined`
  // turns off justif's live canvas-measured protrusion for every
  // character (resolveOptions' measuredProtrusion, index.js ~4395), not
  // just whichever one a user table was added for. The ellipsis is
  // added via hangingPunctuation instead (below), specifically so this
  // can stay `true`.
  assert.match(opts, /protrusion:\s*true/);
  assert.doesNotMatch(
    opts,
    /protrusion:\s*\{/,
    "a user protrusion table object would disable live measurement sitewide",
  );
});

test("the ellipsis is added to justif's own exported hanging-character set, not a hand-copied one", () => {
  const src = readFileSync(root + "static/js/typography.js", "utf8");
  // Must import hangingCharacters from justif rather than re-typing its
  // character list, so this doesn't silently go stale if a future
  // justif version changes the default set.
  assert.match(
    src,
    /import\s*\{[^}]*\bhangingCharacters\b[^}]*\}\s*from\s*["'`]\.\/lib\/justif\/index\.js["'`]/,
  );

  const opts = justifyOptionsText();
  // hangingPunctuation must be the object form, keeping the previous
  // edge mode and extending justif's own `hangingCharacters.end` with
  // "…" — not a hand-copied character list, and not just a plain string
  // (which would leave the ellipsis with zero protrusion, the original
  // bug).
  assert.match(opts, /edges:\s*["'`]line-end-only["'`]/);
  assert.match(
    opts,
    /characters:\s*\{\s*end:\s*hangingCharacters\.end\s*\+\s*["'`]…["'`]\s*\}/,
  );
});

test("hyphens still fully occupy the base latinProtrusion table (colon/semicolon/!/? are not widened into a hang)", () => {
  const opts = justifyOptionsText();
  // Fix 2 deliberately leaves ":", ";", "!", "?" out of the widened
  // hanging-character set — justif's own default already excludes them
  // from hangingCharacters.end while still giving them base protrusion
  // codes (via protrusion: true above). The extension here must add
  // only "…" to hangingCharacters.end, not those four characters too.
  const m = opts.match(/characters:\s*\{\s*end:\s*([^}]*)\}/);
  assert.ok(m, "expected a characters.end extension");
  assert.doesNotMatch(
    m[1],
    /["'`][:;!?]["'`]/,
    "colon/semicolon/!/? must not be appended to the hanging character set",
  );
});

// ---------------------------------------------------------------------------
// The two site-local patches to the vendored justif 0.9.1
// (docs/superpowers/reports/2026-09-09-justif-float-intrusion.md). Both live
// inside a third-party bundle, so a version bump silently drops them: these
// tests fail loudly when that happens. There is no DOM emulator in this
// project (and no npm dependencies at all), so the patched logic is exercised
// by lifting the pure functions out of the bundle's source text and
// evaluating them, rather than by driving a browser.

function vendoredJustif() {
  return readFileSync(root + "static/js/lib/justif/index.js", "utf8");
}

// Lift `function <name>(...) { ... }` out of the bundle by brace matching.
function liftFunction(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at !== -1, `justif no longer defines ${name}()`);
  const body = extractBalanced(src, at, "{");
  assert.ok(body, `could not brace-match the body of ${name}()`);
  return src.slice(at, body.end + 1);
}

test("patch 1: an exactly-three-line float does not read as four intruded lines", () => {
  const src = vendoredJustif();
  const evaluate = new Function(
    `${liftFunction(src, "lastLineRaggedAt")}
     ${liftFunction(src, "intrudedLineCount")}
     return intrudedLineCount;`,
  );
  const intrudedLineCount = evaluate();

  // Measured on /essays/nsi-vs-hydra-vs-riley/ before the patch: a 113.76px
  // drop-cap box (3 x 37.92px line-height) sitting at the paragraph's content
  // top, whose first *text* rect starts 1px above that content top because
  // the standfirst is italic and its ascenders overshoot the line box.
  const lineHeight = 37.92;
  const contentTop = 386.98;
  const floatBottom = contentTop + 3 * lineHeight; // 500.74
  const content = { left: 0, right: 781, top: contentTop, lineHeight };
  const paragraphStyle = {
    textAlign: "justify",
    direction: "ltr",
    getPropertyValue: () => "auto",
  };
  const inlineSize = 68.93;
  const lines = [
    { left: inlineSize, right: 781, top: 385.98, bottom: 419.9 },
    { left: inlineSize, right: 781, top: contentTop + lineHeight },
    { left: inlineSize, right: 781, top: contentTop + 2 * lineHeight },
    { left: 0, right: 781, top: floatBottom },
  ];

  assert.equal(
    intrudedLineCount(
      lines,
      content,
      paragraphStyle,
      "left",
      inlineSize,
      floatBottom,
      0,
    ),
    3,
    "a float exactly three line-heights tall intrudes into three lines; " +
      "taking the ink top of an italic first line inflated 3.0 to 3.026, " +
      "which Math.ceil rounded up to a fourth (narrowed) line",
  );

  // The same paragraph set in roman, whose first text rect sits *below* the
  // content top, must be unaffected by the clamp.
  const roman = lines.map((l, i) => (i === 0 ? { ...l, top: 389.2 } : l));
  assert.equal(
    intrudedLineCount(
      roman,
      content,
      paragraphStyle,
      "left",
      inlineSize,
      floatBottom,
      0,
    ),
    3,
  );
});

test("patch 2: only plain-string generated content is measured", () => {
  const src = vendoredJustif();
  const generatedContentText = new Function(
    `${liftFunction(src, "generatedContentText")}
     return generatedContentText;`,
  )();

  // What getComputedStyle(a, "::after").content actually returns for
  // sass/_links.scss's external-link mark.
  assert.equal(generatedContentText('"↗"'), "↗");
  assert.equal(generatedContentText('"↗" / ""'), "↗");
  assert.equal(generatedContentText('"[" "]"'), "[]");
  // No pseudo, or nothing generated.
  assert.equal(generatedContentText("none"), null);
  assert.equal(generatedContentText("normal"), null);
  // Not measurable from the computed value alone: left unmodelled, exactly
  // as the whole feature was before the patch.
  assert.equal(generatedContentText('counters(toc, ".") "  "'), null);
  assert.equal(generatedContentText("attr(data-x)"), null);
  assert.equal(generatedContentText('url("i.png")'), null);
  assert.equal(generatedContentText('"a\\"b"'), null);
});

test("patch 2: generated-content advance reaches the line model but not the protrusion", () => {
  const src = vendoredJustif();
  const chunk = readFileSync(
    root + "static/js/lib/justif/chunk-WWMSGT6G.js",
    "utf8",
  );

  // The scan must fold ::before/::after into the run insets the breaker
  // already widens boxes by.
  assert.match(
    src,
    /generatedInlineAdvance\(view,\s*el,\s*["'`]::before["'`]\)/,
  );
  assert.match(
    src,
    /generatedInlineAdvance\(view,\s*el,\s*["'`]::after["'`]\)/,
  );
  assert.match(
    src,
    /lastRun\.padEndPx\s*=\s*\(lastRun\.padEndPx\s*\?\?\s*0\)\s*\+\s*generatedEnd/,
    "generated content must widen the modelled run, or the browser paints " +
      "lines wider than justif broke them",
  );
  // ...and must be tagged as ink so it can never hang past the measure.
  assert.match(
    src,
    /lastRun\.inkEndPx\s*=\s*\(lastRun\.inkEndPx\s*\?\?\s*0\)\s*\+\s*generatedEnd/,
  );
  assert.match(src, /inkEndPx:\s*r\.inkEndPx/, "runTexts must forward inkEndPx");
  assert.match(
    chunk,
    /protrudableEndPad\s*=\s*\(piece\.padEndPx\s*\?\?\s*0\)\s*-\s*\(piece\.inkEndPx\s*\?\?\s*0\)/,
    "padding may hang past the measure; a generated glyph may not",
  );
  assert.doesNotMatch(
    chunk,
    /lb\.rp\s*=\s*opts\.protrusion\s*===\s*false\s*\?\s*0\s*:\s*Math\.max\(piece\.boxEndProtrusionPx,\s*piece\.padEndPx/,
    "the unpatched rp assignment would let the external-link mark hang " +
      "into the right margin",
  );
});
