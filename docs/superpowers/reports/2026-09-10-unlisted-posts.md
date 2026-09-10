# Unlisted posts

Adds an `[extra] unlisted = true` convention: a page that builds and is
reachable at its own URL, but is filtered out of every surface the site
uses to advertise its contents, and marked `noindex`. Complements the
existing `draft = true` (not built at all, 404s).

## Surfaces filtered

1. **Homepage recent-essays list** (`templates/index.html`) - the original
   used `essays.pages[:10]`, and Zola 0.23's Tera has no `slice` filter.
   Replaced with a `for` loop over all pages, a `{% set_global shown = 0 %}`
   counter, `{% if not page.extra.unlisted %}` to skip unlisted pages before
   counting them, and `{% break %}` once 10 _listed_ pages have been shown.
   (Tera 1.19, bundled with the installed Zola 0.23.4, supports `break` and
   `continue` inside `for` loops and `set_global` for a value that survives
   loop-iteration scoping - both confirmed by testing against the actual
   installed `zola` binary, not assumed from docs.)
2. **Section listing** (`templates/section.html`) - wrapped the `<li>` in
   `{% if not page.extra.unlisted %}`.
3. **Tag listing page** (`templates/taxonomy_single.html`) - same filter
   around the `<li>` for `term.pages`.
4. **Tag index** (`templates/taxonomy_list.html`) - see "Taxonomy decision"
   below.
5. **`sitemap.xml`** - overrode the template. Zola's real `sitemap.xml`
   (extracted from the installed binary, see "A wasted detour" below) is:
   ```
   {%- for sitemap_entry in entries %}
   <url>...</url>
   {%- endfor %}
   ```
   `SitemapEntry` carries the page's `extra` map (`sitemap_entry.extra`), so
   the override just wraps the `<url>` block in
   `{% if not sitemap_entry.extra.unlisted %}`.
6. **The feed** - `config.toml` has no `generate_feeds`/`generate_feed`
   (both default to false), so the site does **not** currently generate a
   site-wide `atom.xml` - the link to it in `base.html`'s `<head>` is
   already a dead link, pre-existing and out of scope here, not touched.
   The one feed mechanism actually active is `taxonomies = [{name = "tags",
feed = true}]`, which renders `tags/<tag>/atom.xml` for every tag using
   the template named `atom.xml`. Overrode `templates/atom.xml` (see
   below) wrapping each `<entry>` in `{% if not page.extra.unlisted %}`.
   This also covers a future site-wide or per-section feed, since they
   render through the same template name.

## Taxonomy decision

