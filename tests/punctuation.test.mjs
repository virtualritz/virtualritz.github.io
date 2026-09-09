import { test } from "node:test";
import assert from "node:assert/strict";
import { findSentenceEnds } from "../static/js/lib/punctuation.js";

const ends = (s) =>
  findSentenceEnds(s).map((c) => s.slice(c.start, c.start + c.len));

test("a period after a lowercase letter ends a sentence", () => {
  assert.deepEqual(ends("at that office. The fifteen"), ["."]);
});

test("a period after a capital is an initial, not a sentence end", () => {
  assert.deepEqual(ends("written by J. R. R. Tolkien here"), []);
});

test("known abbreviations are not sentence ends", () => {
  assert.deepEqual(ends("see e.g. The Book"), []);
  assert.deepEqual(ends("ask Dr. Smith now"), []);
  assert.deepEqual(ends("Fig. Two shows"), []);
});

test("question and exclamation marks count", () => {
  assert.deepEqual(ends("Quixotic? Perhaps. But"), ["?", "."]);
});

test("a closing quote is carried with the punctuation", () => {
  assert.deepEqual(ends('he said "no." Then left'), ['."']);
});

test("a sentence end needs a following capital", () => {
  assert.deepEqual(ends("version 1.2 and then"), []);
});

test("digits can end a sentence", () => {
  assert.deepEqual(ends("counted to 10. Then stopped"), ["."]);
});
