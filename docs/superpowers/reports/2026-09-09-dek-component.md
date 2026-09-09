# The `dek` component — 2026-09-09

## Why this exists

`static/js/dropcaps.js` places the drop cap on `.article-body > p`, the
essay's first paragraph that is a **direct child** of `.article-body`. If
that paragraph is too short to host the cap's 3-line depth, it places no
cap at all — checked by an overhang test, not a fallback (see the file's
header comment and `capOverhangsParagraph` in
`static/js/lib/dropcap-geometry.js`).

`content/essays/nsi-vs-hydra-vs-riley.md` opens with a two-line "TL;DR:"
paragraph followed by the italic standfirst. As a plain paragraph, the
TL;DR _is_ `.article-body`'s first direct child, so the cap tried to
attach there, found it too short, and placed no cap at all — even though
the standfirst right below it would fit one.

A prior attempt (commits `ab45802`, `9951ceb`, `acab0ba`, all reverted)
taught the cap itself to walk forward to the first paragraph that fits.
It picked the right paragraph, but justif doesn't reserve column space
for a paragraph's leading float unless it's given every paragraph up
front — walking forward at cap-placement time broke that pass, and the
standfirst rendered orphaned (text pushed below the cap instead of
wrapping beside it). That's a `static/js/lib/justif` limitation, out of
scope here; per instructions, `dropcaps.js`, `toc-move.js` and
`static/js/lib/justif/**` were not touched.

The fix instead removes the TL;DR from `.article-body`'s direct-child
paragraph list entirely, on the content side, so the existing (working)
cap-placement path naturally lands on the standfirst.

## The component

`templates/shortcodes/dek.html` (new), following the existing pattern in
`admonition.html`/`collapse.html`/`marginnote.html` exactly:

```
{% component dek() %}
<div class="dek">{{ body | markdown | safe }}</div>
{% endcomponent dek %}
```

