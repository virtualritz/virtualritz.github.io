/**
 * Resolves once an element matching `selector` has a real layout box
 * (width > 10px) — DOMContentLoaded/module-script execution alone is not
 * enough, since stylesheets may not have applied yet. Polls via
 * requestAnimationFrame for ~4s, then gives up.
 *
 * Shared by typography.js (justif declines elements with no layout box)
 * and dropcaps.js (cap geometry reads computed font-size/line-height,
 * which are unreliable before styles have applied).
 *
 * @returns {Promise<boolean>} true once a box is found, false if the
 *   ~4s budget ran out first. Always resolves, never rejects.
 */
export function waitForBox(selector, { maxTries = 240 } = {}) {
  return new Promise((resolve) => {
    let tries = 0;
    function poll() {
      const el = document.querySelector(selector);
      if (el && el.getBoundingClientRect().width > 10) return resolve(true);
      if (++tries > maxTries) return resolve(false); // ~4s; give up
      requestAnimationFrame(poll);
    }
    poll();
  });
}
