# Mobile code overflow, ellipsis hanging, monospace protrusion — 2026-09-09

Three typography defects, diagnosed by the requester ahead of time. This
report covers what was actually changed (Fixes 1 and 2), and why Fix 3
was **not** changed — the hypothesis behind it didn't hold up once the
vendored `justif` source was read closely.

## Fix 1 — long inline `<code>` overflowed the column

**Cause, confirmed by reading `static/js/lib/justif/index.js`
(`beginEnhancement`, ~line 2223):** justif masks `overflow-wrap` and
`word-break` to `normal` on the `<p>` itself (an `!important` inline
style) before it lays a paragraph out, so its own line-breaking
measurements aren't second-guessed by the browser. `overflow-wrap` is
inherited, so a `<code>` with no specified value of its own inherits
that `normal` — a long token (a file path, an identifier) then has
nowhere to break and pushes past the column edge.

**Change** — `sass/_typography.scss`:

- `.article-body code, kbd, samp` gets `overflow-wrap: anywhere`. A
  property set directly on the element wins over an inherited value
  regardless of how the ancestor's value was set (inline, `!important`,
  or otherwise) — inheritance only supplies a value when the element has
  none of its own — so this overrides justif's mask without touching
  justif.
- `.article-body pre code` gets an explicit `overflow-wrap: normal`
  override. `pre` is already its own scroll container
  (`overflow-x: auto`), so breaking tokens mid-word there would only hurt
  readability for no overflow benefit; the task also scoped the fix to
  inline code specifically.

Verified via `zola build`'s compiled `style.css`:

```
.article-body code,.article-body kbd,.article-body samp{...;overflow-wrap:anywhere}
.article-body pre code{...;overflow-wrap:normal}
```

**Why this doesn't fight justif:** `overflow-wrap`/`word-break` are
listed among justif's `ATOMIC_PINNED_PROPERTIES`/masked declarations
only on the _paragraph_; nothing in the source checks or masks these
properties on `<code>` (or any inline descendant) directly, and the
`[data-justif]` line-breaking algorithm computes line breaks from
_measured text widths_, not from the DOM's own wrapping — the browser's
in-token wrap only ever kicks in as a fallback for a specific run whose
own advance exceeds the box, which is exactly the overflow case this
fixes. No justif option controls this; it's purely a CSS override.

**Confirmed structurally** (not just on the one reported essay): the
`.article-body code, kbd, samp` selector is not essay-scoped, so it
applies wherever the shared `#article`/`.article-body` template is used.
`content/essays/nsi-vs-hydra-vs-riley.md` isn't the only page with long
inline-code tokens — `on-typography.md`/`typography.md` also render long
`<code>…</code>` spans in the built HTML — so the fix isn't
essay-specific by construction.

## Fix 2 — the ellipsis never hangs

**Confirmed from `chunk-WWMSGT6G.js`:** `hangingCharacters = { start:
quotes, end: quotes + ".," + CJK }`. `…` (U+2026) is in neither that set
nor `latinProtrusion`, so it currently gets protrusion code `0` — no
hang, no optical nudge, at all.

**Source paths read for the option shapes:**

- `chunk-WWMSGT6G.js`: `latinProtrusion`, `groups`/`hangingCharacters`,
  `classify`, `composeProtrusion` (full body, including the `user` merge
  at the end) — the character-code table shape (`{ ch: { l?, r? } }`,
  values 0–1000, `1000` = `HANG` = the character's _entire_ advance width
  hangs) and how a `characters: { start, end }` override composes with it.
- `index.js` `resolveOptions` (~4373–4450): where `options.protrusion`
  (boolean vs. object) and `options.hangingPunctuation` (string vs.
  `{ edges, characters }` object) get parsed, and — the important part —
  where they interact.
- `index.js` `composedForFamily`/`buildRunMetrics` (~3292–3430): how the
  per-family table actually gets built and consumed per run at render
  time.

**A coupling I found that the diagnosis didn't call out, and had to make
a judgment call on:** `resolveOptions` derives `measuredProtrusion` as
_exactly_ `options.protrusion === true || options.protrusion === void 0`
(index.js line 4395). Passing `options.protrusion` as a user-table
object — the only way to add a codepoint `latinProtrusion` doesn't have —
unconditionally sets `measuredProtrusion` to `false` for **every**
character, not just the one being added. With it `false`,
`composedForFamily` never calls the live canvas-measured
`opticalProtrusion(spec)` and falls back to
`{...latinProtrusion, ...fontProtrusion(family)}` for all glyphs on all
elements. Two things made this an acceptable trade rather than a
regression to avoid:

