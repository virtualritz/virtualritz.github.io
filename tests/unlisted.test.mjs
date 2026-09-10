import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { buildSite } from "./helpers/build.mjs";

// [extra] unlisted = true must build the page at its own URL while keeping it
// out of every surface the site uses to advertise its contents (homepage,
// section listing, sitemap, feed, taxonomy pages) and mark it noindex. This
// fixture is written into content/ before the build and removed afterwards
// (see `after`, below) so no stray page is left in the repo. It carries the
// "design" tag so it lands in an existing, already-built taxonomy feed
// (tags/design/atom.xml) and taxonomy listing, letting us prove both are
// filtered without inventing a new tag.
const FIXTURE_PATH = new URL(
  "../content/essays/unlisted-mechanism-fixture.md",
  import.meta.url,
).pathname;

const FIXTURE_SLUG = "unlisted-mechanism-fixture";
const FIXTURE_TITLE = "Unlisted Mechanism Fixture";

const FIXTURE_CONTENT = `+++
title = "${FIXTURE_TITLE}"
date = 2024-06-01
description = "Proves the [extra] unlisted mechanism; removed after the test run."

[taxonomies]
tags = ["design"]

[extra]
unlisted = true
+++

This page exists only for \`tests/unlisted.test.mjs\`. It must build and be reachable at its own URL, but must not appear on the homepage, the essays section listing, the sitemap, the design tag's feed or listing, or be indexed by search engines.
`;

before(() => {
  writeFileSync(FIXTURE_PATH, FIXTURE_CONTENT);
});

after(() => {
  rmSync(FIXTURE_PATH, { force: true });
});

test("an unlisted page still builds and is reachable at its own URL", async () => {
  const site = await buildSite();
  assert.ok(site.exists(`essays/${FIXTURE_SLUG}/index.html`));
  const html = site.read(`essays/${FIXTURE_SLUG}/index.html`);
  assert.match(html, new RegExp(FIXTURE_TITLE));
});

test("an unlisted page is absent from the homepage's recent-essays list", async () => {
  const html = (await buildSite()).read("index.html");
  assert.doesNotMatch(html, new RegExp(FIXTURE_TITLE));
  assert.doesNotMatch(html, new RegExp(FIXTURE_SLUG));
});

test("an unlisted page is absent from the essays section listing", async () => {
  const html = (await buildSite()).read("essays/index.html");
  assert.doesNotMatch(html, new RegExp(FIXTURE_TITLE));
  assert.doesNotMatch(html, new RegExp(FIXTURE_SLUG));
  // sanity: a normal, listed essay must still be there
  assert.match(html, /Setting this site/);
});

test("an unlisted page is absent from sitemap.xml", async () => {
  const xml = (await buildSite()).read("sitemap.xml");
  assert.doesNotMatch(xml, new RegExp(FIXTURE_SLUG));
});

test("an unlisted page is absent from its tag's feed", async () => {
  const xml = (await buildSite()).read("tags/design/atom.xml");
  assert.doesNotMatch(xml, new RegExp(FIXTURE_SLUG));
  assert.doesNotMatch(xml, new RegExp(FIXTURE_TITLE));
});

test("a tag whose only other member is unlisted does not get a misleading count", async () => {
  const html = (await buildSite()).read("tags/index.html");
  // "design" already has one listed member (on-typography.md); adding the
  // unlisted fixture must not bump the advertised count to 2.
  const designLi = html.match(
    /<a href="[^"]*\/tags\/design\/">design<\/a>\s*<span class="post-meta">(\d+)<\/span>/,
  );
  assert.ok(designLi, "design tag entry not found in tags/index.html");
  assert.equal(designLi[1], "1");
});

test("an unlisted page is absent from its tag's listing page", async () => {
  const html = (await buildSite()).read("tags/design/index.html");
  assert.doesNotMatch(html, new RegExp(FIXTURE_SLUG));
});

test("an unlisted page carries a noindex robots meta tag", async () => {
  const html = (await buildSite()).read(`essays/${FIXTURE_SLUG}/index.html`);
  assert.match(
    html,
    /<meta\s+name="robots"\s+content="noindex,\s*nofollow"\s*\/>/,
  );
});

test("a normal (listed) page does not carry the noindex meta tag", async () => {
  const html = (await buildSite()).read("essays/typography/index.html");
  assert.doesNotMatch(html, /name="robots"/);
});
