/**
 * Which leading paragraph should host the drop cap.
 *
 * Pure and DOM-free: the caller supplies the tag names of `.article-body`'s
 * direct children, in document order, and gets back the indices (into that
 * same array) of the paragraphs worth *trying* as a drop-cap host. Actually
 * placing the cap and measuring whether it fits happens in dropcaps.js,
 * which walks these indices in order and stops at the first one that works.
 */

const HEADING_TAG_RE = /^H[1-6]$/;

/**
 * A short lead-in (an epigraph, a TL;DR line, a standfirst) can leave the
 * true opening paragraph two or three deep. But a cap appearing well into
 * the body would read as misplaced, not intentional, so the search is
 * bounded rather than open-ended: 3 covers every lead-in shape seen on this
 * site (a one-line TL;DR plus a two-paragraph italic standfirst, the
 * deepest case observed), while still refusing to hunt for a home for the
 * cap indefinitely.
 */
export const MAX_DROPCAP_CANDIDATES = 3;

/**
 * Returns the indices of `tagNames` worth trying as a drop-cap host: the
 * leading `<p>` elements, in order, stopping at the first heading
 * (`H1`-`H6`) or once `maxCandidates` paragraphs have been collected,
 * whichever comes first. Non-paragraph, non-heading siblings (an `<hr>`, a
 * top-level blockquote, ...) are skipped without ending the search — only a
 * heading marks the end of the article's opening.
 */
export function selectDropcapCandidates(
  tagNames,
  maxCandidates = MAX_DROPCAP_CANDIDATES,
) {
  const indices = [];
  for (let i = 0; i < tagNames.length; i++) {
    const tag = tagNames[i];
    if (HEADING_TAG_RE.test(tag)) break;
    if (tag === "P") {
      indices.push(i);
      if (indices.length >= maxCandidates) break;
    }
  }
  return indices;
}
