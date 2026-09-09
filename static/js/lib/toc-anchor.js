/**
 * Which paragraph the TOC should be inserted after.
 *
 * Pure and DOM-free: dropcaps.js resolves `capPlaced` with whichever
 * paragraph actually received the drop cap — usually the essay's first
 * paragraph, but a later one when the first is too short to host a
 * 3-line cap (see dropcap-candidates.js). The TOC is a preceding-sibling
 * float that only avoids intruding into whatever paragraph follows it in
 * DOM order (see toc-move.js's header comment), so it must land after
 * THAT paragraph specifically — landing after paragraph 0 while the cap
 * sits in paragraph 1 reproduces the exact bug this module exists to
 * avoid (the cap orphaned beside the TOC, its paragraph pushed below).
 *
 * Falls back to the essay's first paragraph when no cap was placed at all
 * (a short opening paragraph with no eligible candidate), and to `null`
 * (no-op: leave the TOC where the template put it) when neither exists —
 * every non-essay page, or an essay with no paragraphs.
 */
export function tocAnchor(capHost, firstPara) {
  return capHost ?? firstPara ?? null;
}
