import assert from "node:assert/strict";
import test from "node:test";
import { meritPdfLetterheadLayout, paginateMeritAnalyticsItems, paginateMeritTextLines, paginateSubjectLevelRows, subjectLevelBandCode, subjectLevelRowsPerPage, subjectLevelSubjectColumnWidth, subjectLevelSubjectSections } from "./merit-pdf-layout.ts";

test("wrapped merit letterhead reserves separate baselines for long vision and mission text", () => {
  const layout = meritPdfLetterheadLayout({ school: 2, address: 2, vision: 3, mission: 4, motto: 2, title: 2, period: 2 });

  assert.ok(layout.mission >= layout.vision + 3 * 2.3);
  assert.ok(layout.motto >= layout.mission + 4 * 2.3);
  assert.ok(layout.title >= layout.motto + 2 * 3);
  assert.ok(layout.period >= layout.title + 2 * 3.4);
  assert.ok(layout.headerBottom > layout.period + 2.7);
  assert.ok(layout.tableTop >= layout.headerBottom + 4);
});

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

test("uses the current page's smaller analytics capacity before full continuation pages", () => {
  const rows = [{ id: 1, height: 6 }, { id: 2, height: 7 }, { id: 3, height: 8 }, { id: 4, height: 9 }];
  const pages = paginateMeritAnalyticsItems(rows, 13, (row) => row.height, 20);

  assert.deepEqual(pages.map((page) => page.map((row) => row.id)), [[1, 2], [3, 4]]);
  assert.ok(pages[0].reduce((sum, row) => sum + row.height, 0) <= 13);
  assert.ok(pages.slice(1).every((page) => page.reduce((sum, row) => sum + row.height, 0) <= 20));
});

test("packs wrapped term and review lines into the current page before adding full continuation pages", () => {
  const lines = Array.from({ length: 17 }, (_, index) => `line-${index + 1}`);
  const pages = paginateMeritTextLines(lines, 5, 10);

  assert.deepEqual(pages.map((page) => page.length), [5, 10, 2]);
  assert.deepEqual(pages.flat(), lines);
});

test("reserves enough subject-level rows below a taller wrapped header", () => {
  assert.ok(subjectLevelRowsPerPage(297, 5.6, 48) < subjectLevelRowsPerPage(297, 5.6, 43));
  const rows = Array.from({ length: 85 }, (_, index) => index + 1);
  const pages = paginateSubjectLevelRows(rows, 297, 5.6, 48);

  assert.deepEqual(pages.flat(), rows);
  assert.ok(pages.every((page) => page.length <= subjectLevelRowsPerPage(297, 5.6, 48)));
});

test("subject-level PDF extracts the band code rather than the numeric score for level styling", () => {
  assert.equal(subjectLevelBandCode("92 · EE1"), "EE1");
  assert.equal(subjectLevelBandCode("66.5 · ME2"), "ME2");
  assert.equal(subjectLevelBandCode("—"), "—");
});

test("empty subject-level rosters still render one explanatory page", () => {
  assert.deepEqual(paginateSubjectLevelRows([], 297), [[]]);
});
