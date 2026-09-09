/**
 * Punctuation refinement, run before justif measures anything.
 *
 * Zola's smart_punctuation already produces the right codepoints (`--`
 * becomes an en dash, `---` an em dash), so this only adds *spacing*.
 * Spacing comes from CSS padding rather than Unicode space characters
 * because those are not a portable width: thin space varies 2.1x across
 * our candidate faces and hair space 12.2x (see spec §8).
 */

// TeX's rule: a period after a lowercase letter or digit ends a sentence;
// after a capital it is an initial. These are the exceptions.
const ABBR =
  /(?:^|[\s("'"'"])(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|cf|etc|Fig|No|Vol|Ed|pp|al|Inc|Ltd|Co|ca|approx|[A-Za-z]\.[A-Za-z])$/;

const SENTENCE = /([a-z0-9)\]"'"'])([.!?])([""')\]]?)(?=[ \u00a0]+[A-Z""'('])/g;

/** Offsets of sentence-terminating punctuation runs in `text`. */
export function findSentenceEnds(text) {
  const cuts = [];
  SENTENCE.lastIndex = 0;
  let m;
  while ((m = SENTENCE.exec(text))) {
    const wordStart = Math.max(
      text.lastIndexOf(" ", m.index),
      text.lastIndexOf("\u00a0", m.index),
    );
    // The abbreviation list is anchored with $, so `preceding` must stop at
    // the letter and exclude the terminal period — otherwise "Dr." can never
    // match "Dr" and every abbreviation reads as a sentence end.
    const preceding = text.slice(wordStart + 1, m.index + 1);
    if (ABBR.test(" " + preceding)) continue;
    cuts.push({
      start: m.index + m[1].length,
      len: m[2].length + m[3].length,
    });
  }
  return cuts;
}

function textNodes(root) {
  const out = [];
  const w = root.ownerDocument.createTreeWalker(root, 4 /* TEXT */);
  let n;
  while ((n = w.nextNode())) {
    if (n.parentElement && !n.parentElement.closest("code,pre,kbd,samp"))
      out.push(n);
  }
  return out;
}

function wrap(node, start, len, className) {
  const target = node.splitText(start);
  target.splitText(len);
  const span = node.ownerDocument.createElement("span");
  span.className = className;
  span.textContent = target.data;
  target.replaceWith(span);
}

/**
 * Wrap em dashes and sentence punctuation for CSS spacing. Idempotent:
 * unwraps any previous pass first.
 * @returns {{dashes: number, sentences: number}}
 */
export function markPunctuation(root) {
  unmarkPunctuation(root);
  let dashes = 0;
  let sentences = 0;

  // em dashes first: closed up in the markup, spaced by .emd padding.
  // Breaks stay available on both sides because an em dash is line-break
  // class B2 in UAX #14 — no word joiner needed.
  for (const node of textNodes(root)) {
    const cuts = [];
    for (let i = 0; i < node.data.length; i++) {
      if (node.data[i] === "\u2014") cuts.push({ start: i, len: 1 });
    }
    for (const c of cuts.reverse()) {
      wrap(node, c.start, c.len, "emd");
      dashes++;
    }
  }

  // English spacing: padding goes on the period, never on a bare space.
  // justif refuses a padded span with no text content (spec §7.2), and
  // this way the word space stays pure glue for Knuth-Plass.
  for (const node of textNodes(root)) {
    const cuts = findSentenceEnds(node.data);
    for (const c of cuts.reverse()) {
      wrap(node, c.start, c.len, "sg");
      sentences++;
    }
  }

  return { dashes, sentences };
}

/** Restore the original text, discarding our spans. */
export function unmarkPunctuation(root) {
  for (const span of root.querySelectorAll("span.emd, span.sg")) {
    span.replaceWith(span.ownerDocument.createTextNode(span.textContent));
  }
  root.normalize();
}
