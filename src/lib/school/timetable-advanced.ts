import type { TimetableEntry, TimetablePeriod } from "@/lib/school/model";

export type OptimizationProfile = "balanced" | "morning" | "compact";
export type TimetableLoad = { teacherId: string; periods: number; days: number; windows: number; averagePerDay: number };
export type TimetableGap = { ownerId: string; day: number; gapPeriods: number[] };
export type VersionChange = { id: string; kind: "added" | "removed" | "moved" | "changed"; summary: string };

export function profileWeights(profile: OptimizationProfile) {
  if (profile === "morning") return { load: 1, gaps: 1, spread: 1, preferences: 3 };
  if (profile === "compact") return { load: 2, gaps: 3, spread: 1, preferences: 1 };
  return { load: 1, gaps: 1, spread: 1, preferences: 1 };
}

function coveredLessonIndices(entry: Pick<TimetableEntry, "periodId"> & Partial<Pick<TimetableEntry, "blockLength">>, periods: TimetablePeriod[]) {
  const bell = [...periods].sort((a, b) => a.sort - b.sort);
  const start = bell.findIndex((period) => period.id === entry.periodId);
  if (start < 0) return [];
  const lessonIndex = new Map(bell.filter((period) => !period.isBreak).map((period, index) => [period.id, index]));
  const target = Math.max(1, Math.min(3, entry.blockLength ?? 1));
  const result: number[] = [];
  let previousSort: number | null = null;
  for (let index = start; index < bell.length && result.length < target; index += 1) {
    const period = bell[index];
    if (period.isBreak || (previousSort != null && period.sort !== previousSort + 1)) break;
    const position = lessonIndex.get(period.id);
    if (position == null) break;
    result.push(position);
    previousSort = period.sort;
  }
  return result;
}

export function calculateTeacherLoads(entries: Array<Pick<TimetableEntry, "teacherUserId" | "dayOfWeek" | "periodId"> & Partial<Pick<TimetableEntry, "blockLength">>>, periods: TimetablePeriod[]): TimetableLoad[] {
  const byTeacher = new Map<string, Array<{ day: number; positions: number[] }>>();
  for (const entry of entries) byTeacher.set(entry.teacherUserId, [...(byTeacher.get(entry.teacherUserId) ?? []), { day: entry.dayOfWeek, positions: coveredLessonIndices(entry, periods) }]);
  return [...byTeacher.entries()].map(([teacherId, rows]) => {
    const byDay = new Map<number, number[]>();
    for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), ...row.positions]);
    let windows = 0;
    for (const sorts of byDay.values()) {
      const ordered = [...new Set(sorts)].sort((a, b) => a - b);
      if (!ordered.length) continue;
      windows += 1;
      for (let i = 1; i < ordered.length; i += 1) if (ordered[i] > ordered[i - 1] + 1) windows += 1;
    }
    const periodsCount = rows.reduce((sum, row) => sum + row.positions.length, 0);
    return { teacherId, periods: periodsCount, days: byDay.size, windows, averagePerDay: periodsCount / Math.max(byDay.size, 1) };
  }).sort((a, b) => b.periods - a.periods);
}

export function detectClassGaps(entries: Array<Pick<TimetableEntry, "gradeId" | "streamId" | "dayOfWeek" | "periodId"> & Partial<Pick<TimetableEntry, "blockLength">>>, periods: TimetablePeriod[]): TimetableGap[] {
  const groups = new Map<string, Array<{ day: number; positions: number[] }>>();
  for (const entry of entries) {
    const key = `${entry.gradeId}:${entry.streamId ?? "*"}`;
    groups.set(key, [...(groups.get(key) ?? []), { day: entry.dayOfWeek, positions: coveredLessonIndices(entry, periods) }]);
  }
  const result: TimetableGap[] = [];
  for (const [ownerId, rows] of groups) {
    const byDay = new Map<number, number[]>();
    for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), ...row.positions]);
    for (const [day, sorts] of byDay) {
      const ordered = [...new Set(sorts)].sort((a, b) => a - b);
      const gapPeriods: number[] = [];
      for (let position = (ordered[0] ?? 0) + 1; position < (ordered.at(-1) ?? 0); position += 1) if (!ordered.includes(position)) gapPeriods.push(position);
      if (gapPeriods.length) result.push({ ownerId, day, gapPeriods });
    }
  }
  return result;
}

export function compareTimetableVersions(before: Pick<TimetableEntry, "id" | "dayOfWeek" | "periodId" | "subjectId" | "teacherUserId" | "gradeId" | "streamId">[], after: Pick<TimetableEntry, "id" | "dayOfWeek" | "periodId" | "subjectId" | "teacherUserId" | "gradeId" | "streamId">[]): VersionChange[] {
  const oldMap = new Map(before.map((row) => [row.id, row]));
  const newMap = new Map(after.map((row) => [row.id, row]));
  const changes: VersionChange[] = [];
  for (const row of after) {
    const old = oldMap.get(row.id);
    if (!old) changes.push({ id: row.id, kind: "added", summary: `Added ${row.subjectId} to day ${row.dayOfWeek}` });
    else if (old.dayOfWeek !== row.dayOfWeek || old.periodId !== row.periodId) changes.push({ id: row.id, kind: "moved", summary: `Moved ${row.subjectId} from ${old.dayOfWeek}/${old.periodId} to ${row.dayOfWeek}/${row.periodId}` });
    else if (old.subjectId !== row.subjectId || old.teacherUserId !== row.teacherUserId || old.gradeId !== row.gradeId || old.streamId !== row.streamId) changes.push({ id: row.id, kind: "changed", summary: `Changed lesson ${row.id}` });
  }
  for (const row of before) if (!newMap.has(row.id)) changes.push({ id: row.id, kind: "removed", summary: `Removed lesson ${row.subjectId}` });
  return changes;
}

export function cycleWeek(weekNumber: number, cycleLength: number) {
  const length = Math.max(1, Math.trunc(cycleLength));
  return ((Math.max(1, Math.trunc(weekNumber)) - 1) % length) + 1;
}

export function timetableIcsEvent(title: string, start: Date, end: Date, location = "", description = "") {
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return ["BEGIN:VEVENT", `UID:${crypto.randomUUID()}@mukuyu`, `DTSTAMP:${format(new Date())}`, `DTSTART:${format(start)}`, `DTEND:${format(end)}`, `SUMMARY:${title.replace(/[\n;,]/g, " ")}`, `LOCATION:${location.replace(/[\n;,]/g, " ")}`, `DESCRIPTION:${description.replace(/[\n;,]/g, " ")}`, "END:VEVENT"].join("\r\n");
}
