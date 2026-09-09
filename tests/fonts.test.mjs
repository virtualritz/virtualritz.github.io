import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const manifest = () =>
  JSON.parse(readFileSync(root + "static/fonts/manifest.json", "utf8"));

test("every declared face has a file on disk", () => {
  for (const f of manifest().faces) {
    assert.ok(existsSync(root + "static/fonts/" + f.file), `missing ${f.file}`);
  }
});

test("EB Garamond keeps the features we rely on", () => {
  const m = manifest();
  const roman = m.faces.find(
    (f) => f.family === "EB Garamond" && f.style === "normal",
  );
  const italic = m.faces.find(
    (f) => f.family === "EB Garamond" && f.style === "italic",
  );
  for (const tag of ["smcp", "c2sc", "pcap", "onum", "tnum", "liga", "dlig"]) {
    assert.ok(roman.features.includes(tag), `roman lost ${tag}`);
  }
  assert.ok(italic.features.includes("swsh"), "italic lost swsh");
});

test("subsets carry the space repertoire the punctuation pass needs", () => {
  const m = manifest();
  const roman = m.faces.find(
    (f) => f.family === "EB Garamond" && f.style === "normal",
  );
  const metricsKey = roman.file.replace(".woff2", "");
  for (const cp of ["0x2009", "0x2014", "0x2013"]) {
    assert.ok(
      m.metrics[metricsKey].spaces[cp] != null,
      `EB Garamond subset lacks ${cp}`,
    );
  }
});

test("Thunder is shipped unmodified", () => {
  const t = manifest().faces.filter((f) => f.family === "Thunder VF");
  assert.equal(t.length, 1);
  assert.equal(t[0].unmodified, true);
});
