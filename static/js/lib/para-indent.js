/**
 * Pure string transform behind the paragraph-break inversion (see
 * ../mark-para-indent.js and sass/_typography.scss): a hard line break
 * (CommonMark "\" or two trailing spaces, rendered as `<br>`) gets an
 * indented continuation with no vertical gap; a blank line (a new `<p>`)
 * keeps the gap-and-flush styling every paragraph gets by default.
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

/**
 * Insert `.para-indent` immediately after every `<br>` in an HTML
 * fragment, skipping any `<br>` that already has one. Idempotent: calling
 * this again on its own output makes no further change.
 * @param {string} html
 * @returns {string}
 */
export function insertParaIndentMarkers(html) {
  return html.replace(BR, (match, offset, str) => {
    const rest = str.slice(offset + match.length);
    return ALREADY_MARKED.test(rest) ? match : match + MARKER;
  });
}
