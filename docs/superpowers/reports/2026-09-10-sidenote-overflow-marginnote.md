# Sidenote overflow and inline `marginnote` — 2026-09-10

## Bug 1 — sidenote text overflowing its column

### Cause, confirmed from source

`static/js/typography.js`'s `SELECTOR` (`.article-body p, .article-body li,
.article-body blockquote p`) matched Zola's collected footnote `<li>`s
(and their inner `<p>`), because they live inside `.article-body` too.
justif justified them at the ~895px `.article-body` measure — the
`white-space: nowrap` per-word `justif-seg` spans it emits don't reflow —
and `static/js/sidenotes.js` then cloned that already-justified `<li>`
into a 260px sidenote column, where the frozen-width segments spilled out
(overlapping the body column on the left, and past the viewport edge on
the right).

### Chosen fix: exclude the source from justif, not strip the clone

The brief offered two options. I chose **excluding footnote content from
`SELECTOR`** (`:not(.footnotes *)` appended to each of the three
selector clauses) over stripping `data-justif`/`.justif-seg` back out of
the clone afterwards, because:

- It's strictly less code and fewer moving parts: nothing is ever applied
  to footnote content, so there's nothing to undo later. A stripping pass
  would also have to keep pace with justif's _other_ wrapper types
  (`justif-hyphen`, `justif-break`, `justif-joint`, `justif-soft-break`,
  `justif-weld-end`, each with their own inline styles/`::after` content —
  see `static/js/lib/justif/index.js` around line 950), not just
  `justif-seg`, to be genuinely artifact-free.
- It matches existing project precedent: an earlier verification pass
  (`docs/superpowers/plans/2026-09-08-typography-foundation-verification.md`,
  "Of the elements justif does report declining, two are the footnote
  `<li>`s... correct and harmless") already treated an unjustified
  footnote `<li>` as an acceptable, known-good state — this fix just makes
  that outcome deterministic instead of an accident of clip-CSS timing.
- The native fallback (below 1560px) simply reflows the footnote text with
  the browser's own line breaking instead of Knuth-Plass justification.
  That's a readability trade I judged acceptable given the precedent
  above; I did not find or add a test requiring footnote justification in
  the narrow-viewport fallback.

`static/js/sidenotes.js` needed **no change** for Bug 1: `li.cloneNode`
now always clones plain Zola markup.

## Bug 2 — `marginnote` renders inline, mid-sentence

### Why the clone-and-strip approach _was_ needed here

A `.marginnote` span sits inside a normal, still-must-be-justified
paragraph, so it can't be excluded from `SELECTOR` the way footnotes were
— that would un-justify the whole surrounding sentence. justif decomposes
inline content word-by-word regardless of ancestor element, so the live
`.marginnote` span carries the same non-reflowing artifacts footnotes did
(and more of justif's wrapper types, per the file's actual segment-emission
code, not just `.justif-seg`).

Rather than enumerate and strip every justif wrapper class from a live
clone (fragile — depends on justif's exact current markup, silently goes
stale on a justif upgrade), `static/js/typography.js` now snapshots each
`.marginnote`'s `innerHTML` once, right after `markPunctuation(body)` and
before `justify()` is ever called (`marginNoteHTML(index)`, exported).
That's the last point the markup is guaranteed both punctuation-marked
_and_ justif-untouched. `static/js/sidenotes.js` hoists from that snapshot,
falling back to the live span's `innerHTML` only if no snapshot exists
(i.e. `run()` bailed before reaching it — meaning justify() never touched
anything on that page either).

### Placement design

`static/js/sidenotes.js`'s `build()` is extended, not duplicated:

- `footnoteEntries()` and `marginNoteEntries()` each produce a list of
  `{ top, note }` — `top` measured from the _anchor_ (footnote reference
  `<sup><a>`, or the `.marginnote` span's own position — it has no
  separate reference mark to key off).
- Both lists are concatenated and handed to a new pure helper,
  `assignColumns` (`static/js/lib/sidenote-layout.js`), which sorts by
  `top` and alternates left/right by that combined order. `resolveColumn`
  (unchanged) then still does its per-column overlap-push job.
- This merge matters concretely: `content/essays/typography.md`'s
  demo footnote and its marginnote sit a few lines apart in the same
  section. Assigning columns per-kind independently (footnotes by their
  own list index, marginnotes by theirs) could put a footnote sidenote
  and a margin note in the same column with no shared collision check
  between them.
- A margin note gets a plain `div.sidenote` with no `.sidenote-number` and
  no backref stripping — it has no reference to strip.
- `has-sidenotes` (the flag both the footnote-list clip CSS and the new
  `.marginnote` clip CSS key off) now means "at least one sidenote column
  has content," from either source.

### Rebuild-safety bug I found while implementing this

Unlike a footnote's `<sup>` reference, a margin note's _anchor_ is the
same element that gets visually clipped once hoisted. The original
`build()` only cleared `has-sidenotes` inside the `!wide` early-return.
On a rebuild while already wide (a resize that stays wide, or
`resize-recompute.js`'s extra call after a rejustify) `has-sidenotes` was
still set from the previous pass, so a margin note's anchor would be
measured **while already clipped to its near-zero-size box**, placing the
new clone at the wrong height. Fixed by clearing `has-sidenotes`
unconditionally, before the wide/narrow branch is even reached, so every
`build()` call always measures against the true in-flow position. This
is also what makes the design rotation-safe: the original span is never
moved, only clipped/unclipped by the class toggle, and the columns are
always fully rebuilt from scratch — nothing to orphan or duplicate.

### Degradation below the breakpoint

Unchanged mechanically: below 1560px, `build()`'s `!wide` branch clears
both columns and (now unconditionally) removes `has-sidenotes`, which
un-clips every `.marginnote` via the CSS cascade — no DOM move needed,
since the span was never relocated. `sass/_components.scss`'s `.marginnote`
rule is what's visible there and in the no-JS case; I replaced its
leftover block-era declarations (`border-left`, `padding-left`,
`margin: 1em 0` — meaningless/incorrect on an inline span, kept from when
it was briefly `display: block`) with `font-style: italic` + a slightly
reduced `font-size` (0.92em) alongside the existing muted color, so it
reads as a visually distinct aside without breaking the sentence's flow.
`display: inline` itself is untouched.

## Test evidence

`npm test` baseline at the start of this session: **188 passing** (the
brief said 187; another agent had already landed one more test on
`master` before I started — matches the stated possibility). After this
work: **203 passing, 0 failing** (15 new tests, all in
`tests/sidenotes.test.mjs`; no other test file touched).

New tests pin:

- `SELECTOR` excludes `.footnotes` descendants (Bug 1), and that
  `sidenotes.js` contains no `justif-seg`/`data-justif` handling (i.e.
  confirms the "don't do both" choice).
- `typography.js` takes the `.marginnote` snapshot after
  `markPunctuation` and before `justify()`, and exports `marginNoteHTML`.
- `sidenotes.js` sources a margin note's clone via `marginNoteHTML`, not
  the live span.
- Exactly one `sidenote-number` in the file (footnotes only — no margin
  note ever gets numbered).
- `assignColumns` is used to merge both kinds into one column split.
- `assignColumns` itself (DOM-free): alternates by sorted `top`
  regardless of input order, stable on ties, doesn't mutate its input,
  safe on empty input.
- `has-sidenotes` is cleared _before_ the wide/narrow branch point, not
  just inside it (the rebuild-safety fix above) — with exactly one such
  clear call in the file.
- Build-based: the demo page's `.marginnote` sits inline inside a `<p>`
  in Zola's static output, with no `class="sidenote"`/`id="sn-..."`
  anywhere in server-rendered HTML (hoisting is 100% client-side).
- Build-based CSS: `.has-sidenotes .marginnote` uses the same clip
  technique as `.has-sidenotes .footnotes`; the base `.marginnote` rule
  has no `display: block` or `border-left`.

### Teeth demonstrated (break → fail → restore)

Ran for real, not just described:

1. Reverted the `SELECTOR` change (`sed`) → `justif's target selector
excludes Zola's collected footnote list` failed (202 pass / 1 fail).
   Restored → 203/0.
