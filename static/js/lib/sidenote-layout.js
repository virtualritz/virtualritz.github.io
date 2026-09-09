/**
 * Vertical placement for one sidenote column. Each note wants to sit at
 * its reference's top; where that would overlap the note above, it is
 * pushed down just far enough to clear it. Pure and order-stable.
 */
export function resolveColumn(notes, gap = 12) {
  const tops = [];
  let floor = -Infinity;
  for (const n of notes) {
    const top = Math.max(n.top, floor);
    tops.push(top);
    floor = top + n.height + gap;
  }
  return tops;
}

/**
 * The target id a footnote reference's href points at — the part after
 * the last "#". Zola's hrefs are absolute permalinks (e.g.
 * "https://.../essay/#fn-1"), so this must never be compared with `===`
 * against a bare "#id".
 */
function hrefTarget(href) {
  return href.slice(href.indexOf("#") + 1);
}

/**
 * Pairs each footnote definition (a `<li id="fn-LABEL">`, identified
 * here by its id) to the first reference anchor whose href targets it.
 * Takes and returns plain strings/indices rather than DOM nodes, so the
 * matching itself — the part actually worth testing — can be exercised
 * without a DOM.
 *
 * Returns an array parallel to `definitionIds`: for each definition, the
 * index into `referenceHrefs` of its matching reference, or -1 if none
 * was found (e.g. an orphaned definition with no citation).
 */
export function pairReferences(definitionIds, referenceHrefs) {
  const firstIndexByTarget = new Map();
  referenceHrefs.forEach((href, i) => {
    const target = hrefTarget(href);
    if (!firstIndexByTarget.has(target)) firstIndexByTarget.set(target, i);
  });
  return definitionIds.map((id) => firstIndexByTarget.get(id) ?? -1);
}

/**
 * The footnote label Zola derived an id from: "fn-1" -> "1",
 * "fn-long-label" -> "long-label". Labels are arbitrary strings, never
 * assumed to be integers.
 */
export function footnoteLabel(definitionId) {
  return definitionId.slice("fn-".length);
}

/**
 * True if `href` is a return-arrow backref for the footnote labelled
 * `label` — i.e. it targets one of that footnote's reference ids
 * (fr-LABEL-1, fr-LABEL-2, ... when the footnote is cited more than
 * once; Zola gives each citation its own backref arrow, and there is no
 * .footnote-backref class to key off instead).
 *
 * The trailing "-" is load-bearing: without it, label "1" would also
 * match a backref belonging to label "10" or "100", since "#fr-10-1"
 * and "#fr-100-1" both contain "#fr-1" as a plain substring.
 */
export function isBackrefFor(href, label) {
  return href.includes(`#fr-${label}-`);
}
