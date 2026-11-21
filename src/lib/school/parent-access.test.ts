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

test("prioritizes one exact full-name match over a similar learner name", () => {
  assert.equal(matchLearnerName("Amina Njeri", [
    { id: "exact", fullName: "Amina Njeri" },
    { id: "similar", fullName: "Amina Njeru" },
  ])?.id, "exact");
});

test("does not guess on missing or too-short names and rejects duplicate full names", () => {
  assert.equal(matchLearnerName("Missing Learner", learners), null);
  assert.equal(matchLearnerName("Am", learners), null);
  assert.equal(matchLearnerName("Amina Njeri", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "duplicate", fullName: "Amina Njeri" },
  ]), null);
});

test("matches a unique first or last name, including a one-token entry", () => {
  assert.equal(matchLearnerName("Amina", learners)?.id, "a");
  assert.equal(matchLearnerName("Njeri", learners)?.id, "a");
  assert.equal(matchLearnerName("Bo", [{ id: "bo", fullName: "Bo" }])?.id, "bo");
  assert.equal(matchLearnerName("B", [{ id: "bo", fullName: "Bo" }]), null);
});

test("matches reordered names and a unique fuzzy name at the 60 percent threshold", () => {
  assert.equal(matchLearnerName("Njeri Amina", learners)?.id, "a");
  assert.equal(matchLearnerName("Ami", [{ id: "a", fullName: "Amina Njeri" }])?.id, "a");
  assert.equal(matchLearnerName("Amin Njeri", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "b", fullName: "Brian Otieno" },
  ])?.id, "a");
});

test("rejects tied fuzzy learner names and common one-token names", () => {
  assert.equal(matchLearnerName("Amin Njer", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "b", fullName: "Amina Njeru" },
  ]), null);
  assert.equal(matchLearnerName("Ami", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "b", fullName: "Amira Kamau" },
  ]), null);
  assert.equal(matchLearnerName("Tumi", [
    { id: "a", fullName: "Tumi Zulu" },
    { id: "b", fullName: "Tumi Banda" },
  ]), null);
});