- our body face is `"EB Garamond"` (`sass/_tokens.scss` `--serif`), which
  _is_ one of the hand-tuned entries in `FAMILY_TO_TABLE`/`TABLES`
  (microtype's own Garamond config) — so the fallback isn't a generic
  guess, it's a curated table for the exact font we ship.
  `FAMILY_TO_TABLE` only keys on the _authored_ first font-family (not
  whatever the browser actually renders), so this fallback is only as
  good as EB Garamond actually loading — the live-measured path is more
  robust to font-fallback, which is the cost being paid here.
- I could not find any public option that supplies a user table _and_
  keeps live measurement on; `protrusionUser` and `measuredProtrusion`
  are both derived from the single `options.protrusion` value with no
  other entry point.
- I did not measure this trade visually (see "what I could not confirm"
  below) — flagging it explicitly rather than deciding silently that it
  doesn't matter, per the instruction not to hide tradeoffs.

**Change** — `static/js/typography.js`, the `justify()` call:

- `protrusion: true` → `protrusion: { "…": { r: 250 } }`.
- `hangingPunctuation` is left as the plain string `"line-end-only"` —
  **not** widened to `{ edges: "line-end-only", characters: { end:
hangingCharacters.end + "…" } }`. Adding `…` to that set would force
  its protrusion code to `1000` (`HANG`) unconditionally at line end —
  the character's _entire own advance width_ hangs, and an ellipsis's
  advance is a lot wider than a period's — one dot's ink plus two more
  dots and the gaps between them, roughly 2.5–3× as wide in a typical
  serif text face. Full-width hang on something that wide would swallow
  a visibly wide notch out of the margin, not the small optical nudge
  hanging punctuation is supposed to produce.
- **Value chosen: `r: 250`, no `l` code.** Calibration: `.` is `r: 700`
  in `latinProtrusion`. The _absolute pixel_ hang justif produces is
  `(code / 1000) × the character's own measured advance`
  (`protrusionHangForCode`, chunk-WWMSGT6G.js). Scaling `700` down by the
  ~2.5–3× width ratio between an ellipsis and a period keeps that
  absolute pixel hang in the same range a hanging period already
  produces (`700 / 2.8 ≈ 250`), rather than the ellipsis's own greater
  bulk producing a proportionally bigger gap just because it's a wider
  character. No `l` code, matching every other single-sided stop already
  in `latinProtrusion` (`.`, `,`, `:`, `;`, `!`, `?` — none of them
  protrude on the left either). This is a reasoned estimate from source,
  not a browser measurement — see below.
- **Judgment call, scope not expanded:** the task also asked whether
  `:` `;` `!` `?` — in `latinProtrusion` but excluded from
  `hangingCharacters.end` — should be added to the hanging set. I judged
  **no**, and left them untouched. justif's own default already treats
  "gets a partial optical nudge at a line edge" (its protrusion codes:
  500/300/100/100) and "fully hangs past the margin" (the `HANG` set) as
  different things, reserving the latter for small, simple marks
  (quotes, period, comma). A colon's two stacked dots, a semicolon's
  comma-tail, and the vertical stroke of `!`/`?` read as more visually
  complex than a lone period or a round quote — a full `1000` hang would
  leave a more conspicuous, disconnected-looking mark sitting in the
  margin. This also keeps the ellipsis treatment (partial protrusion,
  not a full hang) consistent with how these four characters already
  behave, rather than inventing a new rule just for `…`.

## Fix 3 — monospace protrusion: hypothesis not confirmed, no fix made

The task's hypothesis was that `FAMILY_TO_TABLE`/`fontProtrusion` having
no monospace entry means IBM Plex Mono gets _no_ font-specific
protrusion table, and asked me to determine whether an absent font table
suppresses protrusion entirely (in which case, fix it) or whether the
base table still applies regardless (in which case, report and don't
invent a fix).

**Finding: the base table applies regardless, on every path I could
find. I made no code change for this fix.**

1. **Static fallback path** (`composedForFamily`, index.js ~3300):
   `base = {...latinProtrusion, ...fontProtrusion(family)}`. Spreading
   `undefined` (what `fontProtrusion("IBM Plex Mono, ...")` returns,
   since no monospace family is in the table) into an object literal is
   a no-op in JS — `base` is simply the full, unmodified `latinProtrusion`
   table, hyphen entry (`"-": { l: 500, r: 500 }`) included. An absent
   font table does not zero anything out; it just contributes no
   font-specific _overrides_ on top of the base.
2. **Live-measured path, which is what actually runs today:** our config
   passes `protrusion: true` (well, did — see Fix 2 above; note this
   conclusion doesn't change either way, since `fontProtrusion(family)`
   is spread the same way in both branches). `true` sets
   `measuredProtrusion = true`, so `composedForFamily` calls
   `opticalProtrusion(spec)` for _every_ font, including inline
   `IBM Plex Mono` runs — this measures actual rendered glyph ink via
   canvas, per font, independent of `FAMILY_TO_TABLE` entirely. `-` is in
   the optically-measured `CANDIDATES` list (index.js ~425), so its hang
   amount for monospace comes from a real measurement of that font's
   hyphen glyph, not a missing static table entry.

**What most plausibly explains the user's actual perception** (hyphens
in monospace not hanging "the way ordinary hyphens do"), found while
tracing this: `buildRunMetrics` (index.js ~3423) sets
`protrudeInkOnly: isMonospace(spec) && spec.key !== baseSpec.key` — i.e.
for any monospace run that _isn't_ the paragraph's base font (exactly
the inline-`<code>`-in-prose case), `protrusionHangForCode`
(chunk-WWMSGT6G.js ~688) clamps the hang to
`Math.min(advanceBasedHang, measure.inkBearings(ch, run)[side])`. The
adjacent source comment explains this is deliberate: "Monospace cells
carry huge side bearings; advance-relative protrusion codes would hang
the ink visibly past the margin." So inline-code hyphens _do_ get
protrusion, but it's clamped to the glyph's actual ink overhang rather
than the full advance-relative amount ordinary text gets — likely much
smaller in absolute pixels for a monospace font's wide fixed-width
cells, which would read as "barely hangs" rather than "doesn't hang."
I found no public option (`LAYOUT_OPTION_KEYS` is
`["hangingPunctuation", "protrusion", "expansion", "tracking",
"spacing", "lastLineMinWidth", "lastLineFit"]`) that controls
`protrudeInkOnly` — it's derived internally from `isMonospace()` and
whether the run's font differs from the paragraph's base font, not
exposed for override. Patching it would mean editing vendored
`justif`, which is out of scope.

