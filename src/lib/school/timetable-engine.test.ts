import assert from "node:assert/strict";
import test from "node:test";
import {
  auditTimetable,
  generateTimetableDraft,
  isAfternoonPeriod,
  isValidDistribution,
  parseDistribution,
  subtractLessonPeriods,
  type EnginePeriod,
  type EnginePlacement,
  type EngineUnit,
} from "./timetable-engine.ts";

const periods: EnginePeriod[] = [
  { id: "p1", sort: 1, isBreak: false, startTime: "08:20", label: "1" },
  { id: "p2", sort: 2, isBreak: false, startTime: "09:00", label: "2" },
  { id: "b1", sort: 3, isBreak: true, startTime: "09:40", label: "First break" },
  { id: "p3", sort: 4, isBreak: false, startTime: "09:50", label: "3" },
  { id: "p4", sort: 5, isBreak: false, startTime: "10:30", label: "4" },
  { id: "b2", sort: 6, isBreak: true, startTime: "11:10", label: "Second break" },
  { id: "p5", sort: 7, isBreak: false, startTime: "11:30", label: "5" },
  { id: "p6", sort: 8, isBreak: false, startTime: "12:10", label: "6" },
  { id: "lunch", sort: 9, isBreak: true, startTime: "12:50", label: "Lunch break" },
  { id: "p7", sort: 10, isBreak: false, startTime: "14:00", label: "7" },
  { id: "p8", sort: 11, isBreak: false, startTime: "14:40", label: "8" },
];

function unit(partial: Partial<EngineUnit> & Pick<EngineUnit, "id" | "subjectId">): EngineUnit {
  return {
    gradeId: "g7",
    streamId: "g7n",
    teacherUserId: "t1",
    room: "",
    roomId: "",
    block: 1,
    order: 0,
    ...partial,
  };
}

test("distribution patterns match aSc card notation", () => {
  assert.deepEqual(parseDistribution("2+1+1+1", 5, 1), [2, 1, 1, 1]);
  assert.deepEqual(parseDistribution("", 6, 2), [2, 2, 2]);
  assert.deepEqual(parseDistribution("2+2", 5, 1), [1, 1, 1, 1, 1]);
  assert.equal(isValidDistribution("2+1+1+1", 5), true);
  assert.equal(isValidDistribution("2+2", 5), false);
  assert.equal(isValidDistribution("3+2", 5), true);
  assert.deepEqual(subtractLessonPeriods([2, 1, 1, 1], 1), [2, 1, 1]);
  assert.deepEqual(subtractLessonPeriods([2, 1, 1, 1], 2), [2, 1]);
});

