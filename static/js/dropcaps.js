/**
 * Ink-measured drop caps.
 *
 * Body and glyph metrics are measured live via Canvas rather than read
 * from static/fonts/manifest.json: rendered metrics must reflect the
 * font the browser actually loaded, and the manifest is keyed by slug
 * for the font tests' benefit, not for runtime layout.
 *
 * Must run BEFORE justif (typography.js's `run()`, which awaits
 * `capPlaced` below): justif has no second pass, so a cap inserted after
 * justification invalidates that paragraph's already-computed layout
 * forever (measured: the capped paragraph never got justified). The cap's
 * own geometry does not depend on justif's output — capGeometry() reads
 * only font-size, line-height and font metrics (all CSS-authored/font
 * data), never anything justif changes (word-spacing, letter-spacing,
 * line breaks) — so placing it first is safe. It still needs a real
 * layout box first, same as justif: computed font-size/line-height are
 * unreliable before styles have applied.
 */
import { waitForBox } from "./lib/wait-for-box.js";
import {
  capGeometry,
  capOverhangsParagraph,
  restoreLetter,
  solveWeight,
  stripLetter,
} from "./lib/dropcap-geometry.js";
import {
  MAX_DROPCAP_CANDIDATES,
  selectDropcapCandidates,
} from "./lib/dropcap-candidates.js";

const LINES = 3;
const CAP_DROP_PCT = 3;
const GROW_PCT = 4;
const STROKE_RATIO = 5.0; // spec §6: IM Fell English's J measures 5.23x
const REF = 240; // measure large, then scale: a 24px stem is under 2px
const OVERHANG_EPSILON_PX = 1; // absorb sub-pixel layout rounding

const cx = document.createElement("canvas").getContext("2d");
const stemCx = document
  .createElement("canvas")
  .getContext("2d", { willReadFrequently: true });

function inkRatios(family, ch, weight) {
  cx.font = `${weight ? weight + " " : ""}${REF}px "${family}"`;
  const m = cx.measureText(ch);
  return {
    inkAsc: m.actualBoundingBoxAscent / REF,
    inkDesc: m.actualBoundingBoxDescent / REF,
    inkLeft: m.actualBoundingBoxLeft / REF,
    inkRight: m.actualBoundingBoxRight / REF,
    fbAsc: m.fontBoundingBoxAscent / REF,
    fbDesc: m.fontBoundingBoxDescent / REF,
  };
}

/** Stem width as a fraction of em, by scanning one rasterised pixel row. */
function stemRatio(family, ch, weight) {
  const px = REF;
  stemCx.canvas.width = Math.ceil(px * 2.4);
  stemCx.canvas.height = Math.ceil(px * 2.4);
  stemCx.clearRect(0, 0, stemCx.canvas.width, stemCx.canvas.height);
  stemCx.font = `${weight ? weight + " " : ""}${px}px "${family}"`;
  stemCx.textBaseline = "alphabetic";
  stemCx.fillStyle = "#000";
  const by = Math.round(px * 1.6);
  stemCx.fillText(ch, Math.round(px * 0.5), by);
  const asc = stemCx.measureText(ch).actualBoundingBoxAscent;
  if (!(asc > 0)) return 0;
  // 45% of ink height above the baseline: "l" and "J" are pure stem there,
  // with the serifs above and below.
  const y = Math.round(by - asc * 0.45);
  const d = stemCx.getImageData(0, y, stemCx.canvas.width, 1).data;
  let best = 0;
  let run = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 100) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best / px;
}

/**
 * Try to place a cap on one candidate paragraph and measure whether it
 * actually fits. Returns true and leaves the cap in place if it does;
 * returns false and leaves `p` exactly as found (see the undo comment
 * below) if it overhangs or has no ink to cap at all.
 */
