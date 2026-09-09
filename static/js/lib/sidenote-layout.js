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
