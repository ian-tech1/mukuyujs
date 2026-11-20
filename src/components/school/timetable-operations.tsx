import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import {
  deleteTimetableAvailability,
  deleteTimetableRequirement,
  deleteTimetableRoom,
  deleteLessonRelation,
  generateTimetable,
  inspectTimetableAssignments,
  publishTimetable,
  restoreTimetableVersion,
  saveTimetableAvailability,
  saveTimetableRequirement,
  saveTimetableRoom,
  unpublishTimetable,
  validateTimetable,
  setTimetableAdminPermission,
  setTimetableStaffAssignmentsEnabled,
  saveSubjectConstraint,
  saveAvailabilityMap,
  saveTeacherContract,
  saveClassConstraint,
  saveLessonRelation,
  seedTimetableRequirements,
  applyTimetableFix,
} from "@/lib/school/api";
import type { AvailabilityLevel, Subject, SubjectConstraint, TimetableAvailability, TimetablePeriod, TimetableRoom, TimetableRequirement } from "@/lib/school/model";
import { coveredPeriodIds } from "@/components/school/timetable-sheet";
import { TimetablePlanner } from "@/components/school/timetable-planner";

type IssueFix = { kind: "repair" | "reset_distribution" | "relax_rest" | "raise_teacher_limit" | "raise_subject_max_day"; label: string; requirementId?: string; teacherUserId?: string; subjectId?: string };
type UnplacedDetail = { text: string; advice: string; fixes: Array<{ kind: "raise_subject_max_day" | "relax_rest" | "raise_teacher_limit"; label: string; subjectId?: string; teacherUserId?: string }> };

