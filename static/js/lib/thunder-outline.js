/**
 * Interpolates Thunder VF's outlines for the wordmark, as SVG path geometry.
 *
 * This is the whole point of not using CSS for the brand animation. Skia
 * caches rasterised glyphs on a quantised grid, so stepping a variable
 * font's weight through `font-weight` snaps between cached bitmaps — at
 * body sizes that is invisible, at the masthead's 132px it reads as a
 * twitch. Paths carry no glyph cache: every frame is rasterised from
 * geometry with analytic anti-aliasing, so the motion is continuous. The
 * Typeface Bench specimen reached the same conclusion first
 * (docs/specimen/typeface-bench.html); this is that approach with the
 * site's own wordmark, and the logic below is ported from it.
 *
 * The data comes from build/thunder-paths.py. Interpolation is exact
 * rather than approximate: Thunder's wght axis is a single two-master
 * tuple with no avar, so an instance is precisely
 *   point = point@900 + t * (point@100 - point@900),  t = (900 - wght)/800.
 *
 * Pure functions, no DOM, so tests/brand.test.mjs can check the geometry
 * without a browser.
 */

/** Axis travel from the fvar default (900) toward the delta master (100). */
export function weightT(wght) {
  return (900 - wght) / 800;
}

/**
 * The `d` attribute for one glyph at one weight.
 *
 * TrueType curves are quadratic and consecutive off-curve points imply an
 * on-curve point midway between them; a "Q" op therefore carries a whole
 * run of controls plus the on-curve point that ends it, and the implied
 * midpoints are reconstructed here rather than stored.
 */
export function glyphPath(data, ch, t) {
  const g = data.g[ch];
  if (g === undefined) return "";
  const n = g.pts.length;
  const q = new Array(n);
  for (let k = 0; k < n; k++) q[k] = g.pts[k] + t * g.d[k];

  const X = (j) => q[2 * j].toFixed(1);
  const Y = (j) => q[2 * j + 1].toFixed(1);

  let d = "";
  let idx = 0;
  for (const [op, cnt] of g.ops) {
    if (op === "M") {
      d += `M${X(idx)} ${Y(idx)}`;
      idx += 1;
    } else if (op === "L") {
      d += `L${X(idx)} ${Y(idx)}`;
      idx += 1;
    } else if (op === "Q") {
      for (let j = 0; j < cnt - 1; j++) {
        const cx = q[2 * (idx + j)];
        const cy = q[2 * (idx + j) + 1];
        let ex, ey;
        if (j === cnt - 2) {
          ex = q[2 * (idx + cnt - 1)];
          ey = q[2 * (idx + cnt - 1) + 1];
        } else {
          // the implied on-curve point between two controls
          ex = (cx + q[2 * (idx + j + 1)]) / 2;
          ey = (cy + q[2 * (idx + j + 1) + 1]) / 2;
        }
        d += `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      }
      idx += cnt;
    } else if (op === "Z") {
      d += "Z";
    }
  }
  return d;
}

/**
 * Letter positions on FIXED advances, taken from one weight and never
 * recomputed.
 *
 * A glyph's advance grows with its weight, so laying the word out on live
 * advances makes it breathe and slide sideways under the wave — and at
 * masthead size that is far more distracting than the weight change
 * itself. The specimen pinned advances to the mid-axis instance for the
 * same reason, and the CSS version of this brand pinned per-letter widths
 * to solve the identical problem.
 */
export function layout(data, wght) {
  const t = weightT(wght);
  const slots = [];
  let x = 0;
  for (const ch of data.text) {
    const adv =
      ch === " "
        ? data.space + t * data.spaceD
        : data.g[ch].adv + t * data.g[ch].advD;
    slots.push({ ch, x, adv });
    x += adv;
  }
  return { slots, width: x };
}
