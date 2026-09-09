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

---

## Follow-up regression: the TOC still anchored on the first paragraph — 2026-09-09

### The bug this time

The fix above changed which paragraph gets the cap, but
`static/js/toc-move.js` still moved `#toc` unconditionally to a following
sibling of `.article-body`'s _first_ `<p>` — synchronously, at module
evaluation, with no knowledge of where the cap actually landed. On the NSI
essay the cap now lands on paragraph 1 (the italic standfirst), so the TOC
ended up sitting _between_ paragraph 0 and the capped paragraph 1 — a
preceding-sibling float intruding into the capped paragraph's box again,
exactly the failure mode `toc-move.js` was written to avoid, just one
paragraph later. Live symptom: the drop cap "A" rendered as an orphaned
letter beside the TOC, with no text wrapping next to it.

### The new coupling between dropcaps.js and toc-move.js

`dropcaps.js`'s `place()` now **returns** the paragraph it actually
capped — the `p` from the candidate loop — instead of nothing. All of its
return paths were made explicit:

- `if (!container) return null;` — no `.article-body`.
- `if (existingBox) return existingBox.parentElement;` — idempotency: a
  second call reports the same host it found the first time, rather than
  silently no-op'ing (this branch pre-existed as a guard against a
  duplicate box; it just didn't report anything before).
- `if (candidates.length === 0) return null;` — no eligible candidate.
- `if (tryPlaceCap(...)) return p;` inside the loop — the paragraph that
  actually took the cap.
- `return null;` after the loop — every candidate overhung.

`capPlaced` (the exported promise) now resolves with that value directly:
`found ? place(article) : null` (was `found && place(article)`, which
could resolve to the boolean `false` instead of `null` — harmless before
since nothing read the value, but worth tightening now that toc-move.js
does).

`toc-move.js` imports `capPlaced` from `dropcaps.js` and a new pure
function, `tocAnchor(capHost, firstPara)`, from the new module
`static/js/lib/toc-anchor.js`:

```js
export function tocAnchor(capHost, firstPara) {
  return capHost ?? firstPara ?? null;
}
```

`toc-move.js`'s `moveToc()` (an `async` function, replacing the old
top-level synchronous `if (toc && firstPara) firstPara.after(toc)`) awaits
`capPlaced`, feeds the result and the pre-existing `firstPara` lookup into
`tocAnchor`, and inserts `#toc` after whatever comes back — falling back to
the first paragraph when no cap was placed, and no-op'ing (leaving the TOC
where the template put it) when neither exists. This is a genuinely new
dependency: the header comment in `toc-move.js` used to say "Order
relative to capPlaced does not matter" — that's now false, and I corrected
it (see "Comments corrected" below) since `toc-move.js` cannot decide where
to anchor without first knowing what `capPlaced` resolved to.

The decision itself (`tocAnchor`) is pure and DOM-free, split out
specifically so it could be unit-tested with real execution rather than
only the source-regex pinning the rest of `toc-move.js` needs (no DOM
under `node --test`, no jsdom allowed).

### How I ruled out a hang or deadlock

Two promises are now coupled (`tocMoved` awaits `capPlaced`) where they
previously settled independently, so I checked this both directions:

- **No cycle**: `dropcaps.js` does not import `toc-move.js` or anything
  that depends on it — verified by re-reading `dropcaps.js` in full; its
  only imports are `./lib/wait-for-box.js`, `./lib/dropcap-geometry.js`,
  `./lib/dropcap-candidates.js`. `capPlaced` is computed independently of
  `tocMoved`, so there's no A-awaits-B-awaits-A path.
- **`capPlaced` itself cannot hang**: unchanged from the previous fix —
  the only asynchronous wait inside `place()` is the
  `document.fonts.load(...)` pair, and that's raced against a 2-second
  `setTimeout` via `Promise.race`, which always settles. `waitForBox` above
  it also has its own bounded ~4s poll-then-give-up. Since `capPlaced`'s
  own settlement is bounded, `await capPlaced` inside `toc-move.js` cannot
  hang either — it's bounded by the same budget.
  - `capPlaced` on `/about/` (no `#article.essay`) resolves synchronously
    via `Promise.resolve(null)`, bypassing `waitForBox` entirely — this is
    checked once as part of `article ? ... : Promise.resolve(null)`.
