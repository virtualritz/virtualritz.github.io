/**
 * The weight wave the nav brand animates along — the same function the
 * Typeface Bench specimen used for its headline (docs/specimen/,
 * `paintHeadline`), kept as pure arithmetic so it can be tested without a
 * DOM or a font.
 *
 * Each letter samples one sine, offset in phase by its index. `spread` is
 * that per-letter phase step in radians, so the visible wavelength is
 * 2*PI/spread letters: at the specimen's 0.55 that is ~11.4 letters, just
 * over the length of "virtualritz", which is why the word reads as a
 * single travelling swell rather than a repeating ripple.
 *
 * `amp` is a fraction of the *full* axis range, and the wave is centred on
 * the axis midpoint: amp 1 sweeps the whole 100-900 span, amp 0 is a flat
 * mid-weight. The clamp only ever matters for amp values above 1, which
 * the caller does not use — it is there so a bad parameter degrades to a
 * held extreme instead of asking the font for an out-of-range instance.
 */
export const WGHT = { min: 100, max: 900, mid: 500 };

/**
 * @param {number} t seconds since the animation started
 * @param {number} i letter index within the word
 * @param {{freq: number, amp: number, spread: number, axis?: typeof WGHT}} opts
 * @returns {number} a weight inside the axis range
 */
export function waveWeight(t, i, { freq, amp, spread, axis = WGHT }) {
  const half = (amp * (axis.max - axis.min)) / 2;
  const v = axis.mid + half * Math.sin(2 * Math.PI * freq * t + i * spread);
  return Math.max(axis.min, Math.min(axis.max, v));
}
