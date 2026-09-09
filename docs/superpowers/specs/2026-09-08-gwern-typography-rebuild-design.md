# Design: gwern.net-faithful typography rebuild

Date: 2026-09-08
Status: approved for planning
Repo: `virtualritz/virtualritz.github.io`

## 1. Goal

Replace the site's presentation layer with a faithful reconstruction of
gwern.net's typography, written from scratch, and exceed it where the web
now permits — specifically in line breaking and optical margins, which
gwern.net does not do.

### Scope

**In:** complete replacement of `sass/` and `templates/`. Type system,
layout, drop caps, sidenotes, link popups, collapsible sections,
admonitions, dark mode, floated table of contents, punctuation pipeline.

**Out:** replacing placeholder content (separate task; one demo page will
exercise every feature). Also out: gwern's link icons,
inflation-adjustment, date subscripts, AI-generated image drop caps,
generated backlinks.

**Non-goal:** matching gwern.net where it is worse. See §4 and §7.

## 2. Decisions

| Question      | Decision                                                           |
| ------------- | ------------------------------------------------------------------ |
| Fidelity      | Faithful clone of gwern.net's look and mechanics                   |
| Provenance    | Written fresh; gwern.net measured as reference, no code copied     |
| Zola          | Upgrade 0.18.0 → 0.23.4 as a prerequisite                          |
| Justification | `justif` (Knuth–Plass), MIT, self-hosted                           |
| Body serif    | **EB Garamond at 24px/38px**                                       |
| Headline face | Thunder VF, animated on `wght`                                     |
| Initial face  | Thunder VF, weight solved to a stroke ratio                        |
| Popups        | Fetch-and-extract, plus `data/annotations.toml` for external links |
| Sidenotes     | JS hoist from Zola's collected footnote section                    |

### Prerequisite: Zola upgrade

Zola 0.18.0 emits footnote definitions **inline where they were written**:

```html
<p>
  Text with a note<sup class="footnote-reference"><a href="#1">1</a></sup
  >.
</p>
<div class="footnote-definition" id="1">…</div>
<!-- sits mid-article -->
```

Zola 0.19+ collects footnotes into a bottom section with backrefs. That is
both the correct no-JS fallback and a clean source for the sidenote hoist,
so the upgrade is a prerequisite rather than an improvement.

```
cargo install zola --locked      # 0.18.0 → 0.23.4
zola build                       # resolve any config/template breakage
```

Verify: footnotes render as a collected list with backrefs.

## 3. Measured reference values

Taken from `gwern.net/dnm-archive` in light mode via computed styles, not
from memory.

|              | Value                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ground / ink | `#fff` / `#000`; boxes `#f8f8f8`; rules `#ccc`–`#888`                                                                                                                             |
| Column       | `main` max-width **935px**, 20px padding → **895px** measure                                                                                                                      |
| Body         | Source Serif 4, **20px/32px** (1.6), justified, `hyphens:auto`, `oldstyle-nums`                                                                                                   |
| Paragraphs   | `margin: 0`, `text-indent: 50px` (2.5em); first paragraph `0`                                                                                                                     |
| h1           | 40px/40px, 600, `small-caps`, `letter-spacing:-0.75px`, solid `0.8px #888` rule                                                                                                   |
| h2           | 28px/28px, 700, `uppercase`, **dotted** `0.8px #888` rule                                                                                                                         |
| h3 / h4      | 27px / 24px, 700, no rule                                                                                                                                                         |
| Links        | `#333`, no `text-decoration`; gradient dotted underline + 7 zero-blur `text-shadow` cutouts in `#f8f8f8`, `background-size: 2px 1px`, `background-position: 0 calc(100% - 1.9px)` |
| TOC          | `float: left`, max-width **285px**, `#f8f8f8` on `0.8px #ccc`, Source Sans 3, 45px right margin — **inside the article**, not a sidebar                                           |
| Sidenotes    | Two absolute columns `#sidenote-column-{left,right}`; footnotes converted to `div.sidenote#snN`, JS-positioned against `a.footnote-ref#fnrefN`                                    |
| Drop cap     | `<span class="dropcap">` inside a link; Kanzlei Initialen 140px/140px, `float:left`, `margin-bottom:-35px`, `#191919`; face chosen per page by a `dropcaps-*` body class          |

