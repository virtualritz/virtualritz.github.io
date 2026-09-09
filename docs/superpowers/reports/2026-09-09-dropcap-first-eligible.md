# Drop cap lands on the first eligible paragraph — 2026-09-09

## The bug

`static/js/dropcaps.js`'s `place()` only ever tried
`.article-body > p` (the very first paragraph). If that paragraph's cap
overhung its own bottom (the existing, correct undo path), the essay simply
got no cap at all. The NSI/Hydra/Riley essay recently gained a two-line
"TL;DR:" opener ahead of its three-line italic standfirst, so the guard now
rejected paragraph 1 and stopped — the essay lost its drop cap even though
paragraph 2 would host one perfectly, as it used to before the TL;DR was
added.

## The fix

`place()` now builds a short list of _candidate_ paragraphs and tries them
in order, stopping at the first one whose cap actually fits (measured
post-placement, exactly as before), and undoing completely before moving to
the next.

### Candidate rule and bound

New pure module `static/js/lib/dropcap-candidates.js` exports
`selectDropcapCandidates(tagNames, maxCandidates)`: given the tag names of
`.article-body`'s direct children in document order, it returns the indices
of the leading `<p>` elements worth trying — walking forward, collecting
`<p>` tags, until either a heading (`H1`-`H6`) is hit or `maxCandidates`
paragraphs have been collected. Non-paragraph, non-heading siblings (an
`<hr>`, a top-level blockquote, ...) are skipped without ending the search;
only a heading marks the end of the article's opening — that's the only
stop condition the task called out explicitly, and it matches every essay
on this site (the NSI essay's shape is literally `<p><p><p><hr><h2>`).

**Bound chosen: `MAX_DROPCAP_CANDIDATES = 3`.** The deepest lead-in shape
actually seen on this site is exactly 3 paragraphs deep (TL;DR line +
two-paragraph italic standfirst, on the NSI essay). 3 covers that with no
slack to spare, while still refusing to hunt further into the article — a
cap appearing on, say, the fifth paragraph would read as a mistake, not
design intent, which is the failure mode the task asked to guard against.
`dropcap-candidates.js` documents this reasoning inline next to the
constant.

Only `.article-body`'s direct `<p>` children are ever candidates — the
selection function only ever sees the container's own `children` (element
children, so whitespace text nodes are already excluded); it never
descends into blockquotes, asides, list items or table cells because those
aren't in that children list to begin with.

### The undo staying exact across repeated rejections

The strip/place/measure/undo logic was extracted into a new function,
`tryPlaceCap(p, letter, opts, initial, weight)`, unchanged line-for-line
apart from being parameterized (it took `bodySize` off the closure and
takes it via `opts.bodySize` instead, since it fits now runs once per
candidate rather than once per article). Everything it touches —
`walker`, `node`, `stripped`, `box`, `glyph`, `sr` — is a local of that one
call, not shared module or `place()` state, so nothing can carry over from
one rejected candidate into the next: each call gets a fresh
`TreeWalker` and fresh DOM nodes, and on the overhang branch it removes
`box`, removes `sr`, and restores the letter to the exact index
`stripLetter` reported for _that_ call, then returns `false` — `place()`'s
loop only moves to the next candidate after this full undo has run to
completion. No state persists between candidates other than the untouched
`candidates` array and the once-only font/geometry setup described below,
so three rejections in a row are three independent, fully-reversed
attempts, not a chain that can partially unwind.

I added a source-pinning test (`the candidate loop stops at the first
paragraph whose cap actually fits`) plus kept the existing "undone
completely" test, which now pins the same box/sr/letter-restore sequence
inside `tryPlaceCap` instead of inline in `place()`.

### Font-await interaction

The instructions flagged this explicitly: the `document.fonts.load(...)`
vs. 2s-timeout race must not repeat per candidate, or a stalled/blocked
font could multiply the budget by up to `MAX_DROPCAP_CANDIDATES`. Fixed by
hoisting all of the once-per-article setup — `bodySize`, `serif`,
`initial`, the font-load-and-race block, `bodyMetrics`, `bodyStemPx`, and
the `variable` (Thunder VF) flag — above the candidate loop, computed
exactly once regardless of how many candidates get tried. The one thing
that must vary per candidate — the letter passed to `document.fonts.load`,
in case of unicode-range-subsetted fonts — is handled by first computing
every viable candidate's own first letter up front (cheap: just
`textContent`/regex, no DOM mutation), then passing the deduplicated set of
all of them as the load's `text` argument in that single call. Per-
candidate work that stayed inside the loop (`lineHeight` from
`getComputedStyle(p)`, the variable-weight probe/solve, `capGeometry`) is
all synchronous — no additional awaits, so the timeout budget is spent
exactly once no matter how many candidates are tried.

