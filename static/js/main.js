// Load order is enforced by dependency, not by import position here:
// typography.js imports dropcaps.js's `capPlaced` and toc-move.js's
// `tocMoved` directly and awaits both before ever calling justify(), so
// the drop cap lands in the DOM and the TOC is out of the first
// paragraph's box before justif scans it (justif has no second pass — see
// the ordering invariant documented in typography.js, dropcaps.js and
// toc-move.js). dropcaps.js and toc-move.js also import each other
// directly — toc-move.js detaches `#toc` before dropcaps.js measures
// anything, then re-inserts it after dropcaps.js decides where the cap
// goes — see toc-move.js's header comment for that three-phase design.
// Every module is a no-op when its DOM hooks are absent.
import "./typography.js"; // awaits capPlaced + tocMoved, then justifies; exports `ready`
import "./dropcaps.js"; // detects tocDetached, places the cap; exports `capPlaced`
import "./toc-move.js"; // detaches then re-inserts the TOC; exports `tocDetached` + `tocMoved`
import "./sidenotes.js"; // awaits ready, then positions against final geometry
