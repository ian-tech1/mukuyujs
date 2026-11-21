import assert from "node:assert/strict";
import test from "node:test";
import { isValidParentEmail, matchLearnerName, normalizeLearnerName, normalizeParentEmail } from "./parent-access.ts";

const learners = [
  { id: "a", fullName: "Amina Njeri" },
  { id: "b", fullName: "Brian Otieno" },
  { id: "c", fullName: "José Mwangi" },
];

test("normalizes parent email and learner case, accents, punctuation, and spacing", () => {
  assert.equal(normalizeParentEmail(" Parent@Example.COM "), "parent@example.com");
  assert.equal(normalizeLearnerName("  JOSÉ   O’Neil-Mwangi "), "jose o neil mwangi");
  assert.equal(isValidParentEmail(" parent@example.com "), false);
  assert.equal(isValidParentEmail("parent@example.com"), true);
});

test("matches one full learner name despite a small typo or adjacent transposition", () => {
  assert.equal(matchLearnerName("Amin Njeri", learners)?.id, "a");
  assert.equal(matchLearnerName("Biran Otieno", learners)?.id, "b");
});

test("matches exact names after accent and punctuation normalization", () => {
  assert.equal(matchLearnerName("Jose Mwangi", learners)?.id, "c");
  assert.equal(matchLearnerName("  brian   otieno ", learners)?.id, "b");
});

test("does not guess on a missing name, short name, partial substring, or tied candidates", () => {
  assert.equal(matchLearnerName("Missing Learner", learners), null);
  assert.equal(matchLearnerName("Ami", learners), null);
  assert.equal(matchLearnerName("Njeri", learners), null);
  assert.equal(matchLearnerName("Amina Njeri", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "duplicate", fullName: "Amina Njeri" },
  ]), null);
});

test("rejects close competing candidates instead of linking an uncertain learner", () => {
  assert.equal(matchLearnerName("Amin Njeri", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "b", fullName: "Amin Njeru" },
  ]), null);
});
