import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSite } from "./helpers/build.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const themeSrc = () => src("../static/js/theme.js");

// The cloak hides the article until the typography pipeline is done, so the
// pre-pipeline layout (TOC above the body, no drop cap, browser line
// breaking) is never painted and then rearranged. Its whole safety story is
// that it is armed by JS and only by JS, and that the reveal cannot be lost.

test("the cloak is armed only from JS, so a no-JS visitor never has anything hidden", async () => {
  const c = (await buildSite()).read("style.css");
  // Zola compresses: no spaces around the selector's braces.
  const rule = c.match(/html\.js #article\[data-cloak\]\{([^}]*)\}/);
  assert.ok(rule, "cloak rule missing");
  assert.match(rule[1], /visibility:hidden/);
  assert.match(
    c,
    /html\.js\.typo-ready #article\[data-cloak\]\{[^}]*visibility:visible/,
  );
  // The `js` class exists nowhere in the served HTML — it is added at
  // runtime by theme.js. If it were ever baked into the markup, a visitor
  // with JS off would get a permanently invisible article.
  const site = await buildSite();
  for (const page of ["index.html", "essays/typography/index.html"]) {
    assert.doesNotMatch(
      site.read(page),
      /<html[^>]*class=[^>]*\bjs\b/,
      `${page} must not ship the js class in its markup`,
    );
  }
});

test("theme.js adds the js class and guarantees the reveal on a timer", () => {
  const s = themeSrc();
  assert.match(s, /classList\.add\("js"\)/);
  // The reveal must not depend on the pipeline reporting in: a thrown
  // exception in any module would otherwise strand the reader on a blank
  // article for good.
  assert.match(s, /setTimeout\(reveal, \d+\)/);
  assert.match(s, /addEventListener\("typo-ready", reveal\)/);
});

test("typography.js announces readiness so the reveal is normally immediate", () => {
  assert.match(
    src("../static/js/typography.js"),
    /ready\.then\(\(\) => document\.dispatchEvent\(new Event\("typo-ready"\)\)\)/,
  );
});

test("only pages that load the pipeline are cloakable", async () => {
  const site = await buildSite();
  // page.html loads main.js and marks its article data-cloak. The listing
  // templates have an #article too but no pipeline to wait for, so cloaking
  // them would hide them for the full safety timeout and nothing else.
  const essay = site.read("essays/typography/index.html");
  assert.match(essay, /<article id="article" data-cloak/);
  assert.match(essay, /js\/main\.js/);
  for (const page of ["index.html", "essays/index.html", "tags/index.html"]) {
    const html = site.read(page);
    assert.doesNotMatch(html, /data-cloak/, `${page} must not be cloaked`);
    assert.doesNotMatch(html, /js\/main\.js/, `${page} has no pipeline`);
  }
});

test("the TOC's link colour does not depend on JS having moved it", async () => {
  const c = (await buildSite()).read("style.css");
  // toc-move.js relocates #toc inside .article-body, where `.article-body a`
  // colours it — but only once that script has run. Without a colour of its
  // own the TOC fell back to the browser default #0000ee: bright blue links
  // on the dark ground that turned grey when JS arrived.
  const rule = c.match(/#toc a\{([^}]*)\}/);
  assert.ok(rule, "#toc a must set a colour of its own");
  assert.match(rule[1], /color:var\(--link\)/);
});

test("the no-JS preview switch is development-only and suppresses the layer", () => {
  const s = themeSrc();
  // It must never be drawn for a visitor: local server, or an explicit ?dev.
  assert.match(s, /localhost/);
  assert.match(s, /\(\^\|\[\?&\]\)dev/);
  // Guarding the entry modules is what makes the preview real; a static
  // import would run every module's side effects before any guard could
  // stop it, because module evaluation is hoisted.
  assert.match(
    src("../static/js/main.js"),
    /if \(!document\.documentElement\.classList\.contains\("nojs-sim"\)\) \{/,
  );
  assert.match(
    src("../static/js/main.js"),
    /await import\("\.\/typography\.js"\)/,
  );
  assert.match(
    src("../static/js/brand.js"),
    /classList\.contains\("nojs-sim"\)/,
  );
  // And the cloak must not engage in that mode, or the preview would be of
  // a hidden page.
  assert.match(s, /if \(!noJs\) \{[\s\S]*?classList\.add\("js"\)/);
});