A tag whose only member is unlisted must not advertise a misleading count.
Two options: show `0`, or drop the tag from the index entirely. Chose
**drop it**: a `0`-count tag is still a link inviting a click to an empty
page and is itself a signal ("something here has a tag but nothing shows"),
which works against "unlisted means don't advertise this exists."
`taxonomy_list.html` now computes a `visible` count per term (a nested
`for`/`set_global` loop over `term.pages` filtering `unlisted`) and only
emits the `<li>` when `visible > 0`; the displayed count is `visible`, not
`term.pages | length`. `taxonomy_single.html` (the tag's own listing page)
still gets built even if its visible-count is 0 - same tradeoff Zola itself
makes for `draft`-free empty sections; only the _index_ hides the term.

## noindex

`templates/base.html`, in `<head>`: `{% if page is defined and
page.extra.unlisted %}<meta name="robots" content="noindex, nofollow" />{%
endif %}`. `page is defined` guards against templates that share
`base.html` but never bind a `page` variable (`index.html`, `section.html`,
`taxonomy_list.html`, `taxonomy_single.html` bind `section`/`terms`/`term`,
not `page`) - referencing `page.extra.unlisted` there directly errors with
"Variable `page` is not defined", it is not silently falsy the way a
missing _nested_ key is.

## A wasted detour, worth recording

There is a local zola checkout at `/home/ritz/code/crates/zola` (branch
`next`, merging upstream `getzola/zola` into a personal fork). I initially
copied its builtin `sitemap.xml`/`atom.xml` templates and its config field
names (`generate_feed`, singular) as ground truth. Wrong: that checkout is
version 0.18.0-ish with an unrelated, half-finished rename of "feed" to
"ln" throughout its config code, and does not match the installed `zola`
0.23.4 binary at all (confirmed by `cargo install --list` showing a stale
install record, and by config.toml round-tripping through the real binary
which reports the actual fields as `generate_feeds`/`feed_filenames`,
plural). Its builtin `atom.xml` used `date(format="%+")`, which the real
0.23.4 binary's `date` filter does not support ("unrecognized specifier
directive `+`") - only reproducible once a _project_ override template
exists, because without an override the _actual_ embedded builtin (which
uses `date(format="%Y-%m-%dT%H:%M:%S%:z")`) is what renders, and it never
hit the bug. Recovered the real builtin templates with
`strings -n 8 ~/.cargo/bin/zola | grep -A N '__zola_builtins/atom.xml'`
and rebuilt `templates/atom.xml` from that, confirmed byte-for-byte
identical output to the pre-change build for all _listed_ content
(`difft` reported "No changes." on every generated file; the only diffs
across the whole `public/` tree were non-syntactic whitespace from the new
`{% if %}` blocks in HTML templates, confirmed with `difft` reporting "No
syntactic changes." on every page). Do not trust `/home/ritz/code/crates/zola`
as a reference for this site's actual Zola behavior again - verify against
the installed binary directly.

## Fixture strategy

`tests/unlisted.test.mjs` writes `content/essays/unlisted-mechanism-fixture.md`
(title "Unlisted Mechanism Fixture", tagged `design` so it lands in an
already-active taxonomy feed/listing) in a `before()` hook, and removes it
in `after()`. This keeps the fixture self-contained to the one test file
and leaves `content/` clean once the run ends (`git status --short
content/` is empty after `npm test`). Chose a temporary fixture over a
permanent "genuinely useful" unlisted page because the owner did not ask
for one and inventing content not requested would violate "no features
beyond what was asked."

## Tests added (9), what each proves

- builds and is reachable at its own URL (`essays/<slug>/index.html` exists,
  contains the title)
- absent from the homepage
- absent from the essays section listing (plus a sanity check that a
  normal listed essay is still there)
- absent from `sitemap.xml`
- absent from its tag's feed (`tags/design/atom.xml`)
- a tag whose only _other_ member is unlisted keeps its count at `1`, not
  `2`, on the tag index
- absent from its tag's listing page
- carries the noindex meta tag
- a normal page does **not** carry the noindex meta tag (negative control)

## Evidence the tests have teeth

Removed each filter, watched the corresponding test fail, restored it, watched
the suite go green again:

| Filter removed                                               | Test that failed                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `sitemap.xml`'s `{% if not sitemap_entry.extra.unlisted %}`  | `an unlisted page is absent from sitemap.xml`                       |
| `atom.xml`'s `{% if not page.extra.unlisted %}`              | `an unlisted page is absent from its tag's feed`                    |
| `index.html`'s `{% if not page.extra.unlisted %}` (homepage) | `an unlisted page is absent from the homepage's recent-essays list` |
| `section.html`'s `{% if not page.extra.unlisted %}`          | `an unlisted page is absent from the essays section listing`        |
| `base.html`'s noindex `{% if %}`                             | `an unlisted page carries a noindex robots meta tag`                |

Each restore was verified with `command diff`/`difft` against the pre-break
file to confirm an exact, clean revert before moving to the next.

## Verification

- `npm test` baseline: 178 passing. **New count: 187 passing** (9 new
  tests), 0 failing.
- `zola build` - clean, 3 pages / 2 sections, no warnings.
- `zola check --skip-external-links` - clean.
- Whole-output diff of the real content (`difft` on every generated file)
  between pre-change and post-change builds: no syntactic/content changes
  anywhere, since no page in the real site is currently `unlisted` -
  confirms the change is a no-op for the site as it stands today.
- `git status --short content/` empty after the test run - fixture cleanup
  confirmed.

## Not converted

`content/essays/nsi-vs-hydra-vs-riley.md` is left as `draft = true`, as
instructed. It still 404s. Converting it to `unlisted` is the owner's call.

## What I could not confirm

- I cannot drive a browser, so I did not visually confirm the noindex tag
  or the absence of listings in a rendered page - this is pure
  build-output assertion, matching the brief. If you want a manual check:
  set `unlisted = true` on `nsi-vs-hydra-vs-riley.md` and `draft = false`
  (or a scratch page), `zola serve`, and confirm in a browser that the page
  loads at its URL, does not appear on the homepage/essays list/tags, and
  `view-source:` shows `<meta name="robots" content="noindex, nofollow">`.
- I did not check how any third-party crawler or search console actually
  treats `noindex` on a page that was never submitted/linked anywhere -
  that's inherently outside what a local build can prove.
