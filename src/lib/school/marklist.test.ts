import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarklistRows, learnersForMarklist } from "./marklist.ts";

test("mark-list roster includes saved historical members and active current stream members once", () => {
  const learners = [
    { id: "old", roll: 4, fullName: "Historical Learner", gradeId: "g7", streamId: "north", status: "inactive" },
    { id: "current", roll: 2, fullName: "Current Learner", gradeId: "g7", streamId: "north", status: "active" },
    { id: "inactive", roll: 1, fullName: "Inactive Without Placement", gradeId: "g7", streamId: "north", status: "inactive" },
    { id: "other", roll: 3, fullName: "Other Stream", gradeId: "g7", streamId: "south", status: "active" },
  ];
  const ws = {
    learners,
    placements: [{ learnerId: "old", yearId: "y1", gradeId: "g7", streamId: "north" }],
    marks: [],
    years: [{ id: "y1", sort: 1 }, { id: "y2", sort: 2 }],
    grades: [{ id: "g7", level: 7 }],
    profile: { activeYearId: "y2" },
  } as never;

  const rows = learnersForMarklist(ws, "y1", "g7", "north");
  assert.deepEqual(rows.map((learner) => learner.id), ["current", "old"]);
});

test("mark-list pagination keeps all rows and returns one empty page for an empty roster", () => {
  const rows = Array.from({ length: 57 }, (_, index) => `learner-${index + 1}`);
  const pages = chunkMarklistRows(rows, 24);
  assert.deepEqual(pages.map((page) => page.length), [24, 24, 9]);
  assert.deepEqual(pages.flat(), rows);
  assert.deepEqual(chunkMarklistRows([], 24), [[]]);
});