test("exact weekly quotas may reuse a period column when it is the only column available", () => {
  const oneColumn = [{ id: "only", sort: 1, isBreak: false, startTime: "08:00", label: "One teaching column" }];
  const result = generateTimetableDraft({
    periods: oneColumn,
    units: Array.from({ length: 5 }, (_, order) => unit({ id: `quota-${order}`, subjectId: "english", order })),
    availability: [], subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placements.length, 5);
  assert.equal(new Set(result.placements.map((item) => item.day)).size, 5);
});

test("afternoons are the periods after lunch", () => {
  assert.equal(isAfternoonPeriod(periods[6], periods), false);
  assert.equal(isAfternoonPeriod(periods.find((period) => period.id === "p7")!, periods), true);
  assert.equal(isAfternoonPeriod(periods.find((period) => period.id === "p1")!, periods), false);
});

test("maths stays before lunch and spreads in weekday order", () => {
  const units = [0, 1, 2, 3, 4].map((order) => unit({ id: `m${order}`, subjectId: "math", order }));
  const result = generateTimetableDraft({
    periods,
    units,
    availability: [{ entityType: "subject", entityId: "math", day: 1, periodId: "p1", level: "off" }],
    subjectRules: [{ subjectId: "math", maxPerDay: 1, minDaysPerWeek: 5, noAfternoon: true, preferredMorning: true, avoidConsecutiveDays: false, noLastPeriod: false, complexity: 2, placeInOrder: true }],
    teacherRules: [],
    classRules: [],
    relations: [],
    locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  const days = result.placements.map((item) => item.day);
  assert.deepEqual(days, [1, 2, 3, 4, 5]);
  assert.ok(result.placements.every((item) => item.periodId !== "p7" && item.periodId !== "p8"));
  assert.ok(result.placements.every((item) => !(item.day === 1 && item.periodId === "p1")));
});

test("stream-specific off-time is inherited by grade-wide timetable units", () => {
  const result = generateTimetableDraft({
    periods: [periods[0]],
    units: [unit({ id: "grade-wide", subjectId: "science", streamId: null })],
    availability: [{ entityType: "stream", entityId: "g7n", streamGradeId: "g7", day: 1, periodId: "p1", level: "off" }],
    subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  assert.notEqual(result.placements[0].day, 1);
});

test("morning-priority profile changes scoring when a morning slot is only discouraged", () => {
  const profilePeriods: EnginePeriod[] = [
    { id: "am", sort: 1, isBreak: false, startTime: "08:00", label: "Morning" },
    { id: "lunch", sort: 2, isBreak: true, startTime: "12:00", label: "Lunch" },
    { id: "pm", sort: 3, isBreak: false, startTime: "14:00", label: "Afternoon" },
  ];
  const availability = [1, 2, 3, 4, 5].map((day) => ({ entityType: "subject", entityId: "art", day, periodId: "am", level: "avoid" as const }));
  const input = { periods: profilePeriods, units: [unit({ id: "art1", subjectId: "art" })], availability, subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [] };
  const balanced = generateTimetableDraft(input);
  const morning = generateTimetableDraft({ ...input, profile: "morning" });
  assert.equal(balanced.placements[0].periodId, "pm");
  assert.equal(morning.placements[0].periodId, "am");
});

test("balanced profile spreads different subjects across the class week", () => {
  const balanced = generateTimetableDraft({
    periods: [{ id: "p1", sort: 1, isBreak: false, startTime: "08:00", label: "Lesson 1" }, { id: "p2", sort: 2, isBreak: false, startTime: "09:00", label: "Lesson 2" }],
    units: ["math", "eng", "kis", "sci", "art"].map((subjectId, index) => unit({ id: `unit-${index}`, subjectId, teacherUserId: `t${index}` })),
    availability: [], subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [], profile: "balanced",
  });
  assert.equal(balanced.unplaced.length, 0);
  assert.deepEqual([...new Set(balanced.placements.map((item) => item.day))].sort(), [1, 2, 3, 4, 5]);
});

test("a double lesson cannot cross a break and two classes cannot share a teacher", () => {
  const units = [
    unit({ id: "d1", subjectId: "sci", block: 2, teacherUserId: "t1" }),
    unit({ id: "d2", subjectId: "sci", block: 2, teacherUserId: "t1", streamId: "g7s", order: 0 }),
  ];
  const result = generateTimetableDraft({
    periods,
    units,
    availability: [],
    subjectRules: [],
    teacherRules: [],
    classRules: [],
    relations: [],
    locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  for (const item of result.placements) {
    assert.equal(item.sorts.length, 2);
    assert.equal(item.sorts[1], item.sorts[0] + 1);
    assert.ok(!item.periodIds.includes("lunch"));
  }
  assert.ok(result.placements[0].day !== result.placements[1].day || result.placements[0].periodId !== result.placements[1].periodId);
});

test("teacher minimum recovery periods are enforced between distinct blocks", () => {
  const result = generateTimetableDraft({
    periods: periods.slice(0, 2),
    units: [unit({ id: "rest-a", subjectId: "english", order: 0 }), unit({ id: "rest-b", subjectId: "science", order: 1 })],
    availability: [], subjectRules: [],
    teacherRules: [{ teacherUserId: "t1", maxPerDay: 6, maxPerWeek: 30, maxConsecutive: 4, maxDays: 5, maxWindows: 3, minRestPeriods: 1 }],
    classRules: [], relations: [], locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  const [first, second] = result.placements;
  if (first.day === second.day) assert.ok(Math.abs(first.sorts[0] - second.sorts[0]) > 1);
});

test("a bell break does not count as a free teaching period for teacher recovery", () => {
  const bell = [
    { id: "before-break", sort: 1, isBreak: false, startTime: "08:00", label: "Lesson 1" },
    { id: "break", sort: 2, isBreak: true, startTime: "08:40", label: "Break" },
    { id: "after-break", sort: 3, isBreak: false, startTime: "09:00", label: "Lesson 2" },
  ];
  const result = generateTimetableDraft({
    periods: bell,
    units: [unit({ id: "break-rest-a", subjectId: "english" }), unit({ id: "break-rest-b", subjectId: "science" })],
    availability: [], subjectRules: [],
    teacherRules: [{ teacherUserId: "t1", maxPerDay: 6, maxPerWeek: 30, maxConsecutive: 4, maxDays: 5, maxWindows: 3, minRestPeriods: 1 }],
    classRules: [], relations: [], locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  assert.notEqual(result.placements[0].day, result.placements[1].day);
});

test("non-adjacent subject relations are hard generator constraints", () => {
  const result = generateTimetableDraft({
    periods: [{ id: "p1", sort: 1, isBreak: false, startTime: "08:00", label: "1" }, { id: "p2", sort: 2, isBreak: false, startTime: "09:00", label: "2" }],
    units: [unit({ id: "left", subjectId: "english", teacherUserId: "t1" }), unit({ id: "right", subjectId: "science", teacherUserId: "t2" })],
    availability: [], subjectRules: [], teacherRules: [], classRules: [],
    relations: [{ gradeId: "g7", streamId: "g7n", leftSubjectId: "english", rightSubjectId: "science", relation: "not_consecutive" }],
    locked: [],
  });
  assert.equal(result.unplaced.length, 0);
  const [left, right] = result.placements;
  assert.ok(left.day !== right.day || Math.abs(left.sorts[0] - right.sorts[0]) > 1);
});

test("locked lessons are kept and clashes are reported", () => {
  const lockedUnit = unit({ id: "lock", subjectId: "eng" });
  const locked: EnginePlacement[] = [{ unit: lockedUnit, day: 1, periodId: "p1", periodIds: ["p1"], sorts: [1], locked: true }];
  const issues = auditTimetable({
    periods,
    placements: [
      locked[0],
      { unit: unit({ id: "clash", subjectId: "kis", teacherUserId: "t1" }), day: 1, periodId: "p1", periodIds: ["p1"], sorts: [1] },
      { unit: unit({ id: "late", subjectId: "math" }), day: 2, periodId: "p7", periodIds: ["p7"], sorts: [10] },
    ],
    availability: [],
    subjectRules: [{ subjectId: "math", maxPerDay: 2, minDaysPerWeek: 1, noAfternoon: true, preferredMorning: true, avoidConsecutiveDays: false, noLastPeriod: false, complexity: 2, placeInOrder: true }],
    teacherRules: [],
    classRules: [],
    relations: [],
    requirements: [],
    names: {
      day: (day) => `Day ${day}`,
      teacher: () => "Mitchel",
      subject: (id) => id,
      classLabel: () => "7 North",
      period: (id) => id,
    },
  });
  assert.ok(issues.some((issue) => issue.severity === "error" && /double-booked/i.test(issue.message)));
  assert.ok(issues.some((issue) => /after lunch/i.test(issue.message)));
});

test("audit catches impossible weekly class and teacher loads before generation", () => {
  const issues = auditTimetable({
    periods: [{ id: "p1", sort: 1, isBreak: false, startTime: "08:00", label: "Lesson 1" }],
    placements: [], availability: [], subjectRules: [],
    teacherRules: [{ teacherUserId: "t1", maxPerDay: 6, maxPerWeek: 4, maxConsecutive: 4, maxDays: 5, maxWindows: 3 }],
    classRules: [], relations: [],
    requirements: [{ gradeId: "g7", streamId: "g7n", subjectId: "eng", teacherUserId: "t1", lessonsPerWeek: 6, blockLength: 1, distribution: "2+1+1+1+1" }],
    names: { day: (day) => `Day ${day}`, teacher: () => "Teacher A", subject: () => "English", classLabel: () => "Grade 7 North", period: (id) => id },
  });
  assert.ok(issues.some((issue) => /needs 6 periods per week but the bell only provides 5/i.test(issue.message)));
  assert.ok(issues.some((issue) => /assigned 6 periods per week, above the 4-period weekly contract/i.test(issue.message)));
});

test("weekly lesson shortfall is a blocking audit error, not a warning", () => {
  const issues = auditTimetable({
    periods,
    placements: [{ unit: unit({ id: "only-four", subjectId: "eng" }), day: 1, periodId: "p1", periodIds: ["p1"], sorts: [1] }],
    availability: [], subjectRules: [], teacherRules: [], classRules: [], relations: [],
    requirements: [{ gradeId: "g7", streamId: "g7n", subjectId: "eng", teacherUserId: "t1", lessonsPerWeek: 5, blockLength: 1, distribution: "1+1+1+1+1" }],
    names: { day: (day) => `Day ${day}`, teacher: () => "Teacher A", subject: () => "English", classLabel: () => "Grade 7 North", period: (id) => id },
  });
  assert.ok(issues.some((issue) => issue.severity === "error" && /has 1 of 5 required weekly periods/i.test(issue.message)));
});

test("four saved blocks including one double satisfy five required weekly periods", () => {
  const base = unit({ id: "english-double", subjectId: "eng", block: 2 });
  const singles = ["p3", "p4", "p5"].map((periodId, index) => {
    const period = periods.find((item) => item.id === periodId)!;
    return { unit: unit({ id: `english-single-${index}`, subjectId: "eng", order: index + 1 }), day: index + 1, periodId, periodIds: [periodId], sorts: [period.sort] };
  });
  const issues = auditTimetable({
    periods,
    placements: [{ unit: base, day: 1, periodId: "p1", periodIds: ["p1", "p2"], sorts: [1, 2] }, ...singles],
    availability: [], subjectRules: [], teacherRules: [], classRules: [], relations: [],
    requirements: [{ gradeId: "g7", streamId: "g7n", subjectId: "eng", teacherUserId: "t1", lessonsPerWeek: 5, blockLength: 1, distribution: "2+1+1+1" }],
    names: { day: (day) => `Day ${day}`, teacher: () => "Teacher A", subject: () => "English", classLabel: () => "Grade 7 North", period: (id) => id },
  });
  assert.ok(!issues.some((issue) => /required weekly periods/i.test(issue.message)));
});

test("audit detects bell, placement, contract, distribution, and room-integrity issues", () => {
  const issues = auditTimetable({
    periods: [
      { id: "p1", sort: 1, isBreak: false, startTime: "08:00", endTime: "09:00", label: "Lesson 1" },
      { id: "p2", sort: 1, isBreak: false, startTime: "08:30", endTime: "09:10", label: "Lesson 2" },
      { id: "p3", sort: 2, isBreak: false, startTime: "10:30", endTime: "09:30", label: "Broken period" },
    ],
    placements: [
      { unit: unit({ id: "bad-day", subjectId: "eng", block: 2, room: "Lab" }), day: 6, periodId: "missing", periodIds: ["p1"], sorts: [1] },
      { unit: unit({ id: "crowded", subjectId: "sci", teacherUserId: "t2", room: "Hall" }), day: 2, periodId: "p2", periodIds: ["p2"], sorts: [1] },
    ],
    availability: [],
    subjectRules: [],
    teacherRules: [],
    classRules: [],
    relations: [],
    requirements: [
      { gradeId: "g7", streamId: "g7n", subjectId: "eng", teacherUserId: "t1", lessonsPerWeek: 5, blockLength: 1, distribution: "1+2+3" },
      { gradeId: "g7", streamId: "g7n", subjectId: "eng", teacherUserId: "t1", lessonsPerWeek: 5, blockLength: 1, distribution: "1+2+3" },
    ],
    rooms: [
      { name: "Lab", active: false, capacity: 10 },
      { name: "Hall", active: true, capacity: 20 },
    ],
    classSizes: [{ gradeId: "g7", streamId: "g7n", learners: 25 }],
    assignments: [{ gradeId: "g7", streamId: "g7n", subjectId: "eng", teacherUserId: "t2" }, { gradeId: "g7", streamId: "g7n", subjectId: "sci", teacherUserId: "t2" }, { gradeId: "g8", streamId: null, subjectId: "art", teacherUserId: "t9" }],
    names: {
      day: (day) => `Day ${day}`,
      teacher: (id) => id,
      subject: (id) => id,
      classLabel: () => "Grade 7 North",
      period: (id) => id,
    },
  });
  const messages = issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => /valid 24-hour/i.test(message)));
  assert.ok(messages.some((message) => /same sequence number/i.test(message)));
  assert.ok(messages.some((message) => /overlap in clock time/i.test(message)));
  assert.ok(messages.some((message) => /invalid weekday/i.test(message)));
  assert.ok(messages.some((message) => /period that is missing/i.test(message)));
  assert.ok(messages.some((message) => /incomplete or non-contiguous/i.test(message)));
  assert.ok(messages.some((message) => /duplicate weekly requirements/i.test(message)));
  assert.ok(messages.some((message) => /malformed weekly distribution/i.test(message)));
  assert.ok(messages.some((message) => /inactive but still scheduled/i.test(message)));
  assert.ok(messages.some((message) => /below the 25-learner class size/i.test(message)));
  assert.ok(messages.some((message) => /without a matching subject-teacher assignment/i.test(message)));
  assert.ok(messages.some((message) => /do not yet have weekly lesson cards/i.test(message)));
});

import { applyDoubleRule, preBreakSorts } from "./timetable-engine.ts";

test("double rule: never double, or an exact number of doubles", () => {
  assert.deepEqual(applyDoubleRule([2, 1, 1, 1], 0), [1, 1, 1, 1, 1]);
  assert.deepEqual(applyDoubleRule([1, 1, 1, 1, 1], 1), [2, 1, 1, 1]);
  assert.deepEqual(applyDoubleRule([1, 1, 1, 1, 1], 9), [2, 2, 1]);
  assert.deepEqual(applyDoubleRule([2, 1, 1, 1], null), [2, 1, 1, 1]);
});

test("pre-break periods are the two lessons directly before each break", () => {
  assert.deepEqual([...preBreakSorts(periods)].sort((a, b) => a - b), [1, 2, 4, 5, 7, 8]);
});

test("every lesson of a busy class is placed (5 of 5), with a limit of 3 before breaks", () => {
  const subjects = ["eng", "mat", "sci", "sst"];
  const units = subjects.flatMap((subjectId, s) => Array.from({ length: 5 }, (_, order) => unit({ id: `${subjectId}-${order}`, subjectId, teacherUserId: `t${s}`, order })));
  const result = generateTimetableDraft({ periods, units, availability: [], subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [] });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placements.length, 20);
  const before = preBreakSorts(periods);
  for (const subjectId of subjects) {
    const count = result.placements.filter((item) => item.unit.subjectId === subjectId).reduce((sum, item) => sum + item.sorts.filter((sort) => before.has(sort)).length, 0);
    assert.ok(count <= 3, `${subjectId} has ${count} lessons before breaks`);
  }
});

test("a swap frees a slot so no lesson is left out", () => {
  // Two classes share one teacher; the only free columns force a swap.
  const two = [{ id: "a", sort: 1, isBreak: false, startTime: "08:00", label: "1" }, { id: "b", sort: 2, isBreak: false, startTime: "08:40", label: "2" }];
  const units = [
    ...Array.from({ length: 5 }, (_, order) => unit({ id: `x${order}`, subjectId: "eng", streamId: "n", order })),
    ...Array.from({ length: 5 }, (_, order) => unit({ id: `y${order}`, subjectId: "eng", streamId: "s", order })),
  ];
  const result = generateTimetableDraft({ periods: two, units, availability: [], subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [] });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placements.length, 10);
});

test("repair keeps valid lessons and moves only the one on a subject off-time", () => {
  const units = Array.from({ length: 3 }, (_, order) => unit({ id: `m${order}`, subjectId: "mat", order }));
  const slot = (day: number, id: string, sort: number) => ({ day, periodId: id, periodIds: [id], sorts: [sort] });
  const existing: EnginePlacement[] = [
    { unit: units[0], ...slot(1, "p1", 1) },
    { unit: units[1], ...slot(3, "p1", 1) },
    { unit: units[2], ...slot(5, "p1", 1) },
  ];
  const result = generateTimetableDraft({ periods, units, availability: [{ entityType: "subject", entityId: "mat", day: 3, periodId: "p1", level: "off" }], subjectRules: [], teacherRules: [], classRules: [], relations: [], locked: [], existing });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placements.length, 3);
  assert.equal(result.placements.some((item) => item.day === 3 && item.periodIds.includes("p1")), false);
  assert.ok(result.placements.some((item) => item.day === 1 && item.periodId === "p1"));
  assert.ok(result.placements.some((item) => item.day === 5 && item.periodId === "p1"));
});
