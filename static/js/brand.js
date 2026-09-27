/**
 * Animates the nav brand's letters along Thunder VF's weight axis, the way
 * the Typeface Bench specimen (docs/specimen/typeface-bench.html) animated
 * its headline — including *how* it draws them.
 *
 * It draws SVG outlines, not text. An earlier version animated
 * `font-weight` on per-letter spans, which is simpler and was wrong: Skia
 * caches rasterised glyphs on a quantised grid, so the weight steps
 * between cached bitmaps instead of gliding. At the nav's old ~13px that
 * was imperceptible, which is why the shortcut looked fine; at the
 * masthead's 132px it reads as a twitch. Paths have no glyph cache — each
 * frame is rasterised from geometry — so the motion is continuous. The
 * specimen reached this conclusion first and said so in its own comments.
 *
 * Interpolation is exact, not approximate; see lib/thunder-outline.js and
 * build/thunder-paths.py for why a single delta set suffices.
 *
 * Loaded from templates/base.html rather than from main.js: the nav is on
 * every page, main.js only on essays.
 *
 * No-JS: base.html renders the brand as ordinary link text and
 * sass/_typography.scss sets it in Thunder, uppercase, at the same size,
 * so the wordmark looks deliberate with the script absent. The text stays
 * in the DOM when the SVG is built, too — it is what a screen reader
 * announces and what copy/paste yields; only its pixels are hidden.
 */
import PATHS from "./lib/thunder-paths.js";
import { glyphPath, layout, weightT } from "./lib/thunder-outline.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const brand = document.documentElement.classList.contains("nojs-sim")
  ? null
  : document.querySelector("#brand");

// prefers-reduced-motion softens the wave rather than stopping it, which
// is what the specimen did. Stopping it outright was an earlier choice
// here and it was wrong twice over: the owner asks for this animation and
// could not see it running, and a weight wave is not the kind of motion
// the preference exists to guard against — nothing translates, scales or
// flashes; only stroke thickness changes, in place.
const reduce =
  window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The specimen's `anim` defaults, and its own reduced-motion softening.
const FREQ = reduce ? 0.06 : 0.35; // Hz
const AMP = reduce ? 0.75 : 1; // fraction of the 100-900 axis range
const SPREAD = 0.55; // radians of phase per letter
const MIN = 100;
const MAX = 900;
const MID = 500;

if (brand && PATHS.g[PATHS.text.replace(/ /g, "")[0]] !== undefined) {
  // Fixed advances from the mid-axis instance: a glyph's advance grows
  // with its weight, so live advances would make the word breathe and
  // slide. Computed once and never again.
  const lay = layout(PATHS, MID);

  // Ascender headroom, in font units, matching the specimen's framing.
  const top = -0.8 * PATHS.upem;
  const vbHeight = 1.04 * PATHS.upem;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute(
    "viewBox",
    `0 ${top.toFixed(0)} ${lay.width.toFixed(0)} ${vbHeight.toFixed(0)}`,
  );
  svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // Sized in em so it tracks #brand's own clamp() font-size exactly as the
  // text it replaces did, rather than filling the measure.
  svg.style.width = `${(lay.width / PATHS.upem).toFixed(4)}em`;
  svg.style.height = "auto";
  svg.style.display = "block";
  svg.style.overflow = "visible";

  // Font coordinates are y-up; SVG is y-down.
  const flip = document.createElementNS(SVG_NS, "g");
  flip.setAttribute("transform", "scale(1,-1)");
  svg.append(flip);

  const cells = [];
  for (const slot of lay.slots) {
    if (slot.ch === " ") continue;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("transform", `translate(${slot.x.toFixed(1)},0)`);
    flip.append(path);
    cells.push({ ch: slot.ch, path });
  }

  // Move the anchor's own text into a span so CSS can hide its pixels. It
  // is a bare text node otherwise, and a text node cannot be selected —
  // and it must stay in the DOM regardless: it is the link's accessible
  // name and what copy/paste yields.
  const text = document.createElement("span");
  text.className = "brand-text";
  text.append(...brand.childNodes);
  brand.append(text, svg);
  brand.classList.add("has-outline");

  const paint = (t) => {
    cells.forEach(({ ch, path }, i) => {
      const half = (AMP * (MAX - MIN)) / 2;
      let v = MID + half * Math.sin(2 * Math.PI * FREQ * t + i * SPREAD);
      v = Math.max(MIN, Math.min(MAX, v));
      path.setAttribute("d", glyphPath(PATHS, ch, weightT(v)));
    });
  };

  paint(0);

  let t0 = 0;
  let raf = 0;
  const frame = (now) => {
    if (!t0) t0 = now;
    paint((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  };

  // Run only while the brand is on screen and the tab is frontmost. rAF
  // already stops in a background tab, but a long page scrolled past the
  // masthead would otherwise keep rasterising outlines nobody can see.
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const start = () => {
    if (raf) return;
    t0 = 0;
    raf = requestAnimationFrame(frame);
  };

  let onScreen = true;
  const sync = () => (onScreen && !document.hidden ? start() : stop());

  document.addEventListener("visibilitychange", sync);
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(brand);
  }
  sync();
}