**I did not invent a fix for this**, per the task's own instruction: the
hypothesis (absent font table ⇒ no protrusion) doesn't hold, and the
actual clamp mechanism is deliberate, internal, and not configurable
through the documented option surface. Reporting this rather than
patching around it.

## Test evidence

Added to `tests/typography.test.mjs` (CSS, via the existing
`buildSite()`/compiled-`style.css` pattern):

- `inline code wraps instead of overflowing the column` — asserts
  `overflow-wrap: anywhere` on `.article-body code, kbd, samp`.
- `code inside <pre> keeps overflow-wrap normal (pre has its own scroll
container)` — asserts `overflow-wrap: normal` on `.article-body pre code`.

Added to `tests/justif.test.mjs` (source-level, matching the file's
existing `extractBalanced`-based style):

- `the ellipsis gets a partial protrusion code, not a full hang` —
  extracts the `justify()` options object and asserts the `"…"` entry's
  `r` code is strictly between 0 and 1000.
- `the ellipsis is not added to hangingPunctuation's hanging character
set` — asserts `hangingPunctuation` stays the plain string
  `"line-end-only"`.
- `hyphens still fully occupy the base latinProtrusion table
(colon/semicolon/!/? are not widened into a hang)` — guards against
  someone later "completing the set" by handing `hangingPunctuation` a
  `characters` object.

**Demonstrated teeth on all four new tests** — broke the invariant, ran
the specific test, watched it fail with the expected assertion error,
restored, reran green:

- Reverted `overflow-wrap: anywhere` → `normal` on inline code → `inline
code wraps...` failed (`AssertionError`, no match). Restored, green.
- Removed `overflow-wrap: normal` from `pre code` → `code inside <pre>
keeps...` failed with `error: 'background:none;padding:0;font-size:inherit'`
  not matching. Restored, green.
- Reverted `protrusion: {"…": {r:250}}` → `protrusion: true` → `the
ellipsis gets a partial protrusion code...` failed with `expected an
options.protrusion entry for the ellipsis`. Restored, green.

Commands and results:

