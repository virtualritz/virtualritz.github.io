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
