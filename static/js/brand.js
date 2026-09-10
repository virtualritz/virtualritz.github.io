/**
 * Animates the nav brand's letters along Thunder VF's weight axis, the way
 * the Typeface Bench specimen (docs/specimen/typeface-bench.html) animated
 * its headline. Wave parameters are carried over from that page unchanged
 * — it is the one the site's faces were chosen on, so matching it is the
 * point, not a coincidence.
 *
 * Loaded from templates/base.html rather than from main.js: the nav is on
 * every page, main.js only on essays. It has no ordering relationship to
 * the article pipeline (it never touches .article-body), so it is a plain
 * independent module rather than another link in typography.js's chain.
 *
 * No-JS: base.html renders the brand as ordinary link text and
 * sass/_typography.scss uppercases it and sets it in Thunder at a fixed
 * weight, so the brand looks deliberate with the script absent — the
 * animation is the enhancement, the typography is not.
 *
 * Two things a naive version gets wrong, both learned from the specimen:
 *
 * 1. A glyph's advance changes with its weight, so animating weight on
 *    natural advances makes the word breathe and slide — and here it would
 *    drag Essays/Projects/About along with it, since the nav is a flex row
 *    and the brand is its first item. Each letter is therefore pinned to
 *    the advance it has at mid-weight and centred in that box, exactly the
 *    fixed-advance layout the specimen used. The word's total width then
 *    never changes and the rest of the nav holds still.
 *
 * 2. Skia caches rasterised glyphs on a 0.25px horizontal / 1px vertical
 *    grid, so CSS weight animation snaps rather than glides. The specimen
 *    answered that by rasterising outlines itself from a 7KB delta set;
 *    that is worth it for a 200px headline and not for a ~13px nav brand,
 *    where a quarter-pixel is well under a stem width. The CSS path is
 *    what runs here.
 */
import { waveWeight, WGHT } from "./lib/brand-wave.js";

// theme.js's development-only "JS: off" switch previews the CSS-only
// rendering; the brand's static, unsplit state is part of that.
const brand = document.documentElement.classList.contains("nojs-sim")
  ? null
  : document.querySelector("#brand");

// prefers-reduced-motion gets the static mid-weight, not a slowed wave.
// The specimen only softened the motion because motion was that page's
// subject; this one runs on every page for as long as the page is open,
// which is the ambient, unrequested kind the preference is asking about.
const reduce =
  window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Straight from the specimen's `anim` defaults.
const FREQ = 0.35; // Hz
const AMP = 1; // fraction of the 100-900 axis range
const SPREAD = 0.55; // radians of phase per letter

if (brand) {
  // Spaces stay ordinary text nodes rather than becoming cells, as in the
  // specimen's buildHeadline. A cell is an inline-block, and an
  // inline-block whose only content is a space collapses that space to
  // nothing — the word-gap in "Virtual Ritz" simply disappears.
  const cells = [];
  const nodes = [...brand.textContent].map((ch) => {
    if (ch === " ") return document.createTextNode(" ");
    const s = document.createElement("span");
    s.className = "brand-cell";
    s.textContent = ch;
    cells.push(s);
    return s;
  });
  brand.textContent = "";
  brand.append(...nodes);

  // Advances are only meaningful once the real face has loaded; measured
  // against the fallback they would pin every letter to the wrong box.
  // document.fonts.ready settles even if the font fails, in which case the
  // widths are simply the fallback's own and stay self-consistent.
  document.fonts.ready.then(() => {
    for (const s of cells) s.style.fontWeight = String(WGHT.mid);
    // Read every width before writing any, so the first assignment does
    // not invalidate layout for the measurements still to come.
    const widths = cells.map((s) => s.getBoundingClientRect().width);
    cells.forEach((s, i) => {
      s.style.width = widths[i].toFixed(3) + "px";
    });

    if (reduce) return;

    let t0 = 0;
    let raf = 0;
    const frame = (now) => {
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      cells.forEach((s, i) => {
        s.style.fontWeight = waveWeight(t, i, {
          freq: FREQ,
          amp: AMP,
          spread: SPREAD,
        }).toFixed(0);
      });
      raf = requestAnimationFrame(frame);
    };

    // Run only while the brand is actually on screen and the tab is
    // frontmost. rAF already stops in a background tab, but a long page
    // scrolled past the nav would otherwise keep repainting glyphs nobody
    // can see. Restarting resets t0, so the wave resumes from a flat
    // phase rather than jumping to wherever it would have been.
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
  });
}
