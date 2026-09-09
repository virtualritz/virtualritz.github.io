+++
title = "Setting this site"
date = 2026-09-08
description = "How the type on this site is set, and the measurements behind it."

[taxonomies]
tags = ["typography", "web"]
+++

_Every typographic device this site has, on one page, so a change that
breaks one of them is visible immediately. The opening paragraph runs to at
least three lines on purpose: that is the depth the drop cap reserves, and a
shorter one would leave the initial overhanging into whatever follows it._

---

## Body text

Justified text is the whole difficulty. A browser breaks one line at a
time, so a locally acceptable break can force the next line loose, opening
rivers of whitespace down the column. Knuth--Plass weighs the paragraph
whole and the difference shows inside the first five lines of any
figure-heavy passage.

This paragraph is indented rather than spaced, which is how books have set
continuous prose for five centuries. The first paragraph of a section is
flush; every one after it is indented by 2.5em. There is no vertical gap,
because the indent already says "new paragraph" and the gap would say it
twice.

Sentences end with a slightly wider space than the words inside them---
English spacing, and the extra width comes from CSS rather than a Unicode
space character, because those are not a portable width.

## Small caps, figures and ligatures

Real small caps, not synthesised: <span class="small-caps">nasa</span> and
<span class="small-caps">ascii</span>. Oldstyle figures sit in the text at
x-height: 1863, 1,024, 39. Tabular lining figures are used in tables.
Ligatures resolve in office, fluffier, and flagstaff.

## Notes in the margin

Footnotes become sidenotes where there is room for them[^1], and stay
footnotes where there is not[^2].

Not every note in the margin is a citation{% <marginnote> %}A margin note is authored, not derived from a footnote. It has no reference mark.{% </marginnote> %} — some are simply written there.

## Structures

{% <admonition kind="note"> %}An admonition. Uses no JavaScript.{% </admonition> %}

{% <admonition kind="warning" label="Careful"> %}A second kind, for things that bite.{% </admonition> %}

{% <collapse summary="A collapsible section"> %}
This is a native `<details>` element, so it works with JavaScript
disabled and is keyboard accessible without any help from us.
{% </collapse> %}

> A blockquote, for when someone else said it better. The rule on the left
> is 2px; the text is set at the muted colour rather than full ink.

| Face           |  x/em | Glyphs | Swashes |
| -------------- | ----: | -----: | :-----: |
| EB Garamond    | 0.400 |  3,247 |   yes   |
| Vollkorn       | 0.458 |  2,281 |   no    |
| Source Serif 4 | 0.475 |  1,464 |   no    |

```rust
// Code is set in IBM Plex Mono, left-aligned, never justified.
fn measure(face: &Font, size: f32) -> f32 {
    face.average_advance() * size
}
```

[^1]:
    On a wide viewport this note sits in the margin, vertically aligned
    to its reference, in one of two columns.

[^2]:
    Below 1400px the margins disappear and Zola's collected footnote
    section is what you are reading now.
