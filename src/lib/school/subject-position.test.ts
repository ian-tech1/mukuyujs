import assert from "node:assert/strict";
import test from "node:test";
import { rankSubjectsByMean } from "./subject-position.ts";

test("ranks subjects from the highest mean and shares positions for ties", () => {
  const result = rankSubjectsByMean([
    { name: "English", mean: 72 },
    { name: "Maths", mean: 86 },
    { name: "Science", mean: 72 },
    { name: "Kiswahili", mean: 63 },
  ]);
  assert.deepEqual(result, [
    { name: "Maths", mean: 86, position: "1" },
    { name: "English", mean: 72, position: "2" },
    { name: "Science", mean: 72, position: "2" },
    { name: "Kiswahili", mean: 63, position: "4" },
  ]);
});

test("keeps a real zero mean ranked but leaves unscored subjects unranked", () => {
  assert.deepEqual(rankSubjectsByMean([
    { name: "Unscored", mean: null },
    { name: "Zero", mean: 0 },
    { name: "Scored", mean: 40 },
  ]), [
    { name: "Scored", mean: 40, position: "1" },
    { name: "Zero", mean: 0, position: "2" },
    { name: "Unscored", mean: null, position: "—" },
  ]);
});
