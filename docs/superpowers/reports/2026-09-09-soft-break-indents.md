# Soft-break indents and related fixes — 2026-09-09

## 1. Soft line breaks indent the next line

`static/js/lib/para-indent.js` now does two passes inside
`insertParaIndentMarkers(html)`:

1. **New**: `convertSoftBreaks` scopes to each `<p>...</p>` element found
   by `P_ELEMENT` (a non-greedy `<p\b[^>]*>...<\/p>` match — `<p>` never
   nests in HTML, so this is exact) and, inside it, replaces a bare `\n`
   with `<br />` + the `.para-indent` marker + the original `\n`. This
   only fires between real content:
   - leading newline (start of paragraph) → left alone
   - trailing newline (end of paragraph) → left alone
   - a newline that would straddle a blank line (`\n\s*\n`) → left alone
   - a newline immediately preceded by `<br>` (marked or not) → left
     alone, so it doesn't double up with the existing authored-break pass
     and so the whole function is idempotent (a second run sees the
     freshly-inserted `<br />` + marker before the `\n` and skips it)
   - a `<pre>`, `<code>` or `<table>` block nested inside the `<p>` is
     matched and passed through as one atomic unit, so newlines inside it
     are never touched (defence in depth — CommonMark doesn't actually
     nest those inside inline content or leave raw newlines in a code
     span, but the requirement asked for it explicitly)
2. **Unchanged**: the existing global `<br>` regex pass, which still adds
   a marker after any authored `<br>` that doesn't have one yet.

`static/js/mark-para-indent.js`'s no-op guard changed from "has a `<br>`"
to "has a `<p>`" (`body.querySelector("p")`), because a page using only
plain soft breaks — zero authored `<br>`s — must still get the rewrite.
Updated its header comment and `tests/mark-para-indent.test.mjs`'s
regex assertion to match.

`typography.js` already awaited `paraIndentMarked` inside
`Promise.all([capPlaced, tocMoved, paraIndentMarked])` before
`markPunctuation`/`justify` (this predates my change), so no wiring
change was needed there — the ordering invariant holds unchanged.

### Edge cases handled (and tested)

- leading/trailing newline in a paragraph
- a newline that would produce a blank line
- multiple soft breaks in one paragraph
- a soft break immediately after an authored `<br>` (Zola's own hard-break
  shape is `<br />\n` — must not double-mark)
- newline between two `<p>` elements (structural, not a soft break) — untouched
- newline inside a nested `<code>`/`<pre>`/`<table>` — untouched
- idempotency (run twice, no duplication)
- no-op on a fragment with no `<p>` and no `<br>`

### No-JS behaviour (confirmed, documented in CLAUDE.md)

