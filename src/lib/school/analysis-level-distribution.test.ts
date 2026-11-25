import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLearnersByLevel } from "./analysis-level-distribution.ts";

test("level distribution counts each learner and gender, including learners with no recorded level", () => {
  const distribution = summarizeLearnersByLevel([
    { level: "ME1", gender: "MALE" },
    { level: "ME1", gender: "FEMALE" },
    { level: "ME1", gender: "MALE" },
    { level: "ME2", gender: "FEMALE" },
    { level: null, gender: "MALE" },
    { level: "", gender: "UNSPECIFIED" },
  ]);

  assert.deepEqual(distribution, [
    { level: "ME1", students: 3, boys: 2, girls: 1, other: 0 },
    { level: "ME2", students: 1, boys: 0, girls: 1, other: 0 },
    { level: "No recorded level", students: 2, boys: 1, girls: 0, other: 1 },
  ]);
  assert.equal(distribution.reduce((total, group) => total + group.students, 0), 6);
  assert.ok(distribution.every((group) => group.students === group.boys + group.girls + group.other));
});

test("level codes are normalized and sorted naturally with the no-level group last", () => {
  const distribution = summarizeLearnersByLevel([
    { level: "ME10", gender: "FEMALE" },
    { level: "me2", gender: "MALE" },
    { level: null, gender: null },
  ]);

  assert.deepEqual(distribution.map((group) => group.level), ["ME2", "ME10", "No recorded level"]);
});
