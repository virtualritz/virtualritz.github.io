# Typography foundation — verification sweep

Recorded against spec §14 for the plan
`docs/superpowers/plans/2026-09-08-typography-foundation.md`.

Environment: local `zola serve` at `127.0.0.1:1111`, Chrome on Linux,
`devicePixelRatio` 1.5625–1.875, viewport 1889–2267 CSS px. Zola 0.23.4.

Verified at commit `d16d7c4` (branch `worktree-typography-foundation`,
unmerged, 26 commits ahead of `origin/master`).

## Why this ran locally rather than against the deployed site

The plan's Task 14 says it consumes "the deployed site" and its Step 4 says
to run the probe "on a deployed article". That is not possible yet: this
branch is unmerged, so the deployed site is still the pre-rebuild baseline
from `e382aca`. Every check below would have passed or failed on code this
plan has not shipped. The items marked **post-merge** below are the ones
that genuinely cannot be answered locally.

## Method warning — read before trusting any browser measurement

A Chrome tab that is not painting (`document.visibilityState === "hidden"`)
pauses `requestAnimationFrame`. `static/js/typography.js` counts its
four-second give-up budget in rAF _ticks_ rather than wall-clock time, so in
a hidden tab `ready` never resolves and both `dropcaps.js` and
`sidenotes.js` wait on it forever.

The first pass of this sweep therefore observed no drop cap, no sidenotes,
and a permanently pending `ready`, and nearly recorded that as a critical
product defect. It is an artifact of the measuring environment. Every result
below was taken with the tab confirmed painting and cross-checked against a
screenshot.

The underlying weakness is real but minor, and is recorded as FAIL 4.

## Step 1 — automated checks

At the time of this sweep, `just check` **failed**, but not on anything this
plan built — see the now-fixed `justfile:19` finding below; `just check` runs
`zola check --skip-external-links` since that fix and passes. Broken down as
it stood at the time:

| Check                                             | Result                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `just fonts` regenerates identically              | **PASS** — clean `git status` afterwards, byte-identical                                                                              |
| `zola build`                                      | **PASS** — clean                                                                                                                      |
| `npm test`                                        | **PASS** — 80/80 at the time this sweep ran (now 87+; see the fix-wave note below)                                                    |
| `zola check --skip-external-links` (what CI runs) | **PASS** — 4 pages, 2 sections, 0 orphans, no internal breakage                                                                       |
| `zola check` (what `just check` ran at the time)  | **FAIL** — 72 external-link complaints (`just check` now runs `zola check --skip-external-links`, same as CI — see the Finding below) |

All 72 are third-party: GitLab anchor checks (`#L30`-style deep links into
source files, where GitLab does not serve the anchor to a bot) and 403s from
`projects.blender.org`. They are all in `content/essays/nsi-vs-hydra-vs-riley.md`,
which carries 399 external references.

**Finding (minor, real) — FIXED:** `justfile:18` labelled the `check` recipe
"Everything CI runs", but line 19 ran bare `zola check` while
`.github/workflows/deploy.yml` runs `zola check --skip-external-links`, with
a comment explaining that CI must not depend on other people's uptime. The
local target was therefore both stricter than CI and permanently red, which
trains you to ignore it. Line 19 now carries `--skip-external-links`, and the
comment above `check` notes that it also runs `fonts`, which CI does not —
`just check` is no longer permanently red, and the "Result" row above is
current as of that fix.

## Step 2 — the no-JS path

**Not verified.** Disabling JavaScript requires driving the DevTools
settings UI, which this sweep did not attempt. The no-JS _fallbacks_ were
partially observed indirectly (see FAIL 4: with `ready` never resolving in a
hidden tab, the page renders as the no-JS path does — article fully typeset
by native CSS, footnotes as a collected section — and it was readable), but
that is weak evidence and not a substitute for the real check.

Carry this forward.

## Step 3 — the JS path

| Item                                             | Result                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Sidenotes hoist, alternating columns, no overlap | **PASS** — 2 notes at 1889px+, 1 left, 1 right                                                                           |
| Native footnote section stays accessible         | **PASS** — no `hidden` attribute, `display: block`, hidden only via `clip-path`, so it remains in the accessibility tree |
| Drop cap renders in Thunder VF                   | **PASS** — 136px, solved weight **290**                                                                                  |
| No horizontal page scroll                        | **PASS** at 1889–2267px (`scrollWidth === clientWidth`); no element inside `.article-body` overflows its own box         |
| `dataset.justifSkipped` undefined                | **FAIL** — see FAIL 3                                                                                                    |
| 375px, no horizontal scroll                      | **Not verified** — `resize_window` reported success but `innerWidth` stayed at 2267; the viewport never narrowed         |
| 50%–200% zoom sweep                              | **Not verified**                                                                                                         |

