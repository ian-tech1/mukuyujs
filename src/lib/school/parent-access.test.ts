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

test("supports a 65 percent marks-import threshold and rejects scores below it", () => {
  const roster = [{ id: "long", fullName: "abcdefghijklmnopqrst" }];
  const marksImport = { minimumSimilarity: 0.65, ambiguityMargin: 0.08 };
  assert.equal(matchLearnerName("abcdefghijklm", roster, marksImport)?.id, "long");
  assert.equal(matchLearnerName("abcdefghijkl", roster, marksImport), null);
});

test("rejects similarly close fuzzy learner candidates inside the configured safety margin", () => {
  assert.equal(matchLearnerName("Amin Njer", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "b", fullName: "Amina Njeru" },
  ], { minimumSimilarity: 0.65, ambiguityMargin: 0.08 }), null);
});

test("matches reordered names and a unique fuzzy name at the 60 percent threshold", () => {
  assert.equal(matchLearnerName("Njeri Amina", learners)?.id, "a");
  assert.equal(matchLearnerName("Ami", [{ id: "a", fullName: "Amina Njeri" }])?.id, "a");
  assert.equal(matchLearnerName("Amin Njeri", [
    { id: "a", fullName: "Amina Njeri" },
    { id: "b", fullName: "Brian Otieno" },
  ])?.id, "a");
});

test("matches exact supplied name tokens when the roster includes an omitted middle name", () => {
  const roster = [
    { id: "a", fullName: "Amina Wanjiku Njeri" },
    { id: "b", fullName: "Brian Otieno" },
  ];
  assert.equal(matchLearnerName("Amina Njeri", roster)?.id, "a");
  assert.equal(matchLearnerName("Njeri Amina", roster)?.id, "a");
  assert.equal(matchLearnerName("Amina Njeri", [
    ...roster,
    { id: "duplicate", fullName: "Amina Njeri" },
  ])?.id, "duplicate");
  assert.equal(matchLearnerName("Amina Njeri", [
    { id: "a", fullName: "Amina Wanjiku Njeri" },
    { id: "b", fullName: "Amina Wanjiku Njeri" },
  ]), null);
});

test("scores misspelled entered name tokens without penalizing an omitted middle name", () => {
  const roster = [
    { id: "a", fullName: "Amina Wanjiku Njeri" },
    { id: "b", fullName: "Brian Otieno" },
  ];
  assert.equal(matchLearnerName("Amin Njer", roster)?.id, "a");
  assert.equal(matchLearnerName("Amin Zzzzz", roster), null);
});

test("does not auto-link close fuzzy token-subset candidates", () => {
  assert.equal(matchLearnerName("Amin Njer", [
    { id: "a", fullName: "Amina Wanjiku Njeri" },
    { id: "b", fullName: "Amine Maina Njeri" },
  ]), null);
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
