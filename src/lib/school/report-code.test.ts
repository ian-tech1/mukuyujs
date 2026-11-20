import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeReportCode, resolveReportCode } from "./report-code.ts";

const learners = [
  { id: "learner-a", publicCode: "ab12cd34", roll: 7 },
  { id: "learner-b", publicCode: "ef56gh78", roll: 8 },
];

test("stable public codes resolve as before, ignoring case and surrounding whitespace", () => {
  assert.equal(resolveReportCode(learners, " AB12CD34 ")?.id, "learner-a");
});

test("legacy numeric report links resolve when the roll number is unique", () => {
  assert.equal(normalizeReportCode("7"), "7");
  assert.equal(resolveReportCode(learners, " 7 ")?.id, "learner-a");
});

test("duplicate roll numbers are rejected instead of showing the wrong learner", () => {
  const duplicate = [...learners, { id: "learner-c", publicCode: "ij90kl12", roll: 7 }];
  assert.equal(resolveReportCode(duplicate, "7"), null);
});

test("unknown and malformed codes do not resolve", () => {
  assert.equal(normalizeReportCode("not-a-code"), null);
  assert.equal(normalizeReportCode("12345678901"), "12345678901");
  assert.equal(normalizeReportCode("1234567890123"), null);
  assert.equal(resolveReportCode(learners, "not-a-code"), null);
  assert.equal(resolveReportCode(learners, "99999999999999999999999"), null);
});