### What gwern.net does _not_ do

Measured, not assumed:

- **No optical margin alignment, either edge.** 1131 blocks measured: 78
  blocks starting with `T` all sit at offset `0.00`; `V` (8), `W` (7),
  `Y` (4) likewise; opening curly quotes across 205 blocks are flush or
  _inset_. The only negative offset in the scan is the drop cap's own
  `margin-left: -2.8px`.
- **No hanging punctuation.** Chrome has never implemented
  `hanging-punctuation` (`CSS.supports` false for every value; computed
  value empty). Every justified line terminates at exactly the content-box
  edge, including lines ending in a comma.
- **Hyphens cannot protrude in any browser.** No CSS property does it;
  hyphen protrusion is a TeX microtype feature (`\pdfprotrudechars`).

This is the gap we close with `justif` (§7).

## 4. Type system

All faces **self-hosted from upstream releases**, subsetted with
`--layout-features='*'`. Google Fonts' served webfonts strip most
OpenType features, so the CDN is not an option.

### Body serif: EB Garamond (OFL-1.1)

Chosen because it is the only credible candidate with swash capitals.
Feature audit of eight faces, substitution counts from the binaries:

```
face           glyphs  cmap   smcp c2sc pcap dlig hlig swsh salt titl hist
EB Garamond      3247  2091     ●    ●    ●   12    1    ●    ·    ·    ●
Junicode         6063  3685     ●    ●    ●   10   45    ·    ●    ·    ·
Vollkorn         2281  1240     ●    ●    ·    8    1    ·    ●    ●    ●
Cormorant        3251   974     ●    ●    ·   14    2    ·    ·    ·    ·
Alegreya         2172  1254     ●    ●    ·    5    0    ·    ·    ·    ·
Spectral         1480   878     ●    ●    ·    3    0    ·    ·    ·    ●
Source Serif 4   1464   920     ●    ●    ·    0    0    ·    ·    ·    ·
Crimson Pro       833   690     ·    ·    ·    2    0    ·    ·    ·    ·
```

Two facts that shape usage:

- **The swashes live in the italic.** `swsh` covers only `Q` in the roman
  (3 substitutions) but all 26 capitals in the italic (26 substitutions).
  Swash caps are therefore an italic device — epigraphs, pull quotes,
  display lines — not something the roman body gives you.
