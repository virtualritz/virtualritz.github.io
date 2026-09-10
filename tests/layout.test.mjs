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
  assert.match(toc, /max-width:\s*285px/);
  assert.match(toc, /background:\s*var\(--box\)/);
  // The float belongs to the moved TOC only. templates/page.html renders
  // #toc above .article-body and toc-move.js relocates it; floating it in
  // the un-moved position made the opening paragraphs wrap around a box
  // outside their own column, which is what a no-JS visitor saw.
  assert.doesNotMatch(toc, /float:\s*left/);
  const moved = css.match(/\.article-body #toc\{([^}]*)\}/)[1];
  assert.match(moved, /float:left/);
  // And it must clear the drop cap, which is a left float in the preceding
  // paragraph: when the cap hangs below that paragraph's last line the TOC
  // otherwise lands beside it rather than at the column edge, an indent
  // that appears only at the zoom levels where the standfirst reflows to
  // fewer lines than the cap is deep.
  assert.match(moved, /clear:left/);
});

test("TOC has a full body line of leading above it, and a comfortably readable font size", async () => {
  const css = (await buildSite()).read("style.css");
  const toc = css.match(/#toc\s*\{([^}]*)\}/)[1];
  // A full line of the body's own leading, not the TOC's own — so it must
  // be anchored to --body-size, not left as a bare em. It lives on the
  // moved TOC, the only one that floats.
  const moved = css.match(/\.article-body #toc\{([^}]*)\}/)[1];
  assert.match(
    moved,
    /margin:\s*calc\(var\(--body-lh\)\s*\*\s*var\(--body-size\)\)/,
  );
  // Was 0.58em, then 0.75em, and still read as small print next to the
  // body. It is now body size outright. Anchored to --body-size rather
  // than `1em` because the TOC changes parent when toc-move.js runs, and
  // a bare em would resolve differently before and after.
  assert.match(toc, /font-size:var\(--body-size\)/);
});

test("sidenote columns only exist on very wide viewports", async () => {
  const css = (await buildSite()).read("style.css");
  assert.match(css, /min-width:\s*1560px/);
});

test("body does not set overflow-x: scroll", async () => {
  const css = (await buildSite()).read("style.css");
  assert.ok(!/body[^{]*\{[^}]*overflow-x:\s*scroll/.test(css));
});
