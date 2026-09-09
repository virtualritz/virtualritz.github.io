import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build.mjs";

test("main is a 935px centred column", async () => {
  const css = (await buildSite()).read("style.css");
  const m = css.match(/(^|\})\s*main\s*\{([^}]*)\}/)[2];
  assert.match(m, /max-width:\s*935px/);
  assert.match(m, /margin:[^;]*auto/);
  assert.match(m, /padding:\s*20px/);
});

test("TOC floats inside the article, not in a sidebar", async () => {
  const css = (await buildSite()).read("style.css");
  const toc = css.match(/#toc\s*\{([^}]*)\}/)[1];
  assert.match(toc, /float:\s*left/);
  assert.match(toc, /max-width:\s*285px/);
  assert.match(toc, /background:\s*var\(--box\)/);
});

test("TOC has a full body line of leading above it, and a comfortably readable font size", async () => {
  const css = (await buildSite()).read("style.css");
  const toc = css.match(/#toc\s*\{([^}]*)\}/)[1];
  // A full line of the body's own leading, not the TOC's own (smaller)
  // one — so it must be anchored to --body-size, not left as a bare em.
  assert.match(
    toc,
    /margin:\s*calc\(var\(--body-lh\)\s*\*\s*var\(--body-size\)\)/,
  );
  // Was 0.58em (~14px); raised well clear of that, still smaller than
  // the 24px body copy.
  const size = toc.match(/font-size:\s*0?\.(\d+)em/)[1];
  assert.ok(
    Number(`0.${size}`) >= 0.7,
    "TOC text should read comfortably, not squint-small",
  );
});

test("sidenote columns only exist on very wide viewports", async () => {
  const css = (await buildSite()).read("style.css");
  assert.match(css, /min-width:\s*1560px/);
});

test("body does not set overflow-x: scroll", async () => {
  const css = (await buildSite()).read("style.css");
  assert.ok(!/body[^{]*\{[^}]*overflow-x:\s*scroll/.test(css));
});
