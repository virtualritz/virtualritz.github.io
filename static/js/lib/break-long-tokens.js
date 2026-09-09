/**
 * Pure string transform that gives justif (../justif/**) legal break
 * points inside long, space-free `<code>` tokens — file paths, dotted or
 * underscored identifiers, camelCase names — that would otherwise punch
 * through the column on narrow viewports.
 *
 * Why not the two obvious options — both read from justif's own source,
 * not assumed:
 *
 *  1. The `hyphenate` option (typography.js already passes hyphenateEnUS).
 *     chunkPieces() in chunk-WWMSGT6G.js only calls it when the WHOLE
 *     chunk matches `WORD_CORE = /^(\P{L}*)(\p{L}+)(\P{L}*)$/u` — one
 *     single run of letters with only punctuation/digits before or after.
 *     "3Delight/source/InteractiveRenderManager.cpp" has four letter runs
 *     separated by "/" and ".", so it never matches and `hyphenate` is
 *     never even called on it. It would also be the wrong tool for
 *     camelCase: chunkPieces() lower-cases the word before calling
 *     `hyphenate`, destroying the case boundary the break would need.
 *  2. A literal U+200B (ZERO WIDTH SPACE) is not a recognized break
 *     point. The top-level word/space splitter (TEXT_SEPARATOR_SPLIT)
 *     matches real whitespace only up to U+200A, and chunkPieces() only
 *     special-cases U+00AD (SOFT HYPHEN). A ZWSP would sit inertly inside
 *     the one unbreakable box it's already part of.
 *
 * U+00AD (SOFT HYPHEN) *is* unconditionally recognized: chunkPieces()
 * does `chunk.includes(SOFT_HYPHEN)` before it ever checks WORD_CORE, and
 * splits into separately-breakable pieces regardless of chunk shape. That
 * is the one character that genuinely creates a break opportunity inside
 * an arbitrary token in this vendored justif — so this module inserts
 * U+00AD, not U+200B.
 *
 * Cost, also read from source rather than assumed: justif reserves width
 * for a hyphen glyph at *any* break item with nonzero width
 * (`hyphenated: isPenalty && it.width > 0` in chunk-WWMSGT6G.js, and
 * `run.hyphenWidth` — the measured width of "-" — is what SOFT_HYPHEN
 * breaks are given), so a line that actually breaks at one of these
 * points shows a visible "‐". There is no option that gives justif an
 * invisible mid-token break without editing the vendored source. A soft
 * hyphen that never gets used (the token fits without breaking) stays
 * fully invisible and zero-width, so tagging a token that never actually
 * needs to wrap costs nothing visible — Knuth-Plass never prefers a worse
 * fit, so it only takes the break when the token doesn't otherwise fit.
 *
 * Soft hyphens are real characters, so a copy of "broken" code text would
 * include them unless stripped back out — see mark-long-tokens.js's
 * `copy` handler, built on `stripSoftHyphens` below.
 */

// Comfortably above the longest span measured still fitting its column
// ("HdRenderPass", 12 chars) and comfortably below the shortest span
// measured overflowing ("InteractiveRenderManager.cpp", 28 chars). A
// token below this length is left completely untouched.
export const MIN_BREAKABLE_LENGTH = 20;

export const SOFT_HYPHEN = "­";

// Zola/pulldown-cmark only ever emits these five entities inside escaped
// code-span text. Each is treated as a single opaque unit: never split,
// and classified by the character it decodes to (so e.g. "-&gt;" gets a
// break after "-" but never inside "&gt;").
const ENTITY_DECODE = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};
const UNIT_RE = /&(?:amp|lt|gt|quot|apos|#39);|[\s\S]/gi;

const PUNCT_BOUNDARY = new Set(["/", ".", "-", "_"]);
const isLower = (ch) => /[a-z0-9]/.test(ch);
const isUpper = (ch) => /[A-Z]/.test(ch);

/**
 * Inserts U+00AD at natural break boundaries inside a single whitespace-
 * free token: after "/", ".", "-", "_", and at lowercase/digit-to-
 * uppercase (camelCase) transitions. Tokens shorter than
 * MIN_BREAKABLE_LENGTH (counting an HTML entity as one decoded character)
 * are returned unchanged. A token with no such boundary is also returned
 * unchanged — this is a source of natural break points, not a generic
 * word-wrapper, so it never invents a break in the middle of an
 * unbroken run of letters.
 */
export function insertSoftBreaks(token) {
  const units = token.match(UNIT_RE);
  if (units === null || units.length < MIN_BREAKABLE_LENGTH) return token;

  const decoded = units.map((u) => ENTITY_DECODE[u.toLowerCase()] ?? u);

  let result = units[0];
  for (let i = 1; i < units.length; i++) {
    const prev = decoded[i - 1];
    const cur = decoded[i];
    const breakBefore =
      PUNCT_BOUNDARY.has(prev) || (isLower(prev) && isUpper(cur));
    if (breakBefore) result += SOFT_HYPHEN;
    result += units[i];
  }
  return result;
}

/** Strips U+00AD back out — used to keep copied text clean. */
export function stripSoftHyphens(text) {
  return text.split(SOFT_HYPHEN).join("");
}

// Matches a whole <pre>...</pre> block (left untouched: it's its own
// scroll container, see sass/_typography.scss) or a <code>...</code>
// span not inside one. Alternation order matters: a <pre> containing
// <code> is matched whole by the first branch, so the second branch never
// sees the code nested inside it.
const PRE_OR_CODE =
  /<pre\b[\s\S]*?<\/pre>|<code(\s[^>]*)?>([\s\S]*?)<\/code>/gi;

/**
 * Runs insertSoftBreaks() over every non-whitespace run inside every
 * inline `<code>` span in `html`, skipping anything inside `<pre>`.
 * Intended for `.article-body`'s innerHTML, ahead of justify() — see
 * mark-long-tokens.js.
 */
export function breakLongCodeTokens(html) {
  return html.replace(PRE_OR_CODE, (match, attrs, inner) => {
    if (inner === undefined) return match; // matched a whole <pre>...</pre>
    const attrPart = attrs ?? "";
    const transformed = inner.replace(/\S+/g, insertSoftBreaks);
    return `<code${attrPart}>${transformed}</code>`;
  });
}