- **Rejection, not just hang**: `moveToc()` wraps `await capPlaced` in its
  own `try`/`catch` — if `capPlaced` ever did reject (it's documented not
  to, but the guard costs nothing), the `catch` logs a warning and falls
  through with `capHost = null`, so `tocAnchor` still runs and falls back
  to `firstPara`. A second `try`/`catch` wraps the `tocAnchor` call and the
  actual `anchor.after(toc)` DOM move, so a throw there (e.g. a detached
  node) also can't leave `tocMoved` rejected or pending — it's swallowed
  and logged, same idiom as `mark-para-indent.js`/`mark-long-tokens.js`'s
  existing top-level `try { ... } catch { console.warn(...) }` pattern.
  Because both `try`/`catch` blocks are inside the `async function
moveToc()`, and neither lets an exception escape, the promise assigned
  to `tocMoved` is guaranteed to _resolve_ (to `undefined`), never reject,
  on every path — including a throw. This mirrors the existing "must always
  resolve (never reject/hang)" contract already documented on `capPlaced`.
- Added a source-pinning test asserting the `try { ... await capPlaced ...
} catch` shape exists around that specific await, precisely so this
  guarantee doesn't silently regress later (`toc-move.js never lets
capPlaced rejecting (or the DOM move throwing) leave tocMoved
unsettled`).
- `typography.js`'s `await Promise.all([capPlaced, tocMoved, ...])` is
  itself inside `run()`'s outer `try`/`catch`, unchanged from before — an
  unlikely rejection from either promise still resolves `ready` via the
  existing `catch` block, so the overall pipeline's own resolve-always
  guarantee is untouched by this change.

### Comments corrected

Doc comments describing the _old_ arrangement (TOC always anchored on the
first paragraph, order relative to `capPlaced` not mattering) would have
been actively wrong after this change, so I updated:

- **`static/js/toc-move.js`** (full rewrite of the header comment): now
  describes anchoring on the _capped_ paragraph via `capPlaced`/
  `tocAnchor`, why anchoring on the first paragraph unconditionally
  reproduces the bug one paragraph later, the new resolve-always
  guarantee and why `capPlaced`'s own bounded settlement makes the await
  safe, and updated the no-op conditions (no `#toc`, or no paragraph to
  anchor on at all).
- **`static/js/dropcaps.js`**: added a paragraph to the header comment
  noting `toc-move.js` must run after `capPlaced` settles and reads its
  resolved paragraph; updated the `capPlaced` export's inline comment to
  document the new resolved value (host paragraph or `null`) and that
  `toc-move.js` also awaits it.
- **`static/js/typography.js`**: the "Ordering invariant" paragraph said
  "the TOC MUST be out of the _first paragraph's_ box" and "essay's first
  paragraph" — corrected to "the _capped_ paragraph's box" / "essay's
  paragraphs", and added a sentence explaining the capped paragraph isn't
  always the first one and why that's exactly why `toc-move.js` awaits
  `capPlaced`.
- **`static/js/mark-para-indent.js`** and **`static/js/mark-long-tokens.js`**:
  re-read both in full; their ordering comments only describe running
  before `dropcaps.js`/`toc-move.js` touch `.article-body`'s HTML, and
  before `markPunctuation`/`justify` — neither claim was affected by this
  change, so neither file needed edits.

### Tests

New pure-logic test file, `tests/toc-anchor.test.mjs` (real execution, no
source-regex, since `tocAnchor` is DOM-free):

```js
tocAnchor("p1", "p0") === "p1"; // prefers the cap host
tocAnchor(null, "p0") === "p0"; // falls back to the first paragraph
tocAnchor(null, null) === null; // no-op
```

Updated existing source-pinning tests that pinned the _old_ (buggy)
literal code shape, since the fix necessarily changes that shape:

- `tests/toc-move.test.mjs`: replaced the assertion on
  `firstPara.after(toc)`/`if (toc && firstPara)` with assertions that
  `toc-move.js` imports `tocAnchor` from `./lib/toc-anchor.js` and
  `capPlaced` from `./dropcaps.js`, moves `#toc` via `anchor.after(toc)`,
  no-ops on `!toc`, and no-ops when `tocAnchor` returns nothing. Added the
  new hang/reject-safety test described above. Left the existing
  "typography.js awaits tocMoved before markPunctuation/justify" test
  untouched — still valid, still passing.
- `tests/dropcap.test.mjs`: updated "the candidate loop stops at the first
  paragraph whose cap actually fits" to expect `return p;` instead of
  `return;`. Added a new test, "place() resolves capPlaced with the host
  paragraph, or null when no cap was placed", pinning all three `null`
  return paths and the `return p` success path.

**Baseline for this follow-up fix: 149 passing** (the count from the
section above). **New count: 154 passing** (149 + 3 in
`toc-anchor.test.mjs` + 1 new test in `toc-move.test.mjs`; the other
changes were edits to existing tests, not new ones — net +5 including the
one dropped/replaced assertion pair being folded into updated tests rather
than counted separately).

```
$ npm test
...
# tests 154
# suites 0
# pass 154
# fail 0
```

**Demonstrated the new tests have teeth** (break → fail → restore, working
tree clean before and after each):

1. `static/js/lib/toc-anchor.js`: changed `return capHost ?? firstPara ??
null;` to `return firstPara ?? capHost ?? null;` (reintroducing
   "always prefer the first paragraph"). `node --test tests/toc-anchor.test.mjs`
   → 2 pass / 1 fail (`the TOC lands after the cap's host paragraph when a
cap is placed` failed, asserting `'p1'` but getting `'p0'`). Restored
   from a pre-edit backup; `git diff --stat` showed no changes after
   restore.
2. `static/js/toc-move.js`: changed `if (anchor) anchor.after(toc);` to a
   bare `anchor.after(toc);` (dropping the no-op guard).
   `node --test tests/toc-move.test.mjs` → 2 pass / 1 fail (the "moves
   #toc to a following sibling of whatever tocAnchor picks" test failed on
   the `if\s*\(\s*anchor\s*\)\s*anchor\.after\(toc\);` assertion). Restored
   from a pre-edit backup; `git diff --stat` showed the restore matched the
   intended post-fix file exactly (67 insertions / 31 deletions relative to
   the pre-fix version, i.e. the real diff, not a stray change).

Full suite after both restores: `npm test` → 154/154.

### Build

```
$ zola build
Building site...
-> Creating 4 pages (0 orphan) and 2 sections
Done in 81ms.

$ zola check --skip-external-links
Checking site...
-> Site content: 4 pages (0 orphan), 2 sections
Done in 52ms.
```

Both clean.

### What I inspected in the built HTML (no browser available)