Visually confirmed by screenshot: small caps (`nasa`, `ascii`), oldstyle
figures (1863, 1,024, 39), the floated in-article table of contents, h1/h2
rules, em and en dashes, and all three components (`admonition` in both
`note` and `warning` kinds, `collapse`, and the inline `marginnote`).

### Correction to a Task 9 concern

Task 9's ledger recorded that the stroke-weight solver clamps Thunder VF to
its lightest weight (100), measured against the "A" of
`nsi-vs-hydra-vs-riley.md` at a stem ratio of 6.59 versus a 5.0 target, and
concluded the stroke-matching had "no effective range with this face".

On this page's "E" the solver returns **290**, so it does have real range.
The clamp is letter-specific, not a blanket loss of range — "A" presents
diagonals where "E" presents a clean vertical. That concern should be
restated per-initial rather than as a general defect.

## Step 4 — optical margins, the axis meant to beat gwern.net

**PASS**, on every paragraph justif actually laid out. See the retracted FAIL 2
below for the measurements and for the error in an earlier revision of this
document, which recorded this as a failure.

## Failures

### ~~FAIL 1 — the drop cap destroys justification on the paragraph it decorates~~ — RESOLVED

**Was load-bearing; fixed by commits `0e68bf7`, `09468b0`, `b28cd62`.**

With the tab painting, justified targets dropped from 15/15 to 9/15 as soon as
`dropcaps.js` ran. Re-running `justify()` with a capturing `onSkip` gave the
reason explicitly:

```
p (div.article-body), width 895
  "EEvery typographic device this site has,…"
  reason: "floated element is not a leading direct child"
```

So the opening paragraph of **every** essay silently fell back to native CSS
justification, losing both Knuth–Plass line-breaking and optical margins — on
the one paragraph a reader looks at first, and the one carrying the drop cap
that is supposed to showcase the typography.

At the time this was recorded, the remedy looked like a design decision
rather than a defect fix: either restructure the drop-cap markup so the
floated element is a leading direct child of the paragraph, or abandon the
float for a different placement technique. It turned out to be three
ordinary defects, not a design conflict:

1. `0e68bf7` — `p.prepend(sr)` (the screen-reader span) ran after
   `p.prepend(box)` and reinserted `.sr` ahead of `.dropcap-box`, demoting
   the box to the paragraph's second child. justif requires the floated
   element to be the leading direct child.
2. `09468b0` — justif has no second pass: `typography.js` was calling
   `justify()` before the drop cap was placed, so inserting the cap
   afterwards invalidated the first paragraph's already-computed layout.
   `run()` now awaits `dropcaps.js`'s `capPlaced` (and `toc-move.js`'s
   `tocMoved`) before ever calling `justify()` — see the ordering invariant
   documented in both files' headers.
3. `b28cd62` — the floated `#toc`, rendered as a preceding sibling of
   `.article-body`, still intruded into the first paragraph's box even
   after (1) and (2). Moving the TOC to a _following_ sibling of the first
   paragraph (still `float: left`) removed it from that paragraph's box
   entirely.

Verified in a browser on the real essay: **279/279 paragraphs justified**,
cap and TOC flush at offset 0, protrusion T 2.41px / W 1.05px. Task 8 and
Task 9 are not mutually incompatible; the browser-only failure mode is now
also caught at the source level by `tests/dropcap.test.mjs`'s DOM-order and
sequencing pins, since no DOM is available under `node --test` to execute
the path directly.

### ~~FAIL 2 — optical-margin protrusion not observed~~ — RETRACTED, this was a measurement error

**Protrusion works.** An earlier revision of this document recorded it as a
load-bearing failure. That was wrong, and the error was mine, twice over:

1. I compared the first glyph's offset against the paragraph's box and looked
   for a **negative** number, ignoring that body paragraphs carry a 60px
   (2.5em) `text-indent`. The correct baseline is the indent itself, so an
   offset of `58.8` on a `60px` indent is **1.2px of protrusion**, not zero.
2. My first probe ran on a page state where justif had not applied to
   anything, so nothing could have protruded.

