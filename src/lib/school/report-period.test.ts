import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReportExamChoices, chooseReportExams, filterReportMarksToGrade, remapMarksForReport, reportChoicesForDownload, reportExamChoiceKey, reportExamLabel, reportTermIds, validateReportExamSelection } from "./report-period.ts";

const terms = [
  { id: "t3", name: "Term 3", sort: 3 },
  { id: "t1", name: "Term 1", sort: 1 },
  { id: "t2", name: "Term 2", sort: 2 },
];
const exams = [
  { id: "e2", name: "End Term", code: "ET", sort: 2 },
  { id: "e1", name: "CAT 1", code: "C1", sort: 1 },
];

test("report exam choices respect configured active exams and fall back to all exams when unconfigured", () => {
  const choices = buildReportExamChoices("2026", terms, exams, [
    { yearId: "2026", termId: "t1", examId: "e1", active: true },
    { yearId: "2026", termId: "t1", examId: "e2", active: false },
    { yearId: "2025", termId: "t2", examId: "e1", active: false },
  ]);
  assert.deepEqual(choices.map(({ termId, examId }) => `${termId}/${examId}`), [
    "t1/e1", "t2/e1", "t2/e2", "t3/e1", "t3/e2",
  ]);
});

test("exam selection filters both chosen terms and chosen exams", () => {
  const choices = buildReportExamChoices("2026", terms, exams, []);
  const selected = chooseReportExams(choices, ["t1", "t3"], [reportExamChoiceKey("t1", "e1"), reportExamChoiceKey("t3", "e2")]);
  assert.deepEqual(selected.map(({ termId, examId }) => `${termId}/${examId}`), ["t1/e1", "t3/e2"]);
});

test("same exam in different terms receives independent export IDs and keeps each term's mark", () => {
  const choices = buildReportExamChoices("2026", terms, exams, []).filter((choice) => choice.examId === "e1");
  assert.notEqual(choices[0]?.key, choices[1]?.key);
  const mapped = remapMarksForReport([
    { learnerId: "l1", subjectId: "s1", yearId: "2026", termId: "t1", examId: "e1", score: 61 },
    { learnerId: "l1", subjectId: "s1", yearId: "2026", termId: "t2", examId: "e1", score: 82 },
    { learnerId: "l1", subjectId: "s1", yearId: "2025", termId: "t1", examId: "e1", score: 99 },
  ], choices);
  assert.deepEqual(mapped.map(({ examId, score }) => [examId, score]), [
    [reportExamChoiceKey("t1", "e1"), 61],
    [reportExamChoiceKey("t2", "e1"), 82],
  ]);
});

test("term-name preference controls labels without changing exam identity", () => {
  const choice = buildReportExamChoices("2026", terms, exams, [])[0]!;
  assert.equal(reportExamLabel(choice, true), "Term 1 · CAT 1");
  assert.equal(reportExamLabel(choice, false), "CAT 1");
  assert.equal(choice.key, reportExamChoiceKey("t1", "e1"));
});

test("combined report marks stay within the selected grade and learner set", () => {
  const marks = [
    { learnerId: "l1", gradeId: "g1", score: 70 },
    { learnerId: "l1", gradeId: "g2", score: 99 },
    { learnerId: "l2", gradeId: "g1", score: 85 },
    { learnerId: "l1", score: 60 },
  ];
  const selected = filterReportMarksToGrade(marks, ["l1"], "g1");
  assert.deepEqual(selected.map(({ gradeId, score }) => [gradeId ?? null, score]), [["g1", 70], [null, 60]]);
});

test("shared report range selection preserves term ordering and filters custom terms and exams", () => {
  const choices = buildReportExamChoices("2026", terms, exams, []);
  assert.deepEqual(reportTermIds("year", "t2", terms, []), ["t1", "t2", "t3"]);
  assert.deepEqual(reportTermIds("custom", "t2", terms, ["t3", "t1", "unknown"]), ["t1", "t3"]);
  const termIds = reportTermIds("custom", "t2", terms, ["t3", "t1"]);
  const selected = reportChoicesForDownload(choices, "custom", termIds, [reportExamChoiceKey("t1", "e2"), reportExamChoiceKey("t3", "e1")]);
  assert.deepEqual(selected.map(({ termId, examId }) => `${termId}/${examId}`), ["t1/e2", "t3/e1"]);
});

test("family report selection validation rejects unknown or duplicate term and exam choices", () => {
  const choices = buildReportExamChoices("2026", terms, exams, []);
  assert.equal(validateReportExamSelection(choices, ["t1"], [reportExamChoiceKey("t1", "e1")])?.length, 1);
  assert.equal(validateReportExamSelection(choices, ["t1"], ["unknown"]), null);
  assert.equal(validateReportExamSelection(choices, ["t1", "t1"], [reportExamChoiceKey("t1", "e1")]), null);
  assert.equal(validateReportExamSelection(choices, ["t1"], [reportExamChoiceKey("t1", "e1"), reportExamChoiceKey("t1", "e1")]), null);
});
