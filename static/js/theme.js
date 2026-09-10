/**
 * Runs synchronously in <head>, before the body is parsed, so everything
 * it decides is settled before the first paint. Three jobs:
 *
 *  1. Apply the stored colour scheme (the original reason this file
 *     exists) — doing it here is what avoids a flash of the wrong theme.
 *  2. Cloak the article until the typography pipeline has finished, and
 *     guarantee the uncloaking even if that pipeline never reports in.
 *  3. Offer a development-only switch for previewing the site with the
 *     enhancement layer turned off.
 */
(function () {
  var root = document.documentElement;

  var read = function (k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      /* private mode, blocked site data: behave as if unset */
      return null;
    }
  };
  var write = function (k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  };

  // --- 1. colour scheme ---------------------------------------------
  var stored = read("theme");
  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#theme-toggle")) return;
    var isDark =
      root.getAttribute("data-theme") === "dark" ||
      (!root.hasAttribute("data-theme") &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    var next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    write("theme", next);
  });

  // --- 3. no-JS preview (checked first: it suppresses the cloak) -----
  // A real "disable JavaScript" cannot be done from inside the page, so
  // this turns off the *enhancement layer* instead — main.js and brand.js
  // both bail on this class — which is the part that no-JS visitors are
  // actually missing. Deliberately not a simulation of a broken script
  // tag: the point is to preview the CSS-only rendering, and that is
  // exactly what is left once those two modules decline to run.
  var noJs = read("nojs") === "1";
  if (noJs) root.classList.add("nojs-sim");

  // The switch is a development affordance and must never reach a
  // visitor, so it is drawn only on a local server or when ?dev is in the
  // query string — the latter so the deployed site can still be checked
  // from a phone, where DevTools' own "Disable JavaScript" is unavailable.
  var isDev =
    /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) ||
    /(^|[?&])dev(&|=|$)/.test(location.search);
  if (isDev) {
    document.addEventListener("DOMContentLoaded", function () {
      var b = document.createElement("button");
      b.id = "nojs-toggle";
      b.type = "button";
      b.textContent = noJs ? "JS: off" : "JS: on";
      b.setAttribute("aria-pressed", String(noJs));
      b.title = "Development only: preview the site without its JS layer";
      b.addEventListener("click", function () {
        write("nojs", noJs ? "0" : "1");
        location.reload();
      });
      document.body.appendChild(b);
    });
  }

  // --- 2. cloak + guaranteed reveal ---------------------------------
  // `js` is what arms the cloak rule in sass/_layout.scss, so a visitor
  // with JS off never has anything hidden: the class is only ever added
  // by this script. The cloak is scoped by that rule to articles marked
  // data-cloak, i.e. the pages that actually load the pipeline.
  //
  // Without it the first paint shows the pre-pipeline layout — TOC above
  // the body, no drop cap, browser line-breaking — and it then visibly
  // rearranges (measured: the move and the justification both land around
  // the load event, ~460ms on a warm fast connection).
  //
  // The reveal must not depend on the pipeline succeeding, or a single
  // thrown exception in a module would leave a permanently blank article.
  // So the same script that hides also guarantees the uncloaking: the
  // pipeline's own `typo-ready` event reveals as soon as it is genuinely
  // done, and a timer reveals regardless if that never arrives. The
  // budget is deliberately larger than the measured ready time and
  // smaller than the 3s `font-display: block` already blanks text for, so
  // in the worst case this adds no visible delay beyond the fonts'.
  if (!noJs) {
    root.classList.add("js");
    var reveal = function () {
      root.classList.add("typo-ready");
    };
    document.addEventListener("typo-ready", reveal);
    setTimeout(reveal, 2000);
  }
})();