- `/essays/nsi-vs-hydra-vs-riley/`: `.article-body` opens
  `<p>TL;DR: ...</p><p><em>An architectural review...</em></p><p><em>This
is not an adoption survey...</em></p><hr/><h2>` — confirms paragraph 0 is
  the short TL;DR line (the cap's first, rejected candidate) and paragraph
  1 is the italic standfirst (the confirmed cap host per the task's own
  diagnosis), matching the scenario `tocAnchor` is meant to handle: anchor
  on paragraph 1, not paragraph 0.
- `/essays/typography/` and `/essays/on-typography/`: both still have
  `#toc` and a long opening paragraph as `.article-body`'s first child with
  no short lead-in ahead of it, so the cap (per the previous fix, unchanged
  here) lands on paragraph 0 — `tocAnchor(capHost, firstPara)` returns the
  same element either way, so the anchor point is byte-for-byte the same
  node as before this change.
- `/about/`: no `#toc` in the built HTML at all (confirmed via `rg`) and no
  `class="essay"` on `<article>`, so `moveToc()` returns immediately on
  `if (!toc) return;` — both the "no cap" and "no TOC" halves of this
  page's expected behaviour are unchanged and untouched by this fix.

### What I could not confirm

Per the task's constraint, I cannot drive a browser, so I could not
visually verify:

- That the NSI essay's cap now renders with visible text wrapping beside
  it on paragraph 1, and that the TOC renders below that paragraph rather
  than beside/above it — only that the DOM insertion point and the
  cap-host resolution logic are structurally correct and unit-tested.
- That the demo (`/essays/typography/`) and `/essays/on-typography/` pages
  are pixel-identical to before this change (same anchor node, but not
  re-rendered/re-measured live).
- That `/about/` still renders with no cap and no TOC in a live browser
  (expected from the build-time absence of both `#toc` and the essay
  class, not re-observed visually).
- Real timing behavior of the `capPlaced`/`tocMoved` coupling under actual
  network/font-loading conditions (e.g. a genuinely slow font request
  hitting the 2s timeout) — only the bounded-by-construction argument
  above, not an observed real-world race.

These are exactly the items flagged for your browser sweep.

---

## Third iteration: breaking the measurement cycle by detaching the TOC first — 2026-09-09

### The bug this time

Both earlier fixes still measured the candidate paragraph's fit while
`#toc` was in its _original_ template position — `float: left`, a
preceding sibling of `.article-body` — because `dropcaps.js`'s candidate
loop ran, and finished, before `toc-move.js` ever touched the DOM
(`toc-move.js`'s move awaited `capPlaced`, i.e. ran _after_ it). That
intruding float squeezes whatever paragraph follows it into more lines
than it actually needs, so a cap that measured as fitting a 2-line
paragraph (measured: host height 76px) actually overhung once `toc-move.js`
moved the TOC away and the paragraph reflowed back down (measured
overhang: 38px, a full line — `hostIndex: 0`, i.e. the cap landed back on
the "TL;DR:" opener the previous fix was supposed to skip). The cap's
placement depended on the TOC's position, and the TOC's position depended
on the cap's placement — a genuine measurement cycle, not fixable by
picking a different anchor, since every anchor choice is downstream of a
measurement taken at the wrong moment.

### The fix: three phases, TOC out of the flow before anything measures

1. **Detach** (`toc-move.js`, synchronous, at module evaluation): pull
   `#toc` out of the document entirely via `toc.remove()`, before any
   other module has a chance to measure a paragraph. Guarded on
   `firstPara` existing (see "TOC never lost" below).
2. **Measure and place the cap** (`dropcaps.js`, unchanged
   place-measure-undo logic, now running against clean, TOC-free layout).
3. **Re-insert** (`toc-move.js`): once `capPlaced` resolves, insert `#toc`
   immediately after the cap's host paragraph, or after the essay's first
   paragraph when no cap was placed.

`toc-move.js` exports two promises making each boundary explicit:
`tocDetached` (phase 1, always `Promise.resolve()` since the detach above
it is itself synchronous) and `tocMoved` (phase 3, as before).
`dropcaps.js` imports `tocDetached` and chains `capPlaced`'s whole pipeline
off it, before the `waitForBox`/`place()` calls that do the actual
measuring.

### Why this is acyclic (verified, not assumed)

The _promise dependency graph_ is a straight line:
`tocDetached → (cap measurement) → capPlaced → tocMoved`. `tocDetached`
needs nothing from `dropcaps.js`; `capPlaced` needs `tocDetached`;
`tocMoved` needs `capPlaced`. No promise anywhere awaits something that
(transitively) awaits it back.

The _ES-module import graph_, however, does have a cycle:
`dropcaps.js` imports `tocDetached` from `toc-move.js`, and `toc-move.js`
imports `capPlaced` from `dropcaps.js`. I traced this by hand against the
ES module evaluation algorithm (imports fully evaluate the target module,
including circular re-entries, before the importing module's own
top-level code continues) rather than assuming the task's "no cycle"
framing meant no module-graph edge at all:

- `typography.js` imports `dropcaps.js` before `toc-move.js`, so
  `dropcaps.js` is the module that "enters" the cycle. When its import of
  `toc-move.js` triggers `toc-move.js`'s evaluation, `toc-move.js` in turn
  hits its own `import { capPlaced } from "./dropcaps.js"` — circular,
  so the loader links the binding without re-evaluating, and `capPlaced`
  is still in the temporal dead zone (dropcaps.js hasn't reached that line
  yet).
- If `toc-move.js`'s `export const tocMoved = moveToc();` called
  `moveToc()` synchronously right there (as the pre-existing code did),
  `moveToc`'s first `await capPlaced` would evaluate the identifier
  `capPlaced` as part of building the `await` expression — a synchronous
  read, before any suspension — and throw a `ReferenceError` from the
  TDZ. That throw lands inside `moveToc`'s own `try`/`catch` around that
  await, so it wouldn't crash, but it _would_ silently and permanently
  treat `capPlaced` as rejected, defeating the whole anchor-on-host fix
  every single time.
- Fix: `export const tocMoved = Promise.resolve().then(moveToc);` defers
  the call to a microtask. Microtasks only run after the _entire_
  currently-executing synchronous job finishes — which includes the whole
  static module graph's evaluation, cycle and all — so by the time
  `moveToc` actually runs, `dropcaps.js` has long since defined
  `capPlaced`.
- Symmetrically, I deferred `dropcaps.js`'s read of `tocDetached` the same
  way (`Promise.resolve().then(() => tocDetached).then(...)` rather than
  reading `tocDetached` inline) so the code doesn't silently depend on
  `dropcaps.js` being imported before `toc-move.js` forever — a future
  reordering of `typography.js`'s two import lines would otherwise crash
  the whole module graph outright (an uncaught TDZ `ReferenceError`, not
  even a swallowed one), which is exactly the kind of "incidental to
  import order" fragility the task asked me to avoid.

I confirmed this by literally breaking each side (see "Teeth" below) and
by running the full test suite with the real code, which requires the
cycle to resolve cleanly on every module load, not just once.

### How the TOC is guaranteed never lost

- The detach (`if (toc && firstPara) toc.remove();`) only runs when
  `firstPara` exists — with no paragraph at all, `tocAnchor` can never
  resolve to anything (`capHost ?? firstPara ?? null` with both null),
  so removing `#toc` would strand it with nowhere to go. In that case
  `tocDetached` still resolves (there's nothing to await for) but nothing
  is ever removed, matching "strict no-op ... no paragraphs".
- `moveToc()`'s `await capPlaced` is wrapped in `try`/`catch`: a rejection
  falls back to `capHost = null`, so `tocAnchor` still resolves to
  `firstPara`.
- The actual DOM insertion has two fallback layers: `anchor.after(toc)`
  is wrapped in `try`/`catch`; if it throws, `firstPara.after(toc)` is
  tried; if _that_ throws too, `document.querySelector(".article-body")
?.append(toc)` is the last resort. Every one of these three attempts
  targets a node that is either the resolved anchor, the always-present
  first paragraph, or `.article-body` itself — `#toc` ends up back in the
  document on every code path short of `.article-body` itself having been
  removed from the page entirely (a case beyond what any DOM move can
  recover from).
- Both `tocDetached` and `tocMoved` are plain `Promise.resolve()`/
  `.then()` chains with no unbounded awaits of their own — `tocDetached`
  can't hang since the detach it stands for is synchronous, and
  `tocMoved`'s only await (`capPlaced`) is already documented and
  unit-tested to always settle (bounded by dropcaps.js's font-load-vs-2s-
  timeout race, unchanged from before).

### Comments corrected

Rewrote the header comments in `static/js/toc-move.js` (full rewrite:
history of the two earlier fixes, the measurement-cycle diagnosis, the
three-phase design, the import-cycle/TDZ reasoning, the never-lost
guarantee) and `static/js/dropcaps.js` (added the "must run after
`tocDetached`" section explaining why measuring before the TOC moves away
is wrong, and why `capPlaced` defers its read of `tocDetached` to a
microtask). Updated `static/js/typography.js`'s "Ordering invariant"
paragraph to describe the three-phase sequence instead of the old
two-party (`capPlaced`/`tocMoved`) framing. Updated `static/js/main.js`'s
load-order comment to mention the `dropcaps.js`/`toc-move.js` mutual
import. Re-read `static/js/mark-para-indent.js` and
`static/js/mark-long-tokens.js` in full: their claims ("must run before
`dropcaps.js`/`toc-move.js` touch `.article-body`'s HTML") are unaffected
by this change — the wholesale-innerHTML-rewrite-must-come-first ordering
they document doesn't interact with when the TOC gets detached — so
neither file needed edits.

### Tests

Updated `tests/toc-move.test.mjs`'s stale source-pinning assertion
(`if (!toc) return;`, `if (anchor) anchor.after(toc);`) to match the new
guard shape (`if (!toc || !firstPara) return;`) and added:

- `toc-move.js detaches #toc synchronously, at module evaluation, not
inside an async function` — pins the detach as a column-0 statement
  (`/^if \(toc && firstPara\) toc\.remove\(\);$/m`) preceding `moveToc`'s
  definition, and that `tocDetached` is a bare `Promise.resolve()`.
- `dropcaps.js awaits tocDetached before it measures anything` — pins
  that `capPlaced`'s chain reads `tocDetached` before it calls
  `waitForBox`/`place`.
- `the TOC is re-inserted even when capPlaced rejects` (replaces the
  previous iteration's equivalent test, updated for the new code shape).
- `the TOC is re-inserted even when the anchored insertion itself throws`
  — pins the two-level fallback (`firstPara.after(toc)`, then
  `.article-body`'s `append`).

**Baseline for this iteration: 154 passing. New count: 157 passing**
(154 baseline + 4 new tests − 1 old test folded into an updated
equivalent = net +3).

```
$ npm test
...
# tests 157
# suites 0
# pass 157
# fail 0
```

### Teeth (break → fail → restore, working tree clean before and after each)

Backed up both files to the scratchpad before starting; every restore
below was verified byte-identical via `diff`.

1. **Detach-before-measure**: reverted `dropcaps.js`'s `capPlaced` to the
   pre-fix `waitForBox(...).then(...)` (no `tocDetached` in the chain) →
   `dropcaps.js awaits tocDetached before it measures anything` failed
   (5 pass / 1 fail on `tests/toc-move.test.mjs`). Restored.
2. **Guaranteed re-insertion on `capPlaced` rejection**: removed the
   `try`/`catch` around `await capPlaced` in `moveToc()` → `the TOC is
re-inserted even when capPlaced rejects` failed (5/1). Restored.
3. **Guaranteed re-insertion on a throwing anchor move**: removed the
   nested `try`/`catch`/fallback around `anchor.after(toc)`, leaving a
   bare `anchor.after(toc);` → `the TOC is re-inserted even when the
anchored insertion itself throws` failed (5/1). Restored.
4. **Synchronous detach**: wrapped the detach in
   `tocDetached = Promise.resolve().then(() => { if (toc && firstPara)
toc.remove(); })` (deferring it to a microtask) → `toc-move.js detaches
#toc synchronously...` failed (5/1) once the test was tightened to
   check column-0 placement (an earlier, looser regex missed this
   break entirely — corrected before relying on it). Restored.

Full suite after all four restores: `npm test` → 157/157. `node --check`
on all four changed `.js` files confirms no syntax errors.

### Build

```
$ zola build
Building site...
-> Creating 4 pages (0 orphan) and 2 sections
Done in 33ms.

$ zola check --skip-external-links
Checking site...
-> Site content: 4 pages (0 orphan), 2 sections
Done in 36ms.
```

Both clean.

### What I inspected in the built HTML (no browser available)

- `/essays/nsi-vs-hydra-vs-riley/`: `<article id="article" class="essay">`
  and `<nav id="toc" aria-label="Contents">` both present; `.article-body`
  opens `<p>TL;DR: ...</p><p><em>An architectural review...` — same shape
  as the previous iteration's inspection, confirming the structural setup
  this fix targets is still present in the built output.

### What I could not confirm

Per the task's constraint, I cannot drive a browser, so — as flagged
explicitly in the task itself — I could not verify the one thing that
actually matters: that text visibly wraps beside the drop cap on all four
page types (an essay with a short lead-in like NSI, an essay with a plain
long opener, the demo typography essay, and `/about/` with no cap/TOC at
all), and that the TOC itself renders in the right place with no overhang.
Everything above is structural/source-level verification (the promise
graph resolves correctly, the DOM operations happen in the right order,
the fallbacks fire when broken) plus confirmation that the pre-existing
`capOverhangsParagraph` unit tests (pinning the exact 76px/113.8px/38px
numbers from your browser measurement) still pass unchanged. This is
exactly the browser sweep you said you'd do.