- **Hard break** (`\` / two trailing spaces): Zola server-renders a real
  `<br>`, so the line break always happens; only the indent is
  JS-dependent.
- **Soft break** (plain newline): Zola leaves it as a literal `\n` inside
  the `<p>`'s text. `sass/*.scss` sets no `white-space` on `.article-body`
  or `p`, so default `white-space: normal` collapses that newline to an
  ordinary rendered space with JS off — text reads as one continuous
  wrapped sentence, nothing disappears, only the indent/gap distinction
  is lost. Verified by inspecting the sass files for `white-space` (only
  hits are `.dropcap`/`.sidenote`, unrelated) and by reasoning from CSS
  defaults, since I cannot drive a browser.

## 2. Unwrapped hard-wrapped content files

`content/about.md` and `content/essays/typography.md` had every paragraph
joined onto a single source line (measurements from the brief, not
re-derived). Not touched: table rows, code fences, TOML frontmatter,
blockquote marker lines are still one `>` line per rendered line (but the
prose _inside_ the blockquote, the `{% collapse %}` body, and both
footnote definitions were also unwrapped, since all three render as `<p>`
soft-broken text in `.article-body` exactly like a regular paragraph and
would otherwise pick up a spurious indent).

`content/essays/typography.md`'s paragraph break demo (the "hard line
break" paragraph) was **not** collapsed into one line — that would have
deleted the very break it's demonstrating. Its second line is now
produced by a plain newline (a soft break) instead of the original
trailing backslash, and the prose was updated to mention that a soft
break works too — this directly demonstrates item 1, which is the
essay's whole purpose ("every typographic device ... on one page").

I also added one use of `****nasa****` to the small-caps section per
item 3.

Left alone, as instructed: `on-typography.md` (no wrapping) and
`nsi-vs-hydra-vs-riley.md` (no wrapping; its three existing soft breaks at
source lines 97, 181, 182 are deliberate and now become indents for free).

### Text-neutrality check

Built the site before and after my changes (`/tmp/zbuild-before` vs.
`public/`), extracted each page's `.article-body` text, stripped tags,
collapsed whitespace, and diffed word-by-word with
`difflib.SequenceMatcher`:

- `about/index.html`: byte-identical text.
- `essays/typography/index.html`: the only differences are the
  intentional content changes above (the updated hard-break sentence, the
  updated second demo line, and the new `****nasa****` example) — no
  incidental drift.
- `essays/nsi-vs-hydra-vs-riley/index.html`: the only differences are
  exactly the three typo fixes (`Hoewver`→`However`, `meast`→`least`,
  `youtful`→`youthful`, plus `designed`→`designed it` and `at time`→`at
the time`).

One real bug caught by this check and fixed: my first unwrap of
"...inside them---\nEnglish spacing..." dropped the rendered space
between the em dash and "English" (a soft break renders as a space, so
joining must insert one) — the diff caught it immediately, I re-added the
space, and the diff came back clean on rebuild.

## 3. Small caps via `****foo****`

Verified pulldown-cmark parses `****foo****` as nested
`<strong><strong>...</strong></strong>` (already confirmed by the task;
reconfirmed on my own build of the updated demo page). Added
`.article-body strong strong { font-variant: small-caps; font-weight:
normal; }` to `sass/_typography.scss`, next to `.small-caps`. Documented
both syntaxes in `CLAUDE.md`. Demo page now uses it once.

## 4. Dotted underline 50% bigger

`sass/_links.scss`: `background-size: 2px 1px` → `3px 1.5px`.
`background-position` vertical offset recomputed to keep the dot's
_centre_ fixed rather than its top edge: old centre was `1.9px - 0.5px =
1.4px` above the box bottom; new centre stays at `1.4px`, so new offset =
`1.4 + 1.5/2 = 2.15px` → `calc(100% - 2.15px)`. The seven `text-shadow`
entries were not touched.

## 5. Draft copy fixes in nsi-vs-hydra-vs-riley.md

- "Hoewver" → "However" (line ~134)
- "designed after" → "designed it after" (line ~24)
- "not meast on my youtful and ignorant request at time" → "not least on
  my youthful and ignorant request at the time" (line ~164)
- "we call Stop() in the wait loop" → "we call \`Stop()\`..." (the user's
  own example)

I scanned the whole file for other bare `Name()` occurrences (11 more
hits). All of them sit inside direct quotations of external source —
GitHub issue text, Doxygen comments, hdPrman/Gaffer source comments,
commit messages. I left those alone and only backticked the one instance
the brief named explicitly, since adding markup inside verbatim
quotations elsewhere wasn't asked for and the brief said to be
conservative.

## Test evidence

`npm test`: **120 passing** (baseline 109; +11: 10 new soft-break cases +
1 idempotency case in `para-indent.test.mjs`, 1 new CSS case in
`typography.test.mjs`; `links.test.mjs` and `demo.test.mjs` got new
assertions inside existing tests, not new test functions).

Demonstrated the new tests have teeth: commented out the
leading-newline guard in `convertSoftBreaks`, re-ran
`node --test tests/para-indent.test.mjs` → 17 pass / **1 fail**
("ignores a leading newline inside a `<p>`"), restored the file, re-ran →
18/18 pass again.

`zola build` and `zola check --skip-external-links`: both clean, no
warnings, 4 pages / 2 sections either way.

## What needs your browser sweep

- Soft-break indents rendering correctly on all three essays (only
  `nsi-vs-hydra-vs-riley.md` has pre-existing ones at lines 97/181/182;
  `typography.md`'s demo paragraph now has one too).
- The `****nasa****` small-caps rendering in the demo page.
- The thicker dotted underline (visually — I only verified the compiled
  CSS values, not how it looks).
- The no-JS path (disable JS, confirm soft breaks read as plain spaces
  and hard breaks as flush unindented lines, per the CLAUDE.md doc I
  wrote).

## Concerns

- None outstanding. The one thing worth double-checking visually: my
  vertical-centring choice for the underline (`2.15px`) is a reasoned
  default, not a browser measurement — the brief didn't hand me a target
  number for this one (unlike the horizontal `text-shadow` offsets, which
  are measured and untouched).
