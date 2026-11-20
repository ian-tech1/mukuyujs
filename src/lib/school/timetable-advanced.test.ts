import assert from "node:assert/strict";
import test from "node:test";
import { calculateTeacherLoads, detectClassGaps } from "./timetable-advanced.ts";

const periods = [
  { id: "p1", yearId: "y1", termId: "t1", label: "1", startTime: "08:00", endTime: "08:40", sort: 1, isBreak: false },
  { id: "p2", yearId: "y1", termId: "t1", label: "2", startTime: "08:40", endTime: "09:20", sort: 2, isBreak: false },
  { id: "p3", yearId: "y1", termId: "t1", label: "3", startTime: "09:20", endTime: "10:00", sort: 3, isBreak: false },
] as const;

const entry = (periodId: string, blockLength: number) => ({
  gradeId: "g7",
  streamId: "north",
  teacherUserId: "t1",
  dayOfWeek: 1,
  periodId,
  blockLength,
});

test("teacher loads count every period covered by a double block", () => {
  const loads = calculateTeacherLoads([entry("p1", 2)], [...periods]);
  assert.equal(loads[0]?.periods, 2);
});

test("a double block does not create a false class gap at its second period", () => {
  const gaps = detectClassGaps([entry("p1", 2), entry("p3", 1)], [...periods]);
  assert.deepEqual(gaps, []);
});

test("class gaps are still detected when a teaching period is genuinely empty", () => {
  const gaps = detectClassGaps([entry("p1", 1), entry("p3", 1)], [...periods]);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0].gapPeriods, [1]);
});
