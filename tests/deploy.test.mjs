import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;

test("workflow pins the Zola version the site needs", () => {
  const wf = readFileSync(root + ".github/workflows/deploy.yml", "utf8");
  assert.match(wf, /0\.23\.4/, "Zola must be pinned; 0.18 breaks footnotes");
  assert.match(wf, /actions\/deploy-pages/);
  assert.match(wf, /npm test/, "CI must run the test suite before deploying");
});

test("base_url matches the Pages host", () => {
  const cfg = readFileSync(root + "config.toml", "utf8");
  assert.match(cfg, /base_url = "https:\/\/virtualritz\.github\.io"/);
});
