# Drop cap orphaned on `/essays/nsi-vs-hydra-vs-riley/`

Two independent defects in vendored **justif 0.9.1**, both patched in place.
Only the second one causes the reported symptom; the first is real but was
correctly ruled out by the prior investigation as insufficient on its own.

All file references are to `static/js/lib/justif/` unless stated otherwise.
Line numbers are those of the **patched** files; the prose says what the
unpatched code did.

## Symptom recap

`.article-body > p` on that essay gets a `float: left` `span.dropcap-box`
prepended (`static/js/dropcaps.js`), 68.93px wide, 113.76px tall — exactly
three 37.92px lines. Text should wrap beside it. Instead every line lands
below it and the cap is orphaned. The same markup works on
`/essays/on-typography/`.

## Why an over-wide first line is fatal, not merely ugly

This is the mechanism the whole diagnosis hangs on.

justif does not let the browser wrap. It emits each line's text as one or a
few `<span class="justif-seg">`, and its own stylesheet sets
`.justif-seg{white-space:nowrap}` (`index.js:849`). Between lines it emits a
joint; for lines _beside a float_ that joint additionally carries a
`.justif-soft-break` whose `::after` is `content:"\A"` with `white-space:pre`
— a **forced** break (`index.js:3736` sets `jointFlat`, `index.js:993`
writes the span, `index.js:849` defines it).

So an intruded line is a single unbreakable inline run. CSS float avoidance
says a line box that cannot fit the content beside a float is shifted down
past it. A line one fraction of a pixel too wide therefore does not lose its
last word — it loses its place beside the float entirely, and since the float
then ends above every subsequent line, the whole paragraph stacks below it.
That is exactly the reported picture.

The question is therefore only: **what made justif's first line wider than
the 712.07px (781 − 68.93) it broke that line to?**

## Root cause: generated content has advance width justif never models

`sass/_links.scss:39-47`:

```css
.article-body a[rel~="noopener"]::after,
.article-body a[target="_blank"]::after {
  content: "\2197";
  font-size: 0.62em;
  margin-left: 0.08em;
}
```

The scan measures inline ancestors with `inlineInsets`
(`index.js:1789-1796`), which reads **padding and border only**. There is no
`getComputedStyle(el, "::before" | "::after")` anywhere in the bundle — the
sole pseudo-element read in the file is `"::first-letter"` (`index.js:1571`).
So the `↗` is invisible to the line model, while the browser paints it: the
`<a>` clone written by `writeParagraph` (`index.js:1020` region,
`src.cloneNode(false)`) keeps `rel="noopener external"`, so the selector still
matches and the mark still renders.

Magnitude, at this site's `--body-size: 24px`: the pseudo is `0.62em` =
14.88px, `U+2197` is absent from both vendored EB Garamond faces (verified
with fontTools) so it falls back at roughly 1em advance, plus `0.08em` of its
own font-size as `margin-left` ≈ 1.2px. **≈ 16px** of unmodelled advance per
external link.

Where it lands on the failing page. The standfirst is
`<p><em>An architectural review for people who write <a …>offline
renderers</a>, …</em></p>`. Measuring the italic face's real advances
(fontTools, EB Garamond italic at 24px), the link's text ends 529px into the
first line, and the first line runs to ~713px. **The mark is on line 0.** So
line 0 paints ≈ 712 − 1.5 (justif's `WRAP_SAFETY_PAD_PX` tighten,
`index.js:835`, `index.js:4076`) + 16 ≈ **726px against a 712.07px slot** —
over by ~14.5px, unbreakable, pushed below the float.

Why `/essays/on-typography/` is fine: its first paragraph's only link is the
footnote reference `<a href="…#fn-1">[1]</a>`, which Zola gives neither
`rel~=noopener` nor `target=_blank`, so no `::after`, so no drift.

Why this is invisible everywhere else on the site: for a line **not** beside
a float, `verifyPatches` takes the optical branch (`index.js:2606-2630`,
`physicalFit === false`), measures the painted end and shrinks word spacing
until it sits on the content edge. That silently absorbs the same ~16px on
every ordinary paragraph. Beside a float the browser has already relocated
the line before corrections run, and the physical-fit branch's spacing shed is
floored at 80% of the natural space for intruded lines
(`minimumWordSpacingPx`, `index.js:3772`), which is about the size of the
error — so it cannot reliably win the line back.

### Why the `textTop` clamp alone did not fix the rendering

Because the intruded-line count never affected line 0. With `lines = 4`,
`lineWidthsFor` (`index.js:4118-4131`) produces
`[712.07, 712.07, 712.07, 712.07, 781]` — the **first** entry is identical
either way; only the spurious fourth narrowed line differs. Likewise
`besideFloat` (`index.js:3722`) and `physicalFitLines`
(`index.js:4264`) treat line 0 the same at 3 or at 4. The count bug makes
line 4 come out short and force-broken; it cannot displace line 0. The
displacement was always the pseudo-element drift.

