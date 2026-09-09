import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSite } from "./helpers/build.mjs";

const root = new URL("../", import.meta.url).pathname;

test("theme toggle survives a missing localStorage", () => {
  const src = readFileSync(root + "static/js/theme.js", "utf8");
  assert.match(src, /try\s*\{/, "localStorage throws in some contexts");
  assert.match(src, /data-theme/);
});

test("theme.js is loaded in <head> with no defer/async, so it runs before first paint", async () => {
  const html = (await buildSite()).read("index.html");
  const head = html.slice(0, html.indexOf("</head>"));
  const scriptMatch = head.match(
    /<script[^>]*src="[^"]*\/js\/theme\.js"[^>]*>/,
  );
  assert.ok(scriptMatch, "theme.js script tag not found in <head>");
  assert.ok(!/\bdefer\b/.test(scriptMatch[0]), "must not be deferred");
  assert.ok(!/\basync\b/.test(scriptMatch[0]), "must not be async");
});

test("collapsible sections need no JavaScript", async () => {
  const tpl = readFileSync(root + "templates/shortcodes/collapse.html", "utf8");
  assert.match(tpl, /<details/);
  assert.match(tpl, /<summary/);
});

test("every section and taxonomy page builds", async () => {
  const site = await buildSite();
  for (const p of [
    "index.html",
    "essays/index.html",
    "projects/index.html",
    "tags/index.html",
    "tags/rendering/index.html",
  ]) {
    assert.ok(site.exists(p), `missing ${p}`);
  }
});

test("section listing shows dates and descriptions", async () => {
  const html = (await buildSite()).read("essays/index.html");
  assert.match(html, /Hydra, NSI and Riley/);
  assert.match(html, /<time/);
});

test("the dek keeps the TL;DR out of .article-body's direct-child paragraphs, so the standfirst gets the drop cap", async () => {
  // static/js/dropcaps.js places the drop cap on `.article-body > p`, the
  // first paragraph that is a *direct child* of .article-body. The essay
  // opens with a short "TL;DR:" line wrapped in the `dek` component
  // specifically so it does not become that direct child — otherwise the
  // cap would try (and fail, being too short to host it) to attach there,
  // and the essay would silently lose its drop cap. This must never
  // regress back to a plain paragraph.
  const html = (await buildSite()).read(
    "essays/nsi-vs-hydra-vs-riley/index.html",
  );
  const bodyIdx = html.indexOf('<div class="article-body">');
  assert.ok(bodyIdx >= 0, "essay must have an .article-body");
  const body = html.slice(bodyIdx);

  assert.match(
    body,
    /^<div class="article-body"><div class="dek">/,
    "the dek must be .article-body's first child, ahead of any direct-child <p>",
  );

  const match = body.match(/<div class="dek">.*?<\/div>\s*<p>(.*?)<\/p>/s);
  assert.ok(match, "expected the dek to be followed by a direct-child <p>");
  assert.doesNotMatch(
    match[1],
    /TL;DR/,
    "the first .article-body > p must not be the TL;DR lead-in",
  );
  assert.match(
    match[1],
    /architectural review/,
    "the first .article-body > p must be the standfirst",
  );
});
