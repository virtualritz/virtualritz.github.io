#!/usr/bin/env python3
"""Extract Thunder VF's outlines for the nav brand as interpolable geometry.

Why this exists: Skia caches rasterised glyphs on a quantised grid, so
animating a variable font's weight through CSS snaps and twitches. It is
invisible on body copy and very visible on a 132px masthead. The Typeface
Bench specimen (docs/specimen/typeface-bench.html) answered this by
rasterising the outlines itself each frame, as plain SVG path geometry with
analytic anti-aliasing and no glyph cache, and this reproduces that — the
specimen only carries the letters of "ON TYPOGRAPHY", so the site's own
wordmark needs its own data.

The interpolation is exact, not approximate. Thunder's wght axis is a
single two-master tuple (fvar: min 100, default 900, max 900) with no avar,
so every instance is precisely

    point = point@900 + t * (point@100 - point@900),   t = (900 - wght) / 800

which means the deltas can be taken by instancing the font at each end and
subtracting, rather than by reading gvar tuples. CNTR and ital both default
to 0 and the wave does not touch them, so only the wght delta is emitted.

Output is static/js/lib/thunder-paths.js, consumed by static/js/brand.js.

Run with `just fonts` or directly; needs fontTools (as build/fonts.py does).
"""

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "static" / "fonts" / "Thunder-VF.ttf"
OUT = ROOT / "static" / "js" / "lib" / "thunder-paths.js"

# The wordmark, uppercased the way the masthead renders it.
TEXT = "VIRTUAL RITZ"


def contours_to_ops(glyph, glyf):
    """Convert one TrueType glyph to the specimen's (ops, point-order) form.

    ops is a list of [command, points-consumed]; points are read from a flat
    coordinate list in order. "Q" carries every off-curve control of a run
    plus the on-curve point that ends it, because TrueType implies an
    on-curve midpoint between consecutive off-curve points and the renderer
    reconstructs those.
    """
    glyph.expand(glyf)
    if glyph.numberOfContours <= 0:  # empty or composite; the brand has none
        return [], []

    coords, end_pts, flags = glyph.getCoordinates(glyf)
    ops, order = [], []
    start = 0
    for end in end_pts:
        pts = list(range(start, end + 1))
        start = end + 1
        if not pts:
            continue
        on = [i for i in pts if flags[i] & 1]

        if on:
            # Rotate so the contour begins on-curve.
            k = pts.index(on[0])
            pts = pts[k:] + pts[:k]
            first = pts[0]
            ops.append(["M", 1])
            order.append(("pt", first))
            rest = pts[1:]
        else:
            # All off-curve: start at the implied midpoint of the last and
            # first control points.
            first = None
            mid = (
                (coords[pts[-1]][0] + coords[pts[0]][0]) / 2,
                (coords[pts[-1]][1] + coords[pts[0]][1]) / 2,
            )
            ops.append(["M", 1])
            order.append(("mid", pts[-1], pts[0]))
            rest = pts[:]

        run = []
        for i in rest:
            if flags[i] & 1:
                if run:
                    ops.append(["Q", len(run) + 1])
                    order.extend(("pt", j) for j in run)
                    order.append(("pt", i))
                    run = []
                else:
                    ops.append(["L", 1])
                    order.append(("pt", i))
            else:
                run.append(i)

        # Close the contour. Trailing controls curve back to the start point,
        # which is therefore repeated in the coordinate list.
        if run:
            ops.append(["Q", len(run) + 1])
            order.extend(("pt", j) for j in run)
            if first is not None:
                order.append(("pt", first))
            else:
                order.append(("mid", pts[-1], pts[0]))
        ops.append(["Z", 0])

    return ops, order


def coords_for(order, coords):
    """Flatten an order list against one instance's coordinates."""
    out = []
    for item in order:
        if item[0] == "pt":
            x, y = coords[item[1]]
        else:
            a, b = coords[item[1]], coords[item[2]]
            x, y = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        out.append(round(x, 1))
        out.append(round(y, 1))
    return out


def instance_at(weight):
    font = TTFont(FONT)
    instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True)
    return font


def main():
    if not FONT.exists():
        sys.exit(f"missing {FONT} — run `just fonts` first")

    base = instance_at(900)  # the fvar default
    light = instance_at(100)  # the delta master

    upem = base["head"].unitsPerEm
    gset_b, gset_l = base.getGlyphSet(), light.getGlyphSet()
    cmap = base.getBestCmap()
    glyf_b, glyf_l = base["glyf"], light["glyf"]
    hmtx_b, hmtx_l = base["hmtx"], light["hmtx"]

    out = {"upem": upem, "text": TEXT, "g": {}}

    for ch in sorted(set(TEXT)):
        name = cmap.get(ord(ch))
        if name is None:
            sys.exit(f"no glyph for {ch!r}")
        adv_b = hmtx_b[name][0]
        adv_l = hmtx_l[name][0]
        if ch == " ":
            out["space"] = adv_b
            out["spaceD"] = adv_l - adv_b
            continue

        ops, order = contours_to_ops(glyf_b[name], glyf_b)
        cb = coords_for(order, glyf_b[name].getCoordinates(glyf_b)[0])
        cl = coords_for(order, glyf_l[name].getCoordinates(glyf_l)[0])
        if len(cb) != len(cl):
            sys.exit(f"{ch!r}: point count differs between instances")

        out["g"][ch] = {
            "ops": ops,
            "pts": cb,
            "adv": adv_b,
            "d": [round(l - b, 1) for l, b in zip(cl, cb)],
            "advD": adv_l - adv_b,
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # An ES module rather than JSON: brand.js can then import it statically,
    # with no fetch to await and no import-attribute support to depend on.
    OUT.write_text(
        "// Generated by build/thunder-paths.py — do not edit.\n"
        "// Thunder VF outlines for the wordmark, as geometry the brand\n"
        "// animation interpolates itself. See that script for why.\n"
        "export default " + json.dumps(out, separators=(",", ":")) + ";\n"
    )
    size = OUT.stat().st_size
    print(f"wrote {OUT.relative_to(ROOT)} ({size} bytes) for {TEXT!r}")
    # Unused by the runtime, but the check that matters: the glyph set is
    # exactly the wordmark's letters, so nothing rides along unnoticed.
    print("glyphs:", " ".join(sorted(out["g"])))


if __name__ == "__main__":
    main()
