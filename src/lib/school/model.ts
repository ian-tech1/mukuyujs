import type { RoleAccessPolicy } from "@/lib/school/role-access";
import { canActorAccess } from "@/lib/school/role-access";
export { reportLink } from "./report-link.ts";

export type Role = "super_admin" | "admin" | "teacher" | "parent" | "student";

export const PORTAL_BACKDROP_THEME_IDS = [
  "auto-sections", "starfall", "nature-cycle",
] as const;
export type PortalBackdropThemeId = typeof PORTAL_BACKDROP_THEME_IDS[number];

export type AppearancePalette = {
  navy: string;
  navy2: string;
  brass: string;
  brassSoft: string;
  paper: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  good: string;
  warn: string;
  bad: string;
  info: string;
  backdropTheme?: PortalBackdropThemeId;
  autoTextContrast?: boolean;
  textColorCycle?: boolean;
};

export const DEFAULT_APPEARANCE: AppearancePalette = {
  navy: "#0e2a4a",
  navy2: "#16385f",
  brass: "#9a7430",
  brassSoft: "#f3e6c4",
  paper: "#f4f0e6",
  card: "#fffcf7",
  ink: "#1c1915",
  muted: "#6b6258",
  line: "#e3dac8",
  good: "#1f7a4d",
  warn: "#9a5410",
  bad: "#9f2d2d",
  info: "#1d4e89",
  autoTextContrast: true,
  textColorCycle: true,
};

export type Profile = {
  name: string;
  poBox: string;
  mission: string;
  vision: string;
  motto: string;
  headTeacher: string;
  dos: string;
  location: string;
  contact: string;
  email: string;
  academicYear: string;
  termName: string;
  reportTitle: string;
  closingDate: string;
  resumptionDate: string;
  catNote: string;
  requirements: string;
  greeting: string;
  homeNote: string;
  publicBaseUrl: string;
  logoData: string;
  activeYearId: string;
  activeTermId: string;
  showQr: boolean;
  showChart: boolean;
  showRemarks: boolean;
  showPositions: boolean;
  reportExamCount: number;
  showTeacherInitials: boolean;
  showSubjectTeacherInitials: boolean;
  showSubjectRank: boolean;
  showSubjectSpotlight: boolean;
  showPreviousTerm: boolean;
  showAttendance: boolean;
  showCustomRemarks: boolean;
  term1Color?: string;
  term2Color?: string;
  term3Color?: string;
  whatsappGroupEnabled: boolean;
  whatsappGroupUrl: string;
  whatsappGroupLabel: string;
};

