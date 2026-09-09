(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("theme");
  } catch (e) {
    /* private mode, blocked site data: fall through to the OS setting */
  }
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#theme-toggle")) return;
    var root = document.documentElement;
    var isDark =
      root.getAttribute("data-theme") === "dark" ||
      (!root.hasAttribute("data-theme") &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    var next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
  });
})();
