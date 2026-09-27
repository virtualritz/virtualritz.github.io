import { test } from "node:test";
import assert from "node:assert/strict";
import { titleCase, formatDocument } from "../build/titlecase.mjs";

test("capitalises words but keeps articles, conjunctions and short prepositions down", () => {
  assert.equal(titleCase("Setting this site"), "Setting This Site");
  assert.equal(titleCase("Notes in the margin"), "Notes in the Margin");
  assert.equal(
    titleCase("Small caps, figures and ligatures"),
    "Small Caps, Figures and Ligatures",
  );
  // This is the case CSS cannot do: `text-transform: capitalize` would
  // raise "on" and "the" here.
  assert.equal(
    titleCase("a note on the word rendering"),
    "A Note on the Word Rendering",
  );
});

test("first and last word are always capitalised, whatever they are", () => {
  assert.equal(titleCase("the essay of"), "The Essay Of");
  assert.equal(titleCase("in and out"), "In and Out");
});

test("trailing punctuation does not steal the last-word role", () => {
  assert.equal(titleCase("what it is for ..."), "What It Is For ...");
});

test("a word already carrying an internal capital is left alone", () => {
  // These set their own case on purpose; re-casing them would be wrong.
  assert.equal(
    titleCase("what pixar did with hdPrman"),
    // "with" is a four-letter preposition, so Chicago keeps it down.
    "What Pixar Did with hdPrman",
  );
  assert.equal(titleCase("a note on RenderMan"), "A Note on RenderMan");
  // "over" is four letters too, hence lowercase; "C" and "C++" set their
  // own case and are left alone.
  assert.equal(
    titleCase("change over time, and C vs. C++"),
    "Change over Time, and C vs. C++",
  );
});

test("a word after a colon opens a clause and is capitalised", () => {
  assert.equal(
    titleCase("three ways: the shape of it"),
    "Three Ways: The Shape of It",
  );
});

test("code spans survive verbatim", () => {
  assert.equal(
    titleCase("we call `Stop()` on the renderer"),
    "We Call `Stop()` on the Renderer",
  );
  // The masking must not be fooled into title-casing inside the span.
  assert.equal(titleCase("`the and of`"), "`the and of`");
});

test("hyphenated compounds are left as authored", () => {
  // "Drop-Cap" is worse than "drop-cap"; there is no single right answer,
  // so the author's spelling wins.
  assert.equal(titleCase("the drop-cap reserve"), "The Drop-cap Reserve");
});

test("formatDocument rewrites the frontmatter title and ATX headings", () => {
  const src = [
    "+++",
    'title = "Setting this site"',
    'description = "left alone, this is prose"',
    "+++",
    "",
    "## Body text",
    "",
    "Body prose is not touched at all.",
    "",
    "### notes in the margin",
  ].join("\n");
  const out = formatDocument(src).split("\n");
  assert.equal(out[1], 'title = "Setting This Site"');
  assert.equal(out[2], 'description = "left alone, this is prose"');
  assert.equal(out[5], "## Body Text");
  assert.equal(out[7], "Body prose is not touched at all.");
  assert.equal(out[9], "### Notes in the Margin");
});

test("headings inside a fenced code block are not touched", () => {
  const src = [
    "## real heading",
    "",
    "```sh",
    "# not a heading",
    "```",
    "",
    "## after the fence",
  ].join("\n");
  const out = formatDocument(src).split("\n");
  assert.equal(out[0], "## Real Heading");
  assert.equal(out[3], "# not a heading");
  assert.equal(out[6], "## After the Fence");
});

test("running it twice changes nothing the second time", () => {
  const src =
    '+++\ntitle = "Hydra, NSI and riley: three ways"\n+++\n\n## body text\n';
  const once = formatDocument(src);
  assert.equal(formatDocument(once), once);
});
