import assert from "node:assert/strict";
import test from "node:test";
import { resolveSubjectHeader } from "./subject-header.ts";

const subjects = [
  { id: "eng", name: "ENGLISH", shortName: "ENG" },
  { id: "scie", name: "INTEGRATED SCIENCE", shortName: "SCI" },
  { id: "agri", name: "AGRICULTURE AND NUTRITION", shortName: "AGR" },
  { id: "pre", name: "PRETECHNICAL STUDIES", shortName: "PRE" },
  { id: "math", name: "MATHEMATICS", shortName: "MATH" },
];

test("resolves the requested full-name and common short-header subjects", () => {
  assert.equal(resolveSubjectHeader("English Language", subjects)?.id, "eng");
  assert.equal(resolveSubjectHeader("Integrated Science", subjects)?.id, "scie");
  assert.equal(resolveSubjectHeader("Agriculture", subjects)?.id, "agri");
  assert.equal(resolveSubjectHeader("Pretech", subjects)?.id, "pre");
});

test("normalizes common spelling, punctuation and marks suffix variations", () => {
  assert.equal(resolveSubjectHeader("Intergrate Science Marks", subjects)?.id, "scie");
  assert.equal(resolveSubjectHeader("Pre-Tech (100)", subjects)?.id, "pre");
  assert.equal(resolveSubjectHeader("Agric.", subjects)?.id, "agri");
  assert.equal(resolveSubjectHeader("English score", subjects)?.id, "eng");
});

test("accepts a clear typo for a configured subject and ignores unknown or ambiguous columns", () => {
  assert.equal(resolveSubjectHeader("Mathematicss", subjects)?.id, "math");
  assert.equal(resolveSubjectHeader("Unknown elective", subjects), null);
  assert.equal(resolveSubjectHeader("Integrated Science", [...subjects, { id: "sci2", name: "INTEGRATED SCIENCE", shortName: "ISCI" }]), null);
});
