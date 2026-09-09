# Repointing tests off the drafted essay (2026-09-10)

## Context

`content/essays/nsi-vs-hydra-vs-riley.md` was marked `draft = true` at the
owner's request, so Zola stops emitting `essays/nsi-vs-hydra-vs-riley/index.html`.
Six tests read that file directly or depended on it existing in the built
output. `content/essays/typography.md` ("Setting this site") is the
site's own typography demo page — built to `essays/typography/index.html` and
guaranteed not to disappear — so it is the fixture these tests were
repointed to.

## Per-test disposition

### `tests/build.test.mjs:6` — "site builds and emits the essay"

Renamed to **"site builds and honours draft = true by omitting the page"**.
The old assertion ("the essay exists") is simply false now and was only ever
a proxy for "the build works." Rewrote it to assert the thing that is
actually true and actually worth pinning: `essays/typography/index.html`
exists, and `essays/nsi-vs-hydra-vs-riley/index.html` does not. This gives
the draft mechanism itself a regression test, which it didn't have before.
**Meaning changed**: from "an essay builds" to "drafts are excluded from the
build."

### `tests/components.test.mjs:31` — "every section and taxonomy page builds"

The hard-coded page list included `tags/rendering/index.html`. That
taxonomy page existed only because the drafted essay was tagged
`rendering` — with it gone, `rendering` has no live pages and Zola no
longer emits that taxonomy page (confirmed via `zola build`: the tags
directory now has `web`, `design`, `typography`, `reading`). Swapped it for
`tags/typography/index.html`, which both `on-typography.md` and
`typography.md` carry, so it's a taxonomy page genuinely exercised by two
live essays, not just the fixture. No other page in the hard-coded list
referenced the drafted essay. Meaning unchanged — still "every section and
taxonomy page builds," just pointed at a tag that's actually live.

### `tests/components.test.mjs:44` — "section listing shows dates and descriptions"

Swapped the title match from "Hydra, NSI and Riley" to "Setting this site"
(typography.md's title), which now appears in `essays/index.html`'s
listing since it's the essay that ships. Meaning unchanged.

### `tests/components.test.mjs:50` — the dek test (the important one)

This pins the real invariant: a short lead-in wrapped in the `dek`
component must not become `.article-body`'s first direct-child `<p>`, or
the drop cap (which attaches to `.article-body > p`) silently dies because
the TL;DR line is too short to host it.

Before this change, `dek` was used **only** on the now-drafted essay — the
feature would have shipped with zero live usage and zero coverage. Per the
task, I added a `dek` usage to `content/essays/typography.md`:

```
{% <dek> %}
TL;DR: every typographic device this site has, gathered on one page, so a regression is visible immediately.
{% </dek> %}
```

placed directly above the existing three-line italic standfirst
("_Every typographic device this site has, on one page..._"), which was
already long enough (three lines) to host the drop cap, so no change was
needed there. Verified via a manual `zola build` that the rendered
structure is exactly the shape the test expects:

```html
<div class="article-body">
  <div class="dek"><p>TL;DR: ...</p></div>
  <p><em>Every typographic device this site has, on one page, ...</em></p>
</div>
```

Repointed the test at `essays/typography/index.html` and changed the
standfirst-content assertion from `/architectural review/` (a phrase only
the drafted essay had) to `/drop cap reserves/` (a phrase unique to
typography.md's own standfirst, not present in the dek's TL;DR text, so it
can't accidentally match the wrong paragraph). The `doesNotMatch(/TL;DR/)`
assertion is unchanged and still meaningful.

**This demo page now genuinely covers the assertion** — dek present, dek is
the first child of `.article-body`, standfirst is the following
direct-child `<p>`, standfirst does not contain the TL;DR text.

### `tests/sidenotes.test.mjs:119` — "page.html carries both sidenote columns inside #article"

`page.html` is the shared template for every essay (`page_template =
"page.html"` in `content/essays/_index.md`), and the test's own comment
already says "none needs footnotes to prove the shell is wired up." Simple
repoint to `essays/typography/index.html` — the demo page genuinely covers
this since it uses the same template as every other essay.

### `tests/typography.test.mjs:86` — "the essay renders its title once, from frontmatter"

Repointed to `essays/typography/index.html`; title assertion changed from
"Hydra, NSI and Riley" to "Setting this site." The single-`<h1>` assertion
is a template property (`page.html` emits exactly one `<h1>{{ page.title
}}</h1>`), so any essay covers it equally. Meaning unchanged.

### `tests/justif.test.mjs:305`

Left untouched per instructions — it's a comment recording a historical
pixel measurement taken on the drafted essay before a patch, not a live
reference to its build output.

## Verification

- `npm test`: **146 / 146 passing** (0 failing) — was 146 total with 6
  failing before this change.
- `zola build`: clean, 3 pages / 2 sections.
- `zola check --skip-external-links`: clean, 3 pages (0 orphan), 2 sections.

## What I could not confirm (no browser available)

Please check visually:

1. The `dek` box ("TL;DR: every typographic device...") renders above the
   italic standfirst on `/essays/typography/`, styled as a distinct
   lead-in (not just another paragraph).
2. The drop cap still lands on the opening letter of the standfirst
   paragraph ("Every typographic device...") and not on the TL;DR line.
3. Body text wraps correctly beside the drop cap box (no overlap, no
   excessive gap) now that there's an extra block above it.
