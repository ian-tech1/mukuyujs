// Pure aSc-style timetable builder. No database imports — safe to unit test and to call from the server.

export type EnginePeriod = { id: string; sort: number; isBreak: boolean; startTime: string; endTime?: string; label: string };
export type EngineLevel = "off" | "avoid" | "prefer";
export type EngineUnit = {
  id: string;
  gradeId: string;
  streamId: string | null;
  subjectId: string;
  teacherUserId: string;
  room: string;
  roomId: string;
  block: number;
  order: number;
  preferredDay?: number;
  timingPreference?: "none" | "before_break" | "before_lunch";
};
export type EngineAvailability = { entityType: string; entityId: string; day: number; periodId: string; level: EngineLevel; streamGradeId?: string };
export type EngineSubjectRule = {
  subjectId: string;
  maxPerDay: number;
  minDaysPerWeek: number;
  noAfternoon: boolean;
  preferredMorning: boolean;
  avoidConsecutiveDays: boolean;
  noLastPeriod: boolean;
  complexity: number;
  placeInOrder: boolean;
  /** null/undefined = follow each lesson card. 0 = never double. n = exactly n double lessons a week. */
  doubleCount?: number | null;
  /** Most lessons per week one class may have in the two periods just before a break. */
  maxBeforeBreak?: number;
};
export type EngineTeacherRule = {
  teacherUserId: string;
  minPerDay?: number;
  maxPerDay: number;
  maxPerWeek: number;
  maxConsecutive: number;
  maxDays: number;
  maxWindows: number;
  minRestPeriods?: number;
};
export type EngineClassRule = { gradeId: string; streamId: string | null; maxPerDay: number; noGaps: boolean };
export type EngineRelation = {
  gradeId: string;
  streamId: string | null;
  leftSubjectId: string;
  rightSubjectId: string;
  relation: "before" | "same_day" | "different_day" | "not_consecutive";
};
export type EnginePlacement = {
  unit: EngineUnit;
  day: number;
  periodId: string;
  periodIds: string[];
  sorts: number[];
  locked?: boolean;
};
export type EngineFix = {
  kind: "repair" | "reset_distribution" | "relax_rest" | "raise_teacher_limit" | "raise_subject_max_day";
  label: string;
  requirementId?: string;
  teacherUserId?: string;
  subjectId?: string;
};
export type EngineIssue = { severity: "error" | "warning"; message: string; fix?: EngineFix };
export type EngineRoom = { name: string; active: boolean; capacity: number };
export type EngineOptimizationProfile = "balanced" | "morning" | "compact";
export type EngineAssignment = { gradeId: string; streamId: string | null; subjectId: string; teacherUserId: string };
export type EngineNames = {
  day: (day: number) => string;
  teacher: (id: string) => string;
  subject: (id: string) => string;
  classLabel: (gradeId: string, streamId: string | null) => string;
  period: (id: string) => string;
};

const DAY_COUNT = 5;

/** Applies a subject-level double-lesson rule on top of a card's own pattern. */
export function applyDoubleRule(blocks: number[], doubleCount?: number | null) {
  if (doubleCount == null || !Number.isFinite(doubleCount)) return blocks;
  const total = blocks.reduce((sum, part) => sum + part, 0);
  if (doubleCount <= 0) return Array.from({ length: total }, () => 1);
  const doubles = Math.min(Math.floor(total / 2), Math.trunc(doubleCount));
  return [...Array.from({ length: doubles }, () => 2), ...Array.from({ length: total - doubles * 2 }, () => 1)];
}