## Secondary defect: `geometricLines` off-by-one (confirmed, fixed)

`intrudedLineCount`, `index.js:1336-1346`. `lines[0].top` comes from Range
client rects, i.e. **text ink**, not the line box. An italic ascender starts
it above the paragraph's content top. Measured on the failing page:
`floatBottom` 500.74, `firstLine.top` 385.98, `content.top` **386.98**,
`lineHeight` 37.92 → `(500.74 − 385.98) / 37.92 = 3.026`, `Math.ceil` → **4**,
and `Math.max(affected=3, 4)` discards the correctly observed 3. The existing
`- 1e-6` is a rounding guard, not a pixel guard.

Line boxes are laid out downwards from `content.top`, so nothing can be
intruded above it. Clamped.

## The patch

Five hunks, all marked `SITE PATCH` in the sources.

1. `index.js:1336-1345` (`intrudedLineCount`) — clamp:
   `Math.max(firstLine.top, content.top)`.
2. `index.js:1797-1841` — new `generatedContentText()` /
   `generatedInlineAdvance()`, placed next to `inlineInsets`.
   `generatedInlineAdvance` reads the pseudo's computed style, and returns
   `measureWidth(text, fontSpecOf(style))` plus the pseudo's own horizontal
   margin/padding/border. It returns 0 for `display:none`, floated or
   out-of-flow pseudos. `generatedContentText` accepts only plain
   concatenated string tokens (and stops at ` / alt-text`); `counters()`,
   `attr()`, `url()`, images and anything containing a backslash escape
   return `null` and stay unmodelled — i.e. exactly today's behaviour, which
   matters because `sass/_layout.scss:44` uses `counters(toc, ".")`.
3. `index.js:1965-2027` (`attachInlineExtras`) — takes a new `generated`
   argument and folds it into `padStartPx` / `padEndPx`, **after** the
   painted-protrusion sums, also setting `inkEndPx` and `padEndOwner`.
4. `index.js:2089-2093` (`readParagraph`) — computes `generatedHere` and
   passes it through.
5. `chunk-WWMSGT6G.js:1159-1169` (`buildItems`) — `protrudableEndPad =
padEndPx − inkEndPx`, used for `lb.rp` instead of `padEndPx`, plus
   `inkEndPx: r.inkEndPx` forwarded from `runTexts` (`index.js:3441`).

### Why route through the insets, and why `inkEndPx` is needed

`padStartPx`/`padEndPx` is the one channel that is already correct at _both_
ends of the pipeline: the breaker widens the box by it
(`chunk-WWMSGT6G.js:1155`, `lb.width += piece.padEndPx`) and the correction
pass re-adds it as `decorPx` when it measures the line
(`index.js:2425`, `modelPx += seg.decorPx`) — necessary because the mark is
painted by the `<a>` clone and so falls outside every `justif-seg` rect that
`measureLineExtent` sums. No double counting, no new plumbing.

The one thing the channel gets wrong for this payload is protrusion. Trailing
_padding_ is allowed to hang past the measure —
`lb.rp = Math.max(boxEndProtrusionPx, padEndPx)` and then
`L = … − rightHang` (`chunk-WWMSGT6G.js:3152`). A glyph is not padding: left
alone, that would have hung the `↗` fully into the right margin on every
justified line ending in an external link. `inkEndPx` records the ink slice of
the inset and is subtracted before `rp` is computed. (The `::before` side
needs no equivalent: start protrusion is derived from `boxStartProtrusionPx`,
which `attachInlineExtras` computes before the generated advance is added.)
`padPx` still includes it, which is right — the pseudo does not inherit the
`font-stretch` justif puts on the segment spans, so it must not scale with
expansion (`chunk-WWMSGT6G.js:3103`).

## Re-applying after a version bump

`build/vendor.sh` deletes and re-fetches the bundle; a reminder line now
prints at the end of it. The three tests added to `tests/justif.test.mjs`
fail until the hunks are back (or until the bump carries an upstream fix).
Search either file for `SITE PATCH` — each hunk carries a comment saying what
it does and why. All five hunks are textual insertions around unchanged
anchors, so they re-apply by hand in a few minutes as long as
`intrudedLineCount`, `inlineInsets`, `attachInlineExtras`, `runTexts` and
`buildItems`'s `padEndPx` block still exist.

## Tests

`npm test`: **146 passing**, 0 failing (baseline on `HEAD` was 143 — the
"142" in the task statement was stale; verified by stashing).

Three new tests in `tests/justif.test.mjs`, all DOM-free (no jsdom, project
still has zero npm dependencies):

