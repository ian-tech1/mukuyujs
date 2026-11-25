import assert from "node:assert/strict";
import test from "node:test";
import { paginateSubjectLevelRows, subjectLevelBandCode, subjectLevelRowsPerPage } from "./merit-pdf-layout.ts";

test("subject-level portrait pagination uses the available page height without changing row height", () => {
  const portraitCapacity = subjectLevelRowsPerPage(297);
  const landscapeCapacity = subjectLevelRowsPerPage(210);
  assert.equal(portraitCapacity, 42);
  assert.equal(landscapeCapacity, 27);
  assert.ok(portraitCapacity > landscapeCapacity);
});

test("balances learner rows across portrait pages and retains every row", () => {
  const rows = Array.from({ length: 79 }, (_, index) => index + 1);
  const pages = paginateSubjectLevelRows(rows, 297);
  assert.deepEqual(pages.map((page) => page.length), [40, 39]);
  assert.deepEqual(pages.flat(), rows);
  assert.ok(pages.every((page) => page.length <= subjectLevelRowsPerPage(297)));
});

test("keeps landscape row capacity and balances pages", () => {
  const rows = Array.from({ length: 79 }, (_, index) => index + 1);
  const pages = paginateSubjectLevelRows(rows, 210);
  assert.deepEqual(pages.map((page) => page.length), [27, 27, 25]);
  assert.deepEqual(pages.flat(), rows);
});

test("subject-level PDF extracts the band code rather than the numeric score for level styling", () => {
  assert.equal(subjectLevelBandCode("92 · EE1"), "EE1");
  assert.equal(subjectLevelBandCode("66.5 · ME2"), "ME2");
  assert.equal(subjectLevelBandCode("—"), "—");
});

test("empty subject-level rosters still render one explanatory page", () => {
  assert.deepEqual(paginateSubjectLevelRows([], 297), [[]]);
});
