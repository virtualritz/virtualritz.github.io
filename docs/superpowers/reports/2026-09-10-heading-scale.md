# Heading scale: lighter, 30% larger

Request: "fonts for headlines: lighter variant, 30% larger." Applies to
`#article h1`-`h4` in `sass/_typography.scss` (Thunder VF, `var(--initial)`).
Everything else — rules, `text-transform: uppercase` on h2, colours,
margins, `#article` scoping — is unchanged.

## Sizes

Each old size × 1.3, rounded to a whole pixel (no reason to ship a
fractional value the browser would round anyway):

| Heading | Old  | ×1.3   | Chosen |
| ------- | ---- | ------ | ------ |
| h1      | 40px | 52px   | 52px   |
| h2      | 28px | 36.4px | 36px   |
| h3      | 27px | 35.1px | 35px   |
| h4      | 24px | 31.2px | 31px   |

`line-height: 1` on all four is unitless, so it scales with `font-size`
automatically — confirmed in the compiled `public/style.css`, no line-height
edits needed.

Rhythm against the 37.92px body leading (`--body-lh` 1.58 × `--body-size`
24px): h1 at 52px is already well above a full body line, same relationship
as before (40px vs 37.92px), just proportionally larger. h3/h4 (35px/31px)
sit close to or just above one body line, which is the same relative
position they held pre-rescale. Nothing here changes the _relationship_
between heading levels or between headings and body text, only the absolute
scale — so if the old rhythm was defensible, this is too. I cannot verify how
it actually reads without a browser (see Not confirmed).

## Weights

Checked `static/fonts/manifest.json` first: Thunder VF's `weight` field is
`"100 900"` — the full registered `wght` range, TrueType variable font,
`unmodified: true`. Because `wght` is a registered axis, plain CSS
`font-weight` maps directly onto it; `font-variation-settings` isn't needed
(and would be redundant/lower-specificity-fighting with `font-weight` for a
registered axis).

| Heading | Old | New | Reasoning                                                |
| ------- | --- | --- | -------------------------------------------------------- |
| h1      | 600 | 300 | Owner's suggested value; comfortably inside 100-900.     |
| h2      | 700 | 400 | Owner's suggested value.                                 |
| h3      | 700 | 400 | Same step as h2 — h3/h4 have always matched h2's weight. |
| h4      | 700 | 400 | Same as h3.                                              |

This preserves the pre-existing relationship: h1 is one step lighter than
h2-h4 (300 vs 400), same as it was one step lighter before (600 vs 700).

## TOC heading

`#toc h2` (`sass/_layout.scss`) sets its own `font-size: 1em` — 1em of the
TOC's own `0.75em` context, i.e. 18px off the 24px body size — and doesn't
inherit from `#article h2`. Checked cascade order in the compiled
`public/style.css`: `#toc h2` and `#article h2` have equal specificity (one
ID + one type selector each), and `#toc h2` appears later in the stylesheet,
so it wins. Confirmed via `zola build` that the compiled TOC rule is
unchanged: `#toc h2{font-size:1em;text-transform:uppercase;...}` — no 36px
leak. This was already true before the change; the rescale doesn't disturb
it.

The site title in `templates/base.html` was checked and doesn't reference
`h1`/`h2` inside `#article` at all (it's outside that scope), so it's
unaffected.

## Test updates

`tests/typography.test.mjs` had no existing pixel/weight assertions for
h1-h4 (the pre-existing heading test only checked font-family, absence of
small-caps, and the solid/dotted rule styles) — added a new test,
"headings are 30% larger than the pre-rescale sizes and lighter in weight",
pinning all four `font-size`/`font-weight` pairs. Tolerant of Zola's
compressed CSS (no unit-stripping concern here since none of the new pixel
values are `0.x` decimals, so no leading-zero handling was needed).

One wrinkle: `#article h4{` also occurs as the tail of the grouped
shared-properties selector (`#article h1,#article h2,#article h3,#article
h4{...}`), since h4 is last in that comma list and is followed directly by
`{`. A naive `c.match(/#article h4\{([^}]*)\}/)` matched that grouped block
instead of the standalone h4 rule. Fixed with a negative lookbehind,
`(?<!,)#article h4\{`, to skip past the comma-preceded false match. h1-h3
don't have this problem since each is followed by `,` inside the group, not
`{`.

**Verified the new test has teeth**: temporarily reverted h1's `font-size`
to `40px` in `sass/_typography.scss`, reran `node --test
tests/typography.test.mjs` — the new test failed (`AssertionError: The input
did not match /font-size:\s*52px/`) — then restored `52px` and reran; back
to green.

```
$ npm test
...
# tests 188
# pass 188
# fail 0
```

Baseline was 187; net +1 (the new heading-scale test). No other test needed
changes — none of the others assert h1-h4 pixel sizes or weights.

## Build/check

- `zola build` — clean, 3 pages / 2 sections, no errors.
- `zola check --skip-external-links` — clean, no broken links/refs.

## Not confirmed

I cannot drive a browser, so I have not verified: how the lighter weight
actually reads at the larger size, whether the TOC visually looks right,
or whether any long article/section title wraps awkwardly or forces
horizontal scroll at 52px h1 / 36px h2. The CSS numbers above are correct
by construction and by the compiled `style.css`, but the owner's own visual
check is the real verification for readability and overflow.
