/**
 * Drop-cap geometry, derived from glyph ink rather than tuned constants.
 *
 * All glyph and body metrics are per-em ratios, so this is pure and
 * testable without a browser. The caller supplies them from Canvas:
 * actualBoundingBox* for ink, fontBoundingBox* for the metrics the
 * browser uses in line layout.
 */

// 4% of a line of slack. Without it, sub-pixel noise from browser zoom
// flips ceil() across an integer boundary and the reserved line count
// oscillates between 3 and 4 (spec §6).
const LINE_HYSTERESIS = 0.04;

export function capGeometry({
  bodyMetrics,
  glyphMetrics,
  bodySize,
  lineHeight,
  lines,
  fit = "ink",
  capDropPct = 0,
  growPct = 0,
}) {
  const L = bodySize * lineHeight;
  const fbAsc = bodyMetrics.fbAsc * bodySize;
  const fbDesc = bodyMetrics.fbDesc * bodySize;
  const capInk = bodyMetrics.capInk * bodySize;
  if (!(glyphMetrics.inkAsc > 0)) return null;

  const b1 = (L - (fbAsc + fbDesc)) / 2 + fbAsc; // baseline within line 1
  const boxHeight = (lines - 1) * L + capInk; // line-1 cap top → line-n baseline

  // "ink" fits the whole glyph, descender included, inside the box.
  // "base" fits only the part above the baseline, dropping the tail below.
  const denom =
    fit === "base"
      ? glyphMetrics.inkAsc
      : glyphMetrics.inkAsc + glyphMetrics.inkDesc;
  const size = (boxHeight / denom) * (1 + growPct / 100);

  const inkAsc = glyphMetrics.inkAsc * size;
  const inkDesc = glyphMetrics.inkDesc * size;
  const capTop = b1 - capInk;
  const inkTop = capTop + (capDropPct / 100) * boxHeight;
  const inkBottom = inkTop + inkAsc + inkDesc;

  const need = Math.max(
    1,
    Math.ceil((inkBottom - capTop) / L - LINE_HYSTERESIS),
  );

  // place the element so the glyph's ink top lands at inkTop
  const glyphBaselineOffset =
    (size - (glyphMetrics.fbAsc * size + glyphMetrics.fbDesc * size)) / 2 +
    glyphMetrics.fbAsc * size;

  return {
    size,
    top: inkTop + inkAsc - glyphBaselineOffset,
    lines: Math.max(lines, need),
    boxHeight,
    lineHeightPx: L,
    // horizontal: the glyph origin stays at the column edge so swash ink
    // overhangs left, which reads correctly. Do not flush the ink.
    inkLeft: glyphMetrics.inkLeft * size,
    inkRight: glyphMetrics.inkRight * size,
  };
}

/**
 * Binary-search a variable font's weight so the cap's stem is
 * `targetRatio` times the body stem. Absolute equality reads anaemic:
 * IM Fell English measures 5.23x and looks right (spec §6).
 */
export function solveWeight(stemAtWeight, bodyStemPx, targetRatio, capSize) {
  let lo = 100;
  let hi = 900;
  let w = 400;
  for (let i = 0; i < 14; i++) {
    w = (lo + hi) / 2;
    const ratio = (stemAtWeight(Math.round(w)) * capSize) / bodyStemPx;
    if (ratio > targetRatio) hi = w;
    else lo = w;
  }
  return Math.max(100, Math.min(900, Math.round(w)));
}