Re-measured with justification confirmed active, taking protrusion as
`text-indent − offset` (positive = protruding left of the column):

| First glyph   | Protrusion | Justified |
| ------------- | ---------- | --------- |
| T             | **1.20px** | yes       |
| T             | **1.20px** | yes       |
| S             | **0.74px** | yes       |
| A             | **0.44px** | yes       |
| R             | 0          | yes       |
| N             | 0          | yes       |
| J             | −0.62px    | yes       |
| A, A, O, B, F | 0          | **no**    |

This is exactly the intended behaviour: pointed and round left-side glyphs
(`T`, `S`, `A`) protrude, flat-stemmed ones (`R`, `N`) do not, and `J` — open
on its left — correctly does not. gwern.net measures `0.00` for all of these,
so the axis holds, if subtly (~1.2px at 24px type).

Two things follow, both worth keeping:

- **Protrusion only happens on paragraphs justif actually laid out.** Every
  unjustified paragraph measures exactly `0`. So FAIL 1 is not merely about
  line-breaking — it silently costs optical margins on every paragraph it
  touches, which enlarges its blast radius.
- **Task 5's escalation is discharged.** The worry was that our
  link-underline shadows, four of which carry horizontal offsets, would make
  justif treat the underline as a painted halo and suppress protrusion.
  Protrusion is present, so that risk did not materialise.

Independent corroboration on the options: justif's own
`resolveOptions`/`composeProtrusion` were read directly (vendored
`chunk-WWMSGT6G.js:504-538`, `index.js:4373-4399`). `protrusion: true` is
equivalent to omitting the key, and `hangingPunctuation: "line-end-only"` is
a recognised mode; the base Latin `T`/`V`/`W`/`Y` table is included
regardless of hang mode. The call site's options were never the problem.

Also worth recording, since it shaped the original expectation: the
planning-phase specimen page never enabled `protrusion` and never measured
it. The one "1131 blocks measured, offset 0" measurement in the planning
record was of **gwern.net**, taken to justify choosing justif over CSS — not
of this site. So "protrusion was working in the specimen" was inferred from
justif being active, never demonstrated. It is demonstrated now, here.

### FAIL 3 — `justifSkipped` telemetry under-reports

**Update:** this was recorded while FAIL 1 was still open. At the time, 6 of
15 targets lacked justif's `data-justif` attribute while
`dataset.justifSkipped` reported only `2` — a 4-element gap, all of them
paragraphs FAIL 1 was silently falling back to native justification without
`onSkip` ever seeing them (justif's decline path only fires for elements it
actually evaluates and rejects, not for ones a caller-side layout bug pushes
out of its view entirely).

Now that FAIL 1 is resolved, the real essay reports **279/279 justified,
skips at 2** — the same 2 as before, both correct and harmless (see below) —
with no gap left between the declined count and the unjustified count. The
under-report was a symptom of FAIL 1, not an independent defect in `onSkip`
itself; it is no longer observable.

Task 8's ruling installed `onSkip` specifically so that spec §14.8 ("no
`.spec` paragraph is declined") would be falsifiable. A count that missed two
thirds of the unjustified elements could not support that check; a count
that now matches the unjustified elements exactly can.

Of the elements justif _does_ report declining, two are the footnote `<li>`s
inside the clip-hidden native footnote section, with reason
`"white-space: nowrap on the paragraph"` — that is the visually-hidden clip
pattern from Task 10 doing exactly what it should, on content that is not
visible anyway. Those two are correct and harmless.

### FAIL 4 — `ready` does not always resolve, contrary to its own contract

**Low impact.**

`static/js/typography.js`'s header comment states that "`ready` must resolve
even when justif fails: Task 9 and Task 10 both await it, and a hung promise
would silently disable drop caps and sidenotes with no error."

That guarantee does not hold in a background tab, because the 240-tick
give-up budget in `waitForBox` is counted in `requestAnimationFrame` calls
rather than wall-clock time, and rAF is paused while the page is hidden. The
promise resolves once the tab is focused, so real-world impact is small — but
the invariant is weaker than the comment claims, and it is what made the
first pass of this sweep misread the whole feature set as broken.

A wall-clock deadline alongside the tick budget would make the comment true.

## Still to verify after merge

- The no-JS path (Step 2), properly, with JavaScript disabled.
- 375px and the 50%–200% zoom sweep.
- Anything host-specific: absolute `base_url` asset paths over HTTPS, and
  font loading from the Pages host rather than localhost.