Added a source-pinning test (`the font-load await happens once for all
candidates, not once per candidate`) that counts `document.fonts.load(`
occurrences (must be exactly 2 — one for `--initial`, one for `--serif`)
and asserts the call site precedes the candidate loop.

## Test evidence

Baseline was 141 passing. New count: **149 passing** (141 baseline + 8 new:
6 for `selectDropcapCandidates` covering first-fits/second-fits-via-bound-
respecting-selection/heading-stop/non-paragraph-skip/heading-at-top/default-
bound, plus the 2 source-pinning tests above).

```
$ npm test
...
# tests 149
# pass 149
# fail 0
```

Because `selectDropcapCandidates` is pure (no DOM), the "first fits" /
"first too short, second fits" / "all too short" behavior is unit-tested
directly at the selection level (which paragraphs get offered as
candidates) plus at the source-pinning level (the loop tries them in order
and stops on the first success) — the actual fit/overhang measurement
itself was already, and remains, exercised only by `capOverhangsParagraph`
(browser-verified, per the task's own framing) since it depends on real
`getBoundingClientRect()` values this repo's test setup has no DOM for.

**Demonstrated the tests have teeth** (break → fail → restore, on
`master`, working tree clean before and after):

1. Commented out the heading-stop `break` in
   `selectDropcapCandidates` → `selectDropcapCandidates stops at the first
heading, however deep it is` and `... returns nothing when the article
opens on a heading` both failed (147 pass / 2 fail). Restored via
   `cp` from a pre-edit backup; diff against the backup showed no changes
   after restore.
2. Changed `if (tryPlaceCap(...)) return;` to a bare
   `tryPlaceCap(...);` (dropping the early return) →
   `the candidate loop stops at the first paragraph whose cap actually
fits` failed (148 pass / 1 fail). Restored the same way.
3. Injected an extra `document.fonts.load(...)` call inside the candidate
   loop → `the font-load await happens once for all candidates, not once
per candidate` failed (148 pass / 1 fail). Restored the same way.

All three restores were verified byte-identical to the pre-break file via
`diff`, and `npm test` returned to 149/149 after each.

## Build

```
$ zola build
Building site...
-> Creating 4 pages (0 orphan) and 2 sections
Done in 52ms.

$ zola check --skip-external-links
Checking site...
-> Site content: 4 pages (0 orphan), 2 sections
Done in 27ms.
```

Both clean.

## What I could confirm without a browser

Inspected the actual built HTML (`public/essays/*/index.html`) rather than
just the markdown source, to check the real direct-child sequence of
`.article-body`:

- `/essays/nsi-vs-hydra-vs-riley/`: `p, p, p, hr, h2, ...` — exactly the
  3-paragraph-then-heading shape this fix targets. Candidate indices `[0,
1, 2]`, all three within the bound.
- `/essays/on-typography/`: `p, p, h2, ...` — candidate 0 is the essay's
  existing long opening paragraph, unchanged position from before this
  fix.
- `/essays/typography/` (the "Setting this site" demo essay): `p, hr, h2,
...` — candidate 0 is the existing italic standfirst that the essay's own
  text says is "on purpose" 3+ lines deep.
- `/about/`: `<article id="article">` with no `essay` class (it isn't a
  descendant of `essays/_index.md`), so `document.querySelector("#article
.essay")` never matches and `place()` is never invoked at all — this was
  already true before my change and is untouched by it.

## What I could not confirm

Per the task's own constraint, I cannot drive a browser, so I could not
visually verify:

- That the NSI essay's cap actually renders on the italic standfirst
  (paragraph index 1) rather than merely that the candidate list and
  fallback logic are structurally correct.
- That the on-typography and typography ("demo") essays' caps are
  pixel-identical to before (unchanged code path, but not re-measured live).
- That `/about/` renders with no cap and no orphaned `.sr` (expected from
  the class-gating above, not re-observed in a browser).
- Real font metrics, weight-solving output, or any sub-pixel rounding
  behavior — all of `capGeometry`/`capOverhangsParagraph`'s browser-side
  inputs are unit-tested against synthetic ratios only.

These are exactly the items flagged for your browser sweep.
