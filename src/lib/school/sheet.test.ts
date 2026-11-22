import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { marksFromMatrix, readXlsxMatrix, writeXlsxFromMatrix } from "./sheet.ts";

test("mark import accepts learner name without admission number", () => {
  const rows = marksFromMatrix([["Learner Name", "Mathematics", "English"], ["Amina Yusuf", "78", "81"]]);
  assert.deepEqual(rows[0], { admissionNumber: "", fullName: "Amina Yusuf", scores: { Mathematics: 78, English: 81 } });
});

test("mark import accepts admission number without learner name", () => {
  const rows = marksFromMatrix([["Admission Number", "Mathematics"], ["MKS-2026-12345", "78"]]);
  assert.deepEqual(rows[0], { admissionNumber: "MKS-2026-12345", fullName: "", scores: { Mathematics: 78 } });
});

test("mark import retains every subject and converts obtained/maximum scores", () => {
  const rows = marksFromMatrix([
    ["Admission No.", "Learner Name", "Mathematics (100)", "English Score", "Integrated Science", "Social Studies", "Total", "Teacher"],
    ["MKS-2026-12345", "Amina Yusuf", "42/50", "81", "33/40", "76", "232", "Teacher A"],
  ]);
  assert.deepEqual(rows[0], {
    admissionNumber: "MKS-2026-12345",
    fullName: "Amina Yusuf",
    scores: { "Mathematics (100)": 84, "English Score": 81, "Integrated Science": 82.5, "Social Studies": 76 },
  });
});

test("mark import finds the learner header below a school title and retains common subject columns", () => {
  const rows = marksFromMatrix([
    ["Mukuyu Junior School — End Term Marks"],
    ["Admission No.", "Learner Name", "English", "Science", "Creative Arts", "Agriculture", "Pretech"],
    ["MKS-2026-12345", "Amina Yusuf", "81", "76", "84", "73", "79"],
  ]);
  assert.deepEqual(rows[0], {
    admissionNumber: "MKS-2026-12345",
    fullName: "Amina Yusuf",
    scores: { English: 81, Science: 76, "Creative Arts": 84, Agriculture: 73, Pretech: 79 },
  });
});

test("mark-list matrix exports as an Excel workbook with requested orientation and escaped cells", () => {
  const bytes = writeXlsxFromMatrix([
    ["School & Trust"],
    ["Roll", "Admission No.", "Learner", "Mathematics"],
    [1, "ADM-1", "A <Learner>", 87.5],
    [2, "ADM-2", "=2+2", ""],
  ], { sheetName: "Grade 7 North", orientation: "portrait", headerRow: 2 });
  const files = unzipSync(bytes);
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(files["xl/workbook.xml"]);
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /orientation="portrait"/);
  assert.match(xml, /ySplit="2"/);
  assert.match(xml, /&lt;Learner&gt;/);
  assert.match(xml, /=2\+2/);
  assert.match(xml, /87\.5/);
});

test("generated XLSX reopens through the worksheet reader", async () => {
  const bytes = writeXlsxFromMatrix([["School & Trust"], ["Roll", "Learner"], [1, "A <Learner> & Co."]], { headerRow: 2 });
  const matrix = await readXlsxMatrix(bytes);
  assert.equal(matrix[0][0], "School & Trust");
  assert.equal(matrix[2][1], "A <Learner> & Co.");
});
