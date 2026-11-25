import assert from "node:assert/strict";
import test from "node:test";
import { paginateMeritAnalyticsItems, paginateSubjectLevelRows, subjectLevelBandCode, subjectLevelRowsPerPage, subjectLevelSubjectColumnWidth, subjectLevelSubjectSections } from "./merit-pdf-layout.ts";

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

test("keeps every subject in one portrait section and balances the available column width", () => {
  const subjects = Array.from({ length: 16 }, (_, index) => `subject-${index + 1}`);
  const sections = subjectLevelSubjectSections(subjects, "portrait");
  const identityWidths = [6, 5, 14, 32, 11, 9, 9];
  const subjectWidth = subjectLevelSubjectColumnWidth(200, identityWidths, subjects.length);

  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0], subjects);
  assert.equal(subjectWidth, (200 - identityWidths.reduce((total, width) => total + width, 0)) / subjects.length);
  assert.ok(identityWidths.reduce((total, width) => total + width, 0) + subjectWidth * subjects.length <= 200);
});

test("preserves landscape subject sections", () => {
  const subjects = Array.from({ length: 25 }, (_, index) => index + 1);
  const sections = subjectLevelSubjectSections(subjects, "landscape");
  assert.deepEqual(sections.map((section) => section.length), [12, 12, 1]);
  assert.deepEqual(sections.flat(), subjects);
});

test("paginates variable-height analytics without omitting or reordering insights", () => {
  const rows = Array.from({ length: 31 }, (_, index) => ({ id: index + 1, height: 8 + (index % 3) * 4 }));
  const pages = paginateMeritAnalyticsItems(rows, 52, (row) => row.height);
  assert.deepEqual(pages.flat().map((row) => row.id), rows.map((row) => row.id));
  assert.ok(pages.every((page) => page.reduce((sum, row) => sum + row.height, 0) <= 52));
  assert.ok(pages.every((page) => page.length > 0));
});

test("subject-level PDF extracts the band code rather than the numeric score for level styling", () => {
  assert.equal(subjectLevelBandCode("92 · EE1"), "EE1");
  assert.equal(subjectLevelBandCode("66.5 · ME2"), "ME2");
  assert.equal(subjectLevelBandCode("—"), "—");
});

test("empty subject-level rosters still render one explanatory page", () => {
  assert.deepEqual(paginateSubjectLevelRows([], 297), [[]]);
});
