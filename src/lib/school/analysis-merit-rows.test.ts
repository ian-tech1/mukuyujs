import assert from "node:assert/strict";
import test from "node:test";
import { rankMeritRows, selectMeritExportRows } from "./analysis-merit-rows.ts";

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

test("export roster includes wholly unmarked learners by default and excludes them only on request", () => {
  const roster = [
    { id: "scored", avgMean: 72 },
    { id: "unmarked", avgMean: null },
  ];

  assert.deepEqual(selectMeritExportRows(roster).map((row) => row.id), ["scored", "unmarked"]);
  assert.deepEqual(selectMeritExportRows(roster, false).map((row) => row.id), ["scored"]);
});