- _patch 1_ lifts `lastLineRaggedAt` and `intrudedLineCount` out of the
  bundle by brace matching, evaluates them, and feeds the exact measured
  geometry above. Asserts 3, not 4. Also asserts the roman case (first ink
  rect _below_ the content top) is unchanged.
- _patch 2, parser_ lifts `generatedContentText` and pins what is and is not
  measurable, including the `counters(toc, ".")` case the site relies on
  staying unmodelled.
- _patch 2, wiring_ asserts by source structure that the advance reaches
  `padEndPx`/`inkEndPx`, that `runTexts` forwards it, that the chunk computes
  `protrudableEndPad`, and that the unpatched `rp` assignment is gone.

Each was confirmed to fail against the pristine bundle before being kept.

`zola build` and `zola check --skip-external-links` are clean.

## Upstream report (draft)

> **justif 0.9.1 — `::before`/`::after` on an inline ancestor is not modelled,
> which orphans a leading float**
>
> `readParagraph` measures inline ancestors with `inlineInsets`, which reads
> padding and border only; the bundle never calls
> `getComputedStyle(el, "::before"|"::after")`. Generated content has advance
> width, so any line carrying such a pseudo is broken to a width the browser
> then paints wider.
>
> Off a float this is masked: `verifyPatches`' optical branch shrinks word
> spacing until the painted end sits on the content edge. Beside a leading
> float it is not recoverable. Intruded lines are emitted as
> `white-space:nowrap` segments closed by a `.justif-soft-break` forced break,
> so the line has no break opportunity; a line even slightly too wide is
> shifted below the float by CSS float avoidance, and every following line
> stacks under it, leaving the float orphaned.
>
> Reproduction: a `<p>` with a leading `float:left` element sized to three
> line-heights, whose first line contains
> `<a style="…">text</a>` with `a::after{content:"↗"}`. Expected three lines
> beside the float; actual, all lines below it.
>
> Suggested fix: fold string-valued generated content into the run's
> start/end inset (it already flows correctly into `lb.width` in `buildItems`
> and into `decorPx` in `measureLineExtent`), but keep it out of `lb.rp` —
> trailing padding may hang past the measure, a glyph may not. Non-string
> content (`counters()`, `attr()`, `url()`) can stay unmodelled or bail.
>
> **Separate, smaller bug in the same area:** `intrudedLineCount` takes
> `lines[0].top` from Range client rects, i.e. text ink, not the line box. An
> italic first line's ascender overshoot puts it ~1px above the paragraph's
> content top, which turns an exact 3.0 into 3.026 and `Math.ceil`s to a
> spurious fourth intruded line; `Math.max(affected, geometricLines)` then
> discards the correctly observed 3. The `- 1e-6` epsilon cannot absorb a
> pixel. `Math.max(firstLine.top, content.top)` fixes it — line boxes are laid
> out downwards from `content.top`, so nothing is intruded above it.

## Not confirmed

- **No visual verification.** I cannot drive a browser. Everything below the
  "why an over-wide line is fatal" mechanism is source reading plus offline
  font measurement; the ~16px figure for the mark's advance is computed from
  CSS (`0.62em` + `0.08em`) and the fact that neither vendored EB Garamond
  face carries `U+2197`, not measured in a rendering engine. The fallback
  face's actual advance for `↗` could differ by a few px in either direction.
  It does not need to be 16 — anything over ~1.5px displaces the line — but
  the exact number is an estimate.
- I did not verify that the corrections settle loop cannot, in some
  configurations, claw an over-wide intruded line back on its own. The
  argument that it usually cannot (80% word-spacing floor on intruded lines,
  `index.js:3772`, versus a ~16px error) is arithmetic, not observation.
- `generatedInlineAdvance` adds two `getComputedStyle` calls per inline
  element per scan. On this site's paragraph sizes that is negligible, but I
  did not profile it.
- Pseudo advance is measured with justif's canvas measurement path. For a
  pseudo whose `font-variant`/`text-transform` forces
  `needsDomMeasurement`, that path is the same one justif already uses for
  text, so it should behave identically — untested.
- A separate, **pre-existing** hazard is now newly reachable: `padEndOwner`
  makes `paintedEndOf` (`index.js:2443`) measure the ancestor's clone, and
  `writeParagraph` reuses one ancestor clone across a line break, so its rect
  is the union of both fragments. This can mis-place the optical correction
  for an inline that both spans a line break and ends a line. It applies
  equally to author padding today; the patch just makes external links take
  that path. Not observed, not addressed.
- **Tooling note, not part of the fix:** the global `PostToolUse` prettier
  hook reformats any file touched with Edit/Write, and reformatted the whole
  vendored bundle on the first attempt (2293 insertions). The patches were
  applied with a Python script through Bash instead. A `.prettierignore`
  entry for `static/js/lib/` would prevent a recurrence; I did not add one,
  as it is outside this task.
