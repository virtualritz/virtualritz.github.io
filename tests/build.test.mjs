import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildSite } from "./helpers/build.mjs";

test("site builds and honours draft = true by omitting the page", async () => {
  const site = await buildSite();
  assert.ok(site.exists("essays/typography/index.html"));
  assert.ok(!site.exists("essays/nsi-vs-hydra-vs-riley/index.html"));
});

test("zola is new enough to collect footnotes", () => {
  const v = execFileSync("zola", ["--version"], { encoding: "utf8" }).trim();
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/);
  assert.ok(m, `could not parse version from ${v}`);
  const [maj, min] = [Number(m[1]), Number(m[2])];
  assert.ok(
    maj > 0 || min >= 19,
    `Zola ${v} is too old: 0.18 emits footnote definitions inline, which breaks the sidenote source`,
  );
});