```
$ npm test                # node --test tests/**/*.test.mjs
# tests 125 / pass 125 / fail 0   (baseline was 120; +5 new tests)

$ zola build --output-dir /tmp/zbuild-check2 --force
Building site... -> Creating 4 pages (0 orphan) and 2 sections. Done in 31ms.

$ zola check --skip-external-links
Checking site... -> Site content: 4 pages (0 orphan), 2 sections. Done in 25ms.
```

## What needs a browser (I cannot drive one, and did not claim to)

- **390px sweep, every page:** confirm `document.documentElement`
  (or `<body>`) never has `scrollWidth > clientWidth` on any page,
  specifically re-check `/essays/nsi-vs-hydra-vs-riley/` (the originally
  reported 114px overflow) and the other two essays
  (`on-typography`, `typography`) which also render long inline `<code>`
  spans in their built HTML. Also re-confirm the table on
  `nsi-vs-hydra-vs-riley` still scrolls in its own container and hasn't
  changed shape (I didn't touch table CSS).
- **Ellipsis hang, at a line end:** find an `…` that justif places at the
  end of a justified line and check it visibly nudges into the right
  margin by roughly the pixel range a hanging period produces on that
  line — not by nothing (the old bug) and not by the ellipsis's entire
  own width (what a full `HANG` treatment would have looked like).
- **The measured→static protrusion trade for Fix 2** (see above): I
  cannot compare "live canvas-measured EB Garamond protrusion" against
  "the static `FAMILY_TO_TABLE` EB Garamond table" visually. If ordinary
  (non-ellipsis) protrusion — periods, commas, quotes, round caps —
  looks noticeably different anywhere now, that's this trade, not a bug;
  worth a comparison sweep since I could not do one myself.
- **Monospace hyphen protrusion (Fix 3):** no code changed, so nothing
  to verify there — but if you want to confirm the `protrudeInkOnly`
  explanation above rather than take it on the source reading alone,
  measuring the actual hang-in-px of a hyphen inside inline `<code>`
  versus a hyphen in body text on the same line would show the clamp in
  action.

## What I could not confirm

- The exact width ratio between an ellipsis glyph and a period in EB
  Garamond (used to derive `r: 250`) is a reasoned estimate from general
  serif-font proportions, not a measurement — I have no way to run the
  canvas/DOM measurement code path myself. If it doesn't look right, the
  value is a single number in `static/js/typography.js` and easy to
  retune with `latinProtrusion`'s `.`/`,` entries as a reference.
- Everything under "What needs a browser," above — visual/layout
  outcomes in general, per the task's constraint.

## Addendum — Fix 2 reworked: the trade-off wasn't necessary

The coordinator caught a mistake in the Fix 2 write-up above: I'd read
`resolveOptions` far enough to see that `options.protrusion` as an
object disables live-measured protrusion sitewide, but not far enough to
notice that `hangingPunctuation.characters` is resolved on a completely
independent path a few lines earlier in the same function:

```js
const hangChars =
  hangObject?.characters === void 0
    ? hangingCharacters
    : {
        start: hangObject.characters.start ?? hangingCharacters.start,
        end: hangObject.characters.end ?? hangingCharacters.end,
      };
// ...
const measuredProtrusion =
  options.protrusion === void 0 || options.protrusion === true;
const composed =
  !protrusionModel && !hanging
    ? null
    : composeProtrusion(
        protrusionModel ? latinProtrusion : {},
        protrusionUser,
        hangMode,
        hangChars,
      );
```

`hangChars` flows into `composeProtrusion`'s `classify(base, chars.end,
"r", HANG)` regardless of what `protrusion` is set to — it never touches
`protrusionUser`/`measuredProtrusion`. So the ellipsis can be added to
the hanging-character set without ever constructing a `protrusion`
object, and the measured-vs-static trade-off documented above didn't
need to be made at all.

**Reworked `static/js/typography.js`:**

- `protrusion: true` restored (live canvas measurement back on
  sitewide — the `{"…": {r:250}}` user table is gone).
- `hangingPunctuation` changed from the plain string `"line-end-only"`
  to `{ edges: "line-end-only", characters: { end: hangingCharacters.end
  - "…" } }`, importing `hangingCharacters`from`./lib/justif/index.js` rather than hand-copying its character list
(`quotes + ".," + CJK`) — so this doesn't quietly go stale if a future
    justif version changes that default set.
- Consequence I hadn't weighed the first time: `characters.end` only
  ever produces a full `HANG` (1000) code via `classify` — there's no
  way to give a character in that set a partial code the way the old
  `protrusion` user-table entry could. So the ellipsis now gets a full,
  100%-of-its-own-advance-width hang at line end, not the calibrated
  partial `r: 250` from the first version. I flagged in the original
  write-up that a full hang seemed disproportionate for a wide glyph;
  that concern still stands as a visual judgment call I can't verify
  myself — it's now in the coordinator's "will verify in the browser"
  queue rather than something I designed around by (as it turned out,
  needlessly) giving up live measurement.
- Comments rewritten to explain the actual mechanism (independent
  resolution paths) rather than the either/or I'd previously believed
  applied everywhere in `resolveOptions`.
- `:` `;` `!` `?` reasoning carried over unchanged, re-recorded against
  the new mechanism: still not added to `characters.end`, for the same
  reason (justif's own default already separates "gets an optical nudge"
  from "fully hangs," reserving the latter for small, simple marks).

**Tests reworked in `tests/justif.test.mjs`:**

- `protrusion stays live-measured, not swapped for a static user table`
  — replaces the old partial-protrusion-code test; asserts
  `protrusion: true` is present and no `protrusion: {` object exists.
- `the ellipsis is added to justif's own exported hanging-character set,
not a hand-copied one` — replaces the old "not added to
  hangingPunctuation" test (inverted, since the mechanism changed);
  asserts both that `hangingCharacters` is imported from
  `./lib/justif/index.js` (guards against a future hand-copy) and that
  `hangingPunctuation` has the `{ edges, characters: { end:
hangingCharacters.end + "…" } }` shape.
- `hyphens still fully occupy the base latinProtrusion table
(colon/semicolon/!/? are not widened into a hang)` — kept, re-targeted
  at the new `characters.end` expression instead of a `hangingPunctuation:
{` absence check.

**Demonstrated teeth on all three reworked/new tests** (broke, watched
fail, restored, reran green):

- Reverted `protrusion: true` → `protrusion: { "…": { r: 250 } }` →
  `protrusion stays live-measured...` failed: `AssertionError: a user
protrusion table object would disable live measurement sitewide`.
- Reverted `hangingPunctuation` to the plain string `"line-end-only"`
  (dropping the ellipsis extension entirely) → both `the ellipsis is
added to justif's own exported hanging-character set...` and `hyphens
still fully occupy the base latinProtrusion table...` failed (no
  `characters.end` match; "expected a characters.end extension").
- Removed the `hangingCharacters` import and hand-copied its character
  list inline instead → `the ellipsis is added to justif's own exported
hanging-character set...` failed on the import-source assertion
  specifically (`hangingCharacters` not imported from
  `./lib/justif/index.js`).

All three restores brought the suite back to green.

**Re-verified after the rework:**

```
$ npm test
# tests 125 / pass 125 / fail 0

$ zola build --output-dir /tmp/zbuild-check3 --force
Building site... -> Creating 4 pages (0 orphan) and 2 sections. Done in 33ms.

$ zola check --skip-external-links
Checking site... -> Site content: 4 pages (0 orphan), 2 sections. Done in 26ms.
```

**What I still could not confirm:** everything under "What needs a
browser" above still applies (390px sweep, ellipsis hang appearance).
One item is now different rather than resolved: since the ellipsis gets
a full `HANG` (not the calibrated `r: 250`), please specifically check
whether a full-width hang looks right for a glyph this wide, or reads as
excessive — that's the coordinator's call to make visually, not
something I could weigh from source alone. The "measured vs. static
protrusion" comparison table in the coordinator's message is now moot
for this change (protrusion stays live-measured, unchanged from before
either fix), but worth keeping in mind if `protrusion` options are ever
touched again here.

## Addendum 2 — Fix 1 didn't actually fix the justified case; real fix now in

Fix 1 above (`overflow-wrap: anywhere` on `.article-body code`) turned
out to be necessary but not sufficient. Direct 390px measurement found
`/essays/nsi-vs-hydra-vs-riley/` still overflowing by 104px, all of it
one span:

```
<code>3Delight/source/InteractiveRenderManager.cpp</code>
  width 428px, right edge 481px, in a 346px column
  computed overflow-wrap: anywhere      ← Fix 1 IS applied
  wrapped in <span class="justif-seg"> with white-space: nowrap
```

**Root cause, confirmed by reading `static/js/lib/justif/index.js`'s
renderer (~line 1063):** justif wraps every text run it lays out in
`<span class="justif-seg">`, and `.justif-seg { white-space: nowrap }`
(justif's own injected stylesheet, index.js ~849) is what actually
defeats Fix 1 — not the paragraph-level `overflow-wrap` mask Fix 1
already accounts for. Per the CSS Text spec, `white-space: nowrap`
suppresses _all_ soft-wrap opportunities, `overflow-wrap: anywhere`
included; it only ever gets a chance to fire where a line-break
opportunity already exists. Since this whole path is one justif "box"
(no space, no dash) with no internal break candidate, there is no
opportunity for `overflow-wrap` to act on, `nowrap` or not.

### The two candidate mechanisms from the brief — both investigated, both rejected as literally stated

**1. The `hyphenate` hook (`typography.js` already passes
`hyphenateEnUS`).** Read `chunkPieces()` in
`static/js/lib/justif/chunk-WWMSGT6G.js` (~line 835) end to end before
concluding anything:

```js
var WORD_CORE = /^(\P{L}*)(\p{L}+)(\P{L}*)$/u;
// ...
if (opts.hyphenate && chunk.length >= MIN_HYPHENATION_LENGTH) {
  const m = WORD_CORE.exec(chunk);
  if (m && m[2].length >= MIN_HYPHENATION_LENGTH) {
    const parts = opts.hyphenate(core.toLowerCase());
```

`hyphenate` is only ever called when the **entire chunk** is a single
run of Unicode letters with nothing but punctuation/digits immediately
before or after it. `"3Delight/source/InteractiveRenderManager.cpp"` has
four separate letter runs split by `/` and `.`; `WORD_CORE.exec()`
against the whole thing fails to match at all (verified by literally
running the regex against the string in Node), so `opts.hyphenate` is
never invoked on it — not "invoked but returns nothing useful," never
called. Chunking on dashes happens earlier via `splitAtDashes()`
independent of `hyphenate`, and dashes already get free, invisible
breaks natively (`dashJunctionClass`, width-0 penalty) — that's not the
gap here; `/` and `.` are the gap, and this hook structurally cannot
reach them. It's also the wrong tool for camelCase for an unrelated
reason: `chunkPieces` calls `opts.hyphenate(core.toLowerCase())` — case
is destroyed before the callback ever sees the word, so even a pure
camelCase identifier like `InteractiveRenderManager` (which _would_
match `WORD_CORE`) can't have its case boundaries detected through this
hook. **Rejected — confirmed non-viable for both the path case and the
camelCase case, not assumed.**

**2. Raw U+200B (ZERO WIDTH SPACE) inserted pre-justify.** Read the
tokenizer that would have to recognize it:

- The top-level word/whitespace splitter,
  `TEXT_SEPARATOR_SPLIT = /([\t\n\r ]+|[  -  　])/`
  (chunk-WWMSGT6G.js ~557), matches space characters only up to U+200A —
  U+200B is one code point past the end of that range, deliberately or
  not, and is not matched.
- Inside `chunkPieces()`, the only character that gets special-cased
  regardless of `WORD_CORE` is `SOFT_HYPHEN` (U+00AD): `chunk.includes(
SOFT_HYPHEN)` splits into separately-breakable pieces unconditionally.
  There is no equivalent check for U+200B anywhere in either vendored
  file (`rg` for `200B`/`u200b` across both files matches only a CSS
  string constant used to _render_ an already-decided break, never to
  _recognize_ one in input text).

A literal ZWSP would sit inertly inside the one unbreakable box it's
already part of — zero width, zero effect, not a break opportunity.
**Rejected — confirmed non-viable, not assumed**, exactly as the brief
asked me to check rather than take on faith.

### What actually works, and why it's a variant of (2)

`chunkPieces()`'s `SOFT_HYPHEN` (U+00AD) branch is unconditional — no
`WORD_CORE` gate, no case-lowering — so it is the one character in this
vendored justif that genuinely creates a break opportunity inside an
arbitrary token. The cost, also read from source rather than assumed:
`chunk-WWMSGT6G.js` computes `hyphenated: isPenalty && it.width > 0`,
and a `SOFT_HYPHEN` break is given `width: run.hyphenWidth` (the
measured width of an actual "-" glyph, index.js ~3400) — nonzero, always
— so any line that actually breaks at one of these points shows a
visible "‐". There is no path to an invisible mid-token break without
editing vendored `justif`, which is out of scope. This is the accepted
trade the brief flagged as acceptable for (2): "if you use (2) ... a
break mid-word ... is worse but acceptable as a last resort."

Crucially, a soft hyphen that's never _used_ stays fully invisible and
zero-width — Knuth-Plass only chooses a break that improves the line's
fit, so it never breaks at a soft hyphen the token didn't need in order
to fit. This makes the length-threshold heuristic below safe even where
it's imprecise: tagging a token that turns out not to need to wrap costs
nothing visible.

**Implementation — new file `static/js/lib/break-long-tokens.js`, pure
string logic, zero DOM:**

- `insertSoftBreaks(token)`: inserts U+00AD after `/`, `.`, `-`, `_`, and
  at lowercase/digit-to-uppercase (camelCase) transitions, but only in
  tokens at or above `MIN_BREAKABLE_LENGTH = 20` characters (decoded —
  see below). Below that length the token is returned byte-for-byte
  unchanged. A token with no such boundary at all is also returned
  unchanged — this only exploits existing natural boundaries, it never
  invents a mid-run break.
  - Threshold chosen from the two data points in the brief:
    comfortably above `HdRenderPass` (12 chars, measured fitting fine at
    344/346px) and comfortably below `InteractiveRenderManager.cpp` (28
    chars, the measured-overflowing span, sub-token of the full path).
  - HTML entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&#39;` — the
    only ones Zola/pulldown-cmark emits in escaped code-span text) are
    tokenized as one opaque unit apiece, classified by the character
    they decode to. This keeps a break from ever landing inside an
    entity (`-&gt;`, real content in this essay's own
    `outputlayer.outputdrivers` sentence, breaks after the real `-`,
    never inside `&gt;`) and makes the length gate count decoded
    characters, not raw markup bytes.
- `stripSoftHyphens(text)`: removes U+00AD — the copy-paste half, below.
- `breakLongCodeTokens(html)`: the `.article-body`-innerHTML-level pass —
  walks `<code>...</code>` spans (each non-whitespace run through
  `insertSoftBreaks`), explicitly skipping anything inside `<pre>` (its
  own scroll container per Fix 1's `pre code { overflow-wrap: normal }`,
  and corrupting a copy-pasted code block is worse than corrupting an
  inline path).

**New file `static/js/mark-long-tokens.js`** wires this into the DOM,
mirroring `mark-para-indent.js`'s existing pattern exactly: rewrites
`.article-body.innerHTML` wholesale, wrapped in try/catch, exports an
already-resolved `longTokensMarked`. `typography.js` imports it ahead of
`dropcaps.js`/`toc-move.js` (same ordering invariant as
`paraIndentMarked` — both rewrite the same innerHTML wholesale before
either of those touch it; the two rewrites don't interact, since one
edits `<p>` text around `<br>`/newlines and the other edits text inside
`<code>`) and awaits it in the same `Promise.all` before
`markPunctuation`/`justify`. The "All three are no-ops on non-essay
pages" comment was updated to "All four" — keeping it accurate per the
ordering-invariant-comments requirement.

### The clipboard question

Soft hyphens are real DOM characters, so a plain selection-copy of a
"broken" code span would include them (browsers generally do a raw
`textContent`-style extraction on copy, not a rendered-appearance one).
`mark-long-tokens.js` registers a document-level `copy` listener: if the
current selection's text contains U+00AD, it calls
`event.preventDefault()` and writes `stripSoftHyphens(selection)` to
`event.clipboardData` as `text/plain` instead of letting the browser's
default (unstripped) payload through.

**How I verified this, and what I couldn't:** `stripSoftHyphens` itself
is unit-tested directly (removes every U+00AD, touches nothing else).
The event-wiring code was verified by reading, not running — this repo
deliberately has no DOM emulator, and I cannot drive a browser, so the
`copy` listener itself has no automated test; `tests/mark-long-tokens.
test.mjs` instead pins its _shape_ at the source level (registers a
`copy` listener, writes through `stripSoftHyphens`, calls
`preventDefault`) the same way the project already tests
`mark-para-indent.js`'s DOM wiring. **You need to verify**: select and
copy text from the `3Delight/source/InteractiveRenderManager.cpp` code
span (ideally across a point where it visibly wrapped) and paste it
somewhere plain-text to confirm no invisible characters came along.

### Test evidence

New file `tests/break-long-tokens.test.mjs` (11 tests, no DOM) covers
exactly the four cases the brief asked for, plus entity-safety:

- the measured overflow path — exact expected output asserted
  character-for-character, including a `3` → `Delight` digit-to-uppercase
  boundary I hadn't anticipated until the test caught my own wrong
  expectation (see "teeth" below)
- a long camelCase identifier with no punctuation
  (`InteractiveRenderManager` alone)
- a short identifier below the gate (`HdRenderPass`, `Stop()`) — left
  **byte-for-byte** untouched
- a long token with no natural boundary at all — left untouched, no
  invented mid-word break
- an entity (`-&gt;`) never gets split internally
- the length gate counts decoded length, not raw HTML length (an
  entity-padded 21-byte string that decodes to 9 characters must stay
  untouched, and does)
- `stripSoftHyphens` round-trips cleanly
- `breakLongCodeTokens` on real markup: transforms long inline `<code>`,
  leaves `<pre><code>` and short `<code>` alone, preserves attributes

New file `tests/mark-long-tokens.test.mjs` (5 tests, source-level,
mirrors `mark-para-indent.test.mjs`): no-op guard, try/catch +
already-resolved export, `copy`-handler shape, and the two
`typography.js` sequencing invariants (awaited before
markPunctuation/justify; imported ahead of dropcaps.js/toc-move.js).

**Demonstrated teeth** — broke, ran, watched fail, restored, reran
green:

- Removed the `MIN_BREAKABLE_LENGTH` gate entirely →
  `a short identifier below the length gate...`,
  `threshold counts decoded length...`, and
  `leaves short inline <code> spans untouched` all failed. Restored,
  green.
- Replaced `UNIT_RE` with `/[\s\S]/gi` (no entity recognition) → my
  first version of the decoded-vs-raw-length test still passed by
  accident (its example word happened to contain no boundary
  characters, so nothing visibly changed either way) — rewrote it to
  include a `.` near the end so a raw-length-based implementation
  would both mis-qualify the token _and_ produce a visible difference;
  re-ran the break: `threshold counts decoded length...` now correctly
  failed. Restored, green.

Also caught mid-flight by the harness itself, not a deliberate break:
my first hand-written "expected" string for the path case
(`3Delight/source/...`) omitted the digit-to-uppercase break between
`3` and `Delight` that my own `isLower`/`isUpper` rule (which treats
digits as "lower" for this purpose) actually produces. The test failed
against my own implementation on the first run; I fixed the test's
expectation to match the (correct, intentional) behavior rather than
weakening the rule.

```
$ npm test
# tests 141 / pass 141 / fail 0   (baseline for this task was 125; +16 new)

$ zola build
Building site... -> Creating 4 pages (0 orphan) and 2 sections. Done in 45ms.

$ zola check --skip-external-links
Checking site... -> Site content: 4 pages (0 orphan), 2 sections. Done in 34ms.
```

Also spot-checked `breakLongCodeTokens` against the actual built HTML
(`public/essays/nsi-vs-hydra-vs-riley/index.html`'s real `<li>` of
3Delight plugin paths, extracted verbatim) rather than only synthetic
test strings: the reported culprit gets soft hyphens at every `/` and
`.` plus its two camelCase joints; a sibling long path
(`src/NSIExportDelegate.h`, 24 chars) also qualifies and gets broken at
its own boundaries; ten shorter siblings (`src/dlViewport.h`,
`viewport_hook.cpp`, `ROP_3Delight.cpp`, etc., all under 20 decoded
characters) are untouched; and `stripSoftHyphens` on the transformed
`<li>` reproduces the original HTML exactly.

### What I could not confirm

- **The actual fix, visually.** I cannot drive a browser. You need to
  re-sweep all seven pages at 390px and confirm
  `scrollWidth === clientWidth` everywhere, specifically
  `/essays/nsi-vs-hydra-vs-riley/`. I'm confident in the mechanism (verified
  `SOFT_HYPHEN` creates a real Knuth-Plass break candidate by reading
  `chunkPieces()`/the break-candidate scan directly), but confidence
  from source reading is not the same as seeing it render.
- **The visible "‐" glyph's appearance in situ** — how it actually looks
  breaking `3Delight/` mid-path, versus not breaking at all (the
  overflow) or a browser-native mid-letter break (the worse fallback the
  brief explicitly accepted as a last resort). This is a visual judgment
  call I can't make from source.
- **The clipboard fix**, per the "How I verified this" section above:
  the stripping _function_ is tested; the `copy`-event _wiring_ is not
  runnable here and needs a real copy/paste in a browser to confirm.
- Whether `src/NSIExportDelegate.h` and its three siblings (now also
  carrying soft hyphens, since they cross the 20-character gate)
  actually needed them — the sweep only reported one overflowing span,
  so these are speculative coverage. Per the "false positives are
  invisible" argument above this should be harmless, but I have no way
  to see whether it's _also inert_ in the browser as reasoned, only that
  it's inert in the algorithm as read.
