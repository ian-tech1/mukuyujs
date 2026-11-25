import assert from "node:assert/strict";
import test from "node:test";
import { rankMeritRows } from "./analysis-merit-rows.ts";

test("merit ranking keeps every roster learner and places unscored learners after scored learners", () => {
  const roster = [
    { id: "unscored-first", mean: null },
    { id: "middle", mean: 72 },
    { id: "unscored-second", mean: null },
    { id: "top", mean: 91 },
  ];

  const ranked = rankMeritRows(roster, (row) => row.mean);
  assert.deepEqual(ranked.map((row) => row.id), ["top", "middle", "unscored-first", "unscored-second"]);
  assert.equal(ranked.length, roster.length);
  assert.deepEqual(new Set(ranked.map((row) => row.id)), new Set(roster.map((row) => row.id)));
});
