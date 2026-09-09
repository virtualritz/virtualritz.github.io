import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build.mjs";

const css = async () => (await buildSite()).read("style.css");

test("body text is justified with hyphenation and oldstyle figures", async () => {
  const c = await css();
  const body = c.match(/\.article-body\s*\{([^}]*)\}/)[1];
  assert.match(body, /text-align:\s*justify/);
  assert.match(body, /hyphens:\s*auto/);
  assert.match(body, /oldstyle-nums/);
});

test("paragraphs are flush with a gap; .para-indent marks a hard-break continuation", async () => {
  const c = await css();
  // Zola emits compressed CSS: no space after the selector's `{`, no
  // trailing `;` before `}`.
  assert.match(c, /\.article-body p\{margin:0;text-indent:0\}/);
  assert.match(
    c,
    /\.article-body p\+p\{margin-top:calc\(var\(--body-lh\)\*1em\)\}/,
  );
  assert.match(
    c,
    /\.para-indent\{display:inline-block;width:var\(--indent\)\}/,
  );
});

test("h1 is small-caps with a solid rule, h2 uppercase with a dotted rule", async () => {
  const c = await css();
  // Headings are scoped to #article, not .article-body: the frontmatter
  // <h1> lives in <header>, a sibling of .article-body, so a
  // .article-body-scoped rule would never reach it.
  // Zola emits compressed CSS, so the brace sits immediately after the
  // selector. Pinning `{` to the selector matches only the standalone
  // rule, not the grouped `h1,h2,h3,h4` reset Sass emits before it.
  // Compression also strips leading zeros: 0.8px becomes .8px.
  const h1 = c.match(/#article h1\{([^}]*)\}/)[1];
  assert.match(
    h1,
    /font-variant:\s*small-caps|font-variant-caps:\s*small-caps/,
  );
  assert.match(h1, /border-bottom:\s*0?\.8px solid/);
  const h2 = c.match(/#article h2\{([^}]*)\}/)[1];
  assert.match(h2, /text-transform:\s*uppercase/);
  assert.match(h2, /border-bottom:\s*0?\.8px dotted/);
});

test("the essay renders its title once, from frontmatter", async () => {
  const html = (await buildSite()).read(
    "essays/nsi-vs-hydra-vs-riley/index.html",
  );
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /Hydra, NSI and Riley/);
});