export type Grade = { id: string; name: string; level: number; reportTitle: string };
export type Stream = {
  id: string;
  gradeId: string;
  name: string;
  classTeacherLabel: string;
  classTeacherInitials?: string;
  sort: number;
};
export type Subject = { id: string; name: string; shortName: string; sort: number };
export type Exam = { id: string; name: string; code: string; sort: number };
export type Band = {
  minScore: number;
  code: string;
  points: number;
  subjectRemark: string;
  headRemark: string;
  classRemark: string;
};
export type Learner = {
  id: string;
  roll: number;
  fullName: string;
  gender: string;
  gradeId: string;
  streamId: string;
  status: string;
  publicCode: string;
  admissionNumber: string | null;
  cohortYear: string;
};
export type MarkControl = {
  yearId: string; termId: string; examId: string; entryAllowed: boolean; editAllowed: boolean; reason: string;
  deadlineAt?: string | null; adminsCanEnter?: boolean; subjectTeachersCanEnter?: boolean; classTeachersCanEnter?: boolean;
  classTeachersAllSubjects?: boolean; adminsCanViewMarks?: boolean; subjectTeachersCanViewMarks?: boolean; classTeachersCanViewMarks?: boolean;
  adminsCanEditLocked?: boolean; subjectTeachersCanEditLocked?: boolean; classTeachersCanEditLocked?: boolean;
  updatedBy?: string | null; updatedAt?: string | null;
};
export type Placement = { learnerId: string; yearId: string; gradeId: string; streamId: string };
export type Mark = { learnerId: string; subjectId: string; examId: string; score: number; yearId: string; termId: string; gradeId?: string; streamId?: string; status?: string; updatedAt?: string; updatedBy?: string | null; updatedByName?: string | null };
export type Year = { id: string; name: string; sort: number };
export type Term = { id: string; name: string; sort: number };
export type TermAssessment = { yearId: string; termId: string; examId: string; active: boolean };
export type TermDate = {
  yearId: string;
  termId: string;
  closingDate: string;
  openingDate: string;
  reportTitle: string;
  requirements: string;
};
export type Assignment = {
  id: string;
  userId: string;
  kind: "class_teacher" | "subject_teacher" | "hod" | string;
  gradeId: string | null;
  streamId: string | null;
  subjectId: string | null;
};
export type SubjectTeacherSlot = {
  subjectId: string;
  gradeId: string | null;
  streamId: string | null;
  initials: string;
};
export type TimetablePeriod = { id: string; yearId: string; termId: string; label: string; startTime: string; endTime: string; sort: number; isBreak: boolean };
export type TimetableEntry = {
  locked?: boolean;
  id: string;
  yearId: string;
  termId: string;
  dayOfWeek: number;
  periodId: string;
  gradeId: string;
  streamId: string | null;
  subjectId: string;
  teacherUserId: string;
  teacherName: string;
  teacherInitials?: string;
  teacherEmail: string;
  room: string;
  notes: string;
  blockLength: number;
};
export type TimetableRoom = { id: string; name: string; capacity: number; roomType: string; features: string; active: boolean };
export type AvailabilityLevel = "off" | "avoid" | "prefer";
export type TimetableAvailability = { id: string; yearId: string; termId: string; entityType: "teacher" | "grade" | "stream" | "room" | "subject"; entityId: string; dayOfWeek: number; periodId: string; available: boolean; level: AvailabilityLevel; note: string };
export type TimetableRequirement = { id: string; yearId: string; termId: string; gradeId: string; streamId: string | null; subjectId: string; teacherUserId: string; lessonsPerWeek: number; blockLength: number; preferredRoom: string; distribution: string; preferredDoubleDay: number | null; timingPreference: "none" | "before_break" | "before_lunch" };
export type SubjectConstraint = { id: string; yearId: string; termId: string; subjectId: string; maxPerDay: number; minDaysPerWeek: number; noAfternoon: boolean; preferredMorning: boolean; avoidConsecutiveDays: boolean; noLastPeriod: boolean; complexity: number; placeInOrder: boolean; distribution: string; color: string; notes: string; doubleCount: number | null; maxBeforeBreak: number };
export type TeacherContract = { id: string; yearId: string; termId: string; teacherUserId: string; minPerDay: number; maxPerDay: number; maxPerWeek: number; maxConsecutive: number; maxDays: number; maxWindows: number; minRestPeriods: number };
export type ClassConstraint = { id: string; yearId: string; termId: string; gradeId: string; streamId: string | null; maxPerDay: number; noGaps: boolean };
export type LessonRelation = { id: string; yearId: string; termId: string; gradeId: string; streamId: string | null; leftSubjectId: string; rightSubjectId: string; relation: "before" | "same_day" | "different_day" | "not_consecutive" };
export type TimetableVersion = { id: string; yearId: string; termId: string; label: string; createdAt: string; createdBy: string | null };
export type TimetableState = { yearId: string; termId: string; published: boolean; effectiveFrom: string | null; publishedAt: string | null };
export type TermNote = {
  learnerId: string;
  yearId: string;
  termId: string;
  daysPresent: number | null;
  daysExpected: number | null;
  conduct: string;
  comment: string;
};
export type SubjectRemark = {
  learnerId: string;
  subjectId: string;
  yearId: string;
  termId: string;
  remark: string;
};
export type ReportExtras = {
  initials: Record<string, string>;
  previousMean: number | null;
  termNote: TermNote | null;
  customRemarks: Record<string, string>;
};
export type Me = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword?: boolean;
  learnerId: string | null;
  active: boolean;
  privSettings: boolean;
  privStaff: boolean;
  privImport: boolean;
  privCalendar: boolean;
  isDeputy: boolean;
  delegatedResponsibilities?: string[];
};
export type StaffMember = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  initials: string | null;
  canViewOtherSubjects: boolean;
  canEditOtherSubjects: boolean;
  learnerId: string | null;
  privSettings: boolean;
  privStaff: boolean;
  privImport: boolean;
  privCalendar: boolean;
  isDeputy: boolean;
  delegatedResponsibilities?: string[];
};
export type MailItem = {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: string;
};

