import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build.mjs";

test("light palette is defined on bare :root", async () => {
  const css = (await buildSite()).read("style.css");
  const root = css.match(/:root\s*\{([^}]*)\}/)[1];
  for (const tok of [
    "--ink",
    "--paper",
    "--link",
    "--box",
    "--rule",
    "--measure",
    "--body-size",
  ]) {
    assert.ok(root.includes(tok), `${tok} missing from bare :root`);
  }
  assert.ok(root.includes("#fff"), "paper should be #fff in light");
});

test("dark mode overrides tokens, guarded against an explicit light choice", async () => {
  const css = (await buildSite()).read("style.css");
  assert.ok(css.includes("prefers-color-scheme: dark"));
  assert.ok(
    css.includes(':root:not([data-theme="light"])'),
    "dark media block must not beat an explicit light choice",
  );
  assert.ok(css.includes(':root[data-theme="dark"]'));
});

test("body paints an explicit background from a token", async () => {
  const css = (await buildSite()).read("style.css");
  const body = css.match(/(^|\})\s*body\s*\{([^}]*)\}/)[2];
  assert.match(body, /background:\s*var\(--paper\)/);
});

test("measure is 895px inside a 935px column", async () => {
  const css = (await buildSite()).read("style.css");
  assert.ok(css.includes("935px"), "main max-width");
  assert.ok(css.includes("--measure: 895px"));
});
