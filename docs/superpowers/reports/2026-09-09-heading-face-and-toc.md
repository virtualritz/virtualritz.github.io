# Heading face switch and TOC spacing/size

Three changes, per the user's request: headings (including the post title)
now use the drop-cap face; the TOC gets a full line of space above it; the
TOC font is bigger.

## 1. Headings now use `var(--initial)` (Thunder VF)

`sass/_typography.scss`: the grouped `h1, h2, h3, h4` rule changed
`font-family: var(--serif)` → `font-family: var(--initial)`, i.e.
`"Thunder VF", "IM Fell English", var(--serif)` — the same stack the
hanging first-letter drop cap uses (`sass/_dropcaps.scss`). Sizes and rules
were left untouched: h1 40px/40px with the solid `0.8px #888` rule, h2
28px/28px uppercase with the dotted rule, h3 27px, h4 24px with no rule.

**Small-caps: dropped from h1, deliberately.** `static/fonts/manifest.json`
lists Thunder VF's only OpenType feature as `kern` — no `smcp`/`c2sc`. It
has no true small-cap glyphs, so `font-variant: small-caps` on a face
without that table falls back to the browser's faux small-caps: capital
letterforms uniformly scaled down for what were lowercase characters. That
synthesis is already visually rough on a well-behaved text face; on a
heavy display face built for large, dramatic glyphs (i.e. built to _be_
the drop cap) it would read worse, not better. The `-0.75px` letter-spacing
was tuned to balance EB Garamond's small-caps texture specifically and has
no basis carried over to a different face with small-caps removed, so it
came out too. h1 now renders in Thunder VF at whatever case the title is
written in, unadorned by spacing/case tricks — full stop, size and the
rule still carry its weight in the hierarchy.

**Weights: left as-is (h1 600, h2/h3/h4 700).** `sass/_fonts.scss` declares
Thunder VF's `@font-face` with `font-weight: 100 900` — the full variable
axis. 600/700 sit comfortably mid-range, nowhere near the axis extremes
where a display face is more likely to look odd (600 won't read as
anemic-thin, 700 won't be maxed into an over-black weight at 24–27px). No
numeric change seemed justified without a visual check, so I left the
existing hierarchy (h1 slightly lighter than the uppercase h2, matching
weight for h3/h4) in place — flag this as the one thing worth eyeballing,
since Thunder VF's optical weight at a given numeric value is unverified
by me.

## 2. Full line of space above the TOC

`sass/_layout.scss`: `#toc`'s `margin` top value changed from `0` to
`calc(var(--body-lh) * var(--body-size))` — i.e. `1.58 * 24px` ≈ 37.9px,
one full line of the _body_ text's own leading. It's deliberately not a
bare `em` on `#toc` itself: `#toc`'s own font-size is smaller than the
body's (see below), so an em-relative margin there would give a line of
the TOC's own (smaller) leading, not a full line of the paragraph text it
sits under — anchoring to `--body-size` keeps it tied to the surrounding
prose's rhythm instead. This mirrors the existing `p + p` paragraph-gap
formula (`calc(var(--body-lh) * 1em)`), just anchored to the body token
rather than the current element's own font-size.

## 3. TOC font size raised

`0.58em` → `0.75em` (against the 24px body: ~14px → 18px). Reasoning: 18px
is comfortably readable on its own, still clearly secondary to the 24px
body copy (25% smaller), and lands above the site's other small
secondary-text sizes (`.article-meta` at 0.62em ≈ 14.9px, table `th` at
0.86em ≈ 20.6px) rather than at the very bottom of that range. `#toc h2`
stays `1em` (relative to the new base, so it grows proportionally to
~18px, uppercase, tracked). The nested-numbering scheme
(`counters(toc, ".")`, `.9em` nested-list indent, `.3em` item spacing) is
entirely `em`-relative already, so it scales with the base size and stays
aligned — no changes needed there. At 285px `max-width` with 15px side
padding (255px content width), 18px sans-serif text still wraps
comfortably for typical heading text; nothing in the box's `max-width` or
padding needed to change.

## Test evidence

- `npm test`: **143 passing** (baseline 142 + 1 new test), 0 failing.
  - `tests/typography.test.mjs`: renamed/rewrote the h1 test (was "h1 is
    small-caps…") to assert the grouped heading rule now carries
    `font-family:var(--initial)` and that h1 does **not** carry
    `font-variant: small-caps`/`font-variant-caps: small-caps`, while
    still pinning the solid/dotted rules on h1/h2.
  - `tests/layout.test.mjs`: added a test asserting `#toc`'s margin uses
    `calc(var(--body-lh)*var(--body-size))` and that its font-size is
    `>= 0.7em` (comfortably above the old 0.58em).
  - Assertions written tolerantly against Zola's compressed CSS output
    (verified against the actual `public/style.css`: no quotes stripped
    here since none were present, leading zero on `.8px` already
    accounted for by existing tests).
- `zola build`: clean, 4 pages / 2 sections, no errors.
- `zola check --skip-external-links`: clean.
- `static/js/**` untouched (verified via `git status`/`git diff --stat`);
  no vendored `justif` files touched.

## What to check visually

1. **The essay title** (h1) and all headings — do they render in Thunder
   VF (a distinct display face from EB Garamond body text), matching the
   drop cap's face?
2. **h1 small-caps removal** — confirm the title now reads in plain
   mixed/title case, not as small caps, and that this reads better than
   faux-synthesised small caps would have. If you actually want some
   textural distinction back (e.g. uppercase like h2, or tracked caps),
   say so — that's a follow-up choice, not implied by this change.
3. **Heading weights** — h1 at 600, h2–h4 at 700, all in Thunder VF's
   variable axis. Check none of these look too thin or too heavy/blobby
   at their sizes (40/28/27/24px); I picked these by axis range reasoning
   only, not by looking at rendered glyphs.
4. **TOC spacing** — confirm there's now a visible full line of air
   between the paragraph above and the TOC box, rather than the box
   sitting hard against the text.
5. **TOC font size** — confirm 18px reads as comfortably legible but
   still secondary to the 24px body, and that nested numbering
   (`1`, `1.1`, `1.2`, …) still lines up cleanly against the larger text.