- **Junicode is the richer face for historical ligatures** (45 `hlig`
  substitutions against EB Garamond's 1) and has the widest coverage. It
  is the fallback if swashes prove less important than scholarly apparatus.

### Body size: 24px/38px

EB Garamond has a small x-height, so it sets noticeably smaller than
Source Serif 4 at the same pixel size:

```
face           x/em    x-height @20px    px to match Source Serif 4
Source Serif 4  0.475       9.5px        — (baseline)
Vollkorn        0.458       9.2px        20.7px
Alegreya        0.452       9.0px        21.0px
Spectral        0.450       9.0px        21.1px
Junicode        0.415       8.3px        22.9px
EB Garamond     0.400       8.0px        23.8px   ← 19% smaller
Cormorant       0.386       7.7px        24.6px
```

**Decided: EB Garamond at 24px/38px.** The swash capitals and petite caps
are worth the resize, and at 24px on a light ground the face is at its
best.

The measure needs no change, which was not obvious. Average character
width, weighted by English letter frequency and including spaces:

```
Source Serif 4 @20px   avg char 8.93px   →  895px = 100.2 characters
EB Garamond    @24px   avg char 9.05px   →  895px =  98.9 characters
```

EB Garamond at 24px is within 1.3% of Source Serif 4 at 20px, so gwern's
895px measure carries over unchanged and reproduces its line length.

Worth recording: that line length is **~100 characters**, well beyond the
conventional 65–75 guideline. Matching gwern.net here is a deliberate
choice to be faithful, not an endorsement of the measure. The 1.6
line-height is what makes it readable.

### Supporting faces

- **Source Sans 3** — UI, metadata, TOC (matches gwern)
- **IBM Plex Mono** — code
- **Thunder VF** — headlines and initials (§5)

Subset unicode range must include the full space repertoire — see §8.

### Thunder (freeware, Rajesh Rajput)

The embedded name table says "Free for personal use only" but the shipped
EULA supersedes it: _"This typeface is freeware, you can use it freely for
personal and commercial projects. The typeface files may not be modified
without written permission."_

**Therefore Thunder ships unmodified.** No subsetting, no format
conversion. The download already provides `Web-PS/`, `Web-TT/` (WOFF2) and
`Variable-TT/Thunder-VF.ttf` (101 KiB), so this costs nothing.

Thunder-VF axes, and the answer to what HC/LC mean:

```
wght  100 … 900   (default 900)
CNTR    0 … 100   ← HC and LC are the two ends of this axis, not two designs
ital    0 …  14   continuous slant, not a separate italic
36 named instances · no avar
```

Each axis is a **single 2-master tuple** (wght peak at normalised −1, CNTR
and ital at +1). Every instance is therefore exactly

```
outline(w, c, i) = base + tw·Δwght + tc·ΔCNTR + ti·Δital
```

which matters for §5.

### Initial faces

Thunder VF is the primary. Twelve static OFL alternatives are available:
IM Fell English, Astloch, Uncial Antiqua, Grenze Gotisch, Unifraktur
Maguntia, Unifraktur Cook, Almendra Display, Cinzel Decorative, Eagle
Lake, Federant, Pirata One, Fruktur.

Framed ornamental initials in OFL are scarce; most free ones are the Peter
Wiegel faces gwern already uses. Verify each licence before vendoring —
Cheshire Initials in particular appears to be personal-use only.

## 5. Headlines: animated variable axis

Headlines use Thunder VF with `wght` animated per letter, phase-offset so
the weight travels through the word as a wave. Controls: axis
(`wght`/`CNTR`/`ital`), frequency, amplitude, phase spread.

### Rendered as SVG outline geometry, not CSS text

Skia — which Chrome uses — quantises cached glyph rasters to **0.25 px
horizontally and 1 px vertically**. Animating `font-variation-settings`
therefore snaps and jitters, and letters dance vertically.

Because Thunder's axes are 2-master (§4), the exact outline for any
instance is a linear combination of a base and three delta sets. Verified:
contour structure and point counts are **identical across all weights**
(`O` 15 ops, `N` 13, `T` 9, `Y` 11, `P` 16, `G` 22, `R` 24, `A` 14,
`H` 13 at every sampled weight), so path interpolation is safe.

The complete 3-axis model for the 9 glyphs of a headline is **7,370
bytes**. Per frame, interpolate points and rewrite `d` on one `<path>` per
letter: geometry with analytic antialiasing, no glyph cache, no snapping.

Two constraints found while building it:

- **Lay letters out on fixed advances** taken from the mid-axis instance.
  A glyph's advance changes with its weight, so animating on real advances
  makes the word breathe and slide sideways.
- **Accessibility:** paths are not text. Ship a visually-hidden real
  heading alongside the SVG for selection, copy/paste, find-in-page and
  screen readers, and mark the SVG `aria-hidden`.

SVG `<text>` was considered and rejected: it is selectable and copyable,
but Chrome rasterises it through the same glyph cache, so it does not solve
the jitter — and it does not line-wrap.

`prefers-reduced-motion` slows the animation substantially rather than
stopping it. Note that on this machine
`org.gnome.desktop.interface enable-animations` is `false`, which is what
Chrome reports as `reduce`.

## 6. Drop caps

Derived from glyph ink, not tuned constants. Canvas supplies both the ink
bounds (`actualBoundingBox*`) and the metrics the browser uses for line
layout (`fontBoundingBox*`).

```
L          = body line-height in px
b1         = (L − (fbAsc + fbDesc))/2 + fbAsc      body baseline within line 1
capInk     = ink ascent of "H" in the body face
boxH       = (n−1)·L + capInk                      classic drop-cap box
S          = boxH / (inkAscent + inkDescent)       "total ink" fit  ·  × (1 + grow)
inkTop     = (b1 − capInk) + capDrop·boxH
kNeed      = ceil((inkBottom − capTop)/L − 0.04)   lines the float must occupy
top        = inkTop + inkAscent − ((S − (fbAsc+fbDesc))/2 + fbAsc)
```

Notes, each of which was a bug first:

- **Fit total ink, not ink-above-baseline.** Sizing so the ascent alone
  fills the box makes descender letters oversized and hangs the tail into
  the next line, forcing an extra indented line.
- **`kNeed` needs hysteresis.** Without the `0.04` slack, sub-pixel noise
  from browser zoom flips `ceil()` across an integer boundary and the
  reserved line count oscillates between 3 and 4.
- **Horizontal: leave the glyph origin at the column edge.** Do not flush
  the ink. Swash initials should overhang left; that reads correctly.
- **Gutter** to the body text is generous — start at `0.7em` of body size.

### Stroke matching for variable initials

Stem weight is measured by rasterising the glyph and scanning one pixel row
at 45% of ink height above the baseline, where `l` and `J` are pure stem
with serifs above and below. Measured at a large reference size, then
scaled, because a stem at 24px is under two pixels.

Thunder's `wght` is then binary-searched so
`capStem / bodyStem = strokeRatio`. **Absolute equality is wrong** — a
drop cap matching body stroke reads anaemic. IM Fell English's `J`
measures **5.23× the body stem** (8.9px vs 1.70px) and reads well, so the
default target is `5.0×`, tunable.

## 7. Justification: justif

`justif@0.9.1`, MIT, self-hosted from `dist/`. Replaces browser
justification with Knuth–Plass whole-paragraph line breaking, TeX
hyphenation, character protrusion, hanging punctuation, variable-font
`wdth` expansion and tracking. **56 KiB gzip** (151 KiB raw); the 2.3 MB
npm figure is hyphenation patterns for nine languages, loaded on demand.

Chosen over `@liiift-studio/opticalmargin` (2 KiB gzip) because that
library cannot fix the actual complaint: it locks to the browser's line
breaking and only sees DOM text, so a hyphen generated by `hyphens: auto`
is invisible to it. It also injects `<br>` per visual line, which its own
README notes breaks copy/paste.

justif protrudes its own inserted hyphens, preserves selection, copy and
find-in-page, and explicitly handles _"sharp (zero-blur) vertical-only
underline shadows"_ — precisely gwern's link underline technique.

### Integration findings

All three were discovered by building it, and all three are load-bearing:

1. **justif declines elements with no layout box** — reported as
   `<p> → not rendered`. In a frame that is parsed before it is given
   geometry, every paragraph is declined. Gate the call on a real
   bounding box (rAF poll until `width > 10`), not on `DOMContentLoaded`.
2. **justif declines a padded `<span>` with no text content** — reported
   verbatim. This rules out wrapping a bare space to widen it (§8).
3. **Do not add a `ResizeObserver`.** justif already has
   `observeResize: true`. Observing the container feeds justif's own
   height changes back in as a relayout trigger, which at some zoom levels
   settles into a two-state oscillation — a visible flicker.

Sidenote positioning must run **after** `controller.ready`, because justif
changes paragraph heights and therefore reference geometry.

## 8. Punctuation pipeline

Zola's `smart_punctuation = true` already produces the right codepoints.
Verified against a real build:

```
markdown            →  html
Knuth--Plass        →  Knuth–Plass      U+2013 EN DASH
Knuth---Plass       →  Knuth—Plass      U+2014 EM DASH
Knuth-Plass         →  Knuth-Plass      U+002D unchanged
1965--1970          →  1965–1970
...                 →  …                U+2026
"quotes" 'single'   →  “quotes” ‘single’
```

So authors type `--` for an en dash. The build pass adds only _spacing_.

### Em dash spacing: CSS, not space characters

Unicode space characters are not a portable unit. Advance widths as a
percentage of each face's own word space:

```
                  SrcSerif  EBGar  Junicode  Vollkorn  Alegreya  Spectral  Cormorant  Crimson
punctuation space  ·absent   114%     105%      100%      120%      100%       126%     122%
thin space             54%    50%      41%       50%       66%       50%        85%      83%
hair space             18%     5%       4%       25%       40%       10%        50%      26%
six-per-em             72%    83%      69%    ·absent   ·absent   ·absent        71%  ·absent
narrow nbsp            54% ·absent     80%      100%   ·absent   ·absent        85%  ·absent
```

Thin space varies 2.1× across faces; hair space 12.2× (0.010 em in EB
Garamond — effectively invisible). U+202F is absent from EB Garamond,
Alegreya, Spectral and Crimson Pro. Punctuation space is the most
_consistent_ (1.3× spread) but the wrong _size_: it is 100–126% of a word
space, i.e. never tighter than a full space.

Therefore: dashes are set **closed up** in the markup and spaced in CSS.

```html
word<span class="emd">—</span>word
```

```css
.emd {
  padding-inline: 0.1em 0.06em;
}
```

- `padding`, not `margin` — justif accounts for inline padding.
- **Left wider than right** (0.10em / 0.06em) by eye. Measurement shows the
  dash glyph is optically centred in its advance in all eight faces
  (LSB = RSB everywhere), so the perceived asymmetry comes from the
  letter pair either side, which a fixed margin cannot correct. Both sides
  stay independently tunable.
- **Breaks stay open on both sides.** Em dash is line-break class B2 in
  UAX #14 (break opportunity before _and_ after) with no space characters
  needed, so no word joiner and no `nowrap`. The dash may begin a line;
  this is accepted.

### English spacing

A wider space after a sentence-ending period. Detection uses TeX's rule —
a period after a lowercase letter or digit ends a sentence; after a capital
it is an initial — plus an abbreviation guard (`Mr`, `Dr`, `e.g`, `i.e`,
`etc`, `Fig`, `Vol`, `al`, `approx`, …).

The extra width is `padding-inline-end` on a span wrapping **the
punctuation**, not the space:

```html
office<span class="sg">.</span> The
```

```css
.sg {
  padding-inline-end: 0.09em;
}
```

This keeps the word space itself as pure stretchable glue for Knuth–Plass,
and avoids justif's refusal of whitespace-only padded spans (§7.2).

### Font subset requirement

Subsets must include the space and dash repertoire actually used, not just
Latin: `U+2000–2015`, `U+202F`, `U+205F`, `U+2060`, `U+FEFF`. An earlier
subset omitted these and the inserted spaces silently fell back to another
face at the wrong width.

## 9. Architecture

One base template, one stylesheet entry. The previous attempt failed
primarily because it had two of each fighting one another:
`gwern-style.scss` did `@import 'style'` and then overrode it, and
`base.html`/`base-gwern.html` were parallel forks.

```
sass/
  main.scss            entry; @use the partials below
  _tokens.scss         colour, type scale, spacing, measure
  _reset.scss
  _typography.scss     body, headings, lists, quotes, tables, code
  _dropcaps.scss
  _layout.scss         main column, floated TOC, sidenote columns
  _links.scss          gradient underline + shadow cutout
  _sidenotes.scss
  _popups.scss
  _components.scss     admonitions, <details>, metadata block
static/js/
  theme.js             manual toggle over prefers-color-scheme
  punctuation.js       em-dash and sentence-space marking (pre-justif)
  typography.js        justif init; exports a ready promise
  headline.js          Thunder VF outline animation
  dropcaps.js          ink-measured initials
  sidenotes.js         awaits typography.ready
  popups.js
static/fonts/          self-hosted woff2 (Thunder unmodified)
templates/
  base.html            single base
  index.html  section.html  page.html
  taxonomy_list.html  taxonomy_single.html
  shortcodes/{admonition,collapse,marginnote}.html
data/
  annotations.toml     external-link annotations for popups
  thunder-paths.json   headline outline deltas (7 KB)
```

Delete: `sass/style.scss`, `sass/gwern-style.scss`, all eight files in
`templates/`, `.hugo_build.lock` (stale Hugo artifact), empty `themes/`.

`.gitignore`: `public/`, `.hugo_build.lock`, `.claude/settings.local.json`.

### Module ordering

Load order is enforced by imports, not by luck. Every module is a no-op
when its DOM hooks are absent.

```js
punctuation.js   →  mark dashes and sentence ends      (mutates text)
typography.js    →  justif, gated on a real layout box (measures text)
await ready
dropcaps.js      →  ink measurement, float sizing
sidenotes.js     →  position against final geometry
headline.js      →  independent
popups.js        →  independent
```

## 10. Layout

```
┌─ main (max 935px, centred) ────────────────┐
│  nav · title · metadata block              │
│  ┌TOC 285px┐  ┌abstract box┐               │
│  │ float:   │  │ #f8f8f8    │              │
│  │ left     │  └────────────┘              │
│  └──────────┘  body text …                 │
└────────────────────────────────────────────┘
   #sidenote-column-left    #sidenote-column-right
   (absolute, outside main, ≥1400px only)
```

The TOC floats inside the article. Putting it in a left sidebar was the
previous attempt's layout error.

**Light is `:root`;** dark is the `prefers-color-scheme` and
`[data-theme]` override. The previous attempt had this inverted, which
changed the whole character of the site.

## 11. Sidenotes

Zola 0.23 emits a collected `<ol>` with
`<sup><a href="#fn1" id="fnref1">`. `sidenotes.js` hoists each `<li>` into
`div.sidenote#sn1`, appends to the left/right column alternating by index,
sets `top` from `fnref1`'s rect, then resolves collisions by pushing each
note down to clear its predecessor.

Below 1400px the columns are hidden and the native footnote section shows.
Without JS: the same. This is genuine graceful degradation — a reader
without JS gets a fully typeset article with footnotes at the bottom.

## 12. Popups

`page.html` marks same-site links `a.internal`. On hover (150ms delay)
`popups.js` fetches the target, extracts `#markdownBody`'s header and
first ~200 words, or for `#anchor` links the heading's subtree. Cached per
URL in a `Map`. Positioned edge-aware and pinnable.

External links matching an entry in `data/annotations.toml` get
`data-annotated` stamped at build time and show that annotation instead.
Un-annotated external links get no popup.

Without JS, links are just links.

## 13. What works without JS

|                                                                                      |                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Typography, palette, measure, justification, drop caps, small caps, oldstyle figures | pure CSS                                                |
| Floated TOC                                                                          | Zola-generated + CSS                                    |
| Collapsible sections                                                                 | native `<details>`/`<summary>`                          |
| Admonition boxes                                                                     | shortcode + CSS                                         |
| Dark mode following the OS                                                           | `prefers-color-scheme`; only the manual toggle needs JS |
| Sidenotes                                                                            | degrade to footnotes                                    |
| Knuth–Plass, optical margins, popups, headline animation                             | degrade to native rendering / plain links               |

## 14. Verification

1. `zola build` clean; `zola check` clean after the four placeholder links are fixed
2. One demo page exercising drop cap, sidenotes, popup, collapse, admonition, table, code block, swash italic, English spacing, em dashes
3. Screenshot comparison against gwern.net at 1440px, light and dark
4. JS disabled: readable, footnotes at bottom, plain links, no layout break
5. 375px viewport: no horizontal scroll
6. Browser zoom swept 50%–200%: no flicker, no oscillating drop-cap line count
7. Measured check that `T`-initial paragraphs protrude left — the thing gwern.net does not do
8. justif reports every `.spec` paragraph managed, none declined
9. Headline animation holds 60fps with a median frame cost under 4ms

## 15. Open questions

1. **Deployment.** The remote `master` carries two commits from 2020 (a
   WASM test: `index.html` + `tour/`) which is what
   `virtualritz.github.io` currently serves. Decide whether the Zola site
   replaces it, and whether Pages serves from a workflow, `docs/`, or a
   `gh-pages` branch. No `.github/workflows/` exists yet.
2. **Font licences** to verify before vendoring: each initial face
   individually; Cheshire Initials appears to be personal-use only.
3. **Does justif stretch a thin space as a word space?** Relevant if we
   ever reintroduce space characters; currently moot because spacing is
   CSS padding.
4. `content-visibility: auto` on paragraphs — worth it given justif's
   placeholder-height handling?

## 16. Reference

- Typeface bench (live, all measurements reproducible):
  <https://claude.ai/code/artifact/40c8668a-c917-4189-b81e-74c30a2d0f77>
- justif: <https://github.com/lyallcooper/justif> (MIT)
- gwern.net source: <https://github.com/gwern/gwern.net> (reference only;
  no code taken)
