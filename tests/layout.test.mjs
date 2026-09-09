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

test("sidenote columns only exist on very wide viewports", async () => {
  const css = (await buildSite()).read("style.css");
  assert.match(css, /min-width:\s*1400px/);
});

test("no element forces horizontal page scroll", async () => {
  const css = (await buildSite()).read("style.css");
  assert.ok(!/body[^{]*\{[^}]*overflow-x:\s*scroll/.test(css));
});
