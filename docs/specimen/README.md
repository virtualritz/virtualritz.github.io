# Typeface Bench

`typeface-bench.html` is the interactive specimen built during the planning
phase of the typography rebuild: body face, initial (drop-cap) face, size and
cap-line controls, plus an animated variable-font title.

It is preserved here because it is the reference implementation the site's
typography was designed against, and because it settled a real production bug
— justif refuses to justify a paragraph whose floated element is not a leading
direct child, which is why the drop cap markup puts the zero-size float first.

## Reading it

**Do not open it whole in an editor or a tool that loads the file into
context.** It is ~984 KB because Thunder VF is embedded as a base64
`@font-face`. That embedding is deliberate, not bloat: animating a variable
font's axes smoothly requires the face to be local, otherwise the animation
stutters against Skia's glyph cache. Grep it instead.

## What it is authoritative about

- The drop-cap markup: a zero-size `float: left` span as the paragraph's
  **leading direct child**, with the glyph absolutely positioned inside it.
- The animated title treatment.

## What it is *not* evidence for

Optical margins. Its only `justify()` call passes `hyphenate` and `onSkip`;
the string "protrusion" appears nowhere in it. Protrusion was verified
separately, on the live site.

Its `.spec` class is also where the design spec's "no `.spec` paragraph is
declined" wording comes from — that class exists only here, so read that
criterion as "no body paragraph is declined".

It is not part of the Zola build: `docs/` is outside `content/`, `static/`,
`templates/` and `sass/`, so nothing here is served. Move it to `static/` if
you ever want it published.
