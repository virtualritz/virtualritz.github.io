// Load order is enforced by dependency, not by import position here:
// typography.js imports dropcaps.js's `capPlaced` and toc-move.js's
// `tocMoved` directly and awaits both before ever calling justify(), so
// the drop cap lands in the DOM and the TOC is out of the first
// paragraph's box before justif scans it (justif has no second pass — see
// the ordering invariant documented in typography.js, dropcaps.js and
// toc-move.js). Every module is a no-op when its DOM hooks are absent.
//
// The imports are dynamic, and guarded, for one reason: theme.js's
// development-only "JS: off" switch previews the site as a no-JS visitor
// sees it, and a static import would run every module's side effects
// before any guard could stop it — module evaluation is hoisted. Awaiting
// the import instead keeps the whole enhancement layer from loading at
// all, which is exactly the state being previewed. Ordering is unchanged:
// it was never established by the order of these lines (see above), only
// by the promises the modules await.
if (!document.documentElement.classList.contains("nojs-sim")) {
  await import("./typography.js"); // awaits capPlaced + tocMoved, then justifies; exports `ready`
  await import("./dropcaps.js"); // places the cap; exports `capPlaced` (imported above)
  await import("./toc-move.js"); // moves the TOC; exports `tocMoved` (imported above)
  await import("./sidenotes.js"); // awaits ready, then positions against final geometry
  await import("./resize-recompute.js"); // awaits ready, then redoes the cap + justify on a material resize
}
