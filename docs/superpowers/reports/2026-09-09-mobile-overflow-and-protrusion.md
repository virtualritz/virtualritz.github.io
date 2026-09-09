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
