import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "./helpers/build.mjs";

test("demo page exercises every feature", async () => {
  const html = (await buildSite()).read("essays/typography/index.html");
  for (const [what, needle] of [
    // Zola emits fn-LABEL/fr-LABEL-N ids and absolute permalink hrefs, so
    // match by suffix rather than a bare-fragment equality (ruling 2).
    ["footnotes", "#fn-1"],
    // Both admonition kinds render identically apart from the class and
    // label text, so pin the one that isn't the bare default and the
    // fallback-to-kind label (kind="note", no explicit `label`) alongside
    // the explicit label (kind="warning", label="Careful") — a regression
    // in either the class or the label fallback would pass the old,
    // weaker assertion unnoticed.
    ["admonition warning class", 'class="admonition warning"'],
    ["admonition label fallback to kind", ">note</span"],
    ["admonition explicit label", ">Careful</span"],
    ["admonition body word", "for things that bite"],
    ["collapse", '<details class="collapse">'],
    ["collapse summary", "<summary>A collapsible section</summary>"],
    // `<code>` only appears if `{{ body | markdown | safe }}` actually ran
    // the body through markdown rather than dumping it as raw/escaped text.
    ["collapse body rendered as markdown", "<code>&lt;details&gt;</code>"],
    ["marginnote", 'class="marginnote"'],
    ["marginnote body word", "has no reference mark"],
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