export type Workspace = {
  me: Me;
  roleAccess: RoleAccessPolicy;
  profile: Profile;
  grades: Grade[];
  streams: Stream[];
  subjects: Subject[];
  exams: Exam[];
  bands: Band[];
  years: Year[];
  terms: Term[];
  termAssessments: TermAssessment[];
  markControls: MarkControl[];
  calendars: TermDate[];
  learners: Learner[];
  placements: Placement[];
  marks: Mark[];
  assignments: Assignment[];
  subjectTeacherSlots: SubjectTeacherSlot[];
  termNotes: TermNote[];
  subjectRemarks: SubjectRemark[];
  timetablePeriods: TimetablePeriod[];
  timetableEntries: TimetableEntry[];
  timetableRooms: TimetableRoom[];
  timetableAvailability: TimetableAvailability[];
  timetableRequirements: TimetableRequirement[];
  subjectConstraints: SubjectConstraint[];
  teacherContracts: TeacherContract[];
  classConstraints: ClassConstraint[];
  lessonRelations: LessonRelation[];
  timetableVersions: TimetableVersion[];
  timetableStates: TimetableState[];
  timetableAdminsCanEdit: boolean;
  timetableStaffAssignmentsEnabled: boolean;
  staff: StaffMember[];
  childIds: string[];
  familyReports: Decorated[] | null;
};

export type SubjectCell = {
  subjectId: string;
  byExam: Record<string, number | null>;
  avg: number | null;
  points: number | null;
  level: string | null;
  remark: string | null;
};

export type LearnerBoard = {
  learner: Learner;
  cells: SubjectCell[];
  totals: Record<string, number>;
  means: Record<string, number | null>;
  avgTotal: number | null;
  avgMean: number | null;
  totalPoints: number | null;
  level: string | null;
  levelPoints: number | null;
  headRemark: string | null;
  classRemark: string | null;
};

export type RankSlot = { position: number | null; outOf: number };

export type Decorated = LearnerBoard & {
  overall: RankSlot;
  byExam: Record<string, RankSlot>;
  streamByExam: Record<string, RankSlot & { label: string }>;
  genderByExam: Record<string, RankSlot & { label: string }>;
  subjectRanks: Record<string, RankSlot>;
};

export function isAdmin(role: string) {
  return role === "super_admin" || role === "admin";
}

export function canManageTimetable(me: Pick<Me, "role" | "isDeputy">) {
  return me.role === "super_admin" || (me.role === "admin" && me.isDeputy);
}

export function can(me: Me, privilege: "settings" | "staff" | "import" | "calendar") {
  if (!me.active) return false;
  if (me.role === "super_admin") return true;
  if (me.isDeputy) return (me.delegatedResponsibilities ?? ["settings", "staff", "import", "calendar"]).includes(privilege);
  if (me.role !== "admin") return false;
  if (privilege === "settings") return me.privSettings;
  if (privilege === "staff") return me.privStaff;
  if (privilege === "import") return me.privImport;
  return me.privCalendar;
}

export function periodMarks(marks: Mark[], yearId: string, termId: string) {
  return marks.filter((mark) => mark.yearId === yearId && mark.termId === termId);
}

export function calendarFor(calendars: TermDate[], yearId: string, termId: string) {
  return calendars.find((row) => row.yearId === yearId && row.termId === termId) ?? null;
}