function tryPlaceCap(p, letter, opts, initial, weight) {
  const g = capGeometry({
    ...opts,
    glyphMetrics: inkRatios(initial, letter, weight || 0),
  });
  if (!g) return false;

  // strip the letter from the flow and float a sized box in its place.
  // The letter isn't always in the paragraph's very first text node —
  // <p> <em>A</em>lpha…</p> has a leading whitespace text node before the
  // one holding "A" — so walk forward to the first text node that
  // actually contains it rather than assuming nextNode()'s first result
  // does. Blindly replacing on whatever comes first is a silent no-op
  // when that node doesn't contain the letter, and the letter then
  // duplicates: once in the dropcap box, once still in the flowed text.
  // stripLetter also hands back the index it removed from, which is what
  // makes the removal exactly reversible if the cap below turns out not
  // to fit — a plain .replace(letter, "") loses that position.
  const walker = document.createTreeWalker(p, 4);
  let node;
  let stripped;
  while ((node = walker.nextNode())) {
    stripped = stripLetter(node.data, letter);
    if (stripped) {
      node.data = stripped.text;
      break;
    }
  }

  const box = document.createElement("span");
  box.className = "dropcap-box";
  box.style.width = `${g.inkRight + opts.bodySize * 0.7}px`;
  box.style.height = `${g.lines * g.lineHeightPx}px`;

  const glyph = document.createElement("span");
  glyph.className = "dropcap";
  glyph.textContent = letter;
  glyph.style.fontSize = `${g.size.toFixed(2)}px`;
  glyph.style.top = `${g.top.toFixed(2)}px`;
  if (weight) glyph.style.fontWeight = String(weight);
  glyph.setAttribute("aria-hidden", "true");

  box.append(glyph);
  p.prepend(box);

  // keep the letter for screen readers and copy/paste. Insert it after
  // the box, not by prepending it to the paragraph: justif requires the
  // floated .dropcap-box to be p's leading direct child ("floated element
  // is not a leading direct child" otherwise), and prepending sr to p
  // here would run after the box's own prepend above and displace it to
  // second child.
  const sr = document.createElement("span");
  sr.className = "sr";
  sr.textContent = letter;
  box.after(sr);

  // Only now — with the box actually in the DOM — does its real height
  // reflect what placing it does to the paragraph: the float narrows the
  // text column, which can push the same prose onto an extra line. A
  // check made *before* placement (the previous fix wave's approach)
  // compares against a height the placement itself is about to change
  // (measured on the real essay's opener: 75.8px pre-placement vs 113.8px
  // after — the guard rejected a cap that in fact fit exactly). So place
  // first, force this layout read, and undo if the box overhangs.
  const overhangs = capOverhangsParagraph(
    box.getBoundingClientRect().bottom,
    p.getBoundingClientRect().bottom,
    OVERHANG_EPSILON_PX,
  );
  if (overhangs) {
    // Undo completely, leaving the paragraph exactly as found. A
    // half-removed cap — box gone but the initial letter still missing —
    // is worse than either placing the cap or skipping it outright. This
    // must hold no matter how many earlier candidates were already tried
    // and rejected: each rejection restores its own paragraph fully
    // before the next candidate is ever touched, so rejections never
    // compound.
    box.remove();
    sr.remove();
    node.data = restoreLetter(node.data, letter, stripped.index);
    return false;
  }
  return true;
}

