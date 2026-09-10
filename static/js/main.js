// Load order is enforced by dependency, not by import position here:
// typography.js imports dropcaps.js's `capPlaced` and toc-move.js's
// `tocMoved` directly and awaits both before ever calling justify(), so
// the drop cap lands in the DOM and the TOC is out of the first
// paragraph's box before justif scans it (justif has no second pass — see
// the ordering invariant documented in typography.js, dropcaps.js and
// toc-move.js). Every module is a no-op when its DOM hooks are absent.
import "./typography.js"; // awaits capPlaced + tocMoved, then justifies; exports `ready`
import "./dropcaps.js"; // places the cap; exports `capPlaced` (imported above)
import "./toc-move.js"; // moves the TOC; exports `tocMoved` (imported above)
import "./sidenotes.js"; // awaits ready, then positions against final geometry
import "./resize-recompute.js"; // awaits ready, then redoes the cap + justify on a material resize
