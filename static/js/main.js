// Load order is enforced by these imports, not by luck. Every module is a
// no-op when its DOM hooks are absent.
import "./typography.js"; // justif; exports `ready`
import "./dropcaps.js"; // awaits ready, then measures ink
import "./sidenotes.js"; // awaits ready, then positions against final geometry
