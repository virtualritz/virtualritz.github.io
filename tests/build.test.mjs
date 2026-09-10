import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { buildSite } from "./helpers/build.mjs";

// draft = true must keep a page out of the build entirely — unlike
// [extra] unlisted = true, which builds the page but links it from
// nowhere (tests/unlisted.test.mjs). This used to assert against whichever
// real essay happened to be drafted at the time, so publishing that essay
// broke a test about a Zola feature. A throwaway fixture, written before
// the build and removed after, keeps the mechanism covered without tying
// it to the state of the site's actual content.
const FIXTURE_PATH = new URL(
  "../content/essays/draft-mechanism-fixture.md",
  import.meta.url,
).pathname;

const FIXTURE_SLUG = "draft-mechanism-fixture";

before(() => {
  writeFileSync(
    FIXTURE_PATH,
    `+++
title = "Draft Mechanism Fixture"
date = 2024-06-01
description = "Proves draft = true omits the page; removed after the test run."
draft = true
+++

This page exists only for \`tests/build.test.mjs\`. It must not be built.
`,
  );
});

after(() => {
  rmSync(FIXTURE_PATH, { force: true });
});

test("site builds and honours draft = true by omitting the page", async () => {
  const site = await buildSite();
  assert.ok(site.exists("essays/typography/index.html"));
  assert.ok(!site.exists(`essays/${FIXTURE_SLUG}/index.html`));
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