- `body | markdown | safe` renders the wrapped text through Zola's
  markdown pipeline, same as the other three components, so inline
  markdown (the TL;DR's `~~crap~~` strikethrough) still renders — it
  becomes `<del>crap</del>`, verified in the built HTML.
- The output is `<div class="dek"><p>...</p></div>`. The `<p>` Zola's
  markdown renderer emits for the TL;DR text is wrapped in a `<div>`, so
  it is a **descendant** of `.article-body`, not a direct child.
  `.article-body > p` therefore skips straight over it to the next
  element that _is_ a direct-child `<p>` — the standfirst.

Used in `content/essays/nsi-vs-hydra-vs-riley.md` by wrapping the
existing TL;DR line, unchanged, in the component tags:

```
{% <dek> %}
TL;DR: Hydra is ~~crap~~ a bad choice if you need to send data from a digital content creation app (DCC, e.g. Maya, Blender) to a renderer.
{% </dek> %}
```

No wording was changed.

## Styling judgement (`sass/_components.scss`)

Added a `.dek` rule alongside the existing `.admonition`/`.marginnote`
rules:

```scss
.dek {
  font-family: var(--sans);
  font-size: 0.86em;
  color: var(--muted);
  margin: 0 0 calc(var(--body-lh) * 1em);

  p {
    text-indent: 0;
    margin: 0;
  }
}
```

Reasoning:

- **Sans-serif (`var(--sans)`), not serif or italic.** The body is serif
  and the standfirst right below it is already italic serif; giving the
  dek a third, unrelated treatment (upright sans) makes it visually
  distinct from _both_ neighbours at a glance, rather than blending with
  either. This mirrors how `.article-meta` and `.admonition-label`
  already use `var(--sans)` for "this is front matter/metadata, not
  prose" in this design system.
- **Muted (`var(--muted)`), smaller (`0.86em`).** Reads as secondary to
  the body text, consistent with `.admonition` (`0.92em`) and
  `.marginnote` (`0.72em`, `var(--muted)`) — I picked a size between the
  two, since a dek is closer to running prose than a margin note but
  still clearly not a body paragraph.
- **No border, no background.** The task explicitly rules out boxes and
  badges for this typography-led site; `.admonition`/`.abstract` use a
  box because they are call-out asides, but a dek is a lead-in, part of
  the reading order, not an aside — so it gets no border-left, no
  `var(--box)` background, nothing that would read as a UI chrome
  element.
- **`margin` uses only existing tokens** (`var(--sans)`, `var(--muted)`,
  `var(--body-lh)`) — no new magic numbers besides the `0.86em` size
  judgement call itself, which isn't a token-backed value in this
  codebase for any component (each component's font-size is its own
  hand-picked constant, e.g. `.admonition`'s `0.92em`).
- The `p` override (`text-indent: 0; margin: 0`) is defensive/consistent
  with the other components' own internal `p` resets, even though
  `.article-body p` already sets the same values globally.

The structural exclusion from `.article-body > p` needed **no CSS at
all** — it's entirely the markup shape (`<div class="dek"><p>` instead of
a bare `<p>`).

## Built-HTML evidence

`zola build --force`, then inspecting
`public/essays/nsi-vs-hydra-vs-riley/index.html`:

```
<div class="article-body"><div class="dek"><p>TL;DR: Hydra is <del>crap</del> a bad choice if you need to send data from a digital content creation app (DCC, e.g. Maya, Blender) to a renderer.</p>
</div>
<p><em>An architectural review for people who write <a rel="noopener external" target="_blank" href="https://en.wikipedia.org/wiki/Offline_rendering">offline renderers</a>, write exporters, or have to live with the result. ...</em></p>
```

- `.dek`'s `<p>` is nested one level inside a `<div>` — a descendant of
  `.article-body`, not a direct child. Confirmed.
- The next sibling of the `.dek` div, and the essay's first
  `.article-body > p`, is the standfirst (`<em>An architectural
review...`). Confirmed.
- `~~crap~~` rendered as `<del>crap</del>` inside the dek. Confirmed.

`zola check --skip-external-links` is clean.

## Test evidence

Added one test to `tests/components.test.mjs`
("the dek keeps the TL;DR out of .article-body's direct-child
paragraphs, so the standfirst gets the drop cap"). It builds the real
site, slices the HTML from `.article-body`'s opening tag, asserts the
`.dek` div is the very first child, then regex-matches the `<p>`
immediately following the `.dek` div's close and asserts that paragraph
contains "architectural review" and not "TL;DR".

- Baseline before this change: **141 passing**.
- After adding the component, the essay wrapping, and the new test:
  **142 passing, 0 failing.**

Teeth demonstrated: with the `dek` wrapper temporarily removed from
`content/essays/nsi-vs-hydra-vs-riley.md` (reverting the TL;DR line to a
bare paragraph), `node --test tests/components.test.mjs` failed exactly
this new test:

```
not ok 6 - the dek keeps the TL;DR out of .article-body's direct-child paragraphs, so the standfirst gets the drop cap
  error: "the dek must be .article-body's first child, ahead of any direct-child <p>"
  actual: <div class="article-body"><p>TL;DR: Hydra is <del>crap</del> ...
```

All 5 other tests in that file still passed. The content file was then
restored (`diff` against a pre-edit backup showed no changes), and the
full suite re-run clean at 142/142. `zola build`/`zola check` were also
re-run clean after restoring.

## What could not be confirmed

Per instructions, I cannot drive a browser, so I cannot confirm the
thing that actually matters visually: that the standfirst's text wraps
**beside** the drop cap (first glyph at the cap box's right edge,
vertically within the cap's span) rather than below it. What I _can_
confirm, and did:

- The structural precondition for the working cap-placement path is now
  met: the standfirst is `.article-body`'s first direct-child `<p>`,
  the same paragraph shape/selector-position that already renders
  correctly with a cap on other essays (per the task's own account, this
  is "the path that already works").
- Nothing in `dropcaps.js`, `toc-move.js`, or `static/js/lib/justif/**`
  was touched, so whatever behavior those files exhibit for a normal
  first-direct-child paragraph is unchanged and applies here unmodified.
- I did not and cannot verify float/wrap geometry in an actual layout
  engine.

## Files touched

- `templates/shortcodes/dek.html` (new)
- `sass/_components.scss` (added `.dek` rule)
- `content/essays/nsi-vs-hydra-vs-riley.md` (wrapped the TL;DR line)
- `CLAUDE.md` (documented the component and why it must not be
  simplified back to a plain paragraph)
- `tests/components.test.mjs` (added the structural-invariant test)