/** The two teaching periods directly before each break (the "double column" before a break). */
export function preBreakSorts(periods: EnginePeriod[]) {
  const result = new Set<number>();
  const lessons = periods.filter((period) => !period.isBreak);
  for (const brk of periods.filter((period) => period.isBreak)) {
    for (const lesson of lessons) if (lesson.sort < brk.sort && lesson.sort >= brk.sort - 2) result.add(lesson.sort);
  }
  return result;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseDistribution(pattern: string, lessonsPerWeek: number, blockLength: number): number[] {
  const cleaned = pattern.trim().replace(/\s+/g, "");
  if (cleaned) {
    const parts = cleaned.split("+").map((part) => Number(part));
    if (parts.length && parts.every((part) => Number.isInteger(part) && part >= 1 && part <= 3)) {
      if (parts.reduce((sum, part) => sum + part, 0) === lessonsPerWeek) return parts;
    }
  }
  const block = Math.max(1, Math.min(3, Math.trunc(blockLength) || 1));
  if (lessonsPerWeek > 0 && lessonsPerWeek % block === 0) return Array.from({ length: lessonsPerWeek / block }, () => block);
  return Array.from({ length: Math.max(0, lessonsPerWeek) }, () => 1);
}

export function isValidDistribution(pattern: string, lessonsPerWeek: number) {
  const cleaned = pattern.trim().replace(/\s+/g, "");
  if (!cleaned) return true;
  const parts = cleaned.split("+").map(Number);
  return parts.length > 0 && parts.every((part) => Number.isInteger(part) && part >= 1 && part <= 3) && parts.reduce((sum, part) => sum + part, 0) === lessonsPerWeek;
}

export function subtractLessonPeriods(blocks: number[], alreadyPlaced: number) {
  const result = [...blocks];
  let remaining = Math.max(0, Math.trunc(alreadyPlaced));
  for (let index = result.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (result[index] === 1) {
      result.splice(index, 1);
      remaining -= 1;
    }
  }
  for (let index = result.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const removed = Math.min(result[index], remaining);
    result[index] -= removed;
    remaining -= removed;
    if (result[index] === 0) result.splice(index, 1);
    else if (result[index] === 1 && removed > 0) result[index] = 1;
  }
  return result;
}

export function distributionWithDoubleDay(blocks: number[], preferredDoubleDay?: number | null) {
  const result = [...blocks];
  if (!preferredDoubleDay || result.includes(2)) return result;
  const triple = result.indexOf(3);
  if (triple >= 0) { result.splice(triple, 1, 2, 1); return result; }
  const singles = result.map((block, index) => block === 1 ? index : -1).filter((index) => index >= 0);
  if (singles.length >= 2) { result[singles[0]] = 2; result.splice(singles[1], 1); }
  return result;
}

export function isAfternoonPeriod(period: EnginePeriod, periods: EnginePeriod[]) {
  const lunch = periods.find((item) => item.isBreak && /lunch/i.test(item.label));
  if (lunch) return !period.isBreak && period.sort > lunch.sort;
  const match = /^(\d{2}):(\d{2})$/.exec(period.startTime);
  if (!match) return false;
  return Number(match[1]) * 60 + Number(match[2]) >= 13 * 60;
}

export function lessonPeriodsOf(periods: EnginePeriod[]) {
  return periods.filter((period) => !period.isBreak).sort((a, b) => a.sort - b.sort);
}

function lessonPositionForSort(sort: number, periods: EnginePeriod[]) {
  return lessonPeriodsOf(periods).findIndex((period) => period.sort === sort);
}

export function slotsForBlock(block: number, periods: EnginePeriod[]) {
  const lessons = lessonPeriodsOf(periods);
  const slots: Array<{ periodId: string; periodIds: string[]; sorts: number[] }> = [];
  for (let index = 0; index <= lessons.length - block; index += 1) {
    const group = lessons.slice(index, index + block);
    const consecutive = group.every((period, offset) => offset === 0 || period.sort === group[offset - 1].sort + 1);
    if (!consecutive) continue;
    const breakBetween = periods.some((period) => period.isBreak && period.sort > group[0].sort && period.sort < group[group.length - 1].sort);
    if (breakBetween) continue;
    slots.push({ periodId: group[0].id, periodIds: group.map((period) => period.id), sorts: group.map((period) => period.sort) });
  }
  return slots;
}

function sameClass(left: { gradeId: string; streamId: string | null }, right: { gradeId: string; streamId: string | null }) {
  return left.gradeId === right.gradeId && (left.streamId == null || right.streamId == null || left.streamId === right.streamId);
}

function classKey(gradeId: string, streamId: string | null) {
  return `${gradeId}:${streamId ?? "*"}`;
}

type Slot = { day: number; periodId: string; periodIds: string[]; sorts: number[] };

function availabilityIndex(rows: EngineAvailability[]) {
  const map = new Map<string, EngineLevel>();
  for (const row of rows) {
    const keys = [`${row.entityType}:${row.entityId}:${row.day}:${row.periodId}`];
    if (row.entityType === "stream" && row.streamGradeId) keys.push(`stream-grade:${row.streamGradeId}:${row.day}:${row.periodId}`);
    for (const key of keys) {
      const current = map.get(key);
      if (current === "off" || row.level === "off") map.set(key, "off");
      else if (current === "avoid" || row.level === "avoid") map.set(key, "avoid");
      else map.set(key, row.level);
    }
  }
  return map;
}

function cellLevel(unit: EngineUnit, day: number, periodId: string, index: Map<string, EngineLevel>): EngineLevel | null {
  const keys: Array<[string, string]> = [
    ["teacher", unit.teacherUserId],
    ["grade", unit.gradeId],
    ["subject", unit.subjectId],
  ];
  if (unit.streamId) keys.push(["stream", unit.streamId]);
  else keys.push(["stream-grade", unit.gradeId]);
  if (unit.roomId) keys.push(["room", unit.roomId]);
  let level: EngineLevel | null = null;
  for (const [type, id] of keys) {
    const found = index.get(`${type}:${id}:${day}:${periodId}`);
    if (found === "off") return "off";
    if (found === "avoid") level = "avoid";
    else if (found === "prefer" && level !== "avoid") level = "prefer";
  }
  return level;
}

function overlaps(left: EnginePlacement, rightDay: number, rightSorts: number[], right: EngineUnit) {
  if (left.day !== rightDay || !left.sorts.some((sort) => rightSorts.includes(sort))) return false;
  const classClash = sameClass(left.unit, right);
  const roomClash = Boolean(left.unit.room && right.room && left.unit.room.toLowerCase() === right.room.toLowerCase());
  return left.unit.teacherUserId === right.teacherUserId || classClash || roomClash;
}

function countPeriods(placed: EnginePlacement[], predicate: (item: EnginePlacement) => boolean) {
  return placed.filter(predicate).reduce((sum, item) => sum + item.sorts.length, 0);
}

type Context = {
  periods: EnginePeriod[];
  lessons: EnginePeriod[];
  lastLessonId: string;
  availability: Map<string, EngineLevel>;
  subjectRules: Map<string, EngineSubjectRule>;
  teacherRules: Map<string, EngineTeacherRule>;
  classRules: EngineClassRule[];
  relations: EngineRelation[];
  placed: EnginePlacement[];
  preBreak: Set<number>;
  jitter: (() => number) | null;
};

type SlotMode = "strict" | "distinct" | "any" | "keep" | "relaxed";

function subjectRule(ctx: Context, subjectId: string): EngineSubjectRule {
  return ctx.subjectRules.get(subjectId) ?? {
    subjectId,
    maxPerDay: 2,
    minDaysPerWeek: 1,
    noAfternoon: false,
    preferredMorning: false,
    avoidConsecutiveDays: true,
    noLastPeriod: false,
    complexity: 1,
    placeInOrder: true,
    doubleCount: null,
    maxBeforeBreak: 3,
  };
}

function teacherRule(ctx: Context, teacherUserId: string): EngineTeacherRule {
  return ctx.teacherRules.get(teacherUserId) ?? {
    teacherUserId,
    minPerDay: 0,
    maxPerDay: 7,
    maxPerWeek: 35,
    maxConsecutive: 4,
    maxDays: 5,
    maxWindows: 3,
    minRestPeriods: 0,
  };
}

function classRule(ctx: Context, gradeId: string, streamId: string | null): EngineClassRule {
  const exact = ctx.classRules.find((rule) => rule.gradeId === gradeId && rule.streamId === streamId);
  const gradeWide = ctx.classRules.find((rule) => rule.gradeId === gradeId && !rule.streamId);
  return exact ?? gradeWide ?? { gradeId, streamId, maxPerDay: 8, noGaps: true };
}

function relationApplies(relation: EngineRelation, unit: EngineUnit) {
  return relation.gradeId === unit.gradeId && (relation.streamId == null || relation.streamId === unit.streamId);
}

export function buildContext(input: {
  periods: EnginePeriod[];
  availability: EngineAvailability[];
  subjectRules: EngineSubjectRule[];
  teacherRules: EngineTeacherRule[];
  classRules: EngineClassRule[];
  relations: EngineRelation[];
  placed?: EnginePlacement[];
}): Context {
  const lessons = lessonPeriodsOf(input.periods);
  return {
    periods: [...input.periods].sort((a, b) => a.sort - b.sort),
    lessons,
    lastLessonId: lessons[lessons.length - 1]?.id ?? "",
    availability: availabilityIndex(input.availability),
    subjectRules: new Map(input.subjectRules.map((rule) => [rule.subjectId, rule])),
    teacherRules: new Map(input.teacherRules.map((rule) => [rule.teacherUserId, rule])),
    classRules: input.classRules,
    relations: input.relations,
    placed: [...(input.placed ?? [])],
    preBreak: preBreakSorts(input.periods),
    jitter: null,
  };
}

function rejectSlot(ctx: Context, unit: EngineUnit, slot: Slot, previousDay: number, mode: SlotMode): string | null {
  const rule = subjectRule(ctx, unit.subjectId);
  const teacher = teacherRule(ctx, unit.teacherUserId);
  const klass = classRule(ctx, unit.gradeId, unit.streamId);
  if (slot.periodIds.some((periodId) => cellLevel(unit, slot.day, periodId, ctx.availability) === "off")) return "time-off";
  if (ctx.placed.some((item) => overlaps(item, slot.day, slot.sorts, unit))) return "clash";
  const minRest = Math.max(0, teacher.minRestPeriods ?? 0);
  if (minRest > 0 && mode !== "relaxed" && ctx.placed.some((item) => {
    if (item.day !== slot.day || item.unit.teacherUserId !== unit.teacherUserId) return false;
    const previousPositions = item.sorts.map((sort) => lessonPositionForSort(sort, ctx.periods)).filter((position) => position >= 0);
    const nextPositions = slot.sorts.map((sort) => lessonPositionForSort(sort, ctx.periods)).filter((position) => position >= 0);
    if (!previousPositions.length || !nextPositions.length) return false;
    const previousStart = Math.min(...previousPositions);
    const previousEnd = Math.max(...previousPositions);
    const nextStart = Math.min(...nextPositions);
    const nextEnd = Math.max(...nextPositions);
    const gap = nextStart > previousEnd ? nextStart - previousEnd - 1 : previousStart > nextEnd ? previousStart - nextEnd - 1 : -1;
    return gap >= 0 && gap < minRest;
  })) return "teacher-rest";
  if (rule.noAfternoon && slot.periodIds.some((periodId) => {
    const period = ctx.periods.find((item) => item.id === periodId);
    return period ? isAfternoonPeriod(period, ctx.periods) : false;
  })) return "afternoon";
  if (rule.noLastPeriod && slot.periodIds.includes(ctx.lastLessonId)) return "last-period";
  if (unit.preferredDay && slot.day !== unit.preferredDay && mode !== "relaxed" && mode !== "keep") return "double-day";
  if (mode !== "relaxed") for (const relation of ctx.relations) {
    if (!relationApplies(relation, unit) || (relation.leftSubjectId !== unit.subjectId && relation.rightSubjectId !== unit.subjectId)) continue;
    const otherSubjectId = relation.leftSubjectId === unit.subjectId ? relation.rightSubjectId : relation.leftSubjectId;
    const others = ctx.placed.filter((item) => item.unit.subjectId === otherSubjectId && sameClass(item.unit, unit));
    if (relation.relation === "different_day" && others.some((item) => item.day === slot.day)) return "relation-different-day";
    if (relation.relation === "not_consecutive" && others.some((item) => item.day === slot.day && item.sorts.some((sort) => slot.sorts.some((nextSort) => Math.abs(nextSort - sort) === 1)))) return "relation-not-consecutive";
  }
  const added = slot.sorts.length;
  const subjectDay = countPeriods(ctx.placed, (item) => item.day === slot.day && item.unit.subjectId === unit.subjectId && sameClass(item.unit, unit));
  if (mode !== "relaxed" && subjectDay + added > rule.maxPerDay) return "subject-max-day";
  if (mode !== "relaxed") {
    const addedBefore = slot.sorts.filter((sort) => ctx.preBreak.has(sort)).length;
    if (addedBefore) {
      const usedBefore = ctx.placed.filter((item) => item.unit.subjectId === unit.subjectId && sameClass(item.unit, unit)).reduce((sum, item) => sum + item.sorts.filter((sort) => ctx.preBreak.has(sort)).length, 0);
      if (usedBefore + addedBefore > (rule.maxBeforeBreak ?? 3)) return "pre-break-limit";
    }
  }
  if (mode === "strict" && ctx.placed.some((item) => item.day !== slot.day && item.unit.subjectId === unit.subjectId && sameClass(item.unit, unit) && item.sorts.some((sort) => slot.sorts.includes(sort)))) return "same-period-repeat";
  const classDay = countPeriods(ctx.placed, (item) => item.day === slot.day && sameClass(item.unit, unit));
  if (classDay + added > klass.maxPerDay) return "class-max-day";
  const teacherDay = countPeriods(ctx.placed, (item) => item.day === slot.day && item.unit.teacherUserId === unit.teacherUserId);
  if (teacherDay + added > teacher.maxPerDay) return "teacher-max-day";
  const teacherWeek = countPeriods(ctx.placed, (item) => item.unit.teacherUserId === unit.teacherUserId);
  if (teacherWeek + added > teacher.maxPerWeek) return "teacher-max-week";
  const teacherDays = new Set(ctx.placed.filter((item) => item.unit.teacherUserId === unit.teacherUserId).map((item) => item.day));
  if (!teacherDays.has(slot.day) && teacherDays.size >= teacher.maxDays) return "teacher-max-days";
  if ((mode === "strict" || mode === "distinct") && previousDay && slot.day <= previousDay && rule.placeInOrder) return "order";
  if (mode === "strict" && rule.avoidConsecutiveDays && previousDay && slot.day === previousDay + 1) return "consecutive-day";
  if (mode === "distinct" && previousDay && slot.day === previousDay) return "same-day";
  return null;
}

function scoreSlot(ctx: Context, unit: EngineUnit, slot: Slot, previousDay: number, profile: EngineOptimizationProfile) {
  const rule = subjectRule(ctx, unit.subjectId);
  const teacher = teacherRule(ctx, unit.teacherUserId);
  const klass = classRule(ctx, unit.gradeId, unit.streamId);
  let score = slot.day * 2 + slot.sorts[0] * 0.2;
  for (const periodId of slot.periodIds) {
    const level = cellLevel(unit, slot.day, periodId, ctx.availability);
    if (level === "avoid") score += 18;
    if (level === "prefer") score -= 14;
    const period = ctx.periods.find((item) => item.id === periodId);
    if (rule.preferredMorning && period && isAfternoonPeriod(period, ctx.periods)) score += 36;
    if (rule.preferredMorning && period) score += Math.max(0, period.sort - 4);
    const endSort = Math.max(...slot.sorts);
    const lunch = ctx.periods.find((item) => item.isBreak && /lunch/i.test(item.label));
    if (unit.timingPreference === "before_break" && ctx.periods.some((item) => item.isBreak && item.sort === endSort + 1)) score -= 52;
    if (unit.timingPreference === "before_lunch" && lunch && lunch.sort === endSort + 1) score -= 64;
    if (profile === "morning" && period) score += isAfternoonPeriod(period, ctx.periods) ? 34 : -5;
  }
  if (previousDay) score += Math.abs(slot.day - (previousDay + 1)) * 4;
  const sameDaySubject = ctx.placed.some((item) => item.day === slot.day && item.unit.subjectId === unit.subjectId && sameClass(item.unit, unit));
  if (sameDaySubject) score += 70;
  const classSorts = ctx.placed.filter((item) => item.day === slot.day && sameClass(item.unit, unit)).flatMap((item) => item.sorts);
  const classDaily = countPeriods(ctx.placed, (item) => item.day === slot.day && sameClass(item.unit, unit));
  score += profile === "balanced" ? ((classDaily + slot.sorts.length) ** 2 - classDaily ** 2) * 12 : 0;
  const teacherDaily = countPeriods(ctx.placed, (item) => item.day === slot.day && item.unit.teacherUserId === unit.teacherUserId);
  score += profile === "balanced" ? ((teacherDaily + slot.sorts.length) ** 2 - teacherDaily ** 2) * 4 : 0;
  const subjectDay = countPeriods(ctx.placed, (item) => item.day === slot.day && item.unit.subjectId === unit.subjectId && sameClass(item.unit, unit));
  score += subjectDay ? 80 + (profile === "balanced" ? subjectDay * 35 : 0) : 0;
  const dayTotal = countPeriods(ctx.placed, (item) => item.day === slot.day);
  score += profile === "balanced" ? dayTotal * 0.75 : 0;
  if (klass.noGaps && classSorts.length) {
    const touches = slot.sorts.some((sort) => classSorts.includes(sort - 1) || classSorts.includes(sort + 1));
    score += touches ? (profile === "compact" ? -22 : profile === "balanced" ? 0 : -8) : (profile === "compact" ? 34 : profile === "balanced" ? 4 : 12);
  }
  const teacherSorts = ctx.placed.filter((item) => item.day === slot.day && item.unit.teacherUserId === unit.teacherUserId).flatMap((item) => item.sorts);
  for (const previous of ctx.placed) {
    if (previous.day !== slot.day || previous.unit.teacherUserId !== unit.teacherUserId) continue;
    const adjacent = previous.sorts.some((sort) => slot.sorts.some((nextSort) => Math.abs(nextSort - sort) === 1));
    if (!adjacent) continue;
    // A teacher's back-to-back lessons are best in a different grade and the same stream (English 7 North then English 8 North),
    // and worst in a parallel stream of the same grade (English 7 North then English 7 South).
    if (previous.unit.subjectId === unit.subjectId && previous.unit.gradeId === unit.gradeId && previous.unit.streamId !== unit.streamId) score += 95;
    else if (previous.unit.subjectId === unit.subjectId && previous.unit.gradeId === unit.gradeId) score += 65;
    else if (previous.unit.subjectId === unit.subjectId && previous.unit.streamId === unit.streamId) score -= 12;
    else if (previous.unit.subjectId === unit.subjectId) score += 12;
  }
  const repeatedColumnCount = ctx.placed.filter((item) => item.day !== slot.day && item.unit.subjectId === unit.subjectId && sameClass(item.unit, unit) && item.sorts.some((sort) => slot.sorts.includes(sort))).length;
  score += repeatedColumnCount * 90;
  const joined = [...new Set([...teacherSorts, ...slot.sorts])].sort((a, b) => a - b);
  let run = 1;
  let longest = 1;
  for (let index = 1; index < joined.length; index += 1) {
    run = joined[index] === joined[index - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  if (longest > teacher.maxConsecutive) score += 28;
  if (teacherSorts.length) {
    const min = Math.min(...teacherSorts, ...slot.sorts);
    const max = Math.max(...teacherSorts, ...slot.sorts);
    const covered = new Set(joined);
    let windows = 0;
    for (let sort = min; sort <= max; sort += 1) if (!covered.has(sort) && ctx.lessons.some((period) => period.sort === sort)) windows += 1;
    if (windows > teacher.maxWindows) score += (profile === "compact" ? 24 : 10) * (windows - teacher.maxWindows);
  }
  if (rule.complexity >= 2) {
    const heavyTouch = ctx.placed.some((item) => item.day === slot.day && sameClass(item.unit, unit) && subjectRule(ctx, item.unit.subjectId).complexity >= 2 && item.sorts.some((sort) => slot.sorts.includes(sort - 1) || slot.sorts.includes(sort + 1)));
    if (heavyTouch) score += 8;
  }
  for (const relation of ctx.relations) {
    if (!relationApplies(relation, unit)) continue;
    const otherId = relation.leftSubjectId === unit.subjectId ? relation.rightSubjectId : relation.leftSubjectId === unit.subjectId ? relation.leftSubjectId : relation.rightSubjectId === unit.subjectId ? relation.leftSubjectId : "";
    const involved = relation.leftSubjectId === unit.subjectId || relation.rightSubjectId === unit.subjectId;
    if (!involved) continue;
    const others = ctx.placed.filter((item) => item.unit.subjectId === (relation.leftSubjectId === unit.subjectId ? relation.rightSubjectId : relation.leftSubjectId) && sameClass(item.unit, unit));
    if (relation.relation === "different_day" && others.some((item) => item.day === slot.day)) score += 22;
    if (relation.relation === "same_day" && others.length && others.every((item) => item.day !== slot.day)) score += 16;
    if (relation.relation === "before" && relation.leftSubjectId === unit.subjectId) {
      if (others.some((item) => item.day < slot.day || (item.day === slot.day && Math.min(...item.sorts) < Math.min(...slot.sorts)))) score += 20;
    }
    if (relation.relation === "before" && relation.rightSubjectId === unit.subjectId) {
      if (others.some((item) => item.day > slot.day || (item.day === slot.day && Math.max(...item.sorts) > Math.max(...slot.sorts)))) score += 20;
    }
    if (relation.relation === "not_consecutive" && others.some((item) => item.day === slot.day && item.sorts.some((sort) => slot.sorts.includes(sort - 1) || slot.sorts.includes(sort + 1)))) score += 16;
    void otherId;
  }
  if (ctx.jitter) score += ctx.jitter();
  return score;
}

const REASON_TEXT: Record<string, string> = {
  "time-off": "every fitting period is marked off for the subject, teacher, class, or room",
  clash: "the teacher, class, or room is already booked",
  afternoon: "this subject cannot be taught after lunch",
  "last-period": "this subject cannot take the last lesson",
  "subject-max-day": "the subject has reached its maximum lessons that day",
  "class-max-day": "the class has reached its maximum lessons that day",
  "teacher-max-day": "the teacher has reached the daily contract",
  "teacher-max-week": "the teacher has reached the weekly contract",
  "teacher-max-days": "the teacher has reached the maximum days at school",
  "teacher-rest": "the teacher needs more free periods between lesson blocks",
  "relation-different-day": "a linked subject must be on a different weekday",
  "relation-not-consecutive": "a linked subject must not occupy adjacent periods",
  order: "distribution order needs a later weekday and none is free",
  "consecutive-day": "the subject is set to avoid consecutive days",
  "same-day": "this distribution block needs its own day",
  "no-fit": "the lesson block does not fit between breaks",
  "pre-break-limit": "the subject already has its allowed lessons in the two periods before a break",
  "same-period-repeat": "the subject would sit in the same period column on another weekday",
};

function chooseSlot(ctx: Context, unit: EngineUnit, previousDay: number, mode: SlotMode, profile: EngineOptimizationProfile) {
  const shapes = slotsForBlock(unit.block, ctx.periods);
  if (!shapes.length) return { slot: null as Slot | null, reason: "no-fit" };
  const tally = new Map<string, number>();
  const open: Slot[] = [];
  for (let day = 1; day <= DAY_COUNT; day += 1) {
    for (const shape of shapes) {
      const slot = { day, ...shape };
      const reason = rejectSlot(ctx, unit, slot, previousDay, mode);
      if (reason) tally.set(reason, (tally.get(reason) ?? 0) + 1);
      else open.push(slot);
    }
  }
  if (!open.length) {
    const reason = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "clash";
    return { slot: null, reason };
  }
  const scored = open.map((slot) => ({ slot, score: scoreSlot(ctx, unit, slot, previousDay, profile) }));
  scored.sort((a, b) => a.score - b.score || a.slot.day - b.slot.day || a.slot.sorts[0] - b.slot.sorts[0]);
  return { slot: scored[0].slot, reason: "" };
}

const PLACE_MODES: SlotMode[] = ["strict", "distinct", "any", "relaxed"];

/** Tries the strictest rule set first and only loosens soft rules when nothing else fits. */
function pickSlot(ctx: Context, unit: EngineUnit, previousDay: number, profile: EngineOptimizationProfile) {
  let last = { slot: null as Slot | null, reason: "no-fit" };
  for (const mode of PLACE_MODES) {
    last = chooseSlot(ctx, unit, previousDay, mode, profile);
    if (last.slot) return { ...last, mode };
  }
  return { ...last, mode: "relaxed" as SlotMode };
}

/** One-step swap: move one or two unpinned lessons out of the way, put this lesson in, and re-home the displaced ones. */
function tryEject(ctx: Context, unit: EngineUnit, profile: EngineOptimizationProfile) {
  const shapes = slotsForBlock(unit.block, ctx.periods);
  for (let day = 1; day <= DAY_COUNT; day += 1) {
    for (const shape of shapes) {
      const slot: Slot = { day, ...shape };
      const conflicts = ctx.placed.filter((item) => overlaps(item, slot.day, slot.sorts, unit));
      if (!conflicts.length || conflicts.length > 2 || conflicts.some((item) => item.locked)) continue;
      const saved = ctx.placed;
      ctx.placed = saved.filter((item) => !conflicts.includes(item));
      if (rejectSlot(ctx, unit, slot, 0, "relaxed")) { ctx.placed = saved; continue; }
      ctx.placed.push({ unit, day: slot.day, periodId: slot.periodId, periodIds: slot.periodIds, sorts: slot.sorts });
      let ok = true;
      for (const moved of conflicts) {
        const next = pickSlot(ctx, moved.unit, 0, profile);
        if (!next.slot) { ok = false; break; }
        ctx.placed.push({ unit: moved.unit, day: next.slot.day, periodId: next.slot.periodId, periodIds: next.slot.periodIds, sorts: next.slot.sorts });
      }
      if (ok) return true;
      ctx.placed = saved;
    }
  }
  return false;
}

type DraftInput = {
  periods: EnginePeriod[];
  units: EngineUnit[];
  availability: EngineAvailability[];
  subjectRules: EngineSubjectRule[];
  teacherRules: EngineTeacherRule[];
  classRules: EngineClassRule[];
  relations: EngineRelation[];
  locked: EnginePlacement[];
  profile?: EngineOptimizationProfile;
  /** Current unpinned lessons. When given, valid ones are kept and only the problems are repaired. */
  existing?: EnginePlacement[];
  /** How many randomised attempts to make while any lesson is still unplaced. */
  attempts?: number;
};

export type EngineUnplaced = { unit: EngineUnit; reason: string; reasonCode: string };
export type EngineRelaxed = { unit: EngineUnit; day: number; periodId: string; reason: string };

function groupKeyOf(unit: { gradeId: string; streamId: string | null; subjectId: string; teacherUserId: string }) {
  return `${classKey(unit.gradeId, unit.streamId)}:${unit.subjectId}:${unit.teacherUserId}`;
}

function runAttempt(input: DraftInput, attempt: number) {
  const ctx = buildContext({ ...input, placed: input.locked });
  const rng = mulberry32(attempt * 7919 + 11);
  if (attempt > 0) ctx.jitter = () => rng() * Math.min(attempt, 4) * 6;
  const groups = new Map<string, EngineUnit[]>();
  for (const unit of input.units) {
    const key = groupKeyOf(unit);
    const list = groups.get(key) ?? [];
    list.push(unit);
    groups.set(key, list);
  }
  const flex = (units: EngineUnit[]) => slotsForBlock(units[0]?.block ?? 1, ctx.periods).length * DAY_COUNT;
  const ordered = [...groups.entries()].map(([key, units]) => ({ key, units: units.sort((a, b) => a.order - b.order), rank: flex(units) + (attempt > 0 ? rng() * Math.min(attempt, 4) * 4 : 0) }));
  ordered.sort((a, b) => a.rank - b.rank || (b.units[0]?.block ?? 1) - (a.units[0]?.block ?? 1));
  const profile = input.profile ?? "balanced";
  const pendingByKey = new Map<string, EngineUnit[]>(ordered.map((group) => [group.key, [...group.units]]));
  let dropped = 0;
  if (input.existing?.length) {
    const used = new Set<EnginePlacement>();
    for (const group of ordered) {
      const pending = pendingByKey.get(group.key)!;
      const candidates = input.existing.filter((item) => !item.locked && groupKeyOf(item.unit) === group.key).sort((a, b) => a.day - b.day || a.sorts[0] - b.sorts[0]);
      for (const candidate of candidates) {
        used.add(candidate);
        const index = pending.findIndex((unit) => unit.block === candidate.sorts.length);
        if (index < 0) { dropped += 1; continue; }
        const unit = pending[index];
        const slot: Slot = { day: candidate.day, periodId: candidate.periodId, periodIds: candidate.periodIds, sorts: candidate.sorts };
        if (rejectSlot(ctx, unit, slot, 0, "keep")) { dropped += 1; continue; }
        pending.splice(index, 1);
        ctx.placed.push({ unit, ...slot });
      }
    }
    for (const candidate of input.existing) {
      if (candidate.locked || used.has(candidate) || groups.has(groupKeyOf(candidate.unit))) continue;
      const slot: Slot = { day: candidate.day, periodId: candidate.periodId, periodIds: candidate.periodIds, sorts: candidate.sorts };
      if (rejectSlot(ctx, candidate.unit, slot, 0, "keep")) dropped += 1;
      else ctx.placed.push(candidate);
    }
  }
  const unplaced: EngineUnplaced[] = [];
  const relaxed: EngineRelaxed[] = [];
  for (const group of ordered) {
    let previousDay = 0;
    for (const unit of pendingByKey.get(group.key)!) {
      const picked = pickSlot(ctx, unit, previousDay, profile);
      if (!picked.slot) {
        if (tryEject(ctx, unit, profile)) continue;
        unplaced.push({ unit, reason: REASON_TEXT[picked.reason] ?? "no period satisfied the rules", reasonCode: picked.reason });
        continue;
      }
      if (picked.mode === "relaxed") {
        const why = chooseSlot(ctx, unit, previousDay, "any", profile).reason;
        relaxed.push({ unit, day: picked.slot.day, periodId: picked.slot.periodId, reason: REASON_TEXT[why] ?? "a soft preference had to be relaxed" });
      }
      ctx.placed.push({ unit, day: picked.slot.day, periodId: picked.slot.periodId, periodIds: picked.slot.periodIds, sorts: picked.slot.sorts });
      previousDay = picked.slot.day;
    }
  }
  return { placements: ctx.placed.filter((item) => !item.locked), unplaced, relaxed, dropped };
}

export function generateTimetableDraft(input: DraftInput) {
  const attempts = Math.max(1, Math.min(30, Math.trunc(input.attempts ?? 12)));
  let best: ReturnType<typeof runAttempt> | null = null;
  let bestMissing = Infinity;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = runAttempt(input, attempt);
    const missing = result.unplaced.reduce((sum, item) => sum + item.unit.block, 0);
    if (missing < bestMissing || (missing === bestMissing && best && result.relaxed.length < best.relaxed.length)) { best = result; bestMissing = missing; }
    if (missing === 0 && result.relaxed.length === 0) break;
  }
  return best!;
}

function windowsFor(sorts: number[], lessons: EnginePeriod[]) {
  if (sorts.length < 2) return 0;
  const unique = [...new Set(sorts)].sort((a, b) => a - b);
  const covered = new Set(unique);
  let windows = 0;
  for (let sort = unique[0]; sort <= unique[unique.length - 1]; sort += 1) {
    if (!covered.has(sort) && lessons.some((period) => period.sort === sort)) windows += 1;
  }
  return windows;
}

function longestRun(sorts: number[]) {
  const unique = [...new Set(sorts)].sort((a, b) => a - b);
  let run = 1;
  let longest = unique.length ? 1 : 0;
  for (let index = 1; index < unique.length; index += 1) {
    run = unique[index] === unique[index - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

export function auditTimetable(input: {
  periods: EnginePeriod[];
  placements: EnginePlacement[];
  availability: EngineAvailability[];
  subjectRules: EngineSubjectRule[];
  teacherRules: EngineTeacherRule[];
  classRules: EngineClassRule[];
  relations: EngineRelation[];
  requirements: Array<{ id?: string; gradeId: string; streamId: string | null; subjectId: string; teacherUserId: string; lessonsPerWeek: number; blockLength: number; distribution: string; preferredDoubleDay?: number | null; timingPreference?: "none" | "before_break" | "before_lunch" }>;
  rooms?: EngineRoom[];
  classSizes?: Array<{ gradeId: string; streamId: string | null; learners: number }>;
  assignments?: EngineAssignment[];
  names: EngineNames;
}): EngineIssue[] {
  const ctx = buildContext({ ...input, placed: [] });
  const issues: EngineIssue[] = [];
  const placed = input.placements;
  const minutes = (value: string) => {
    const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const periodSorts = new Map<number, EnginePeriod[]>();
  const validIntervals: Array<{ period: EnginePeriod; start: number; end: number }> = [];
  for (const period of ctx.periods) {
    const list = periodSorts.get(period.sort) ?? [];
    list.push(period);
    periodSorts.set(period.sort, list);
    if (period.endTime !== undefined) {
      const start = minutes(period.startTime);
      const end = minutes(period.endTime);
      if (start == null || end == null || end <= start) {
        issues.push({ severity: "error", message: `${period.label}: bell time must use valid 24-hour HH:MM values with an end after its start.` });
      } else validIntervals.push({ period, start, end });
    }
  }
  for (const [sort, list] of periodSorts) {
    if (list.length > 1) issues.push({ severity: "error", message: `Bell schedule has ${list.length} periods with the same sequence number (${sort}).` });
  }
  validIntervals.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < validIntervals.length; index += 1) {
    const previous = validIntervals[index - 1];
    const current = validIntervals[index];
    if (current.start < previous.end) issues.push({ severity: "error", message: `Bell periods ${previous.period.label} and ${current.period.label} overlap in clock time.` });
  }
  if (!placed.length) issues.push({ severity: "warning", message: "There are no scheduled lessons yet." });
  for (let index = 0; index < placed.length; index += 1) {
    const current = placed[index];
    const rule = subjectRule(ctx, current.unit.subjectId);
    if (!Number.isInteger(current.day) || current.day < 1 || current.day > DAY_COUNT) issues.push({ severity: "error", message: `${input.names.subject(current.unit.subjectId)} has an invalid weekday value (${current.day}).` });
    if (!ctx.periods.some((period) => period.id === current.periodId)) issues.push({ severity: "error", message: `${input.names.subject(current.unit.subjectId)} refers to a period that is missing from this bell schedule.` });
    if (current.periodIds.length !== current.unit.block || current.sorts.length !== current.unit.block || current.periodIds[0] !== current.periodId || current.sorts.some((sort, sortIndex) => sortIndex > 0 && sort !== current.sorts[sortIndex - 1] + 1)) {
      issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.subject(current.unit.subjectId)} has an incomplete or non-contiguous ${current.unit.block}-period block.` });
    }
    if (current.periodIds.some((periodId) => !ctx.periods.some((period) => period.id === periodId))) issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.subject(current.unit.subjectId)} block includes a period missing from the bell schedule.` });
    if (current.periodIds.some((periodId) => ctx.periods.find((period) => period.id === periodId)?.isBreak)) {
      issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.subject(current.unit.subjectId)} is sitting on a break.` });
    }
    if (current.periodIds.some((periodId) => cellLevel(current.unit, current.day, periodId, ctx.availability) === "off")) {
      issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.subject(current.unit.subjectId)} for ${input.names.classLabel(current.unit.gradeId, current.unit.streamId)} is on a subject, teacher, class, or room off-time.` });
    }
    if (rule.noAfternoon && current.periodIds.some((periodId) => {
      const period = ctx.periods.find((item) => item.id === periodId);
      return period ? isAfternoonPeriod(period, ctx.periods) : false;
    })) {
      issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.subject(current.unit.subjectId)} is after lunch, but that subject is blocked from afternoons.` });
    }
    if (rule.noLastPeriod && current.periodIds.includes(ctx.lastLessonId)) {
      issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.subject(current.unit.subjectId)} is on the last lesson, which is not allowed.` });
    }
    if (current.unit.room) {
      const room = input.rooms?.find((item) => item.name.trim().toLowerCase() === current.unit.room.trim().toLowerCase());
      if (!room && input.rooms?.length) issues.push({ severity: "warning", message: `${input.names.day(current.day)}: room “${current.unit.room}” is not in the room register.` });
      else if (room && !room.active) issues.push({ severity: "error", message: `${input.names.day(current.day)}: room “${room.name}” is inactive but still scheduled.` });
      else if (room && room.capacity > 0 && input.classSizes?.length) {
        const size = current.unit.streamId
          ? input.classSizes.find((item) => item.gradeId === current.unit.gradeId && item.streamId === current.unit.streamId)?.learners
          : input.classSizes.filter((item) => item.gradeId === current.unit.gradeId).reduce((sum, item) => sum + item.learners, 0);
        if (size != null && size > room.capacity) issues.push({ severity: "warning", message: `${input.names.day(current.day)}: ${room.name} seats ${room.capacity}, below the ${size}-learner class size.` });
      }
    }
    for (let otherIndex = index + 1; otherIndex < placed.length; otherIndex += 1) {
      const other = placed[otherIndex];
      if (!overlaps(current, other.day, other.sorts, other.unit)) continue;
      if (current.unit.teacherUserId === other.unit.teacherUserId) issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.teacher(current.unit.teacherUserId)} is double-booked.` });
      if (sameClass(current.unit, other.unit)) issues.push({ severity: "error", message: `${input.names.day(current.day)}: ${input.names.classLabel(current.unit.gradeId, current.unit.streamId)} has two lessons at once.` });
      if (current.unit.room && other.unit.room && current.unit.room.toLowerCase() === other.unit.room.toLowerCase()) issues.push({ severity: "error", message: `${input.names.day(current.day)}: room ${current.unit.room} is double-booked.` });
    }
  }
  const requirementKeys = new Set<string>();
  for (const requirement of input.requirements) {
    const requirementKey = `${requirement.gradeId}|${requirement.streamId ?? "*"}|${requirement.subjectId}|${requirement.teacherUserId}`;
    if (requirementKeys.has(requirementKey)) issues.push({ severity: "error", message: `${input.names.classLabel(requirement.gradeId, requirement.streamId)} · ${input.names.subject(requirement.subjectId)} has duplicate weekly requirements for the same teacher.` });
    requirementKeys.add(requirementKey);
    if (input.assignments && !input.assignments.some((assignment) => assignment.subjectId === requirement.subjectId && assignment.teacherUserId === requirement.teacherUserId && assignment.gradeId === requirement.gradeId && (assignment.streamId == null || requirement.streamId == null || assignment.streamId === requirement.streamId))) {
      issues.push({ severity: "warning", message: `${input.names.classLabel(requirement.gradeId, requirement.streamId)} · ${input.names.subject(requirement.subjectId)} is scheduled to a teacher without a matching subject-teacher assignment.` });
    }
    if (!Number.isInteger(requirement.lessonsPerWeek) || requirement.lessonsPerWeek < 1 || !Number.isInteger(requirement.blockLength) || requirement.blockLength < 1 || requirement.blockLength > 3) {
      issues.push({ severity: "error", message: `${input.names.classLabel(requirement.gradeId, requirement.streamId)} · ${input.names.subject(requirement.subjectId)} has an invalid weekly lesson count or block length.` });
    }
    if (requirement.distribution.trim()) {
      const parts = requirement.distribution.trim().replace(/\s+/g, "").split("+").map(Number);
      if (parts.some((part) => !Number.isInteger(part) || part < 1 || part > 3) || parts.reduce((sum, part) => sum + part, 0) !== requirement.lessonsPerWeek) {
        issues.push({ severity: "error", message: `${input.names.classLabel(requirement.gradeId, requirement.streamId)} · ${input.names.subject(requirement.subjectId)} has a malformed weekly distribution (“${requirement.distribution}”).`, fix: requirement.id ? { kind: "reset_distribution", label: "Reset to single lessons", requirementId: requirement.id } : undefined });
      }
    }
    const matches = placed.filter((item) => item.unit.gradeId === requirement.gradeId && item.unit.streamId === requirement.streamId && item.unit.subjectId === requirement.subjectId && item.unit.teacherUserId === requirement.teacherUserId);
    const actual = matches.reduce((sum, item) => sum + item.sorts.length, 0);
    const who = `${input.names.classLabel(requirement.gradeId, requirement.streamId)} · ${input.names.subject(requirement.subjectId)}`;
    if (actual !== requirement.lessonsPerWeek) {
      const difference = requirement.lessonsPerWeek - actual;
      const detail = difference > 0 ? `${difference} period(s) are missing` : `${Math.abs(difference)} period(s) are over target`;
      issues.push({ severity: "error", message: `${who} has ${actual} of ${requirement.lessonsPerWeek} required weekly periods; ${detail}. Check its distribution, pinned lessons, off-times, and available bell periods.` });
    }
    const subjectRuleForCard = subjectRule(ctx, requirement.subjectId);
    const neverDouble = subjectRuleForCard.doubleCount === 0;
    const pattern = distributionWithDoubleDay(applyDoubleRule(parseDistribution(requirement.distribution, requirement.lessonsPerWeek, requirement.blockLength), subjectRuleForCard.doubleCount), neverDouble ? null : requirement.preferredDoubleDay);
    if (neverDouble && matches.some((item) => item.sorts.length > 1)) issues.push({ severity: "warning", message: `${who} has a double lesson, but ${input.names.subject(requirement.subjectId)} is set to never be double.` });
    const wantedDoubles = pattern.filter((block) => block >= 2).length;
    if (subjectRuleForCard.doubleCount != null && wantedDoubles > 0 && matches.length === pattern.length && matches.filter((item) => item.sorts.length >= 2).length < wantedDoubles) issues.push({ severity: "warning", message: `${who} should have ${wantedDoubles} double lesson(s) (two consecutive periods) but has ${matches.filter((item) => item.sorts.length >= 2).length}.` });
    const beforeBreak = matches.reduce((sum, item) => sum + item.sorts.filter((sort) => ctx.preBreak.has(sort)).length, 0);
    if (beforeBreak > (subjectRuleForCard.maxBeforeBreak ?? 3)) issues.push({ severity: "warning", message: `${who} has ${beforeBreak} lessons in the two periods before a break; the limit is ${subjectRuleForCard.maxBeforeBreak ?? 3}.` });
    const maxPart = Math.max(...pattern, 1);
    const byDay = new Map<number, number>();
    for (const item of matches) byDay.set(item.day, (byDay.get(item.day) ?? 0) + item.sorts.length);
    for (const [day, count] of byDay) {
      if (count > maxPart) issues.push({ severity: "warning", message: `${input.names.day(day)}: ${who} has ${count} lessons, but the distribution allows ${maxPart} that day.` });
    }
    const rule = subjectRule(ctx, requirement.subjectId);
    if (byDay.size && byDay.size < rule.minDaysPerWeek) issues.push({ severity: "warning", message: `${who} is only on ${byDay.size} day(s); the subject asks for at least ${rule.minDaysPerWeek}.` });
    const days = [...byDay.keys()].sort((a, b) => a - b);
    const columns = new Map<number, Set<number>>();
    for (const item of matches) for (const sort of item.sorts) (columns.get(sort) ?? columns.set(sort, new Set()).get(sort)!).add(item.day);
    if ([...columns.values()].some((daySet) => daySet.size > 1)) issues.push({ severity: "warning", message: `${who} repeats the same period column on multiple weekdays.` });
    if (requirement.preferredDoubleDay && !neverDouble && !matches.some((item) => item.day === requirement.preferredDoubleDay && item.unit.block >= 2)) issues.push({ severity: "warning", message: `${who} does not have its requested double lesson on ${input.names.day(requirement.preferredDoubleDay)}.` });
    if (rule.placeInOrder && days.length > 1 && matches.length === pattern.length) {
      const ordered = [...matches].sort((a, b) => a.unit.order - b.unit.order).map((item) => item.day);
      const increasing = ordered.every((day, index) => index === 0 || day > ordered[index - 1]);
      if (!increasing) issues.push({ severity: "warning", message: `${who} is not distributed in weekday order (${pattern.join("+")}).` });
    }
    if (rule.avoidConsecutiveDays) {
      for (let index = 1; index < days.length; index += 1) {
        if (days[index] === days[index - 1] + 1) issues.push({ severity: "warning", message: `${who} sits on consecutive days (${input.names.day(days[index - 1])} and ${input.names.day(days[index])}).` });
      }
    }
  }
  if (input.assignments) {
    const missing = input.assignments.filter((assignment) => !input.requirements.some((requirement) => requirement.gradeId === assignment.gradeId && requirement.subjectId === assignment.subjectId && requirement.teacherUserId === assignment.teacherUserId && (assignment.streamId == null || requirement.streamId == null || requirement.streamId === assignment.streamId)));
    if (missing.length) issues.push({ severity: "warning", message: `${missing.length} subject-teacher assignment(s) do not yet have weekly lesson cards. Use “Detect teacher assignments” to add the missing cards before generation.` });
  }
  const weeklyClassLoad = new Map<string, { gradeId: string; streamId: string | null; periods: number }>();
  const weeklyTeacherLoad = new Map<string, number>();
  for (const requirement of input.requirements) {
    const classId = `${requirement.gradeId}|${requirement.streamId ?? "*"}`;
    const classLoad = weeklyClassLoad.get(classId) ?? { gradeId: requirement.gradeId, streamId: requirement.streamId, periods: 0 };
    classLoad.periods += Math.max(0, Number(requirement.lessonsPerWeek) || 0);
    weeklyClassLoad.set(classId, classLoad);
    weeklyTeacherLoad.set(requirement.teacherUserId, (weeklyTeacherLoad.get(requirement.teacherUserId) ?? 0) + Math.max(0, Number(requirement.lessonsPerWeek) || 0));
  }
  const weeklyCapacity = ctx.lessons.length * DAY_COUNT;
  for (const load of weeklyClassLoad.values()) {
    if (load.periods > weeklyCapacity) issues.push({ severity: "error", message: `${input.names.classLabel(load.gradeId, load.streamId)} needs ${load.periods} periods per week but the bell only provides ${weeklyCapacity}.` });
  }
  for (const rule of input.teacherRules) {
    const required = weeklyTeacherLoad.get(rule.teacherUserId) ?? 0;
    if (required > rule.maxPerWeek) issues.push({ severity: "error", message: `${input.names.teacher(rule.teacherUserId)} is assigned ${required} periods per week, above the ${rule.maxPerWeek}-period weekly contract.`, fix: { kind: "raise_teacher_limit", label: `Raise weekly limit to ${required}`, teacherUserId: rule.teacherUserId } });
  }
  const teacherDays = new Map<string, Map<number, number[]>>();
  const classDays = new Map<string, Map<number, number[]>>();
  for (const item of placed) {
    const teacherMap = teacherDays.get(item.unit.teacherUserId) ?? new Map<number, number[]>();
    teacherMap.set(item.day, [...(teacherMap.get(item.day) ?? []), ...item.sorts]);
    teacherDays.set(item.unit.teacherUserId, teacherMap);
    const key = classKey(item.unit.gradeId, item.unit.streamId);
    const classMap = classDays.get(key) ?? new Map<number, number[]>();
    classMap.set(item.day, [...(classMap.get(item.day) ?? []), ...item.sorts]);
    classDays.set(key, classMap);
    const rule = subjectRule(ctx, item.unit.subjectId);
    const dayCount = countPeriods(placed, (other) => other.day === item.day && other.unit.subjectId === item.unit.subjectId && sameClass(other.unit, item.unit));
    if (dayCount > rule.maxPerDay) issues.push({ severity: "error", message: `${input.names.day(item.day)}: ${input.names.subject(item.unit.subjectId)} exceeds ${rule.maxPerDay} lesson(s) for ${input.names.classLabel(item.unit.gradeId, item.unit.streamId)}.`, fix: { kind: "repair", label: "Spread this subject out" } });
  }
  for (const [teacherId, days] of teacherDays) {
    const rule = teacherRule(ctx, teacherId);
    let week = 0;
    for (const [day, sorts] of days) {
      week += sorts.length;
      if ((rule.minRestPeriods ?? 0) > 0) {
        const teacherPlacements = placed.filter((item) => item.day === day && item.unit.teacherUserId === teacherId).sort((a, b) => Math.min(...a.sorts) - Math.min(...b.sorts));
        for (let index = 1; index < teacherPlacements.length; index += 1) {
          const previous = teacherPlacements[index - 1];
          const current = teacherPlacements[index];
          const currentPositions = current.sorts.map((sort) => lessonPositionForSort(sort, input.periods)).filter((position) => position >= 0);
          const previousPositions = previous.sorts.map((sort) => lessonPositionForSort(sort, input.periods)).filter((position) => position >= 0);
          if (!currentPositions.length || !previousPositions.length) continue;
          const gap = Math.min(...currentPositions) - Math.max(...previousPositions) - 1;
          if (gap >= 0 && gap < (rule.minRestPeriods ?? 0)) issues.push({ severity: "error", message: `${input.names.day(day)}: ${input.names.teacher(teacherId)} has only ${gap} free period(s) between lesson blocks; ${rule.minRestPeriods} required.`, fix: { kind: "repair", label: "Move a lesson to give rest" } });
        }
      }
      if (sorts.length > rule.maxPerDay) issues.push({ severity: "error", message: `${input.names.day(day)}: ${input.names.teacher(teacherId)} has ${sorts.length} lessons (contract maximum ${rule.maxPerDay}).` });
      const minPerDay = rule.minPerDay ?? 0;
      if (minPerDay > 0 && sorts.length < minPerDay) issues.push({ severity: "error", message: `${input.names.day(day)}: ${input.names.teacher(teacherId)} has only ${sorts.length} lesson(s); the daily contract requires at least ${minPerDay}.` });
      if (longestRun(sorts) > rule.maxConsecutive) issues.push({ severity: "warning", message: `${input.names.day(day)}: ${input.names.teacher(teacherId)} teaches ${longestRun(sorts)} periods in a row (maximum ${rule.maxConsecutive}).` });
      if (windowsFor(sorts, ctx.lessons) > rule.maxWindows) issues.push({ severity: "warning", message: `${input.names.day(day)}: ${input.names.teacher(teacherId)} has ${windowsFor(sorts, ctx.lessons)} window(s) between lessons.` });
    }
    if (week > rule.maxPerWeek) issues.push({ severity: "error", message: `${input.names.teacher(teacherId)} has ${week} lessons this week (contract maximum ${rule.maxPerWeek}).` });
    if (days.size > rule.maxDays) issues.push({ severity: "error", message: `${input.names.teacher(teacherId)} is in school ${days.size} days (contract maximum ${rule.maxDays}).` });
  }
  for (const [key, days] of classDays) {
    const [gradeId, streamId] = key.split(":");
    const stream = streamId === "*" ? null : streamId;
    const rule = classRule(ctx, gradeId, stream);
    for (const [day, sorts] of days) {
      if (sorts.length > rule.maxPerDay) issues.push({ severity: "error", message: `${input.names.day(day)}: ${input.names.classLabel(gradeId, stream)} has ${sorts.length} lessons (class maximum ${rule.maxPerDay}).` });
      if (rule.noGaps && windowsFor(sorts, ctx.lessons) > 0) issues.push({ severity: "warning", message: `${input.names.day(day)}: ${input.names.classLabel(gradeId, stream)} has a free period in the middle of the day.` });
    }
  }
  for (const relation of input.relations) {
    const left = placed.filter((item) => item.unit.subjectId === relation.leftSubjectId && item.unit.gradeId === relation.gradeId && (relation.streamId == null || item.unit.streamId === relation.streamId));
    const right = placed.filter((item) => item.unit.subjectId === relation.rightSubjectId && item.unit.gradeId === relation.gradeId && (relation.streamId == null || item.unit.streamId === relation.streamId));
    const label = `${input.names.subject(relation.leftSubjectId)} / ${input.names.subject(relation.rightSubjectId)} · ${input.names.classLabel(relation.gradeId, relation.streamId)}`;
    if (relation.relation === "different_day" && left.some((item) => right.some((other) => other.day === item.day))) issues.push({ severity: "error", message: `${label} should be on different days.` });
    if (relation.relation === "same_day" && left.length && right.length && left.every((item) => right.every((other) => other.day !== item.day))) issues.push({ severity: "warning", message: `${label} should share a day.` });
    if (relation.relation === "not_consecutive" && left.some((item) => right.some((other) => other.day === item.day && item.sorts.some((sort) => other.sorts.includes(sort - 1) || other.sorts.includes(sort + 1))))) issues.push({ severity: "error", message: `${label} should not be in adjacent periods.` });
    if (relation.relation === "before" && left.some((item) => right.some((other) => other.day < item.day || (other.day === item.day && Math.min(...other.sorts) < Math.min(...item.sorts))))) issues.push({ severity: "warning", message: `${input.names.subject(relation.leftSubjectId)} should come before ${input.names.subject(relation.rightSubjectId)} for ${input.names.classLabel(relation.gradeId, relation.streamId)}.` });
  }
  const seen = new Set<string>();
  const AUTO_REPAIRABLE = /double-booked|two lessons at once|off-time|after lunch|last lesson|sitting on a break|required weekly periods|free period\(s\)|adjacent periods|exceeds|in a row|incomplete or non-contiguous|double lesson|before a break|different days|window|consecutive days|same period column|distributed in weekday order|weekday order/i;
  return issues.filter((issue) => {
    if (seen.has(issue.message)) return false;
    seen.add(issue.message);
    return true;
  }).map((issue) => issue.fix || !AUTO_REPAIRABLE.test(issue.message) ? issue : { ...issue, fix: { kind: "repair" as const, label: "Fix automatically" } });
}