async function place(article) {
  const container = article.querySelector(".article-body");
  if (!container || container.querySelector(".dropcap-box")) return;

  const children = Array.from(container.children);
  const candidateIdx = selectDropcapCandidates(
    children.map((el) => el.tagName),
    MAX_DROPCAP_CANDIDATES,
  );

  // Each candidate's own first letter, decided up front (text content
  // isn't touched until a candidate is actually attempted, so reading it
  // now is safe for every candidate, not just the first).
  const candidates = candidateIdx
    .map((i) => children[i])
    .map((p) => ({ p, letter: p.textContent.trimStart()[0] }))
    .filter(({ letter }) => letter && /[A-Za-z]/.test(letter));
  if (candidates.length === 0) return;

  const cs = getComputedStyle(article);
  const bodySize = parseFloat(cs.fontSize);
  const serif = cs
    .getPropertyValue("--serif")
    .split(",")[0]
    .replace(/"/g, "")
    .trim();
  const initial = cs
    .getPropertyValue("--initial")
    .split(",")[0]
    .replace(/"/g, "")
    .trim();

  // document.fonts.ready only settles for fonts the page has already
  // requested. Neither face here qualifies: --initial is consumed only
  // by .dropcap (which this function creates), and there is no
  // <link rel=preload>.
  // So the first request for either face would otherwise be our own
  // measureText calls below, which return fallback-font metrics
  // synchronously on that first call — and a fallback glyph's ink is
  // still positive, so capGeometry's `inkAsc > 0` guard can't catch it.
  // Ask for both explicitly and wait. A rejected load (missing/blocked
  // font) degrades to the fallback already in the --serif/--initial
  // stack rather than throwing.
  //
  // Race against a timeout: FontFaceSet#load's promise can stay pending
  // indefinitely (a stalled request neither resolves nor rejects), and
  // the try/catch above only ever catches a *rejection*. A pending
  // promise here would hang capPlaced, which typography.js awaits before
  // calling justify() — silently disabling justification, protrusion,
  // drop caps and sidenotes together. Falling through to the timeout
  // measures whatever face is loaded so far, same as the catch below.
  //
  // Done exactly once, for every candidate together, not once per
  // candidate: this await is already raced against a fixed timeout
  // precisely because a stalled font request can hang capPlaced, and
  // repeating it per candidate would let a slow/blocked font multiply
  // that budget by up to MAX_DROPCAP_CANDIDATES. Passing every
  // candidate's letter as the load's text covers unicode-range
  // subsetting for whichever paragraph ends up hosting the cap.
  const letters = [...new Set(candidates.map((c) => c.letter))].join("");
  const FONT_LOAD_TIMEOUT_MS = 2000;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`${REF}px "${initial}"`, letters),
        document.fonts.load(`${REF}px "${serif}"`, "Hl"),
      ]),
      new Promise((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);
  } catch {
    // fall through — measurement reflects whichever face is available
  }

  const bodyH = inkRatios(serif, "H");
  const bodyMetrics = {
    fbAsc: bodyH.fbAsc,
    fbDesc: bodyH.fbDesc,
    capInk: bodyH.inkAsc,
  };
  const bodyStemPx = stemRatio(serif, "l") * bodySize;
  const variable = initial === "Thunder VF";

  for (const { p, letter } of candidates) {
    const lineHeight = parseFloat(getComputedStyle(p).lineHeight) / bodySize;
    const opts = {
      bodyMetrics,
      bodySize,
      lineHeight,
      lines: LINES,
      fit: "ink",
      capDropPct: CAP_DROP_PCT,
      growPct: GROW_PCT,
    };

    // a variable initial gets its weight solved for the stroke ratio; size
    // barely moves with weight, so one probe pass is enough
    let weight = 0;
    if (variable && bodyStemPx > 0) {
      const probe = capGeometry({
        ...opts,
        glyphMetrics: inkRatios(initial, letter, 400),
      });
      if (probe) {
        // Stroke weight is a property of the face, not of the letter being
        // set. Probe "I" — a clean vertical at any weight — rather than the
        // actual initial: a diagonal (A, V, W) or a bowl (O, Q) crosses the
        // scan row wider than its true perpendicular thickness, which would
        // read as a heavier stem than it is and make solveWeight land on a
        // weight that's too light. The body side already probes "l" for the
        // same reason. Fall back to the initial letter if "I" has no ink
        // (unlikely, but avoids handing solveWeight a stem that's always
        // zero).
        const stemGlyph = stemRatio(initial, "I", 400) > 0 ? "I" : letter;
        weight = solveWeight(
          (w) => stemRatio(initial, stemGlyph, w),
          bodyStemPx,
          STROKE_RATIO,
          probe.size,
        );
      }
    }

    if (tryPlaceCap(p, letter, opts, initial, weight)) return;
  }
}

const article = document.querySelector("#article.essay");

// typography.js imports and awaits this before calling justify() — see the
// ordering invariant in both files' header comments. Must always resolve
// (never reject/hang): a stuck promise here would silently disable
// justification, drop caps and sidenotes together. place() does its own
// explicit font loading (document.fonts.ready doesn't cover faces nothing
// else on the page has requested yet — see the comment above).
export const capPlaced = article
  ? waitForBox(".article-body > p").then((found) => found && place(article))
  : Promise.resolve();
