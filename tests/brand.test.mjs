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

test("the brand is set in the display face, uppercased, with pinned letter boxes", async () => {
  const c = (await buildSite()).read("style.css");
  const brand = c.match(/#masthead #brand\{([^}]*)\}/)[1];
  assert.match(brand, /font-family:var\(--initial\)/);
  assert.match(brand, /text-transform:uppercase/);
  // Sized as a display headline, on the Typeface Bench specimen's own
  // metrics (docs/specimen/typeface-bench.html, `.hl`): at the nav's text
  // size the weight wave ran but was too small to read as motion.
  assert.match(brand, /font-size:clamp\(52px,\s*11vw,\s*132px\)/);
  // A letter's advance grows with its weight; without a fixed, centred box
  // the word would breathe and shove the masthead about every frame.
  const cell = c.match(/\.brand-cell\{([^}]*)\}/)[1];
  assert.match(cell, /display:inline-block/);
  assert.match(cell, /text-align:center/);
});