type Props = Gate & { yearId: string; termId: string; periods: Gate["ws"]["timetablePeriods"] };
type EntityType = TimetableAvailability["entityType"];
type RelationKind = "before" | "same_day" | "different_day" | "not_consecutive";
const entityLabels: Record<EntityType, string> = { teacher: "Teacher", grade: "Grade / class", stream: "Stream", room: "Room", subject: "Subject" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const RELATION_LABEL: Record<RelationKind, string> = { before: "comes before", same_day: "same day", different_day: "different days", not_consecutive: "not back-to-back (adjacent periods)" };
const LEVEL_CYCLE: Array<AvailabilityLevel | ""> = ["", "off", "avoid", "prefer"];
type PatternMode = "singles" | "one_double" | "custom";

function patternModeFor(distribution: string, count: number, blockLength: number, preferredDoubleDay: number | null = null): PatternMode {
  const raw = distribution.trim().replace(/\s+/g, "");
  const pattern = raw ? raw.split("+").map(Number) : count % blockLength === 0 ? Array.from({ length: count / blockLength }, () => blockLength) : Array.from({ length: count }, () => 1);
  if (pattern.every((block) => block === 1) && !preferredDoubleDay) return "singles";
  if (pattern.filter((block) => block === 2).length === 1 && pattern.every((block) => block === 1 || block === 2)) return "one_double";
  if (preferredDoubleDay && pattern.every((block) => block === 1)) return "one_double";
  return "custom";
}

function distributionFor(count: number, mode: PatternMode, custom: string) {
  const safeCount = Math.max(1, Math.trunc(Number(count)) || 1);
  if (mode === "singles") return Array.from({ length: safeCount }, () => 1).join("+");
  if (mode === "one_double") return safeCount >= 2 ? [2, ...Array.from({ length: safeCount - 2 }, () => 1)].join("+") : "1";
  return custom.trim().replace(/\s+/g, "");
}

type AvailabilityMapCell = { dayOfWeek: number; periodId: string; level: AvailabilityLevel };
function normalizeTimeOffSlots(items: AvailabilityMapCell[]) {
  return [...new Map(items.map((item) => [`${item.dayOfWeek}:${item.periodId}`, item])).values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodId.localeCompare(b.periodId));
}

function isMaths(subject: Pick<Subject, "name" | "shortName">) {
  return /math/i.test(`${subject.shortName} ${subject.name}`);
}
function afternoonPeriodIds(periods: TimetablePeriod[]) {
  const lunch = periods.find((period) => period.isBreak && /lunch/i.test(period.label));
  const lessons = periods.filter((period) => !period.isBreak);
  if (lunch) return lessons.filter((period) => period.sort > lunch.sort).map((period) => period.id);
  return lessons.filter((period) => {
    const match = /^(\d{2}):(\d{2})$/.exec(period.startTime);
    return Boolean(match && Number(match[1]) * 60 + Number(match[2]) >= 13 * 60);
  }).map((period) => period.id);
}

function suggestedFix(message: string) {
  const text = message.toLowerCase();
  if (text.includes("required weekly periods") || text.includes("weekly lesson count")) return "Compare the scheduled-period count with the target. Review blocked time-off and teacher/class clashes; add a bell period or adjust the target only if the teaching plan allows it.";
  if (text.includes("time-off") || text.includes("off-time")) return "Move the lesson to an available cell, or remove the off-time only if that resource is actually available then.";
  if (text.includes("free period(s) between") || text.includes("needs more free periods")) return "Move one lesson block later or to another day, or reduce the teacher’s recovery-period setting if the rest rule was entered too strictly.";
  if (text.includes("double-booked") || text.includes("two lessons at once") || text.includes("already booked")) return "Move one lesson to another free period, stream, room, or available teacher.";
  if (text.includes("adjacent periods") || text.includes("not be next to each other")) return "Place the two related subjects on separate days or leave at least one period between them.";
  if (text.includes("distribution") || text.includes("weekly pattern")) return "Edit the requirement so its single/double blocks use 1–3 periods and add up exactly to the weekly target.";
  if (text.includes("room")) return "Choose an active registered room with sufficient capacity, or clear the room requirement.";
  if (text.includes("teacher") && (text.includes("maximum") || text.includes("contract") || text.includes("assigned"))) return "Spread the teacher’s lessons across more days/periods, assign an available teacher, or revise the workload limit if approved.";
  return "Use the repair preview to see alternative placements before applying changes; keep hard off-time and required lesson counts intact.";
}

export function TimetableOperations({ ws, refresh, flash, yearId, termId, periods }: Props) {
  const [roomDraft, setRoomDraft] = useState({ name: "", capacity: "", roomType: "", features: "" });
  const [roomEditId, setRoomEditId] = useState<string | null>(null);
  const [availabilityType, setAvailabilityType] = useState<EntityType>("subject");
  const [availabilityId, setAvailabilityId] = useState("");
  const [availabilityDay, setAvailabilityDay] = useState(1);
  const [availabilityPeriod, setAvailabilityPeriod] = useState("");
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [availabilityLevel, setAvailabilityLevel] = useState<AvailabilityLevel>("off");
  const [requirementDraft, setRequirementDraft] = useState({ gradeId: ws.grades[0]?.id ?? "", streamId: "", subjectId: ws.subjects[0]?.id ?? "", teacherUserId: "", lessonsPerWeek: "5", blockLength: "1", preferredRoom: "", distribution: "1+1+1+1+1", patternMode: "singles" as PatternMode, preferredDoubleDay: "", timingPreference: "none" as "none" | "before_break" | "before_lunch" });
  const [requirementEditId, setRequirementEditId] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<{ issues: Array<{ severity: "error" | "warning"; message: string; fix?: IssueFix }>; errors: number; warnings: number } | null>(null);
  const [autoChecking, setAutoChecking] = useState(false);
  const [optimizationProfile, setOptimizationProfile] = useState<"balanced" | "morning" | "compact">("balanced");
  const [generationReport, setGenerationReport] = useState<{ entries: number; placedPeriods: number; requiredPeriods: number; unplacedPeriods: number; unplaced: string[]; kept: number; profile: string; preview: string[]; previewOnly: boolean; details: UnplacedDetail[]; relaxed: string[]; dropped: number } | null>(null);
  const [autoFixOnErrors, setAutoFixOnErrors] = useState(false);
  const lastAutoFixSignature = useRef("");
  const autoFixRuns = useRef(0);
  const [assignmentCoverage, setAssignmentCoverage] = useState<{ assignments: Array<{ grade: string; stream: string; subject: string; teacher: string; hasWeeklyCard: boolean }>; total: number; existing: number; missing: number } | null>(null);
  const [assignmentLessonsPerWeek, setAssignmentLessonsPerWeek] = useState("5");
  const [autoDetectAssignments, setAutoDetectAssignments] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [contract, setContract] = useState({ minPerDay: "0", maxPerDay: "6", maxPerWeek: "30", maxConsecutive: "4", maxDays: "5", maxWindows: "3", minRestPeriods: "0" });
  const [classGradeId, setClassGradeId] = useState(ws.grades[0]?.id ?? "");
  const [classStreamId, setClassStreamId] = useState("");
  const [classMax, setClassMax] = useState("8");
  const [classNoGaps, setClassNoGaps] = useState(true);
  const [relation, setRelation] = useState({ gradeId: ws.grades[0]?.id ?? "", streamId: "", leftSubjectId: ws.subjects[0]?.id ?? "", rightSubjectId: ws.subjects[1]?.id ?? "", kind: "before" as RelationKind });

  const scopedAvailability = useMemo(() => ws.timetableAvailability.filter((item) => item.yearId === yearId && item.termId === termId), [ws.timetableAvailability, yearId, termId]);
  const scopedRequirements = useMemo(() => ws.timetableRequirements.filter((item) => item.yearId === yearId && item.termId === termId), [ws.timetableRequirements, yearId, termId]);
  const versions = useMemo(() => ws.timetableVersions.filter((item) => item.yearId === yearId && item.termId === termId), [ws.timetableVersions, yearId, termId]);
  const constraints = useMemo(() => (ws.subjectConstraints ?? []).filter((item) => item.yearId === yearId && item.termId === termId), [ws.subjectConstraints, yearId, termId]);
  const contracts = useMemo(() => (ws.teacherContracts ?? []).filter((item) => item.yearId === yearId && item.termId === termId), [ws.teacherContracts, yearId, termId]);
  const classRules = useMemo(() => (ws.classConstraints ?? []).filter((item) => item.yearId === yearId && item.termId === termId), [ws.classConstraints, yearId, termId]);
  const relations = useMemo(() => (ws.lessonRelations ?? []).filter((item) => item.yearId === yearId && item.termId === termId), [ws.lessonRelations, yearId, termId]);
  const state = ws.timetableStates.find((item) => item.yearId === yearId && item.termId === termId);
  const auditSignature = useMemo(() => JSON.stringify({
    periods: periods.map(({ id, sort, isBreak, startTime, endTime }) => ({ id, sort, isBreak, startTime, endTime })),
    entries: ws.timetableEntries.filter((item) => item.yearId === yearId && item.termId === termId),
    availability: scopedAvailability,
    requirements: scopedRequirements,
    constraints,
    contracts,
    classRules,
    relations,
    rooms: ws.timetableRooms,
    activeLearners: ws.learners.filter((learner) => learner.status === "active").map(({ id, gradeId, streamId }) => ({ id, gradeId, streamId })),
    subjectTeacherAssignments: ws.assignments.filter((assignment) => assignment.kind === "subject_teacher").map(({ userId, gradeId, streamId, subjectId }) => ({ userId, gradeId, streamId, subjectId })),
  }), [periods, ws.timetableEntries, yearId, termId, scopedAvailability, scopedRequirements, constraints, contracts, classRules, relations, ws.timetableRooms, ws.learners, ws.assignments]);
  const teachers = ws.staff.filter((person) => person.active && ["teacher", "admin", "super_admin"].includes(person.role));
  const streams = ws.streams.filter((stream) => stream.gradeId === requirementDraft.gradeId);
  const classStreams = ws.streams.filter((stream) => stream.gradeId === classGradeId);
  const relationStreams = ws.streams.filter((stream) => stream.gradeId === relation.gradeId);
  const selectedRooms = ws.timetableRooms;
  const optionsFor = (type: EntityType) => type === "subject" ? ws.subjects.map((item) => [item.id, item.name] as const)
    : type === "teacher" ? teachers.map((item) => [item.id, item.fullName] as const)
    : type === "grade" ? ws.grades.map((item) => [item.id, item.name] as const)
      : type === "stream" ? ws.streams.map((item) => [item.id, `${ws.grades.find((grade) => grade.id === item.gradeId)?.name ?? "Grade"} · ${item.name}`] as const)
        : selectedRooms.filter((item) => item.active).map((item) => [item.id, item.name] as const);
  const availabilityOptions = optionsFor(availabilityType);
  const lessonPeriods = periods.filter((period) => !period.isBreak);

  useEffect(() => {
    let cancelled = false;
    setAutoChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await validateTimetable({ data: { yearId, termId } });
        if (!cancelled) setValidation(result);
      } catch {
        if (!cancelled) setValidation(null);
      } finally {
        if (!cancelled) setAutoChecking(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [auditSignature, yearId, termId]);

  useEffect(() => {
    if (validation && !validation.errors) autoFixRuns.current = 0;
    if (!autoFixOnErrors || !validation?.errors || busy || state?.published) return;
    if (lastAutoFixSignature.current === auditSignature || autoFixRuns.current >= 2) return;
    autoFixRuns.current += 1;
    lastAutoFixSignature.current = auditSignature;
    void autoFix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation, autoFixOnErrors, auditSignature]);

  async function run<T>(action: () => Promise<T>, success: string | ((result: T) => string)) {
    setBusy(true);
    try { const result = await action(); flash(typeof success === "function" ? success(result) : success); await refresh(); }
    catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }
  function conflictingEntriesForOffTime(type: EntityType, id: string, slots: Array<{ dayOfWeek: number; periodId: string; level: AvailabilityLevel }>) {
    const offCells = new Set(slots.filter((slot) => slot.level === "off").map((slot) => `${slot.dayOfWeek}:${slot.periodId}`));
    if (!offCells.size) return [];
    const roomName = type === "room" ? ws.timetableRooms.find((room) => room.id === id)?.name.toLowerCase() : "";
    const streamGradeId = type === "stream" ? ws.streams.find((stream) => stream.id === id)?.gradeId : undefined;
    return ws.timetableEntries.filter((entry) => {
      if (entry.yearId !== yearId || entry.termId !== termId) return false;
      const belongs = type === "teacher" ? entry.teacherUserId === id
        : type === "grade" ? entry.gradeId === id
          : type === "stream" ? entry.streamId === id || (!entry.streamId && Boolean(streamGradeId) && entry.gradeId === streamGradeId)
            : type === "subject" ? entry.subjectId === id
              : Boolean(roomName && entry.room.trim().toLowerCase() === roomName);
      if (!belongs) return false;
      const start = periods.find((period) => period.id === entry.periodId);
      if (!start) return false;
      const covered = periods.filter((period) => !period.isBreak && period.sort >= start.sort).slice(0, Math.max(1, entry.blockLength || 1));
      return covered.some((period) => offCells.has(`${entry.dayOfWeek}:${period.id}`));
    });
  }
  async function saveRoom(event: FormEvent) {
    event.preventDefault();
    await run(async () => { await saveTimetableRoom({ data: { ...roomDraft, id: roomEditId ?? undefined, capacity: Number(roomDraft.capacity) || 0 } }); setRoomDraft({ name: "", capacity: "", roomType: "", features: "" }); setRoomEditId(null); }, "Room saved.");
  }
  async function saveAvailability(event: FormEvent) {
    event.preventDefault();
    if (!availabilityId || !availabilityPeriod) { flash("Choose a resource and period.", true); return; }
    const slot = { dayOfWeek: availabilityDay, periodId: availabilityPeriod, level: availabilityLevel };
    const conflicts = conflictingEntriesForOffTime(availabilityType, availabilityId, [slot]);
    if (availabilityLevel === "off" && conflicts.length && !confirm(`This off-time overlaps ${conflicts.length} scheduled lesson block(s), including any linked doubles. They will be removed after a recovery snapshot is saved. Continue?`)) return;
    await run(() => saveTimetableAvailability({ data: { yearId, termId, entityType: availabilityType, entityId: availabilityId, dayOfWeek: availabilityDay, periodId: availabilityPeriod, note: availabilityNote, level: availabilityLevel } }), (result) => result.removedLessons ? `Off-time saved; ${result.removedLessons} conflicting lesson block(s) were cleared after saving a recovery snapshot.` : "Time-off cell saved. Off is a hard restriction; Avoid is discouraged; Prefer is favoured.");
  }
  async function saveRequirement(event: FormEvent) {
    event.preventDefault();
    if (!requirementDraft.teacherUserId) { flash("Choose a teacher for this lesson requirement.", true); return; }
    const distribution = distributionFor(Number(requirementDraft.lessonsPerWeek), requirementDraft.patternMode, requirementDraft.distribution);
    if (requirementDraft.patternMode === "custom" && !distribution) { flash("Enter a custom pattern that adds up to the weekly target.", true); return; }
    const patternParts = distribution.split("+").map((block) => Number(block));
    const hasOneDoubleBlock = patternParts.filter((block) => block > 1).length === 1 && patternParts.includes(2);
    await run(async () => { await saveTimetableRequirement({ data: { yearId, termId, id: requirementEditId ?? undefined, gradeId: requirementDraft.gradeId, streamId: requirementDraft.streamId || undefined, subjectId: requirementDraft.subjectId, teacherUserId: requirementDraft.teacherUserId, lessonsPerWeek: Number(requirementDraft.lessonsPerWeek), blockLength: 1, preferredRoom: requirementDraft.preferredRoom, distribution, preferredDoubleDay: hasOneDoubleBlock && requirementDraft.preferredDoubleDay ? Number(requirementDraft.preferredDoubleDay) : undefined, timingPreference: requirementDraft.timingPreference } }); setRequirementEditId(null); }, "Weekly subject requirement saved.");
  }
  async function checkSchedule() {
    setBusy(true);
    try { setValidation(await validateTimetable({ data: { yearId, termId } })); }
    catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }
  async function scanAssignments() {
    setBusy(true);
    try {
      const result = await inspectTimetableAssignments({ data: { yearId, termId } });
      setAssignmentCoverage(result);
      flash(`Detected ${result.total} active subject-teacher allocation(s): ${result.existing} already have lesson cards and ${result.missing} need cards.`);
    } catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }
  async function addMissingAssignmentCards() {
    setBusy(true);
    try {
      const result = await seedTimetableRequirements({ data: { yearId, termId, lessonsPerWeek: Number(assignmentLessonsPerWeek) } });
      flash(`${result.created} missing subject-teacher card(s) created with a balanced ${result.distribution} weekly pattern.`);
      setAssignmentCoverage(null);
      await refresh();
    } catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }
  function exportAuditCsv() {
    if (!validation?.issues.length) { flash("There are no timetable findings to export.", true); return; }
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = ["Severity,Finding", ...validation.issues.map((issue) => `${quote(issue.severity)},${quote(issue.message)}`)].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `timetable-audit-${yearId}-${termId}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    flash("Timetable audit CSV downloaded.");
  }
  const scopedEntriesCount = ws.timetableEntries.filter((entry) => entry.yearId === yearId && entry.termId === termId).length;
  async function runGenerator(previewOnly = false) {
    if (!previewOnly && !confirm(`Generate a new draft for ${scopedEntriesCount} currently scheduled lesson(s)? Pinned lessons stay. Any current draft is saved as a recoverable version first.`)) return;
    setBusy(true);
    try {
      const result = await generateTimetable({ data: { yearId, termId, profile: optimizationProfile, detectAssignments: !previewOnly && ws.timetableStaffAssignmentsEnabled && autoDetectAssignments, defaultLessonsPerWeek: Number(assignmentLessonsPerWeek), previewOnly } });
      setGenerationReport({ entries: result.entries, placedPeriods: result.placedPeriods ?? 0, requiredPeriods: result.requiredPeriods ?? 0, unplacedPeriods: result.unplacedPeriods ?? 0, unplaced: result.unplaced ?? [], kept: result.kept ?? 0, profile: result.profile ?? optimizationProfile, preview: result.preview ?? [], previewOnly: Boolean(result.previewOnly), details: (result.unplacedDetails ?? []) as UnplacedDetail[], relaxed: result.relaxed ?? [], dropped: result.dropped ?? 0 });
      const syncMessage = result.assignmentSync?.created ? ` ${result.assignmentSync.created} missing subject-teacher card(s) added (${result.assignmentSync.distribution}).` : "";
      flash(previewOnly ? `Preview ready: ${result.entries} lesson block(s) placed; saved timetable was not changed.` : `Draft generated: ${result.entries} lesson block(s) placed; ${result.unplaced?.length ?? 0} unplaced. Profile: ${result.profile ?? optimizationProfile}.${syncMessage}`);
      setValidation(null);
      await refresh();
    } catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }
  async function autoFix() {
    if (state?.published) { flash("This timetable is published. Tap “Unpublish / edit draft” first, then fix it.", true); return; }
    setBusy(true);
    try {
      const result = await generateTimetable({ data: { yearId, termId, profile: optimizationProfile, detectAssignments: ws.timetableStaffAssignmentsEnabled, defaultLessonsPerWeek: Number(assignmentLessonsPerWeek), repair: true } });
      setGenerationReport({ entries: result.entries, placedPeriods: result.placedPeriods ?? 0, requiredPeriods: result.requiredPeriods ?? 0, unplacedPeriods: result.unplacedPeriods ?? 0, unplaced: result.unplaced ?? [], kept: result.kept ?? 0, profile: result.profile ?? optimizationProfile, preview: result.preview ?? [], previewOnly: false, details: (result.unplacedDetails ?? []) as UnplacedDetail[], relaxed: result.relaxed ?? [], dropped: result.dropped ?? 0 });
      flash(result.unplacedPeriods ? `Fixed what could be fixed: ${result.placedPeriods}/${result.requiredPeriods} lessons are on the timetable. ${result.unplacedPeriods} still need a decision — see the suggestions below.` : `All ${result.placedPeriods} lessons are on the timetable. ${result.dropped ? `${result.dropped} clashing lesson(s) were moved.` : "Nothing needed moving."}`);
      setValidation(null);
      await refresh();
    } catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }
  async function applyIssueFix(fix: IssueFix) {
    if (fix.kind === "repair") { await autoFix(); return; }
    setBusy(true);
    try {
      await applyTimetableFix({ data: { yearId, termId, kind: fix.kind, requirementId: fix.requirementId, teacherUserId: fix.teacherUserId, subjectId: fix.subjectId } });
      flash(`${fix.label} — done. Re-checking and repairing the timetable…`);
      await refresh();
    } catch (error) { flash(errText(error), true); setBusy(false); return; }
    setBusy(false);
    await autoFix();
  }
  async function publish() {
    if (!confirm("Publish this timetable? Teachers, learners, and families will see it as the official schedule for the selected year and term.")) return;
    await run(() => publishTimetable({ data: { yearId, termId, effectiveFrom, label: `Effective ${effectiveFrom}` } }), "Timetable published. A version snapshot was saved.");
    setValidation(null);
  }
  async function restore(versionId: string, label: string) {
    if (!confirm(`Restore “${label}” as the current draft? A safety snapshot will be saved first.`)) return;
    await run(() => restoreTimetableVersion({ data: { versionId } }), (result) => result.skippedDeletedTeacherEntries ? `Version “${label}” restored to draft; ${result.skippedDeletedTeacherEntries} lesson(s) assigned to deleted staff accounts were skipped.` : `Version “${label}” restored to draft.`);
    setValidation(null);
  }
  async function paint(entityType: EntityType, entityId: string, slots: Array<{ dayOfWeek: number; periodId: string; level: AvailabilityLevel }>, message: string) {
    if (!entityId) { flash("Choose who this off-time map belongs to.", true); return; }
    const conflicts = conflictingEntriesForOffTime(entityType, entityId, slots);
    if (conflicts.length && !confirm(`This off-time map overlaps ${conflicts.length} scheduled lesson block(s), including any linked doubles. They will be removed after a recovery snapshot is saved. Continue?`)) return;
    await run(() => saveAvailabilityMap({ data: { yearId, termId, entityType, entityId, slots } }), (result) => result.removedLessons ? `${message} ${result.removedLessons} conflicting lesson block(s) were cleared after saving a recovery snapshot.` : message);
  }

  return <section className="space-y-5 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Timetable studio</p><h2 className="mt-1 font-serif text-2xl text-navy">Plan the way aSc does</h2><p className="mt-1 max-w-3xl text-sm text-muted">Set subject off-time, distribution order, teacher contracts, class gaps, and card relations. Generate a draft, pin lessons you want to keep, then publish.</p></div>
      <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${state?.published ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{state?.published ? `Published · ${state.effectiveFrom || "date not set"}` : "Draft · not published"}</span>
    </div>

    <details className="rounded-xl border border-indigo-200 bg-indigo-50 p-4" open>
      <summary className="cursor-pointer font-serif text-lg text-indigo-950">10 advanced aSc-style timetable features</summary>
      <p className="mt-1 text-xs text-indigo-900">These controls are active in this timetable studio. Use the linked panel below each item; hard rules block invalid placements and soft rules are balanced by the generator.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["1", "Exact weekly quotas", `${scopedRequirements.length} lesson card(s) tracked`, "Subjects and lessons per week"],
          ["2", "Single / double / triple blocks", "Break-safe consecutive periods", "Subjects and lessons per week"],
          ["3", "Teacher contracts", "Min/max load, days, windows, recovery", "Teacher limits and recovery time"],
          ["4", "Subject distribution", "Spread, morning, afternoon, last-period rules", "Subject rules"],
          ["5", "Class workload and gaps", "Daily cap and no-gap preference", "Class rules and card relations"],
          ["6", "Room constraints", `${selectedRooms.filter((room) => room.active).length} active room(s)`, "Rooms"],
          ["7", "Lesson relations", `${relations.length} relation(s) configured`, "Class rules and card relations"],
          ["8", "Hard / soft time-off", `${scopedAvailability.filter((item) => item.level === "off").length} hard off-time cell(s)`, "Time-off map"],
          ["9", "Scoped teacher assignments", "Grade, stream, or all streams", "Subject teaching allocations"],
          ["10", "Test, preview, repair", `${validation?.errors ?? 0} blocking issue(s) detected`, "Generate, diagnose, and repair"],
        ].map(([number, title, status, target]) => <div key={number} className="rounded-lg border border-indigo-200 bg-white/80 p-2 text-xs"><span className="mr-1 inline-grid size-5 place-items-center rounded-full bg-indigo-700 font-bold text-white">{number}</span><strong>{title}</strong><span className="mt-1 block text-indigo-900">{status}</span><span className="mt-1 block text-muted">Control: {target}</span></div>)}
      </div>
    </details>

    {ws.me.role === "super_admin" ? <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Who may edit the timetable</strong><p className="mt-1">Ordinary admins can change the timetable only while this switch is allowed. Super admin and deputy keep access either way.</p><p className="mt-1 font-semibold">Ordinary admins: {ws.timetableAdminsCanEdit ? "Allowed" : "Denied"}</p></div><button type="button" className={btnClass} disabled={busy} onClick={() => run(() => setTimetableAdminPermission({ data: { adminsCanEdit: !ws.timetableAdminsCanEdit } }), ws.timetableAdminsCanEdit ? "Admin timetable editing denied." : "Admin timetable editing allowed.")}>{ws.timetableAdminsCanEdit ? "Deny admin edits" : "Allow admin edits"}</button></div></div> : null}
    {ws.me.role === "super_admin" ? <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>Use staff subject allocations in the timetable</strong><p className="mt-1">When enabled, assignment scans and timetable generation can create missing weekly lesson cards from Staff subject-teacher assignments. Turning it off stops future imports; saved lesson cards and scheduled lessons are kept.</p><p className="mt-1 font-semibold">Staff allocations: {ws.timetableStaffAssignmentsEnabled ? "Allowed" : "Not used"}</p></div><button type="button" className={btnClass} disabled={busy} onClick={() => { const enabled = !ws.timetableStaffAssignmentsEnabled; if (!enabled) setAutoDetectAssignments(false); void run(() => setTimetableStaffAssignmentsEnabled({ data: { enabled } }), enabled ? "Staff subject allocations may now be used for timetable lesson cards." : "Staff subject allocations will no longer be imported into timetable lesson cards."); }}>{ws.timetableStaffAssignmentsEnabled ? "Stop using staff allocations" : "Allow staff allocations"}</button></div></div> : null}

    <div className={`rounded-xl border p-4 ${validation?.errors ? "border-red-300 bg-red-50" : generationReport?.unplacedPeriods ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <strong className="text-navy">{autoChecking ? "Checking the timetable…" : validation ? (validation.errors ? `${validation.errors} problem(s) found — tap the button to repair them` : validation.warnings ? `No blocking problems · ${validation.warnings} suggestion(s)` : "No problems found") : "Automatic error checking is on"}</strong>
          <p className="mt-1 text-xs text-muted">One tap repairs clashes, off-time and rule breaks, keeps the lessons that are already fine, and adds missing periods so every subject reaches its weekly number. Your pinned lessons never move, and a recovery version is saved first. If a hard constraint makes a complete timetable impossible, the current draft is preserved and the exact suggested fix is shown.</p>
        </div>
        <button type="button" className={btnClass + " min-w-[14rem]"} disabled={busy || (state?.published ?? false)} onClick={autoFix}>{busy ? "Working…" : "Fix timetable automatically"}</button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={autoFixOnErrors} onChange={(event) => setAutoFixOnErrors(event.target.checked)} /> Fix errors automatically as soon as they appear</label>
      {state?.published ? <p className="mt-1 text-xs font-semibold text-amber-900">Published timetables are read-only. Unpublish to fix it.</p> : null}
    </div>

    <TimetablePlanner ws={ws} refresh={refresh} flash={flash} yearId={yearId} termId={termId} periods={periods} />

    <div className="grid gap-4 xl:grid-cols-2">
      <form className="rounded-xl border border-line bg-paper p-4" onSubmit={saveRoom}>
        <h3 className="font-serif text-lg text-navy">Rooms</h3><p className="text-xs text-muted">Capacity, type, and equipment. The generator will not double-book a room.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><input className={inputClass} placeholder="Room name" value={roomDraft.name} onChange={(event) => setRoomDraft({ ...roomDraft, name: event.target.value })} required/><input className={inputClass} placeholder="Capacity" type="number" min="0" value={roomDraft.capacity} onChange={(event) => setRoomDraft({ ...roomDraft, capacity: event.target.value })}/><input className={inputClass} placeholder="Type (lab, hall…)" value={roomDraft.roomType} onChange={(event) => setRoomDraft({ ...roomDraft, roomType: event.target.value })}/><input className={inputClass} placeholder="Equipment/features" value={roomDraft.features} onChange={(event) => setRoomDraft({ ...roomDraft, features: event.target.value })}/></div>
        <div className="mt-3 flex gap-2"><button className={btnClass} disabled={busy}>{roomEditId ? "Save room changes" : "Save room"}</button>{roomEditId ? <button className={btnGhost} type="button" onClick={() => { setRoomEditId(null); setRoomDraft({ name: "", capacity: "", roomType: "", features: "" }); }}>Cancel</button> : null}</div>
        <div className="mt-3 space-y-1">{selectedRooms.map((room) => <RoomRow key={room.id} room={room} busy={busy} onEdit={() => { setRoomEditId(room.id); setRoomDraft({ name: room.name, capacity: String(room.capacity), roomType: room.roomType, features: room.features }); }} onDelete={() => run(() => deleteTimetableRoom({ data: { id: room.id } }), "Room deleted.")}/>)}</div>
      </form>

      <form className="rounded-xl border border-line bg-paper p-4" onSubmit={saveAvailability}>
        <h3 className="font-serif text-lg text-navy">Time-off</h3><p className="text-xs text-muted">Paint multiple cells and save once. Off is enforced; any conflicting lesson block is cleared only after confirmation and a recovery snapshot. Avoid and Prefer guide placement. Breaks are not teaching cells.</p>
        <TimeOffPainter periods={lessonPeriods} bell={periods} options={availabilityOptions} entityType={availabilityType} onType={(type) => { setAvailabilityType(type); setAvailabilityId(""); }} entityId={availabilityId} onEntity={setAvailabilityId} existing={scopedAvailability} busy={busy} onSave={async (slots, message, also) => { await paint(availabilityType, availabilityId, slots, message); for (const id of also ?? []) await paint(availabilityType, id, slots, message); }} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select className={inputClass} value={availabilityDay} onChange={(event) => setAvailabilityDay(Number(event.target.value))} aria-label="Weekday">{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select>
          <select className={inputClass} value={availabilityPeriod} onChange={(event) => setAvailabilityPeriod(event.target.value)} required><option value="">Choose period</option>{lessonPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}</select>
          <select className={inputClass} value={availabilityLevel} onChange={(event) => setAvailabilityLevel(event.target.value as AvailabilityLevel)} aria-label="Availability level"><option value="off">Off · cannot</option><option value="avoid">Avoid</option><option value="prefer">Prefer</option></select>
          <input className={inputClass} placeholder="Reason (optional)" value={availabilityNote} onChange={(event) => setAvailabilityNote(event.target.value)}/>
        </div>
        <button className={btnClass + " mt-3"} disabled={busy}>Add this cell</button>
        <div className="mt-3 max-h-36 space-y-1 overflow-y-auto">{scopedAvailability.map((item) => <AvailabilityRow key={item.id} item={item} ws={ws} periods={periods} busy={busy} onDelete={() => run(() => deleteTimetableAvailability({ data: { id: item.id } }), "Time-off cell removed.")}/>)}</div>
      </form>

      <form className="rounded-xl border border-line bg-paper p-4 xl:col-span-2" onSubmit={saveRequirement}>
        <h3 className="font-serif text-lg text-navy">Subject teaching allocations and weekly targets</h3>
        <p className="text-xs text-muted">Assign a teacher to a grade and a specific stream, or choose All streams for a grade-wide lesson. Set the required weekly periods and the lesson shape; a double is two consecutive periods but appears as one timetable block.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select className={inputClass} value={requirementDraft.gradeId} onChange={(event) => setRequirementDraft({ ...requirementDraft, gradeId: event.target.value, streamId: "" })} aria-label="Grade">{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select>
          <select className={inputClass} value={requirementDraft.streamId} onChange={(event) => setRequirementDraft({ ...requirementDraft, streamId: event.target.value })} aria-label="Stream"><option value="">All streams / grade-wide</option>{streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select>
          <select className={inputClass} value={requirementDraft.subjectId} onChange={(event) => setRequirementDraft({ ...requirementDraft, subjectId: event.target.value })} aria-label="Subject">{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
          <select className={inputClass} value={requirementDraft.teacherUserId} onChange={(event) => setRequirementDraft({ ...requirementDraft, teacherUserId: event.target.value })} aria-label="Assigned teacher"><option value="">Choose teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>
          <label className="text-xs font-semibold text-navy">Required periods / week<input className={inputClass + " mt-1 w-full"} type="number" min="1" max="40" value={requirementDraft.lessonsPerWeek} onChange={(event) => setRequirementDraft({ ...requirementDraft, lessonsPerWeek: event.target.value })} aria-label="Lessons per week" /></label>
          <label className="text-xs font-semibold text-navy">Consecutive lesson rule<select className={inputClass + " mt-1 w-full"} value={requirementDraft.patternMode} onChange={(event) => setRequirementDraft({ ...requirementDraft, patternMode: event.target.value as PatternMode })} aria-label="Consecutive lesson rule"><option value="singles">Singles only · never double</option><option value="one_double" disabled={Number(requirementDraft.lessonsPerWeek) < 2}>Require one adjacent double + singles</option><option value="custom">Custom blocks · 1–3 periods</option></select></label>
          {requirementDraft.patternMode === "custom" ? <label className="text-xs font-semibold text-navy">Custom pattern<input className={inputClass + " mt-1 w-full"} value={requirementDraft.distribution} onChange={(event) => setRequirementDraft({ ...requirementDraft, distribution: event.target.value })} placeholder="2+1+1+1" aria-label="Custom consecutive-period pattern" required /><span className="mt-1 block font-normal text-muted">Blocks must add up to the weekly target, e.g. 5 = 2+1+1+1.</span></label> : null}
          <select className={inputClass} value={requirementDraft.preferredRoom} onChange={(event) => setRequirementDraft({ ...requirementDraft, preferredRoom: event.target.value })} aria-label="Preferred room"><option value="">Any room</option>{selectedRooms.filter((room) => room.active).map((room) => <option key={room.id} value={room.name}>{room.name}</option>)}</select>
          <select className={inputClass} value={requirementDraft.preferredDoubleDay} disabled={requirementDraft.patternMode === "singles" || (requirementDraft.patternMode === "custom" && (() => { const blocks = requirementDraft.distribution.split("+").map((block) => Number(block.trim())); return blocks.filter((block) => block > 1).length !== 1 || !blocks.includes(2); })())} onChange={(event) => setRequirementDraft({ ...requirementDraft, preferredDoubleDay: event.target.value })} aria-label="Required double weekday"><option value="">No fixed double weekday</option>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day} · double</option>)}</select>
          <select className={inputClass} value={requirementDraft.timingPreference} onChange={(event) => setRequirementDraft({ ...requirementDraft, timingPreference: event.target.value as typeof requirementDraft.timingPreference })} aria-label="Preferred lesson timing"><option value="none">No break-time preference</option><option value="before_break">Prefer before a break</option><option value="before_lunch">Prefer before lunch</option></select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><button className={btnClass} disabled={busy}>{requirementEditId ? "Save card changes" : "Save lesson card"}</button><button className={btnGhost} type="button" disabled={busy} onClick={scanAssignments}>Detect teacher assignments</button>{requirementEditId ? <button className={btnGhost} type="button" onClick={() => setRequirementEditId(null)}>Cancel</button> : null}</div>
        {assignmentCoverage ? <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950"><strong>Assignment coverage · {assignmentCoverage.existing}/{assignmentCoverage.total} have lesson cards</strong><p className="mt-1 text-xs">{assignmentCoverage.missing} missing cards. Pick a weekly lesson target; the new cards will be spread across the five weekdays as evenly as possible.</p><div className="mt-2 flex flex-wrap items-end gap-2"><label className="text-xs">Default periods per subject/week<input className={inputClass + " mt-1 w-36"} type="number" min="1" max="15" value={assignmentLessonsPerWeek} onChange={(event) => setAssignmentLessonsPerWeek(event.target.value)} /></label><button className={btnClass} type="button" disabled={busy || assignmentCoverage.missing === 0 || !ws.timetableStaffAssignmentsEnabled} onClick={addMissingAssignmentCards}>Create {assignmentCoverage.missing} missing card(s)</button><button className={btnGhost} type="button" disabled={busy} onClick={() => setAssignmentCoverage(null)}>Close</button></div><ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">{assignmentCoverage.assignments.map((item, index) => <li key={`${item.grade}:${item.stream}:${item.subject}:${item.teacher}:${index}`}>{item.grade} · {item.stream} · {item.subject} · {item.teacher} — {item.hasWeeklyCard ? "card exists" : "missing card"}</li>)}</ul></div> : null}
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">{scopedRequirements.map((item) => <RequirementRow key={item.id} item={item} ws={ws} periods={periods} scheduledPeriods={ws.timetableEntries.filter((entry) => entry.yearId === yearId && entry.termId === termId && entry.gradeId === item.gradeId && entry.streamId === item.streamId && entry.subjectId === item.subjectId && entry.teacherUserId === item.teacherUserId).reduce((sum, entry) => sum + coveredPeriodIds(entry, periods).length, 0)} busy={busy} onEdit={() => { setRequirementEditId(item.id); setRequirementDraft({ gradeId: item.gradeId, streamId: item.streamId ?? "", subjectId: item.subjectId, teacherUserId: item.teacherUserId, lessonsPerWeek: String(item.lessonsPerWeek), blockLength: String(item.blockLength), preferredRoom: item.preferredRoom, distribution: item.distribution || "", patternMode: patternModeFor(item.distribution || "", item.lessonsPerWeek, item.blockLength, item.preferredDoubleDay), preferredDoubleDay: item.preferredDoubleDay ? String(item.preferredDoubleDay) : "", timingPreference: item.timingPreference ?? "none" }); }} onDelete={() => run(() => deleteTimetableRequirement({ data: { id: item.id } }), "Lesson card deleted.")}/>)}{!scopedRequirements.length ? <p className="text-xs text-muted">No lesson cards yet. Create a subject-teacher allocation above or add a weekly target for a grade/stream.</p> : null}</div>
      </form>

      <div className="rounded-xl border border-line bg-paper p-4 xl:col-span-2">
        <h3 className="font-serif text-lg text-navy">Subject rules</h3>
        <p className="mt-1 text-xs text-muted">Mathematics starts with no afternoon, mornings preferred, and one lesson per day, even before you save. Place in order lays the distribution onto later weekdays. No last period keeps the subject off period 8. Complexity is used when the generator has to choose which card to place first.</p>
        <div className="mt-3 space-y-2">{ws.subjects.map((subject) => <SubjectRuleRow key={`${yearId}:${termId}:${subject.id}`} subject={subject} saved={constraints.find((item) => item.subjectId === subject.id)} busy={busy} onSave={(draft) => run(() => saveSubjectConstraint({ data: { yearId, termId, subjectId: subject.id, ...draft } }), `${subject.shortName || subject.name} rules saved.`)} />)}</div>
      </div>

      <form className="rounded-xl border border-line bg-paper p-4" onSubmit={(event) => { event.preventDefault(); if (!teacherId) { flash("Choose a teacher.", true); return; } void run(() => saveTeacherContract({ data: { yearId, termId, teacherUserId: teacherId, minPerDay: Number(contract.minPerDay), maxPerDay: Number(contract.maxPerDay), maxPerWeek: Number(contract.maxPerWeek), maxConsecutive: Number(contract.maxConsecutive), maxDays: Number(contract.maxDays), maxWindows: Number(contract.maxWindows), minRestPeriods: Number(contract.minRestPeriods) } }), "Teacher timetable limits and rest preference saved."); }}>
        <h3 className="font-serif text-lg text-navy">Teacher limits and recovery time</h3><p className="mt-1 text-xs text-muted">Set the aSc-style minimum/maximum daily load, weekly workload, consecutive limit, teaching days, windows, and free recovery periods. A deliberate double remains one block.</p>
        <select className={inputClass + " mt-3"} value={teacherId} onChange={(event) => { const id = event.target.value; setTeacherId(id); const saved = contracts.find((item) => item.teacherUserId === id); setContract(saved ? { minPerDay: String(saved.minPerDay ?? 0), maxPerDay: String(saved.maxPerDay), maxPerWeek: String(saved.maxPerWeek), maxConsecutive: String(saved.maxConsecutive), maxDays: String(saved.maxDays), maxWindows: String(saved.maxWindows), minRestPeriods: String(saved.minRestPeriods ?? 0) } : { minPerDay: "0", maxPerDay: "6", maxPerWeek: "30", maxConsecutive: "4", maxDays: "5", maxWindows: "3", minRestPeriods: "0" }); }}><option value="">Choose teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>
        <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[11px] text-muted">Min / teaching day<input className={inputClass} type="number" min="0" max="8" value={contract.minPerDay} onChange={(event) => setContract({ ...contract, minPerDay: event.target.value })}/></label><label className="text-[11px] text-muted">Max / day<input className={inputClass} type="number" min="1" max="12" value={contract.maxPerDay} onChange={(event) => setContract({ ...contract, maxPerDay: event.target.value })}/></label><label className="text-[11px] text-muted">Max / week<input className={inputClass} type="number" min="1" max="50" value={contract.maxPerWeek} onChange={(event) => setContract({ ...contract, maxPerWeek: event.target.value })}/></label><label className="text-[11px] text-muted">Max consecutive periods<input className={inputClass} type="number" min="1" max="10" value={contract.maxConsecutive} onChange={(event) => setContract({ ...contract, maxConsecutive: event.target.value })}/></label><label className="text-[11px] text-muted">Max days<input className={inputClass} type="number" min="1" max="5" value={contract.maxDays} onChange={(event) => setContract({ ...contract, maxDays: event.target.value })}/></label><label className="text-[11px] text-muted">Max windows / day<input className={inputClass} type="number" min="0" max="8" value={contract.maxWindows} onChange={(event) => setContract({ ...contract, maxWindows: event.target.value })}/></label><label className="text-[11px] text-muted">Free periods between blocks<input className={inputClass} type="number" min="0" max="2" value={contract.minRestPeriods} onChange={(event) => setContract({ ...contract, minRestPeriods: event.target.value })}/></label></div>
        <button className={btnClass + " mt-3"} disabled={busy}>Save teacher contract</button>
        <ul className="mt-3 space-y-1 text-xs">{contracts.map((item) => <li key={item.id} className="rounded-lg border border-line bg-white px-3 py-2"><strong>{teachers.find((teacher) => teacher.id === item.teacherUserId)?.fullName ?? "Teacher"}</strong><span className="text-muted"> · {item.minPerDay ?? 0}–{item.maxPerDay}/day · {item.maxPerWeek}/week · {item.maxConsecutive} consecutive · {item.minRestPeriods ?? 0} free period(s) between blocks · {item.maxDays} days · {item.maxWindows} windows</span></li>)}</ul>
      </form>

      <form className="rounded-xl border border-line bg-paper p-4" onSubmit={(event) => { event.preventDefault(); void run(() => saveClassConstraint({ data: { yearId, termId, gradeId: classGradeId, streamId: classStreamId || undefined, maxPerDay: Number(classMax), noGaps: classNoGaps } }), "Class rule saved."); }}>
        <h3 className="font-serif text-lg text-navy">Class rules and card relations</h3><p className="text-xs text-muted">Cap lessons in a day and ask the generator to avoid holes between a class’s lessons. Relations tell two subjects how they may sit.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><select className={inputClass} value={classGradeId} onChange={(event) => { setClassGradeId(event.target.value); setClassStreamId(""); }}>{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><select className={inputClass} value={classStreamId} onChange={(event) => setClassStreamId(event.target.value)}><option value="">Whole grade</option>{classStreams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select><input className={inputClass} type="number" min="1" max="12" value={classMax} onChange={(event) => setClassMax(event.target.value)} aria-label="Class max lessons per day"/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={classNoGaps} onChange={(event) => setClassNoGaps(event.target.checked)} />No gaps in the day</label></div>
        <button className={btnClass + " mt-3"} disabled={busy}>Save class rule</button>
        <ul className="mt-2 space-y-1 text-xs">{classRules.map((item) => <li key={item.id} className="text-muted">{ws.grades.find((grade) => grade.id === item.gradeId)?.name} · {item.streamId ? ws.streams.find((stream) => stream.id === item.streamId)?.name : "Whole grade"} · max {item.maxPerDay}/day{item.noGaps ? " · no gaps" : ""}</li>)}</ul>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><select className={inputClass} value={relation.gradeId} onChange={(event) => setRelation({ ...relation, gradeId: event.target.value, streamId: "" })}>{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><select className={inputClass} value={relation.streamId} onChange={(event) => setRelation({ ...relation, streamId: event.target.value })}><option value="">Whole grade</option>{relationStreams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select><select className={inputClass} value={relation.leftSubjectId} onChange={(event) => setRelation({ ...relation, leftSubjectId: event.target.value })} aria-label="First subject">{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.shortName || subject.name}</option>)}</select><select className={inputClass} value={relation.kind} onChange={(event) => setRelation({ ...relation, kind: event.target.value as RelationKind })}>{(Object.keys(RELATION_LABEL) as RelationKind[]).map((kind) => <option key={kind} value={kind}>{RELATION_LABEL[kind]}</option>)}</select><select className={inputClass + " sm:col-span-2"} value={relation.rightSubjectId} onChange={(event) => setRelation({ ...relation, rightSubjectId: event.target.value })} aria-label="Second subject">{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.shortName || subject.name}</option>)}</select></div>
        <button className={btnGhost + " mt-3"} type="button" disabled={busy} onClick={() => run(() => saveLessonRelation({ data: { yearId, termId, gradeId: relation.gradeId, streamId: relation.streamId || undefined, leftSubjectId: relation.leftSubjectId, rightSubjectId: relation.rightSubjectId, relation: relation.kind } }), "Card relation saved.")}>Add card relation</button>
        <ul className="mt-2 space-y-1">{relations.map((item) => { const left = ws.subjects.find((subject) => subject.id === item.leftSubjectId)?.shortName; const right = ws.subjects.find((subject) => subject.id === item.rightSubjectId)?.shortName; const grade = ws.grades.find((row) => row.id === item.gradeId)?.name; return <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs"><span>{grade}: {left} {RELATION_LABEL[item.relation]} {right}</span><button type="button" className="font-semibold text-bad" disabled={busy} onClick={() => run(() => deleteLessonRelation({ data: { id: item.id } }), "Relation removed.")}>×</button></li>; })}</ul>
      </form>

      <div className="rounded-xl border border-line bg-paper p-4">
        <h3 className="font-serif text-lg text-navy">Generate, diagnose, and repair</h3><p className="text-xs text-muted">Pinned lessons stay where they are and count toward their weekly target. Preview the automatic repair first; every double block is reported as two covered periods, not one lesson block.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="text-xs font-semibold text-navy">Generator optimization profile<select className={inputClass + " mt-1 w-full"} value={optimizationProfile} onChange={(event) => setOptimizationProfile(event.target.value as typeof optimizationProfile)}><option value="balanced">Balanced subjects and workloads</option><option value="morning">Morning priority</option><option value="compact">Compact day · reduce gaps</option></select></label>
          <div className="flex flex-wrap items-end gap-2"><button className={btnGhost} type="button" disabled={busy} onClick={() => runGenerator(true)}>Preview automatic repair</button><button className={btnClass} type="button" disabled={busy || (state?.published ?? false)} onClick={() => runGenerator(false)}>{validation?.errors ? "Apply repaired draft" : "Generate timetable draft"}</button><button className={btnGhost} type="button" disabled={busy} onClick={checkSchedule}>Run checks now</button>{validation?.issues.length ? <button className={btnGhost} type="button" disabled={busy} onClick={exportAuditCsv}>Export checks CSV</button> : null}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-3 py-2"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={autoDetectAssignments && ws.timetableStaffAssignmentsEnabled} disabled={busy || !ws.timetableStaffAssignmentsEnabled} onChange={(event) => setAutoDetectAssignments(event.target.checked)} />Before generation, detect assigned subjects and add missing lesson cards</label><label className="text-xs">Default periods/subject/week<input className={inputClass + " ml-2 w-20"} type="number" min="1" max="15" value={assignmentLessonsPerWeek} onChange={(event) => setAssignmentLessonsPerWeek(event.target.value)} /></label><button className={btnGhost} type="button" disabled={busy} onClick={scanAssignments}>Scan assignments</button><span className="text-xs text-muted">{assignmentCoverage ? `${assignmentCoverage.missing} missing cards of ${assignmentCoverage.total} assignments` : ws.timetableStaffAssignmentsEnabled ? "Assignments use their class, stream, subject, and assigned teacher." : "Staff allocations are disabled; weekly lesson cards already saved remain unchanged."}</span></div>
        <p className="mt-2 text-xs text-muted">{autoChecking ? "Automatically checking this timetable…" : "Automatic checks refresh after schedule, bell, requirement, availability, rule, room, or class-size changes."}</p>
        {validation ? <div className={`mt-3 rounded-lg p-3 text-sm ${validation.errors ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`}><strong>{validation.errors ? `${validation.errors} blocking issue(s)` : "No blocking conflicts"}</strong><span className="ml-2">{validation.warnings} warning(s)</span><ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">{validation.issues.map((issue, index) => <li key={`${issue.severity}:${issue.message}:${index}`} className="rounded-lg bg-white/70 p-2 text-xs"><strong>{issue.severity === "error" ? "Error" : "Warning"}:</strong> {issue.message}<span className="mt-1 block text-muted"><strong>Suggested action:</strong> {suggestedFix(issue.message)}</span>{issue.fix ? <button type="button" className="mt-1 rounded-md bg-navy px-3 py-1 text-xs font-semibold text-paper disabled:opacity-50" disabled={busy || (state?.published ?? false)} onClick={() => applyIssueFix(issue.fix!)}>{issue.fix.label}</button> : null}</li>)}</ul></div> : <p className="mt-3 text-xs text-muted">Automatic checks include bell times and overlaps, schedule rows and blocks, exact weekly period targets, room availability/capacity, clashes, breaks, restrictions, teacher recovery time, workload limits, gaps, and subject relations.</p>}
        {generationReport ? <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950"><strong>{generationReport.previewOnly ? "Preview only · saved timetable unchanged" : "Last generation"} · {generationReport.profile}</strong><p className="mt-1 text-xs"><strong>{generationReport.placedPeriods}/{generationReport.requiredPeriods} weekly periods covered</strong> · {generationReport.entries} timetable block(s) placed · {generationReport.kept} pinned lesson(s) kept · {generationReport.unplacedPeriods} periods remain unplaced across {generationReport.unplaced.length} block(s).</p>{generationReport.unplaced.length ? <p className="mt-1 text-xs font-semibold">Suggested next step: adjust a genuine constraint that blocks these placements, then preview again. Do not clear required off-time just to force a placement.</p> : null}{generationReport.previewOnly ? <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">{generationReport.preview.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : null}{generationReport.relaxed.length ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">{generationReport.relaxed.length} lesson(s) were placed by relaxing a soft preference</summary><ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">{generationReport.relaxed.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul></details> : null}
        {generationReport.unplaced.length ? <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">{generationReport.unplaced.map((item, index) => { const detail = generationReport.details[index]; return <li key={`${index}:${item}`} className="rounded-lg bg-white/70 p-2"><strong>{item}</strong><span className="mt-1 block">{detail?.advice ?? suggestedFix(item)}</span>{detail?.fixes.map((fix) => <button key={fix.label} type="button" className="mr-2 mt-1 rounded-md bg-navy px-3 py-1 font-semibold text-paper disabled:opacity-50" disabled={busy} onClick={() => applyIssueFix(fix)}>{fix.label}</button>)}</li>; })}</ul> : null}</div> : null}
      </div>

      <div className="rounded-xl border border-line bg-paper p-4">
        <h3 className="font-serif text-lg text-navy">Publish and versions</h3><p className="text-xs text-muted">Publishing saves a snapshot and shows this schedule to teachers and families. Unpublish to edit again.</p>
        <label className="mt-3 block text-xs font-semibold text-ink">Effective from<input className={inputClass + " mt-1"} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)}/></label>
        <div className="mt-3 flex flex-wrap gap-2">{state?.published ? <button className={btnGhost} type="button" disabled={busy} onClick={() => run(() => unpublishTimetable({ data: { yearId, termId } }), "Timetable unpublished and returned to draft mode.")}>Unpublish / edit draft</button> : <button className={btnClass} type="button" disabled={busy} onClick={publish}>Validate and publish</button>}</div>
        <h4 className="mt-4 text-sm font-bold text-navy">Saved versions</h4>
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2"><span className="min-w-0"><strong className="block truncate text-xs">{version.label}</strong><span className="text-[11px] text-muted">{new Date(version.createdAt).toLocaleString()}</span></span><button className="shrink-0 text-xs font-semibold text-info" type="button" disabled={busy || Boolean(state?.published)} onClick={() => restore(version.id, version.label)}>Restore</button></div>)}{!versions.length ? <p className="text-xs text-muted">No saved versions yet.</p> : null}</div>
      </div>
    </div>
  </section>;
}

function RoomRow({ room, busy, onEdit, onDelete }: { room: TimetableRoom; busy: boolean; onEdit: () => void; onDelete: () => void }) {
  return <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs"><span><strong>{room.name}</strong><span className="text-muted"> · {room.capacity || "capacity n/a"} · {room.roomType || "General"}{room.features ? ` · ${room.features}` : ""}</span></span><span className="flex gap-2"><button className="font-semibold text-info" type="button" disabled={busy} onClick={onEdit}>Edit</button><button className="font-semibold text-bad" type="button" disabled={busy} onClick={onDelete}>Remove</button></span></div>;
}
function AvailabilityRow({ item, ws, periods, busy, onDelete }: { item: TimetableAvailability; ws: Gate["ws"]; periods: Props["periods"]; busy: boolean; onDelete: () => void }) {
  const label = item.entityType === "teacher" ? ws.staff.find((person) => person.id === item.entityId)?.fullName : item.entityType === "grade" ? ws.grades.find((grade) => grade.id === item.entityId)?.name : item.entityType === "stream" ? ws.streams.find((stream) => stream.id === item.entityId)?.name : item.entityType === "subject" ? ws.subjects.find((subject) => subject.id === item.entityId)?.name : ws.timetableRooms.find((room) => room.id === item.entityId)?.name;
  const level = item.level === "avoid" ? "Avoid" : item.level === "prefer" ? "Prefer" : "Off";
  return <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs"><span><strong>{level} · {entityLabels[item.entityType]} · {label || "Unknown"}</strong><span className="block text-muted">{DAYS[item.dayOfWeek - 1]} · {periods.find((period) => period.id === item.periodId)?.label}{item.note ? ` · ${item.note}` : ""}</span></span><button className="font-semibold text-bad" type="button" disabled={busy} onClick={onDelete}>×</button></div>;
}
function RequirementRow({ item, ws, periods, scheduledPeriods, busy, onEdit, onDelete }: { item: TimetableRequirement; ws: Gate["ws"]; periods: TimetablePeriod[]; scheduledPeriods: number; busy: boolean; onEdit: () => void; onDelete: () => void }) {
  const grade = ws.grades.find((row) => row.id === item.gradeId)?.name ?? "Grade";
  const stream = item.streamId ? ws.streams.find((row) => row.id === item.streamId)?.name : "All streams";
  const subject = ws.subjects.find((row) => row.id === item.subjectId)?.shortName ?? "Subject";
  const teacher = ws.staff.find((row) => row.id === item.teacherUserId)?.fullName ?? "Teacher";
  const matchingEntries = ws.timetableEntries.filter((entry) => entry.yearId === item.yearId && entry.termId === item.termId && entry.gradeId === item.gradeId && entry.streamId === item.streamId && entry.subjectId === item.subjectId && entry.teacherUserId === item.teacherUserId);
  const multiPeriodBlocks = matchingEntries.filter((entry) => coveredPeriodIds(entry, periods).length > 1).length;
  const complete = scheduledPeriods === item.lessonsPerWeek;
  const timing = item.timingPreference === "before_break" ? " · before break" : item.timingPreference === "before_lunch" ? " · before lunch" : "";
  const double = item.preferredDoubleDay ? ` · double ${DAYS[item.preferredDoubleDay - 1]}` : "";
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs"><span><strong>{grade} · {stream} · {subject}</strong><span className="block text-muted">{teacher} · target {item.lessonsPerWeek} periods/week · {matchingEntries.length} block(s) scheduled · {multiPeriodBlocks} double/triple block(s){item.preferredRoom ? ` · ${item.preferredRoom}` : ""}{double}{timing}</span><span className={`mt-1 inline-block rounded-full px-2 py-0.5 font-semibold ${complete ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{scheduledPeriods}/{item.lessonsPerWeek} covered periods{complete ? " · target met" : " · needs review"}</span></span><span className="flex gap-2"><button className="font-semibold text-info" type="button" disabled={busy} onClick={onEdit}>Edit</button><button className="font-semibold text-bad" type="button" disabled={busy} onClick={onDelete}>×</button></span></div>;
}

function SubjectRuleRow({ subject, saved, busy, onSave }: { subject: Subject; saved?: SubjectConstraint; busy: boolean; onSave: (draft: { maxPerDay: number; minDaysPerWeek: number; noAfternoon: boolean; preferredMorning: boolean; avoidConsecutiveDays: boolean; noLastPeriod: boolean; complexity: number; placeInOrder: boolean }) => void }) {
  const maths = isMaths(subject);
  const [maxPerDay, setMaxPerDay] = useState(String(saved?.maxPerDay ?? (maths ? 1 : 2)));
  const [minDays, setMinDays] = useState(String(saved?.minDaysPerWeek ?? 1));
  const [noAfternoon, setNoAfternoon] = useState(saved ? saved.noAfternoon : maths);
  const [preferredMorning, setPreferredMorning] = useState(saved ? saved.preferredMorning : maths);
  const [spread, setSpread] = useState(Boolean(saved?.avoidConsecutiveDays));
  const [noLast, setNoLast] = useState(Boolean(saved?.noLastPeriod));
  const [placeInOrder, setPlaceInOrder] = useState(saved ? saved.placeInOrder : true);
  const [complexity, setComplexity] = useState(String(saved?.complexity ?? (maths ? 2 : 1)));
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-white px-3 py-2 text-xs">
    <strong className="min-w-[7rem]">{subject.shortName || subject.name}</strong>
    <label className="flex items-center gap-1">max/day <input className="w-12 rounded border px-1" type="number" min="1" max="8" value={maxPerDay} onChange={(event) => setMaxPerDay(event.target.value)} /></label>
    <label className="flex items-center gap-1">min days <input className="w-12 rounded border px-1" type="number" min="1" max="5" value={minDays} onChange={(event) => setMinDays(event.target.value)} /></label>
    <label className="flex items-center gap-1"><input type="checkbox" checked={noAfternoon} onChange={(event) => setNoAfternoon(event.target.checked)} /> no afternoon</label>
    <label className="flex items-center gap-1"><input type="checkbox" checked={preferredMorning} onChange={(event) => setPreferredMorning(event.target.checked)} /> prefer morning</label>
    <label className="flex items-center gap-1"><input type="checkbox" checked={spread} onChange={(event) => setSpread(event.target.checked)} /> spread days</label>
    <label className="flex items-center gap-1"><input type="checkbox" checked={noLast} onChange={(event) => setNoLast(event.target.checked)} /> no last period</label>
    <label className="flex items-center gap-1"><input type="checkbox" checked={placeInOrder} onChange={(event) => setPlaceInOrder(event.target.checked)} /> place in order</label>
    <label className="flex items-center gap-1">weight <input className="w-12 rounded border px-1" type="number" min="1" max="3" value={complexity} onChange={(event) => setComplexity(event.target.value)} /></label>
    <button type="button" className="ml-auto font-semibold text-info" disabled={busy} onClick={() => onSave({ maxPerDay: Number(maxPerDay), minDaysPerWeek: Number(minDays), noAfternoon, preferredMorning, avoidConsecutiveDays: spread, noLastPeriod: noLast, complexity: Number(complexity), placeInOrder })}>Save</button>
  </div>;
}

function TimeOffPainter({ periods, bell, options, entityType, onType, entityId, onEntity, existing, busy, onSave }: { periods: TimetablePeriod[]; bell: TimetablePeriod[]; options: ReadonlyArray<readonly [string, string]>; entityType: EntityType; onType: (type: EntityType) => void; entityId: string; onEntity: (id: string) => void; existing: TimetableAvailability[]; busy: boolean; onSave: (slots: Array<{ dayOfWeek: number; periodId: string; level: AvailabilityLevel }>, message: string, also?: string[]) => void | Promise<void> }) {
  const periodKey = periods.map((period) => period.id).join("|");
  const [quickDay, setQuickDay] = useState(1);
  const [slots, setSlots] = useState<AvailabilityMapCell[]>([]);
  const [brush, setBrush] = useState<AvailabilityLevel>("off");
  const [alsoIds, setAlsoIds] = useState<string[]>([]);
  const dragLevel = useRef<AvailabilityLevel | "" | null>(null);
  useEffect(() => { const stop = () => { dragLevel.current = null; }; window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop); return () => { window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); }; }, []);
  const baseline = useMemo(() => {
    const periodIds = new Set(periodKey ? periodKey.split("|") : []);
    return normalizeTimeOffSlots(existing.filter((item) => item.entityType === entityType && item.entityId === entityId && periodIds.has(item.periodId)).map((item) => ({ dayOfWeek: item.dayOfWeek, periodId: item.periodId, level: item.level === "avoid" || item.level === "prefer" ? item.level : "off" })));
  }, [existing, entityType, entityId, periodKey]);
  const canonical = (items: AvailabilityMapCell[]) => JSON.stringify(normalizeTimeOffSlots(items));
  const hasChanges = canonical(slots) !== canonical(baseline);
  useEffect(() => { setSlots(baseline); setAlsoIds([]); }, [baseline]);
  function levelAt(day: number, periodId: string) {
    return slots.find((slot) => slot.dayOfWeek === day && slot.periodId === periodId)?.level ?? "";
  }
  function commit(next: AvailabilityMapCell[]) {
    setSlots(normalizeTimeOffSlots(next));
  }
  function cycle(day: number, periodId: string) {
    const current = levelAt(day, periodId);
    const nextLevel = LEVEL_CYCLE[(LEVEL_CYCLE.indexOf(current) + 1) % LEVEL_CYCLE.length];
    const rest = slots.filter((slot) => !(slot.dayOfWeek === day && slot.periodId === periodId));
    commit(nextLevel ? [...rest, { dayOfWeek: day, periodId, level: nextLevel }] : rest);
  }
  function paintSet(periodIdsToPaint: string[], level: AvailabilityLevel) {
    const rest = slots.filter((slot) => !periodIdsToPaint.includes(slot.periodId));
    const added = [1, 2, 3, 4, 5].flatMap((day) => periodIdsToPaint.map((periodId) => ({ dayOfWeek: day, periodId, level })));
    commit([...rest, ...added]);
  }
  function paintDay(day: number, level: AvailabilityLevel | "") {
    const rest = slots.filter((slot) => slot.dayOfWeek !== day);
    commit(level ? [...rest, ...periods.map((period) => ({ dayOfWeek: day, periodId: period.id, level }))] : rest);
  }
  function setCell(day: number, periodId: string, level: AvailabilityLevel | "") {
    setSlots((current) => normalizeTimeOffSlots([...current.filter((slot) => !(slot.dayOfWeek === day && slot.periodId === periodId)), ...(level ? [{ dayOfWeek: day, periodId, level }] : [])]));
  }
  function startPaint(day: number, periodId: string) {
    const target = levelAt(day, periodId) === brush ? "" : brush;
    dragLevel.current = target;
    setCell(day, periodId, target);
  }
  function togglePeriodRow(periodId: string) {
    const all = [1, 2, 3, 4, 5].every((day) => levelAt(day, periodId) === brush);
    setSlots((current) => normalizeTimeOffSlots([...current.filter((slot) => slot.periodId !== periodId), ...(all ? [] : [1, 2, 3, 4, 5].map((day) => ({ dayOfWeek: day, periodId, level: brush })))]));
  }
  function toggleDayColumn(day: number) {
    const all = periods.every((period) => levelAt(day, period.id) === brush);
    setSlots((current) => normalizeTimeOffSlots([...current.filter((slot) => slot.dayOfWeek !== day), ...(all ? [] : periods.map((period) => ({ dayOfWeek: day, periodId: period.id, level: brush })))]));
  }
  const tone = (level: string) => level === "off" ? "bg-red-200 text-red-950" : level === "avoid" ? "bg-amber-100 text-amber-950" : level === "prefer" ? "bg-emerald-100 text-emerald-950" : "bg-white text-muted";
  const label = (level: string) => level === "off" ? "Off" : level === "avoid" ? "Avoid" : level === "prefer" ? "Prefer" : "·";
  return <div className="mt-3">
    <div className="grid gap-2 sm:grid-cols-2"><select className={inputClass} value={entityType} onChange={(event) => onType(event.target.value as EntityType)} aria-label="Time-off resource type">{Object.entries(entityLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select><select className={inputClass} value={entityId} onChange={(event) => onEntity(event.target.value)} aria-label="Choose time-off resource"><option value="">Choose {entityLabels[entityType].toLowerCase()}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
    <div className="mt-2 flex flex-wrap items-end gap-2"><button className={btnGhost} type="button" disabled={busy || !entityId} onClick={() => paintSet(afternoonPeriodIds(bell), "off")}>Afternoons off · all weekdays</button><button className={btnGhost} type="button" disabled={busy || !entityId || !periods.length} onClick={() => paintSet([periods[periods.length - 1].id], "off")}>Last lesson off · all weekdays</button><label className="text-xs text-muted">Quick day<select className={inputClass + " mt-1"} value={quickDay} onChange={(event) => setQuickDay(Number(event.target.value))}>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label><button className={btnGhost} type="button" disabled={busy || !entityId} onClick={() => paintDay(quickDay, "off")}>Mark whole day off</button><button className={btnGhost} type="button" disabled={busy || !entityId} onClick={() => paintDay(quickDay, "")}>Clear that day</button><button className={btnGhost} type="button" disabled={busy || !entityId} onClick={() => commit([])}>Clear map</button></div>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-navy">Brush:</span>{(["off", "avoid", "prefer"] as AvailabilityLevel[]).map((level) => <button key={level} type="button" className={`rounded-full border px-3 py-1 font-semibold ${brush === level ? (level === "off" ? "border-red-400 bg-red-200 text-red-950" : level === "avoid" ? "border-amber-400 bg-amber-100 text-amber-950" : "border-emerald-400 bg-emerald-100 text-emerald-950") : "border-line bg-white text-muted"}`} onClick={() => setBrush(level)}>{level === "off" ? "Off" : level === "avoid" ? "Avoid" : "Prefer"}</button>)}<span className="text-muted">Tap or drag across cells to paint with the brush; tap a painted cell to clear it. Tap a day name or a period name to paint the whole column or row.</span></div>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted">Presets:</span><button className={btnGhost} type="button" disabled={busy || !entityId} onClick={() => paintSet(periods.slice(0, Math.max(1, Math.ceil(periods.length / 2))).map((period) => period.id), brush)}>Mornings · all days</button><button className={btnGhost} type="button" disabled={busy || !entityId || !periods.length} onClick={() => paintSet([periods[0].id], brush)}>First lesson · all days</button><button className={btnGhost} type="button" disabled={busy || !entityId} onClick={() => commit(slots.filter((slot) => slot.dayOfWeek === 1).flatMap((slot) => [1, 2, 3, 4, 5].map((day) => ({ ...slot, dayOfWeek: day }))))}>Copy Monday to all days</button></div>
    {periods.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[28rem] border-collapse text-center text-[11px]"><thead><tr><th className="p-1" />{[1, 2, 3, 4, 5].map((day) => <th key={day} className="p-1"><button type="button" className="w-full rounded px-1 py-0.5 font-semibold text-info hover:bg-white" disabled={busy || !entityId} onClick={() => toggleDayColumn(day)}>{["Mo", "Tu", "We", "Th", "Fr"][day - 1]}</button></th>)}</tr></thead><tbody>{periods.map((period) => <tr key={period.id}><th className="p-1 text-left font-semibold"><button type="button" className="rounded px-1 text-left font-semibold text-info hover:bg-white" disabled={busy || !entityId} onClick={() => togglePeriodRow(period.id)}>{period.label}</button><span className="block font-normal text-muted">{period.startTime}</span></th>{[1, 2, 3, 4, 5].map((day) => { const level = levelAt(day, period.id); return <td key={day} className="p-0.5"><button type="button" disabled={busy || !entityId} aria-label={`${DAYS[day - 1]} ${period.label}: ${label(level)}`} title={`${DAYS[day - 1]} · ${period.label} · ${label(level)}`} className={`h-8 w-full select-none rounded border border-line ${tone(level)}`} style={{ touchAction: "none" }} onPointerDown={(event) => { (event.target as Element).releasePointerCapture?.(event.pointerId); startPaint(day, period.id); }} onPointerEnter={() => { if (dragLevel.current !== null) setCell(day, period.id, dragLevel.current); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cycle(day, period.id); } }}>{label(level)}</button></td>; })}</tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-muted">Add lesson columns, or use the Mukuyu bell, before painting off-time.</p>}
    {entityId && options.length > 1 ? <details className="mt-3 rounded-lg border border-line bg-white px-3 py-2 text-xs"><summary className="cursor-pointer font-semibold text-navy">Also give the same time-off to other {entityLabels[entityType].toLowerCase()}s{alsoIds.length ? ` · ${alsoIds.length} chosen` : ""}</summary><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{options.filter(([id]) => id !== entityId).map(([id, name]) => <label key={id} className="flex items-center gap-1"><input type="checkbox" checked={alsoIds.includes(id)} onChange={(event) => setAlsoIds(event.target.checked ? [...alsoIds, id] : alsoIds.filter((item) => item !== id))} />{name}</label>)}</div></details> : null}
    <div className="mt-3 flex items-center gap-2"><button className={btnClass} type="button" disabled={busy || !entityId || !hasChanges} onClick={() => onSave(normalizeTimeOffSlots(slots), alsoIds.length ? `Time-off map saved for ${alsoIds.length + 1} ${entityLabels[entityType].toLowerCase()}s.` : "Time-off map saved.", alsoIds)}>Save time-off map{alsoIds.length ? ` (+${alsoIds.length} more)` : ""}</button><button className={btnGhost} type="button" disabled={busy || !hasChanges} onClick={() => setSlots(baseline)}>Discard changes</button><span className="text-xs text-muted">{hasChanges ? "Unsaved map changes" : "Map is up to date"}</span></div>
  </div>;
}
