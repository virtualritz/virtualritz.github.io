/**
 * Ink-measured drop caps.
 *
 * Body and glyph metrics are measured live via Canvas rather than read
 * from static/fonts/manifest.json: rendered metrics must reflect the
 * font the browser actually loaded, and the manifest is keyed by slug
 * for the font tests' benefit, not for runtime layout.
 *
 * Must run after justif has settled (`ready`, Task 8): justif changes
 * paragraph heights, so measuring before it settles gives wrong geometry.
 */
import { ready } from "./typography.js";
import { capGeometry, solveWeight } from "./lib/dropcap-geometry.js";

const LINES = 3;
const CAP_DROP_PCT = 3;
const GROW_PCT = 4;
const STROKE_RATIO = 5.0; // spec §6: IM Fell English's J measures 5.23x
const REF = 240; // measure large, then scale: a 24px stem is under 2px

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

async function place(article) {
  const p = article.querySelector(".article-body > p");
  if (!p || p.querySelector(".dropcap-box")) return;

  const text = p.textContent.trimStart();
  const letter = text[0];
  if (!letter || !/[A-Za-z]/.test(letter)) return;

  const cs = getComputedStyle(article);
  const bodySize = parseFloat(cs.fontSize);
  const lineHeight = parseFloat(getComputedStyle(p).lineHeight) / bodySize;
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
  // requested. Neither face here qualifies: --display (also Thunder VF)
  // is unused anywhere in sass/, --initial is consumed only by .dropcap
  // (which this function creates), and there is no <link rel=preload>.
  // So the first request for either face would otherwise be our own
  // measureText calls below, which return fallback-font metrics
  // synchronously on that first call — and a fallback glyph's ink is
  // still positive, so capGeometry's `inkAsc > 0` guard can't catch it.
  // Ask for both explicitly and wait. A rejected load (missing/blocked
  // font) degrades to the fallback already in the --serif/--initial
  // stack rather than throwing.
  try {
    await Promise.all([
      document.fonts.load(`${REF}px "${initial}"`, letter),
      document.fonts.load(`${REF}px "${serif}"`, "Hl"),
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
  const variable = initial === "Thunder VF";
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

  const g = capGeometry({
    ...opts,
    glyphMetrics: inkRatios(initial, letter, weight || 0),
  });
  if (!g) return;

  // strip the letter from the flow and float a sized box in its place
  const first = document.createTreeWalker(p, 4).nextNode();
  first.data = first.data.replace(letter, "");

  const box = document.createElement("span");
  box.className = "dropcap-box";
  box.style.width = `${g.inkRight + bodySize * 0.7}px`;
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

  // keep the letter for screen readers and copy/paste
  const sr = document.createElement("span");
  sr.className = "sr";
  sr.textContent = letter;
  p.prepend(sr);
}

const article = document.querySelector("#article.essay");
if (article) {
  // after justif: it changes paragraph geometry. place() does its own
  // explicit font loading (document.fonts.ready doesn't cover faces
  // nothing else on the page has requested yet — see the comment above).
  ready.then(() => requestAnimationFrame(() => place(article)));
}
