// Load order is enforced by dependency, not by import position here:
// typography.js imports dropcaps.js's `capPlaced` directly and awaits it
// before ever calling justify(), so the drop cap lands in the DOM before
// justif scans the first paragraph (justif has no second pass — see the
// ordering invariant documented in both files). Every module is a no-op
// when its DOM hooks are absent.
import "./typography.js"; // awaits capPlaced, then justifies; exports `ready`
import "./dropcaps.js"; // places the cap; exports `capPlaced` (imported above)
import "./sidenotes.js"; // awaits ready, then positions against final geometry
