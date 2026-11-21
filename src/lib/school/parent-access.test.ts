import assert from "node:assert/strict";
import test from "node:test";
import { matchLearnerNames, normalizeLearnerName, normalizeParentEmail } from "./parent-access.ts";

const learners = [
  { id: "a", fullName: "  Amina   Njeri " },
  { id: "b", fullName: "Brian Otieno" },
  { id: "c", fullName: "Amina Njeri" },
];

test("normalizes email and learner names without loose substring matching", () => {
  assert.equal(normalizeParentEmail(" Parent@Example.COM "), "parent@example.com");
  assert.equal(normalizeLearnerName("  Amina   Njeri "), "amina njeri");
  assert.deepEqual(matchLearnerNames(["Brian Otieno", "Missing Learner"], learners), []);
});

test("requires at least two distinct names and rejects ambiguous duplicate names", () => {
  assert.deepEqual(matchLearnerNames(["Brian Otieno"], learners), []);
  assert.deepEqual(matchLearnerNames(["Amina Njeri", "Brian Otieno"], learners), []);
  assert.deepEqual(matchLearnerNames(["Brian Otieno", "Brian Otieno"], learners), []);
});

test("matches distinct exact names case-insensitively and tolerates spacing differences", () => {
  assert.deepEqual(
    matchLearnerNames([" brian   otieno ", "Amina Njeri"], [
      { id: "b", fullName: "Brian Otieno" },
      { id: "a", fullName: "Amina Njeri" },
    ]).map((learner) => learner.id),
    ["b", "a"],
  );
});
