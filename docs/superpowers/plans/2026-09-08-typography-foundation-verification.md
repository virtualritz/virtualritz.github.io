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

`just check` **fails**, but not on anything this plan built. Broken down:

| Check                                             | Result                                                          |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `just fonts` regenerates identically              | **PASS** — clean `git status` afterwards, byte-identical        |
| `zola build`                                      | **PASS** — clean                                                |
| `npm test`                                        | **PASS** — 80/80, output pristine                               |
| `zola check --skip-external-links` (what CI runs) | **PASS** — 4 pages, 2 sections, 0 orphans, no internal breakage |
| `zola check` (what `just check` runs)             | **FAIL** — 72 external-link complaints                          |

All 72 are third-party: GitLab anchor checks (`#L30`-style deep links into
source files, where GitLab does not serve the anchor to a bot) and 403s from
`projects.blender.org`. They are all in `content/essays/nsi-vs-hydra-vs-riley.md`,
which carries 399 external references.

**Finding (minor, real):** `justfile:18` labels the `check` recipe
"Everything CI runs", but line 19 runs bare `zola check` while
`.github/workflows/deploy.yml` runs `zola check --skip-external-links`, with
a comment explaining that CI must not depend on other people's uptime. The
local target is therefore both stricter than CI and permanently red, which
trains you to ignore it. Line 19 should carry `--skip-external-links` to
match its own description.

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

**FAIL.** See FAIL 2.

## Failures

### FAIL 1 — the drop cap destroys justification on the paragraph it decorates

**Load-bearing.**

With the tab painting, justified targets drop from 15/15 to 9/15 as soon as
`dropcaps.js` runs. Re-running `justify()` with a capturing `onSkip` gives
the reason explicitly:

```
p (div.article-body), width 895
  "EEvery typographic device this site has,…"
  reason: "floated element is not a leading direct child"
```

So the opening paragraph of **every** essay silently falls back to native CSS
justification, losing both Knuth–Plass line-breaking and optical margins — on
the one paragraph a reader looks at first, and the one carrying the drop cap
that is supposed to showcase the typography.

Task 8 (justification) and Task 9 (drop caps) are mutually incompatible as
built. Nothing in the 80-test suite catches it because no test executes this
path in a browser.

The remedy is a design decision, not a defect fix: either restructure the
drop-cap markup so the floated element is a leading direct child of the
paragraph, or abandon the float for a different placement technique.

### FAIL 2 — optical-margin protrusion not observed

**Load-bearing.**

The plan's Step 4 probe expects negative first-glyph offsets for paragraphs
beginning with `T`, `V`, `W`, `Y` and opening quotes — glyphs protruding left
of the column — and describes this as "the axis on which we beat
gwern.net", which measures `0.00` for all of them.

Measured across all 13 `.article-body` paragraphs, offsets were only `0` or
`60` (60px being the 2.5em `text-indent`). **Never negative.** So protrusion
is either not applied or not taking effect.

This is the outcome Task 5's escalation predicted was at risk: justif's own
documentation promises glyph protrusion for "sharp (zero-blur) vertical-only
underline shadows", while four of the seven link-underline shadows this
plan ships carry deliberate horizontal offsets, because the descender-cutout
effect requires them.

Whether those two facts are causally connected here is **not** established —
protrusion is absent on paragraphs with no links at all, so there is likely a
second, simpler cause (configuration, or protrusion needing a property this
build does not set). Worth investigating before assuming the shadows are to
blame.

### FAIL 3 — `justifSkipped` telemetry under-reports

In the painting state, 6 of 15 targets lacked justif's `data-justif`
attribute while `dataset.justifSkipped` reported only `2`.

Task 8's ruling installed `onSkip` specifically so that spec §14.8 ("no
`.spec` paragraph is declined") would be falsifiable. A count that misses two
thirds of the unjustified elements cannot support that check.

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
