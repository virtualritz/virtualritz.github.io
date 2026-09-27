/**
 * Title-cases frontmatter titles and ATX headings in content/*.md.
 *
 * CSS cannot do this: `text-transform: capitalize` capitalises every word,
 * so "a note on the word RenderMan" becomes "A Note On The Word RenderMan".
 * Title case needs to know which words stay down, which is a dictionary
 * problem, not a styling one — so it happens once, to the source, at
 * publish time, and the markdown stays the thing you read and edit.
 *
 * What it deliberately leaves alone:
 *   - anything already carrying an internal capital (RenderMan, hdPrman,
 *     OpenUSD, C++) — a word the author capitalised unusually is a name,
 *     and re-casing it would be wrong
 *   - `code spans`, which are identifiers, not prose
 *   - fenced code blocks, and any `#` inside them
 *   - the first and last word of a title, which are capitalised whatever
 *     part of speech they are
 *
 * Pure functions live here so tests/titlecase.test.mjs can exercise them
 * without touching the filesystem; the CLI at the bottom is the thin part.
 */

// Words that stay lowercase inside a title. Articles, coordinating
// conjunctions, and prepositions of four letters or fewer — the Chicago
// rule, which is what a serif-and-drop-caps site should be following.
const LOWER = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "yet",
  "so",
  "as",
  "at",
  "by",
  "in",
  "of",
  "off",
  "on",
  "out",
  "per",
  "to",
  "up",
  "via",
  "with",
  "from",
  "into",
  "onto",
  "over",
  "than",
  "that",
  "upon",
  "vs",
  "v",
]);

/** True when the word sets its own case and must not be touched. */
const hasInternalCapital = (w) => /[A-Za-z].*[A-Z]/.test(w);

function capitalise(word) {
  // Step past any opening punctuation ("(hydra" -> "(Hydra") so the letter
  // that gets raised is the first *letter*, not the first character.
  const i = word.search(/[A-Za-z]/);
  if (i === -1) return word;
  return word.slice(0, i) + word[i].toUpperCase() + word.slice(i + 1);
}

/**
 * Title-case one line of prose.
 *
 * Splits on spaces only. Hyphenated and slashed compounds are left as the
 * author wrote them: "drop-cap" and "read/write" have no single right
 * answer, and guessing produces "Drop-Cap", which is worse than leaving it.
 */
export function titleCase(text) {
  // Protect code spans: they are identifiers and must survive verbatim.
  const spans = [];
  const masked = text.replace(/`[^`]*`/g, (m) => {
    spans.push(m);
    return `\u0000${spans.length - 1}\u0000`;
  });

  const words = masked.split(" ");
  // Index of the last word that actually contains a letter — the closing
  // word gets capitalised even if it is a preposition, and trailing
  // punctuation-only tokens must not steal that role.
  let last = -1;
  for (let i = words.length - 1; i >= 0; i--) {
    if (/[A-Za-z]/.test(words[i])) {
      last = i;
      break;
    }
  }

  const out = words.map((w, i) => {
    if (w === "" || w.includes("\u0000")) return w;
    if (hasInternalCapital(w)) return w;
    const bare = w.replace(/[^A-Za-z]/g, "").toLowerCase();
    // A word after a colon opens a new clause, so it is capitalised like
    // a first word — "three ways: A study", not "three ways: a study".
    const opensClause = i > 0 && /[:—–?!.]$/.test(words[i - 1]);
    if (i !== 0 && i !== last && !opensClause && LOWER.has(bare)) {
      return w.toLowerCase();
    }
    return capitalise(w);
  });

  return out
    .join(" ")
    .replace(/\u0000(\d+)\u0000/g, (_, n) => spans[Number(n)]);
}

/**
 * Rewrite a whole markdown document: the frontmatter `title = "..."` and
 * every ATX heading outside a fenced code block.
 */
export function formatDocument(src) {
  const lines = src.split("\n");
  let inFence = false;
  // Frontmatter is delimited by +++ and only the first block counts.
  let fmState = 0; // 0 before, 1 inside, 2 after

  const out = lines.map((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    if (line.trim() === "+++") {
      fmState = fmState === 0 && i === 0 ? 1 : fmState === 1 ? 2 : fmState;
      return line;
    }

    if (fmState === 1) {
      const m = line.match(/^(title\s*=\s*")(.*)("\s*)$/);
      if (m) return m[1] + titleCase(m[2]) + m[3];
      return line;
    }

    const h = line.match(/^(#{1,6}\s+)(.*)$/);
    if (h) return h[1] + titleCase(h[2]);
    return line;
  });

  return out.join("\n");
}

// --- CLI -----------------------------------------------------------------
// `node build/titlecase.mjs content` rewrites in place and reports what
// changed; `--check` reports without writing, for CI.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const roots = args.filter((a) => !a.startsWith("--"));
  if (roots.length === 0) roots.push("content");

  const walk = (dir, acc = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (name.endsWith(".md")) acc.push(full);
    }
    return acc;
  };

  let changed = 0;
  for (const root of roots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      const next = formatDocument(src);
      if (next === src) continue;
      changed++;
      console.log(checkOnly ? `would reformat ${file}` : `reformatted ${file}`);
      for (let i = 0; i < src.split("\n").length; i++) {
        const a = src.split("\n")[i];
        const b = next.split("\n")[i];
        if (a !== b) console.log(`    ${a}\n  → ${b}`);
      }
      if (!checkOnly) writeFileSync(file, next);
    }
  }
  if (changed === 0) console.log("content already title-cased");
  if (checkOnly && changed > 0) process.exit(1);
}
