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

test("headings use the drop-cap face, not small-caps; h1 has a solid rule, h2 uppercase with a dotted rule", async () => {
  const c = await css();
  // Headings are scoped to #article, not .article-body: the frontmatter
  // <h1> lives in <header>, a sibling of .article-body, so a
  // .article-body-scoped rule would never reach it.
  // Zola emits compressed CSS, so the brace sits immediately after the
  // selector. Pinning `{` to the selector matches only the standalone
  // rule, not the grouped `h1,h2,h3,h4` reset Sass emits before it.
  // Compression also strips leading zeros: 0.8px becomes .8px.
  const grouped = c.match(
    /#article h1,#article h2,#article h3,#article h4\{([^}]*)\}/,
  )[1];
  assert.match(grouped, /font-family:var\(--initial\)/);
  const h1 = c.match(/#article h1\{([^}]*)\}/)[1];
  // Thunder VF (var(--initial)) has no smcp/c2sc glyphs, so small-caps
  // here would be the browser's faux-synthesised version — dropped
  // rather than carried over from the EB Garamond tuning.
  assert.doesNotMatch(
    h1,
    /font-variant:\s*small-caps|font-variant-caps:\s*small-caps/,
  );
  assert.match(h1, /border-bottom:\s*0?\.8px solid/);
  const h2 = c.match(/#article h2\{([^}]*)\}/)[1];
  assert.match(h2, /text-transform:\s*uppercase/);
  assert.match(h2, /border-bottom:\s*0?\.8px dotted/);
});

test("headings are 30% larger than the pre-rescale sizes and lighter in weight", async () => {
  const c = await css();
  // 40/28/27/24px * 1.3, rounded to whole pixels; wght lightened within
  // Thunder VF's 100-900 axis (static/fonts/manifest.json), h1 staying
  // one step lighter than h2-h4 as before the change.
  const h1 = c.match(/#article h1\{([^}]*)\}/)[1];
  assert.match(h1, /font-size:\s*52px/);
  assert.match(h1, /font-weight:\s*300/);
  const h2 = c.match(/#article h2\{([^}]*)\}/)[1];
  assert.match(h2, /font-size:\s*36px/);
  assert.match(h2, /font-weight:\s*400/);
  const h3 = c.match(/#article h3\{([^}]*)\}/)[1];
  assert.match(h3, /font-size:\s*35px/);
  assert.match(h3, /font-weight:\s*400/);
  // Unlike h1-h3, "#article h4{" also occurs as the tail of the grouped
  // shared-properties selector (h4 is last in that comma list), so a
  // lookbehind is needed to skip straight past that false match to the
  // standalone rule.
  const h4 = c.match(/(?<!,)#article h4\{([^}]*)\}/)[1];
  assert.match(h4, /font-size:\s*31px/);
  assert.match(h4, /font-weight:\s*400/);
});

test("nested strong (`****foo****`) gets small caps with the bold reset", async () => {
  const c = await css();
  const rule = c.match(/\.article-body strong strong\{([^}]*)\}/)[1];
  assert.match(
    rule,
    /font-variant:\s*small-caps|font-variant-caps:\s*small-caps/,
  );
  assert.match(rule, /font-weight:\s*normal/);
});

test("inline code wraps instead of overflowing the column", async () => {
  const c = await css();
  // A long unbroken token (a file path, an identifier) in inline <code>
  // would otherwise punch out of the column and force the whole page to
  // scroll sideways, because justif sets overflow-wrap:normal on the
  // paragraph (see typography.js) and that's what code would otherwise
  // inherit.
  const rule = c.match(
    /\.article-body code,\.article-body kbd,\.article-body samp\{([^}]*)\}/,
  )[1];
  assert.match(rule, /overflow-wrap:\s*anywhere/);
});

test("code inside <pre> keeps overflow-wrap normal (pre has its own scroll container)", async () => {
  const c = await css();
  const rule = c.match(/\.article-body pre code\{([^}]*)\}/)[1];
  assert.match(rule, /overflow-wrap:\s*normal/);
});

test("the essay renders its title once, from frontmatter", async () => {
  const html = (await buildSite()).read("essays/typography/index.html");
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /Setting this site/);
});
