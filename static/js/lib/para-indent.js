/**
 * Pure string transform behind the paragraph-break inversion (see
 * ../mark-para-indent.js and sass/_typography.scss): a hard line break
 * (CommonMark "\" or two trailing spaces, rendered as `<br>`) OR a plain
 * soft line break (a single newline in the markdown source, which
 * pulldown-cmark leaves as a literal "\n" character inside the `<p>`'s
 * text) gets an indented continuation with no vertical gap; a blank line
 * (a new `<p>`) keeps the gap-and-flush styling every paragraph gets by
 * default. Authored hard breaks and soft breaks render identically once
 * marked — the only difference is which markdown syntax produced them.
 *
 * Measured in a real browser (not assumed): `br::before`/`::after` and a
 * `content` value on `<br>` itself never render — a pseudo-element on
 * `<br>` simply does not paint. `text-indent: 2.5em each-line` works but
 * also indents the paragraph's own first line, which the flush-break case
 * forbids. The one technique that measured correctly (0px on the
 * paragraph's own first line, 60px — 2.5em at 24px — on the line after the
 * `<br>`) is an inert marker element inserted right after the `<br>`:
 * `display: inline-block; width: 2.5em`. That is what this function
 * inserts; sass/_typography.scss's `.para-indent` rule supplies the width.
 *
 * A plain string transform rather than DOM surgery so it has no
 * dependency on a live document and is unit-testable without a DOM
 * emulator (project convention — see static/js/lib/punctuation.js and
 * dropcap-geometry.js for the same split between pure `lib/` logic and
 * DOM-wiring modules tested only at the source level).
 */

const BR = /<br\s*\/?>/gi;
const MARKER = '<span class="para-indent" aria-hidden="true"></span>';

// Matches immediately after a `<br>` this function already handled, so a
// second pass is a no-op instead of stacking another marker.
const ALREADY_MARKED = /^\s*<span class="para-indent"/i;

// Scopes the soft-break pass to actual `<p>...</p>` elements. `<p>` never
// nests in HTML, so a non-greedy match to the next `</p>` is exact. This
// is also what keeps the pass out of headings, list items (tight lists
// have no `<p>` at all), blockquote wrapper markup outside its inner
// `<p>`, and every sibling block — only text that is literally inside a
// `<p>` is ever considered.
const P_ELEMENT = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
const P_OPEN_TAG = /^<p\b[^>]*>/i;

// Within a `<p>`, alternates between "a nested block that must not have
// its newlines touched" and "a single newline". CommonMark already
// converts line endings inside a code span to spaces and never nests a
// `<pre>` or `<table>` inside inline paragraph content, so in real Zola
// output these branches are just defence in depth — but they make the
// exclusion exact rather than assumed.
const PROTECTED_OR_NEWLINE =
  /<(?:pre|code|table)\b[\s\S]*?<\/(?:pre|code|table)>|\n/gi;

// A newline immediately preceded by a `<br>` (marked or not) is an
// authored hard break, not a soft break — leave it for the existing
// `<br>` pass below, and don't stack a second break on top of it. This is
// also what keeps a second run of this function idempotent: once a soft
// break has been converted, the newline that follows sits right after
// `<br />` + MARKER and matches here.
const PRECEDED_BY_BREAK = new RegExp(
  `(?:${BR.source}|${MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[ \\t]*$`,
  "i",
);

/**
 * Convert a paragraph's own soft line breaks (bare "\n" between content)
 * into a `<br />` plus `.para-indent` marker, in place. Leading/trailing
 * newlines and any newline that would produce an empty line are left
 * alone — only a newline with real content on both sides is a break.
 * @param {string} inner text between a `<p...>` tag and its `</p>`
 * @returns {string}
 */
function convertSoftBreaks(inner) {
  return inner.replace(PROTECTED_OR_NEWLINE, (match, offset, str) => {
    if (match !== "\n") return match; // protected block: leave verbatim

    const before = str.slice(0, offset);
    const after = str.slice(offset + 1);

    if (/^[ \t\r\n]*$/.test(before)) return match; // leading newline
    if (/^[ \t\r\n]*$/.test(after)) return match; // trailing newline
    if (/[ \t]*\n\s*$/.test(before)) return match; // blank line above
    if (/^[ \t]*\n/.test(after)) return match; // blank line below
    if (PRECEDED_BY_BREAK.test(before)) return match; // already a break

    return `<br />${MARKER}\n`;
  });
}

/**
 * Insert `.para-indent` after every hard line break in an HTML fragment —
 * both an authored `<br>` and a plain soft break (a bare newline inside a
 * `<p>`) — skipping any break that already has one. Idempotent: calling
 * this again on its own output makes no further change. A no-op on a
 * fragment with neither a `<p>` nor a `<br>`.
 * @param {string} html
 * @returns {string}
 */
export function insertParaIndentMarkers(html) {
  const withSoftBreaksMarked = html.replace(P_ELEMENT, (pElement) => {
    const openTag = pElement.match(P_OPEN_TAG)[0];
    const inner = pElement.slice(
      openTag.length,
      pElement.length - "</p>".length,
    );
    return openTag + convertSoftBreaks(inner) + "</p>";
  });

  return withSoftBreaksMarked.replace(BR, (match, offset, str) => {
    const rest = str.slice(offset + match.length);
    return ALREADY_MARKED.test(rest) ? match : match + MARKER;
  });
}
