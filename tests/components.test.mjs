import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSite } from "./helpers/build.mjs";

const root = new URL("../", import.meta.url).pathname;

test("theme toggle runs before paint and survives a missing localStorage", () => {
  const src = readFileSync(root + "static/js/theme.js", "utf8");
  assert.match(src, /try\s*\{/, "localStorage throws in some contexts");
  assert.match(src, /data-theme/);
  assert.ok(!src.includes("DOMContentLoaded"), "must run before first paint");
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
