import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build.mjs";

test("demo page exercises every feature", async () => {
  const html = (await buildSite()).read("essays/typography/index.html");
  for (const [what, needle] of [
    // Zola emits fn-LABEL/fr-LABEL-N ids and absolute permalink hrefs, so
    // match by suffix rather than a bare-fragment equality (ruling 2).
    ["footnotes", "#fn-1"],
    ["admonition", 'class="admonition'],
    ["collapse", "<details"],
    ["marginnote", 'class="marginnote"'],
    ["table", "<table"],
    ["code block", "<pre"],
    ["blockquote", "<blockquote"],
    ["small caps", "small-caps"],
    ["em dash", "—"],
    ["en dash", "–"],
    ["curly quotes", "“"],
  ]) {
    assert.ok(html.includes(needle), `demo page lacks ${what}`);
  }
});

test("no placeholder text survives anywhere", async () => {
  const site = await buildSite();
  for (const p of ["about/index.html", "index.html"]) {
    const html = site.read(p);
    for (const bad of ["yourusername", "your.email@example.com", "Your Name"]) {
      assert.ok(!html.includes(bad), `${p} still contains "${bad}"`);
    }
  }
});

test("zola check finds no broken internal links", async () => {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("zola", ["check", "--skip-external-links"], {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.ok(!/error/i.test(out), out);
});
