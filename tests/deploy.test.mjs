import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;

test("workflow pins the Zola version the site needs", () => {
  const wf = readFileSync(root + ".github/workflows/deploy.yml", "utf8");
  assert.match(wf, /0\.23\.4/, "Zola must be pinned; 0.18 breaks footnotes");
  assert.match(wf, /actions\/deploy-pages/);
});

test("npm test runs inside the build job, after Zola is installed and before the pages artifact is uploaded", () => {
  const wf = readFileSync(root + ".github/workflows/deploy.yml", "utf8");

  // Anchored on the step form, not the bare string, so a comment like
  // "# TODO: add npm test" or a differently-named step can't satisfy this.
  const testStep = wf.match(/- name: Test\s*\n\s*run: npm test\b/);
  assert.ok(
    testStep,
    "CI must run the test suite as a real step (`- name: Test` / `run: npm test`)",
  );

  const installZolaIdx = wf.indexOf("name: Install Zola");
  const uploadArtifactIdx = wf.indexOf("actions/upload-pages-artifact");
  const deployJobIdx = wf.indexOf("\n  deploy:");
  assert.ok(installZolaIdx !== -1, "Install Zola step not found");
  assert.ok(uploadArtifactIdx !== -1, "upload-pages-artifact step not found");
  assert.ok(deployJobIdx !== -1, "deploy job not found");

  const testStepIdx = testStep.index;
  assert.ok(
    testStepIdx > installZolaIdx,
    "npm test must run after Zola is installed (the suite shells out to zola build)",
  );
  assert.ok(
    testStepIdx < uploadArtifactIdx,
    "npm test must run before the pages artifact is uploaded",
  );
  assert.ok(
    testStepIdx < deployJobIdx,
    "npm test must run inside the build job, not the deploy job (which runs after the artifact is already uploaded)",
  );
});

test("base_url matches the Pages host", () => {
  const cfg = readFileSync(root + "config.toml", "utf8");
  assert.match(cfg, /base_url = "https:\/\/virtualritz\.github\.io"/);
});
