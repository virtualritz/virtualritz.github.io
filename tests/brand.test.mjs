import { test } from "node:test";
import assert from "node:assert/strict";
import { waveWeight, WGHT } from "../static/js/lib/brand-wave.js";
import { buildSite } from "./helpers/build.mjs";

const OPTS = { freq: 0.35, amp: 1, spread: 0.55 }; // the specimen's defaults

test("every letter starts at the axis midpoint at t=0 with no phase offset", () => {
  assert.equal(waveWeight(0, 0, OPTS), WGHT.mid);
});

test("a full-amplitude wave reaches both ends of the axis, and no further", () => {
  // Sample a whole period densely; sin hits +-1 so the sweep is the full
  // 100-900, which is what makes the brand read as heavy-to-hairline
  // rather than a wobble around medium.
  const period = 1 / OPTS.freq;
  let lo = Infinity;
  let hi = -Infinity;
  for (let n = 0; n <= 2000; n++) {
    const v = waveWeight((n / 2000) * period, 0, OPTS);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo < WGHT.min + 1, `min ${lo} should reach ${WGHT.min}`);
  assert.ok(hi > WGHT.max - 1, `max ${hi} should reach ${WGHT.max}`);
  assert.ok(lo >= WGHT.min && hi <= WGHT.max, "must stay inside the axis");
});

test("out-of-range amplitude is clamped, never asked of the font", () => {
  // The caller does not pass amp > 1; the clamp is what makes a bad value
  // hold at an extreme instead of requesting an instance the face has not
  // got (font-weight: 1400 renders unpredictably).
  for (let n = 0; n < 400; n++) {
    const v = waveWeight(n / 97, n % 7, { ...OPTS, amp: 4 });
    assert.ok(v >= WGHT.min && v <= WGHT.max, `${v} out of range`);
  }
});

test("neighbouring letters are offset by the phase step, so the wave travels", () => {
  // Letter i at time t sits where letter 0 was `spread / (2*PI*freq)`
  // seconds later: the swell moves along the word rather than the whole
  // word pulsing in unison.
  const lag = OPTS.spread / (2 * Math.PI * OPTS.freq);
  for (const t of [0, 0.31, 1.7]) {
    assert.ok(
      Math.abs(waveWeight(t, 3, OPTS) - waveWeight(t + lag, 2, OPTS)) < 1e-9,
    );
  }
});

test("amp 0 holds a flat mid-weight", () => {
  for (const t of [0, 0.4, 2.2]) {
    assert.equal(waveWeight(t, 5, { ...OPTS, amp: 0 }), WGHT.mid);
  }
});

test("the brand renders as plain link text, so it survives with JS off", async () => {
  const html = (await buildSite()).read("index.html");
  const anchor = html.match(/<a id="brand"[^>]*>([\s\S]*?)<\/a\s*>/);
  assert.ok(anchor, "no #brand anchor in the built page");
  // The per-letter spans are built by brand.js at runtime; the served
  // markup must carry the title itself, or a no-JS visitor gets an empty
  // brand.
  assert.equal(anchor[1].trim(), "Virtual Ritz");
});

test("brand.js is loaded from base.html, so the nav animates on every page", async () => {
  const site = await buildSite();
  // main.js is essay-only (templates/page.html); the nav is not.
  for (const page of ["index.html", "essays/index.html", "about/index.html"]) {
    assert.match(site.read(page), /js\/brand\.js/, `${page} missing brand.js`);
  }
});

test("the brand is set in the display face, uppercased, at specimen size", async () => {
  const c = (await buildSite()).read("style.css");
  const brand = c.match(/#masthead #brand\{([^}]*)\}/)[1];
  assert.match(brand, /font-family:var\(--initial\)/);
  assert.match(brand, /text-transform:uppercase/);
  // Sized as a display headline, on the Typeface Bench specimen's own
  // metrics (docs/specimen/typeface-bench.html, `.hl`): at the nav's text
  // size the weight wave ran but was too small to read as motion. This
  // rule is also what a no-JS visitor sees, since the outline SVG that
  // replaces the text is only ever built by script.
  assert.match(brand, /font-size:clamp\(52px,\s*11vw,\s*132px\)/);
});

test("the wordmark's text survives being replaced by outlines", async () => {
  const c = (await buildSite()).read("style.css");
  // brand.js hides the anchor's own text once it has drawn the SVG, but
  // only its pixels: clip-path keeps it in the accessibility tree as the
  // link's name and as what copy/paste yields, where display:none or
  // visibility:hidden would remove it from both.
  const rule = c.match(/#brand\.has-outline \.brand-text\{([^}]*)\}/)[1];
  assert.match(rule, /clip-path:inset\(50%\)/);
  assert.doesNotMatch(rule, /display:none|visibility:hidden/);
});

// --- outline geometry ----------------------------------------------------

test("a glyph's outline interpolates between the two masters", async () => {
  const { glyphPath, weightT, layout } =
    await import("../static/js/lib/thunder-outline.js");
  const { default: PATHS } = await import("../static/js/lib/thunder-paths.js");
  // The axis default is 900 and the delta master is 100, so t runs 0 -> 1
  // as the weight goes heavy -> light.
  assert.equal(weightT(900), 0);
  assert.equal(weightT(100), 1);
  assert.equal(weightT(500), 0.5);

  const heavy = glyphPath(PATHS, "V", weightT(900));
  const light = glyphPath(PATHS, "V", weightT(100));
  const mid = glyphPath(PATHS, "V", weightT(500));
  assert.notEqual(heavy, light);
  assert.notEqual(mid, heavy);
  assert.notEqual(mid, light);
  assert.match(heavy, /^M[-\d.]+ [-\d.]+/);
  // Every weight yields the same command sequence — only coordinates move.
  const shape = (d) => d.replace(/[-\d.]+/g, "");
  assert.equal(shape(heavy), shape(light));
});

test("every letter of the wordmark has geometry, and nothing else rides along", async () => {
  const { default: PATHS } = await import("../static/js/lib/thunder-paths.js");
  const needed = [...new Set(PATHS.text.replace(/ /g, ""))].sort();
  assert.deepEqual(Object.keys(PATHS.g).sort(), needed);
  assert.equal(PATHS.text, "VIRTUAL RITZ");
});

test("letters sit on fixed advances, so the word cannot breathe", async () => {
  const { layout } = await import("../static/js/lib/thunder-outline.js");
  const { default: PATHS } = await import("../static/js/lib/thunder-paths.js");
  // The layout is taken once at mid weight and reused; a glyph's advance
  // grows with its weight, so laying out per-frame would slide the word
  // sideways under the wave.
  const mid = layout(PATHS, 500);
  const heavy = layout(PATHS, 900);
  assert.notEqual(mid.width, heavy.width, "advances do vary with weight");
  assert.equal(mid.slots.length, PATHS.text.length);
  let x = 0;
  for (const s of mid.slots) {
    assert.equal(s.x, x);
    x += s.adv;
  }
  assert.equal(mid.width, x);
});