export function bandFor(score: number, bands: Band[]): Band | null {
  if (!bands.length || Number.isNaN(score)) return null;
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  for (const band of sorted) if (score + 1e-9 >= band.minScore) return band;
  return sorted[sorted.length - 1] ?? null;
}

export function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

export function genderWord(gender: string) {
  return gender === "FEMALE" ? "GIRLS" : "BOYS";
}

export function meanOf(values: Array<number | null | undefined>) {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function buildBoards(
  learners: Learner[],
  marks: Mark[],
  subjects: Subject[],
  exams: Exam[],
  bands: Band[],
): LearnerBoard[] {
  const index = new Map<string, number>();
  for (const mark of marks) index.set(`${mark.learnerId}|${mark.subjectId}|${mark.examId}`, mark.score);
  const orderedSubjects = [...subjects].sort((a, b) => a.sort - b.sort);
  const orderedExams = [...exams].sort((a, b) => a.sort - b.sort);

  return learners.map((learner) => {
    const cells: SubjectCell[] = orderedSubjects.map((subject) => {
      const byExam: Record<string, number | null> = {};
      for (const exam of orderedExams) {
        const score = index.get(`${learner.id}|${subject.id}|${exam.id}`);
        byExam[exam.id] = score == null ? null : score;
      }
      const avg = meanOf(orderedExams.map((exam) => byExam[exam.id]));
      const band = avg == null ? null : bandFor(avg, bands);
      return {
        subjectId: subject.id,
        byExam,
        avg,
        points: band?.points ?? null,
        level: band?.code ?? null,
        remark: band?.subjectRemark ?? null,
      };
    });

    const totals: Record<string, number> = {};
    const means: Record<string, number | null> = {};
    for (const exam of orderedExams) {
      const scores = cells.map((cell) => cell.byExam[exam.id]).filter((v): v is number => v != null);
      totals[exam.id] = scores.reduce((a, b) => a + b, 0);
      means[exam.id] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    }
    const avgs = cells.map((cell) => cell.avg).filter((v): v is number => v != null);
    const avgTotal = avgs.length ? avgs.reduce((a, b) => a + b, 0) : null;
    const avgMean = avgs.length ? avgTotal! / avgs.length : null;
    const pointValues = cells.map((cell) => cell.points).filter((v): v is number => v != null);
    const totalPoints = pointValues.length ? pointValues.reduce((a, b) => a + b, 0) : null;
    const overall = avgMean == null ? null : bandFor(avgMean, bands);
    return {
      learner,
      cells,
      totals,
      means,
      avgTotal,
      avgMean,
      totalPoints,
      level: overall?.code ?? null,
      levelPoints: overall?.points ?? null,
      headRemark: overall?.headRemark ?? null,
      classRemark: overall?.classRemark ?? null,
    };
  });
}

function rankMap(rows: Array<{ id: string; value: number | null }>) {
  const ranked = rows
    .filter((row): row is { id: string; value: number } => row.value != null)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const map = new Map<string, number>();
  let last = Number.NaN;
  let position = 0;
  ranked.forEach((row, index) => {
    if (row.value !== last) {
      position = index + 1;
      last = row.value;
    }
    map.set(row.id, position);
  });
  return map;
}

export function decorate(boards: LearnerBoard[], streams: Stream[], exams: Exam[]): Decorated[] {
  const overall = rankMap(boards.map((board) => ({ id: board.learner.id, value: board.avgMean })));
  const byExamMaps: Record<string, Map<string, number>> = {};
  for (const exam of exams) {
    byExamMaps[exam.id] = rankMap(boards.map((board) => ({ id: board.learner.id, value: board.means[exam.id] })));
  }
  const streamIds = [...new Set(boards.map((board) => board.learner.streamId))];
  const genders = [...new Set(boards.map((board) => board.learner.gender))];

  const streamExam = new Map<string, Map<string, number>>();
  const streamSize = new Map<string, number>();
  const subjectRank = new Map<string, Map<string, number>>();
  const subjectOut = new Map<string, number>();
  for (const streamId of streamIds) {
    const group = boards.filter((board) => board.learner.streamId === streamId);
    streamSize.set(streamId, group.length);
    for (const exam of exams) {
      streamExam.set(
        `${streamId}|${exam.id}`,
        rankMap(group.map((board) => ({ id: board.learner.id, value: board.means[exam.id] }))),
      );
    }
    streamExam.set(
      `${streamId}|avg`,
      rankMap(group.map((board) => ({ id: board.learner.id, value: board.avgMean }))),
    );
    const subjectIds = [...new Set(group.flatMap((board) => board.cells.map((cell) => cell.subjectId)))];
    for (const subjectId of subjectIds) {
      subjectRank.set(
        `${streamId}|${subjectId}`,
        rankMap(group.map((board) => ({
          id: board.learner.id,
          value: board.cells.find((cell) => cell.subjectId === subjectId)?.avg ?? null,
        }))),
      );
      subjectOut.set(
        `${streamId}|${subjectId}`,
        group.filter((board) => board.cells.find((cell) => cell.subjectId === subjectId)?.avg != null).length,
      );
    }
  }

  const genderExam = new Map<string, Map<string, number>>();
  const genderSize = new Map<string, number>();
  for (const gender of genders) {
    const group = boards.filter((board) => board.learner.gender === gender);
    genderSize.set(gender, group.length);
    for (const exam of exams) {
      genderExam.set(
        `${gender}|${exam.id}`,
        rankMap(group.map((board) => ({ id: board.learner.id, value: board.means[exam.id] }))),
      );
    }
  }

  const streamName = (id: string) => streams.find((stream) => stream.id === id)?.name ?? id;

  return boards.map((board) => {
    const streamId = board.learner.streamId;
    const streamByExam: Decorated["streamByExam"] = {};
    const genderByExam: Decorated["genderByExam"] = {};
    for (const exam of exams) {
      const sMap = streamExam.get(`${streamId}|${exam.id}`);
      streamByExam[exam.id] = {
        position: sMap?.get(board.learner.id) ?? null,
        outOf: streamSize.get(streamId) ?? 0,
        label: `${streamName(streamId)} ${exam.name}`,
      };
      const gMap = genderExam.get(`${board.learner.gender}|${exam.id}`);
      genderByExam[exam.id] = {
        position: gMap?.get(board.learner.id) ?? null,
        outOf: genderSize.get(board.learner.gender) ?? 0,
        label: genderWord(board.learner.gender),
      };
    }
    return {
      ...board,
      overall: { position: overall.get(board.learner.id) ?? null, outOf: boards.length },
      byExam: Object.fromEntries(
        exams.map((exam) => [
          exam.id,
          { position: byExamMaps[exam.id]?.get(board.learner.id) ?? null, outOf: boards.length },
        ]),
      ),
      streamByExam,
      genderByExam,
      subjectRanks: Object.fromEntries(
        board.cells.map((cell) => {
          const map = subjectRank.get(`${streamId}|${cell.subjectId}`);
          return [cell.subjectId, { position: map?.get(board.learner.id) ?? null, outOf: subjectOut.get(`${streamId}|${cell.subjectId}`) ?? 0 }];
        }),
      ),
    };
  });
}

export function sortByPerformance(rows: Decorated[]) {
  return [...rows].sort((a, b) => {
    const av = a.avgMean ?? -1;
    const bv = b.avgMean ?? -1;
    if (bv !== av) return bv - av;
    return a.learner.roll - b.learner.roll;
  });
}

export function sortByRoll<T extends { learner: Learner }>(rows: T[]) {
  return [...rows].sort((a, b) => a.learner.roll - b.learner.roll || a.learner.fullName.localeCompare(b.learner.fullName));
}

export function canEditMark(me: Me, assignments: Assignment[], learner: Learner, subjectId: string) {
  if (!me.active) return false;
  if (isAdmin(me.role)) return true;
  if (me.role !== "teacher") return false;
  return assignments.some((assignment) => {
    if (assignment.userId !== me.id) return false;
    if (assignment.kind === "dos") {
      if (assignment.gradeId && assignment.gradeId !== learner.gradeId) return false;
      if (assignment.streamId && assignment.streamId !== learner.streamId) return false;
      return true;
    }
    if (assignment.kind === "class_teacher" && assignment.streamId === learner.streamId) return true;
    if (assignment.kind !== "subject_teacher" && assignment.kind !== "hod") return false;
    if (assignment.subjectId && assignment.subjectId !== subjectId) return false;
    if (assignment.gradeId && assignment.gradeId !== learner.gradeId) return false;
    if (assignment.streamId && assignment.streamId !== learner.streamId) return false;
    return Boolean(assignment.subjectId);
  });
}

export function canEditLearner(me: Me, assignments: Assignment[], streamId: string) {
  if (!me.active) return false;
  if (isAdmin(me.role)) return true;
  if (me.role !== "teacher") return false;
  return assignments.some((assignment) => {
    if (assignment.userId !== me.id) return false;
    if (assignment.kind === "class_teacher") return assignment.streamId === streamId;
    if (assignment.kind === "dos") return !assignment.streamId || assignment.streamId === streamId;
    return false;
  });
}

export function visibleViews(me: Me, policy: RoleAccessPolicy): string[] {
  if (me.role === "student" || me.role === "parent") return [...(canActorAccess(policy, me.role, "familyResults", "view") ? ["results"] : []), "timetable", "services", "settings"];
  const views = me.role === "teacher" ? ["home", "learners", "marks", "timetable", "services", "parent-feedback"] : ["home", "learners", "marks", "timetable", "services", "parent-feedback"];
  if (canActorAccess(policy, me.role, "analysis", "view")) views.push("analysis");
  if (canActorAccess(policy, me.role, "reports", "view")) views.push("reports");
  if (canActorAccess(policy, me.role, "marklists", "view")) views.push("marklists");
  if (me.role === "super_admin" || (me.isDeputy && (me.delegatedResponsibilities ?? ["settings", "staff", "import", "calendar"]).includes("staff")) || (me.role === "admin" && me.privStaff)) views.push("staff");
  if (me.role === "super_admin" || me.isDeputy) views.push("mail");
  views.push("settings");
  return views;
}

export function levelTone(code: string | null) {
  if (!code) return "muted";
  if (code.startsWith("EE")) return "good";
  if (code.startsWith("ME")) return "info";
  if (code.startsWith("AE")) return "warn";
  return "bad";
}

/**
 * Learners placed in the class they were in during `yearId`, so a promoted learner still shows
 * (with their results) under their old grade and stream for that year, and a new intake only
 * appears in its own year. Mirrors `learnersAtYear` on the server.
 */
export function learnersForYear(ws: Pick<Workspace, "learners" | "placements" | "marks" | "years" | "grades" | "profile">, yearId: string): Learner[] {
  const sortOf = (id: string) => ws.years.find((year) => year.id === id)?.sort ?? 0;
  const isPast = sortOf(yearId) < sortOf(ws.profile.activeYearId);
  const levelOf = (id: string | undefined) => ws.grades.find((grade) => grade.id === id)?.level ?? 0;
  const saved = new Map<string, Placement>();
  for (const row of ws.placements) if (row.yearId === yearId) saved.set(row.learnerId, row);
  const stamped = new Map<string, { gradeId: string; streamId: string }>();
  for (const mark of ws.marks) {
    if (mark.yearId === yearId && mark.gradeId && mark.streamId && !stamped.has(mark.learnerId)) stamped.set(mark.learnerId, { gradeId: mark.gradeId, streamId: mark.streamId });
  }
  const out: Learner[] = [];
  for (const learner of ws.learners) {
    const row = saved.get(learner.id);
    const mk = stamped.get(learner.id);
    if (row) out.push({ ...learner, gradeId: row.gradeId, streamId: row.streamId });
    else if (mk && (isPast || levelOf(mk.gradeId) < levelOf(learner.gradeId))) out.push({ ...learner, gradeId: mk.gradeId, streamId: mk.streamId });
    // Only the active year may fall back to a learner's live class. Future years must have
    // an explicit placement or year-stamped marks; otherwise learners leak into future cohorts.
    else if (!isPast && yearId === ws.profile.activeYearId) out.push(learner);
  }
  return out;
}

/** The lock settings for one year, term and CAT (everything is open when nothing is saved). */
export function markControlFor(ws: Pick<Workspace, "markControls">, yearId: string, termId: string, examId: string) {
  return ws.markControls.find((row) => row.yearId === yearId && row.termId === termId && row.examId === examId) ?? {
    yearId, termId, examId, entryAllowed: true, editAllowed: true, reason: "", deadlineAt: null,
    adminsCanEnter: true, subjectTeachersCanEnter: true, classTeachersCanEnter: true, classTeachersAllSubjects: true,
    adminsCanViewMarks: true, subjectTeachersCanViewMarks: true, classTeachersCanViewMarks: true,
    adminsCanEditLocked: false, subjectTeachersCanEditLocked: false, classTeachersCanEditLocked: false,
  };
}

function assignmentMatches(assignment: Assignment, me: Me, learner: Pick<Learner, "gradeId" | "streamId">, subjectId: string) {
  if (assignment.userId !== me.id) return false;
  if (assignment.gradeId && assignment.gradeId !== learner.gradeId) return false;
  if (assignment.streamId && assignment.streamId !== learner.streamId) return false;
  if (assignment.kind === "class_teacher") return assignment.streamId === learner.streamId;
  if (assignment.kind === "dos") return true;
  return (assignment.kind === "subject_teacher" || assignment.kind === "hod") && assignment.subjectId === subjectId;
}

export function canEnterMark(me: Me, assignments: Assignment[], learner: Learner, subjectId: string, control: MarkControl, locked = false) {
  if (!me.active) return false;
  if (me.role === "super_admin" || me.isDeputy) return true;
  if (me.role === "admin") return locked ? Boolean(control.adminsCanEditLocked) : control.adminsCanEnter !== false;
  if (me.role !== "teacher") return false;
  const subjectAssigned = assignments.some((assignment) => assignmentMatches(assignment, me, learner, subjectId) && (assignment.kind === "subject_teacher" || assignment.kind === "hod"));
  const classAssigned = assignments.some((assignment) => assignmentMatches(assignment, me, learner, subjectId) && assignment.kind === "class_teacher");
  const dosAssigned = assignments.some((assignment) => assignmentMatches(assignment, me, learner, subjectId) && assignment.kind === "dos");
  if (locked) return Boolean((subjectAssigned && control.subjectTeachersCanEditLocked) || (classAssigned && control.classTeachersCanEditLocked));
  if (subjectAssigned && control.subjectTeachersCanEnter !== false) return true;
  if (classAssigned && control.classTeachersCanEnter !== false && control.classTeachersAllSubjects !== false) return true;
  return dosAssigned;
}

export function canViewMark(me: Me, assignments: Assignment[], mark: Mark, control: MarkControl) {
  if (!me.active) return false;
  if (me.role === "super_admin" || me.isDeputy) return true;
  if (me.role === "admin") return control.adminsCanViewMarks !== false;
  if (me.role !== "teacher") return true;
  const learnerScope = { gradeId: mark.gradeId ?? "", streamId: mark.streamId ?? "" };
  const subjectAssigned = assignments.some((assignment) => assignmentMatches(assignment, me, learnerScope, mark.subjectId) && (assignment.kind === "subject_teacher" || assignment.kind === "hod"));
  const classAssigned = assignments.some((assignment) => assignmentMatches(assignment, me, learnerScope, mark.subjectId) && assignment.kind === "class_teacher");
  const dosAssigned = assignments.some((assignment) => assignmentMatches(assignment, me, learnerScope, mark.subjectId) && assignment.kind === "dos");
  return Boolean((subjectAssigned && control.subjectTeachersCanViewMarks !== false) || (classAssigned && control.classTeachersCanViewMarks !== false) || dosAssigned);
}