2. Removed the `.sort()` from `assignColumns` (`sed`) →
   `assignColumns alternates left/right...` failed. Restored → 203/0.
3. Moved the `has-sidenotes` clear back inside the `!wide` branch only
   (reintroducing the exact rebuild bug described above) — **my first
   version of this test didn't catch it**, because it only checked
   position relative to the first `getBoundingClientRect()` call, which
   is true in both the correct and buggy version. Rewrote it to check
   position relative to the `const wide = ...` branch point itself, then
   re-broke the same way and confirmed it now fails
   (`sidenotes.js clears has-sidenotes unconditionally...`, 202/1).
   Restored → 203/0.
4. Reintroduced `display: block` + `border-left` on `.marginnote` (`sed`
   on `sass/_components.scss`) → the CSS-pinning test failed. Restored →
   203/0.

All edits/restores were done with `sed`/`python3 -c` + exact re-application
of the original text (or a `cp` backup) — no `git stash`, no
`git checkout`/`restore` was used anywhere in this session.

`zola build` and `zola check --skip-external-links` both clean throughout
(re-verified after final restore).

## What I could not confirm

I cannot drive a browser, so none of the following is verified visually,
only reasoned from source:

- That the actual pixel ink extents at 2000px now stay inside the 260px
  columns and off the body text (the specific numbers in the bug report).
- That clipping a `.marginnote` span out of an already-justified paragraph
  (a CSS-only, post-layout change) doesn't leave a visible gap or slightly
  different line break where it used to sit, versus a fully rejustified
  paragraph. This mirrors the pre-existing footnote-hiding pattern
  (`.has-sidenotes .footnotes`), which has the same property and was
  already accepted, so I did not treat it as a new risk, but it is
  unverified for the mid-paragraph case specifically.
- Behavior across an actual rotation/resize in a real browser (the fix is
  designed to be idempotent and rotation-safe by construction — see
  "Rebuild-safety" above — but this is reasoning, not a headless-Chrome
  measurement).
