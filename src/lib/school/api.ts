import { createServerFn } from "@tanstack/react-start";
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import type { AppearancePalette, Assignment, AvailabilityLevel, Band, ClassConstraint, Decorated, Exam, Grade, Learner, LessonRelation, MailItem, Mark, MarkControl, Me, Placement, Profile, ReportExtras, Role, StaffMember, Stream, Subject, SubjectConstraint, SubjectRemark, SubjectTeacherSlot, TeacherContract, TermAssessment, TermNote, TimetableAvailability, TimetableEntry, TimetablePeriod, TimetableRequirement, TimetableRoom, TimetableState, TimetableVersion, Workspace } from "@/lib/school/model";
import { DEFAULT_APPEARANCE, isAdmin, buildBoards, decorate, can, canEditLearner, canEditMark, canManageTimetable } from "@/lib/school/model";
import { initialsForSubject, meanForPeriod, previousPeriod } from "@/lib/school/extras";
import { canReadPortalMusic, isSupportedMusicSource, normalizeMusicAttribution, normalizeMusicOptions } from "@/lib/school/music";
import { DEFAULT_WELCOME_DISPLAY, normalizeWelcomeDisplay, type WelcomeDisplayOptions } from "@/lib/school/welcome-display";
import { normalizeSpotifyTrackResults, spotifyTrackSearchUrl } from "@/lib/school/spotify";
import { jamendoSearchUrl, normalizeJamendoSearchResults } from "@/lib/school/music-catalogs/jamendo";
import { soundCloudSearchUrl, normalizeSoundCloudSearchResults } from "@/lib/school/music-catalogs/soundcloud";
import { internetArchiveGenreSearchUrl, internetArchiveSearchUrl, normalizeInternetArchiveResults, safeInternetArchiveFileUrl } from "@/lib/school/music-catalogs/internet-archive";
import { normalizeYouTubeSearchResults, youtubeSearchUrl } from "@/lib/school/music-catalogs/youtube";
import type { MusicCatalogProvider, MusicCatalogResult } from "@/lib/school/music-catalogs/types";
import { applyDoubleRule, auditTimetable, distributionWithDoubleDay, generateTimetableDraft as buildTimetableDraft, isValidDistribution, parseDistribution, subtractLessonPeriods, type EngineAssignment, type EngineOptimizationProfile, type EnginePlacement, type EngineSubjectRule } from "@/lib/school/timetable-engine";
import { DEFAULT_ADMISSION_NUMBER_SETTINGS, normalizeAdmissionNumberSettings, validateAdmissionNumberSettings, type AdmissionNumberSettings } from "@/lib/school/admission-number";
import { DEFAULT_ROLE_ACCESS, normalizeRoleAccess, canActorAccess, type RoleAccessPolicy } from "@/lib/school/role-access";
import { normalizeReportCode, resolveReportCode } from "@/lib/school/report-code";

type SessionData = { userId: string; v: number };
let spotifyTokenCache: { accessToken: string; expiresAt: number } | null = null;
let soundCloudTokenCache: { accessToken: string; expiresAt: number } | null = null;

async function sessionApi() {
  // Read and validate the secret only when server-side session handling runs.
  // This module is also imported by client components, so a module-level check
  // incorrectly throws in the browser even when Vercel has SESSION_SECRET set.
  const secret = process.env.SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "mukuyu-local-preview-only-session-secret");
  if (!secret) throw new Error("SESSION_SECRET must be configured in production before the school portal can start.");

  const { deleteCookie, getCookie, setCookie } = await import("@tanstack/react-start/server");
  const cookieName = "mukuyu";
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 14 };
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const encode = (data: SessionData) => {
    const value = Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
    return `${value}.${sign(value)}`;
  };
  const decode = (raw: string | undefined): SessionData => {
    if (!raw) return { userId: "", v: 0 };
    const separator = raw.lastIndexOf(".");
    if (separator <= 0) return { userId: "", v: 0 };
    const value = raw.slice(0, separator);
    const signature = raw.slice(separator + 1);
    const expected = Buffer.from(sign(value));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { userId: "", v: 0 };
    try {
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SessionData>;
      if (typeof parsed.userId !== "string" || !Number.isFinite(Number(parsed.v))) return { userId: "", v: 0 };
      return { userId: parsed.userId, v: Number(parsed.v) };
    } catch {
      return { userId: "", v: 0 };
    }
  };
  let data = decode(getCookie(cookieName));
  return {
    get data() { return data; },
    async update(next: SessionData) { data = { userId: next.userId, v: Number(next.v) }; setCookie(cookieName, encode(data), cookieOptions); },
    async clear() { data = { userId: "", v: 0 }; deleteCookie(cookieName, cookieOptions); },
  };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}


function isTrueSuper(me: Me) {
  return me.role === "super_admin";
}
function isPowerful(me: Me) {
  return me.role === "super_admin" || (me.role === "admin" && me.isDeputy);
}

async function timetableAdminEditsAllowed() {
  const sql = await getSql();
  const rows = await sql<{ admins_can_edit: boolean }>`select admins_can_edit from timetable_admin_permissions where id = 1`;
  return Boolean(rows[0]?.admins_can_edit);
}

async function requireTimetableEditor(me: Me) {
  if (isPowerful(me)) return;
  if (me.role === "admin" && await timetableAdminEditsAllowed()) return;
  throw new Error("Timetable editing is disabled for admins by the super admin. Ask the super admin to allow timetable changes.");
}

function asRole(value: string): Role {
  if (value === "super_admin" || value === "admin" || value === "teacher" || value === "parent" || value === "student") return value;
  return "teacher";
}

async function readActor(): Promise<Me | null> {
  const session = await sessionApi();
  if (!session.data.userId) return null;
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    learner_id: string | null;
    active: boolean;
    session_version: number;
    priv_settings: boolean;
    priv_staff: boolean;
    priv_import: boolean;
    priv_calendar: boolean;
    is_deputy: boolean;
    delegated_responsibilities: string[];
  }>`select id, email, full_name, role, learner_id, active, session_version, priv_settings, priv_staff, priv_import, priv_calendar, is_deputy, delegated_responsibilities from users where id = ${session.data.userId}`;
  const row = rows[0];
  if (!row || !row.active || Number(row.session_version) !== Number(session.data.v)) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: asRole(row.role),
    learnerId: row.learner_id,
    active: row.active,
    privSettings: row.role === "super_admin" ? true : Boolean(row.priv_settings),
    privStaff: row.role === "super_admin" ? true : Boolean(row.priv_staff),
    privImport: row.role === "super_admin" ? true : Boolean(row.priv_import),
    privCalendar: row.role === "super_admin" ? true : Boolean(row.priv_calendar),
    isDeputy: row.role === "admin" && Boolean(row.is_deputy),
    delegatedResponsibilities: row.delegated_responsibilities ?? ["settings", "staff", "import", "calendar"],
  };
}

async function requireActor() {
  const me = await readActor();
  if (!me) throw new Error("Sign in required.");
  return me;
}

function readGender(value?: string) {
  const text = (value ?? "").trim().toUpperCase();
  if (!text) return "";
  if (text.startsWith("F") || text.startsWith("GIRL") || text === "W") return "FEMALE";
  if (text.startsWith("M") || text.startsWith("BOY")) return "MALE";
  return "";
}

function publicCode() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

async function freshCode(sql: Awaited<ReturnType<typeof getSql>>) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = publicCode();
    const taken = await sql<{ id: string }>`select id from learners where public_code = ${code}`;
    if (!taken.length) return code;
  }
  return publicCode() + publicCode().slice(0, 2);
}

async function freshAdmissionNumber(sql: Awaited<ReturnType<typeof getSql>>) {
  const year = new Date().getFullYear();
  const rows = await sql<{ prefix: string; include_year: boolean; number_digits: number }>`select prefix, include_year, number_digits from admission_number_settings where id = 1`;
  const settings = normalizeAdmissionNumberSettings({
    prefix: rows[0]?.prefix,
    includeYear: rows[0]?.include_year,
    numberDigits: rows[0]?.number_digits,
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const parts = [settings.prefix];
    if (settings.includeYear) parts.push(String(year));
    parts.push(String(randomInt(0, 10 ** settings.numberDigits)).padStart(settings.numberDigits, "0"));
    const value = parts.join("-");
    const exists = await sql<{ id: string }>`select id from learners where upper(admission_number) = ${value}`;
    if (!exists[0]) return value;
  }
  throw new Error("Could not generate a unique admission number. Please try again.");
}

export const getAdmissionNumberSettings = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!isTrueSuper(me)) throw new Error("Only the super admin can view admission-number formatting settings.");
  const sql = await getSql();
  const rows = await sql<{ prefix: string; include_year: boolean; number_digits: number }>`select prefix, include_year, number_digits from admission_number_settings where id = 1`;
  return normalizeAdmissionNumberSettings(rows[0] ? {
    prefix: rows[0].prefix,
    includeYear: rows[0].include_year,
    numberDigits: rows[0].number_digits,
  } : DEFAULT_ADMISSION_NUMBER_SETTINGS);
});

export const saveAdmissionNumberSettings = createServerFn({ method: "POST" })
  .validator((input: AdmissionNumberSettings) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can change admission-number formatting settings.");
    const settings = validateAdmissionNumberSettings(data);
    const sql = await getSql();
    await sql`insert into admission_number_settings (id, prefix, include_year, number_digits, updated_by, updated_at)
      values (1, ${settings.prefix}, ${settings.includeYear}, ${settings.numberDigits}, ${me.id}, now())
      on conflict (id) do update set prefix = excluded.prefix, include_year = excluded.include_year,
        number_digits = excluded.number_digits, updated_by = excluded.updated_by, updated_at = now()`;
    return settings;
  });

async function reportForGrade(sql: Awaited<ReturnType<typeof getSql>>, gradeId: string, yearId: string, termId: string, learnerIds: string[]) {
  const { subjects, exams, bands, streams, learners, marks } = await loadGradeBook(sql, gradeId, yearId, termId);
  const rows = decorate(buildBoards(learners, marks, subjects, exams, bands), streams, exams).filter((row) =>
    learnerIds.includes(row.learner.id),
  );
  return { subjects, exams, bands, streams, rows };
}

type SqlHandle = Awaited<ReturnType<typeof getSql>>;

/**
 * Every active learner placed in the class they were in during `yearId`.
 * Order of truth: a saved placement for that year, then the class stamped on their marks (for years
 * that are over, or when they were promoted after their marks were entered), then their live class.
 * A learner with no trace in a finished year is left out, so a new 2027 Grade 7 never shows up in 2026.
 */
async function learnersAtYear(sql: SqlHandle, yearId: string) {
  const years = await sql<{ id: string; sort: number }>`select id, sort from academic_years`;
  const profile = await sql<{ active_year_id: string }>`select active_year_id from school_profile where id = 1`;
  const sortOf = (id: string) => Number(years.find((year) => year.id === id)?.sort ?? 0);
  const isPast = sortOf(yearId) < sortOf(profile[0]?.active_year_id ?? yearId);
  const isActiveYear = yearId === (profile[0]?.active_year_id ?? yearId);
  return sql<Learner>`
    select * from (
      select l.id, l.roll, l.full_name as "fullName", l.gender,
        coalesce(p.grade_id, case when mk.grade_id is not null and (${isPast} or gm.level < gl.level) then mk.grade_id when ${isActiveYear} then l.grade_id else null end) as "gradeId",
        coalesce(p.stream_id, case when mk.grade_id is not null and (${isPast} or gm.level < gl.level) then mk.stream_id when ${isActiveYear} then l.stream_id else null end) as "streamId",
        l.status, l.public_code as "publicCode", l.admission_number as "admissionNumber", l.cohort_year as "cohortYear"
      from learners l
      left join learner_year_placements p on p.learner_id = l.id and p.year_id = ${yearId}
      left join lateral (
        select m.grade_id, m.stream_id from marks m where m.learner_id = l.id and m.year_id = ${yearId} order by m.updated_at desc limit 1
      ) mk on true
      left join grades gm on gm.id = mk.grade_id
      left join grades gl on gl.id = l.grade_id
      where l.status = 'active'
    ) placed where placed."gradeId" is not null`;
}

/** Call before moving learners up a grade: saves the class they leave under the year their marks belong to. */
async function movesUpAGrade(sql: SqlHandle, fromGradeId: string, toGradeId: string) {
  const levels = await sql<{ id: string; level: number }>`select id, level from grades where id in (${fromGradeId}, ${toGradeId})`;
  const from = levels.find((row) => row.id === fromGradeId);
  const to = levels.find((row) => row.id === toGradeId);
  return Boolean(from && to && Number(to.level) > Number(from.level));
}

async function recordPlacements(sql: SqlHandle, learnerIds: string[]) {
  const profile = await sql<{ active_year_id: string }>`select active_year_id from school_profile where id = 1`;
  for (const id of learnerIds) {
    const latest = await sql<{ year_id: string }>`
      select m.year_id from marks m join academic_years y on y.id = m.year_id where m.learner_id = ${id} order by y.sort desc limit 1`;
    const yearId = latest[0]?.year_id ?? profile[0]?.active_year_id;
    if (!yearId) continue;
    await sql`
      insert into learner_year_placements (learner_id, year_id, grade_id, stream_id)
      select id, ${yearId}, grade_id, stream_id from learners where id = ${id}
      on conflict (learner_id, year_id) do nothing`;
  }
}

async function loadGradeBook(sql: Awaited<ReturnType<typeof getSql>>, gradeId: string, yearId: string, termId: string) {
  const subjects = await sql<{ id: string; name: string; shortName: string; sort: number }>`select id, name, short_name as "shortName", sort from subjects order by sort`;
  const allExams = await sql<{ id: string; name: string; code: string; sort: number }>`select id, name, code, sort from exams order by sort`;
  const assessmentRows = await sql<{ exam_id: string; active: boolean }>`select exam_id, active from term_assessments where year_id = ${yearId} and term_id = ${termId}`;
  const exams = assessmentRows.length ? allExams.filter((exam) => assessmentRows.some((row) => row.exam_id === exam.id && row.active)) : allExams;
  const bands = await sql<{ minScore: number; code: string; points: number; subjectRemark: string; headRemark: string; classRemark: string }>`
    select min_score as "minScore", code, points, subject_remark as "subjectRemark", head_remark as "headRemark", class_remark as "classRemark"
    from grading_bands order by min_score desc`;
  const streams = await sql<{ id: string; gradeId: string; name: string; classTeacherLabel: string; classTeacherInitials: string; sort: number }>`
    select s.id, s.grade_id as "gradeId", s.name, s.class_teacher_label as "classTeacherLabel", s.sort,
      coalesce((select string_agg(nullif(u.initials, ''), ' / ' order by u.full_name) from assignments a join users u on u.id = a.user_id where a.kind = 'class_teacher' and a.stream_id = s.id and u.active = true), '') as "classTeacherInitials"
    from streams s`;
  const learners = (await learnersAtYear(sql, yearId)).filter((learner) => learner.gradeId === gradeId);
  const marks = await sql<Mark>`
    select learner_id as "learnerId", subject_id as "subjectId", exam_id as "examId", score, year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId", status
    from marks where year_id = ${yearId} and term_id = ${termId} and grade_id = ${gradeId}`;
  return { subjects, exams, bands, streams, learners, marks };
}

function tempPassword() {
  // Strong, unpredictable temporary password. Never persist this plaintext.
  return `Mk-${randomBytes(12).toString("base64url")}-9!`;
}

export const portalStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const admins = await sql<{ n: number }>`select count(*)::int as n from users where role = 'super_admin'`;
  const profile = await sql<{ name: string; motto: string; po_box: string; location: string }>`
    select name, motto, po_box, location from school_profile where id = 1`;
  const row = profile[0];
  return {
    needsSetup: (admins[0]?.n ?? 0) === 0,
    schoolName: row?.name ?? "Mukuyu Junior School",
    motto: row?.motto ?? "Hard Work Pays",
    poBox: row?.po_box ?? "",
    location: row?.location ?? "",
  };
});

export const setupSchool = createServerFn({ method: "POST" })
  .validator((input: { fullName: string; email: string; password: string }) => input)
  .handler(async ({ data }) => {
    const fullName = data.fullName?.trim();
    const email = data.email?.trim().toLowerCase();
    const password = data.password ?? "";
    if (!fullName || fullName.length < 3) throw new Error("Enter your full name.");
    if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
    if (password.length < 12 || password.length > 128) throw new Error("Use a super admin password between 12 and 128 characters.");
    const sql = await getSql();
    const existing = await sql<{ n: number }>`select count(*)::int as n from users where role = 'super_admin'`;
    if ((existing[0]?.n ?? 0) > 0) throw new Error("A super admin already exists. Sign in instead.");
    const id = newId("usr");
    await sql`
      insert into users (id, email, password_hash, full_name, role)
      values (${id}, ${email}, ${hashPassword(password)}, ${fullName}, 'super_admin')`;
    const session = await sessionApi();
    await session.update({ userId: id, v: 1 });
    return { ok: true };
  });

export const login = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => input)
  .handler(async ({ data }) => {
    const email = data.email?.trim().toLowerCase();
    const password = data.password ?? "";
    if (!email || !password) throw new Error("Enter your email and password.");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      password_hash: string;
      active: boolean;
      session_version: number;
    }>`select id, password_hash, active, session_version from users where email = ${email}`;
    const row = rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) throw new Error("Email or password is not correct.");
    if (!row.active) throw new Error("This account is disabled. Ask the super admin.");
    const session = await sessionApi();
    await session.update({ userId: row.id, v: Number(row.session_version) });
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await sessionApi();
  await session.clear();
  return { ok: true };
});


async function readRoleAccess(sql: Sql): Promise<RoleAccessPolicy> {
  const rows = await sql<{ policy_json: unknown }>`select policy_json from role_access_policy where id = 1`;
  const stored = rows[0]?.policy_json;
  let value: unknown = stored;
  if (typeof stored === "string") { try { value = JSON.parse(stored); } catch { value = null; } }
  return normalizeRoleAccess(value ?? DEFAULT_ROLE_ACCESS);
}

export const saveRoleAccessPolicy = createServerFn({ method: "POST" })
  .validator((input: { policy: unknown }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the Super Admin can change role view and download controls.");
    const policy = normalizeRoleAccess(data.policy);
    const sql = await getSql();
    await sql`insert into role_access_policy (id, policy_json, updated_by, updated_at) values (1, ${JSON.stringify(policy)}::jsonb, ${me.id}, now()) on conflict (id) do update set policy_json = excluded.policy_json, updated_by = excluded.updated_by, updated_at = now()`;
    return policy;
  });

export const getWorkspace = createServerFn({ method: "GET" }).handler(async (): Promise<Workspace> => {
  const me = await requireActor();
  const sql = await getSql();
  const roleAccess = await readRoleAccess(sql);
  const profileRows = await sql<Profile>`
    select name, po_box as "poBox", mission, vision, motto, head_teacher as "headTeacher", dos,
      location, contact, email, academic_year as "academicYear", term_name as "termName",
      report_title as "reportTitle", closing_date as "closingDate", resumption_date as "resumptionDate",
      cat_note as "catNote", requirements, greeting, home_note as "homeNote",
      public_base_url as "publicBaseUrl", logo_data as "logoData",
      active_year_id as "activeYearId", active_term_id as "activeTermId",
      show_qr as "showQr", show_chart as "showChart", show_remarks as "showRemarks", show_positions as "showPositions",
      report_exam_count as "reportExamCount", show_teacher_initials as "showTeacherInitials",
      show_subject_teacher_initials as "showSubjectTeacherInitials", show_subject_rank as "showSubjectRank",
      show_subject_spotlight as "showSubjectSpotlight", show_previous_term as "showPreviousTerm",
      show_attendance as "showAttendance", show_custom_remarks as "showCustomRemarks",
      color_t1 as "term1Color", color_t2 as "term2Color", color_t3 as "term3Color",
      whatsapp_group_enabled as "whatsappGroupEnabled", whatsapp_group_url as "whatsappGroupUrl", whatsapp_group_label as "whatsappGroupLabel"
    from school_profile where id = 1`;
  const profile = profileRows[0];
  if (!profile) throw new Error("School profile is missing.");
  const grades = await sql<Grade>`select id, name, level, report_title as "reportTitle" from grades order by level`;
  const streams = await sql<Stream>`
    select s.id, s.grade_id as "gradeId", s.name, s.class_teacher_label as "classTeacherLabel", s.sort,
      coalesce((select string_agg(nullif(u.initials, ''), ' / ' order by u.full_name) from assignments a join users u on u.id = a.user_id where a.kind = 'class_teacher' and a.stream_id = s.id and u.active = true), '') as "classTeacherInitials"
    from streams s order by s.sort, s.name`;
  const subjects = await sql<Subject>`select id, name, short_name as "shortName", sort from subjects order by sort`;
  const exams = await sql<Exam>`select id, name, code, sort from exams order by sort`;
  const bands = await sql<Band>`
    select min_score as "minScore", code, points, subject_remark as "subjectRemark",
      head_remark as "headRemark", class_remark as "classRemark"
    from grading_bands order by min_score desc`;

  const years = await sql<{ id: string; name: string; sort: number }>`select id, name, sort from academic_years order by sort`;
  const terms = await sql<{ id: string; name: string; sort: number }>`select id, name, sort from terms order by sort`;
  const termAssessments = await sql<TermAssessment>`select year_id as "yearId", term_id as "termId", exam_id as "examId", active from term_assessments order by year_id, term_id, exam_id`;
  const markControls = await sql<MarkControl>`select year_id as "yearId", term_id as "termId", exam_id as "examId", entry_allowed as "entryAllowed", edit_allowed as "editAllowed", reason from mark_controls`;
  const calendars = await sql<{
    yearId: string; termId: string; closingDate: string; openingDate: string; reportTitle: string; requirements: string;
  }>`
    select year_id as "yearId", term_id as "termId", closing_date as "closingDate", opening_date as "openingDate",
      report_title as "reportTitle", requirements from term_dates`;

  let learners = await sql<Learner>`
    select id, roll, full_name as "fullName", gender, grade_id as "gradeId", stream_id as "streamId", status, public_code as "publicCode", admission_number as "admissionNumber", cohort_year as "cohortYear"
    from learners where status = 'active' order by grade_id, roll`;
  const childRows =
    me.role === "parent"
      ? await sql<{ learner_id: string }>`select learner_id from parent_links where parent_user_id = ${me.id}`
      : [];
  const childIds = childRows.map((row) => row.learner_id);
  if (me.role === "student") learners = learners.filter((learner) => learner.id === me.learnerId);
  if (me.role === "parent") learners = learners.filter((learner) => childIds.includes(learner.id));

  const allowed = new Set(learners.map((learner) => learner.id));
  const markRows = await sql<Mark>`
    select learner_id as "learnerId", subject_id as "subjectId", exam_id as "examId", score,
      year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId", status from marks`;
  let marks = me.role === "student" || me.role === "parent" ? markRows.filter((mark) => allowed.has(mark.learnerId)) : markRows;
  if ((me.role === "student" || me.role === "parent") && !canActorAccess(roleAccess, me.role, "familyResults", "view")) marks = [];

  const placementRows = await sql<Placement>`select learner_id as "learnerId", year_id as "yearId", grade_id as "gradeId", stream_id as "streamId" from learner_year_placements`;
  const placements = me.role === "student" || me.role === "parent" ? placementRows.filter((row) => allowed.has(row.learnerId)) : placementRows;
  const assignmentRows = await sql<Assignment>`
    select id, user_id as "userId", kind, grade_id as "gradeId", stream_id as "streamId", subject_id as "subjectId"
    from assignments`;
  const assignments = isAdmin(me.role) ? assignmentRows : assignmentRows.filter((row) => row.userId === me.id);
  const subjectTeacherSlots = await sql<SubjectTeacherSlot>`
    select a.subject_id as "subjectId", a.grade_id as "gradeId", a.stream_id as "streamId", u.initials
    from assignments a join users u on u.id = a.user_id
    where a.kind in ('subject_teacher', 'hod') and u.active = true and coalesce(trim(u.initials), '') <> ''`;
  const noteRows = await sql<TermNote>`
    select learner_id as "learnerId", year_id as "yearId", term_id as "termId",
      days_present as "daysPresent", days_expected as "daysExpected", conduct, comment
    from learner_term_notes`;
  const remarkRows = await sql<SubjectRemark>`
    select learner_id as "learnerId", subject_id as "subjectId", year_id as "yearId", term_id as "termId", remark
    from subject_remarks`;
  const familyViewAllowed = me.role !== "student" && me.role !== "parent" || canActorAccess(roleAccess, me.role, "familyResults", "view");
  const termNotes = !familyViewAllowed ? [] : me.role === "student" || me.role === "parent" ? noteRows.filter((row) => allowed.has(row.learnerId)) : noteRows;
  const subjectRemarks = !familyViewAllowed ? [] : me.role === "student" || me.role === "parent" ? remarkRows.filter((row) => allowed.has(row.learnerId)) : remarkRows;

  const timetablePeriods = await sql<TimetablePeriod>`
    select id, year_id as "yearId", term_id as "termId", label,
      start_time as "startTime", end_time as "endTime", sort, is_break as "isBreak"
    from timetable_periods order by year_id, term_id, sort`;
  const timetableEntries = await sql<TimetableEntry>`
    select e.id, e.year_id as "yearId", e.term_id as "termId", e.day_of_week as "dayOfWeek",
      e.period_id as "periodId", e.grade_id as "gradeId", e.stream_id as "streamId",
      e.subject_id as "subjectId", e.teacher_user_id as "teacherUserId",
      u.full_name as "teacherName", coalesce(u.initials, '') as "teacherInitials", u.email as "teacherEmail", e.room, e.notes, e.block_length as "blockLength", e.locked
    from timetable_entries e join users u on u.id = e.teacher_user_id
    order by e.year_id, e.term_id, e.day_of_week, e.period_id, e.grade_id, e.stream_id nulls first`;
  const timetableRooms = await sql<TimetableRoom>`select id, name, capacity, room_type as "roomType", features, active from timetable_rooms order by active desc, name`;
  const timetableAvailability = await sql<TimetableAvailability>`select id, year_id as "yearId", term_id as "termId", entity_type as "entityType", entity_id as "entityId", day_of_week as "dayOfWeek", period_id as "periodId", available, coalesce(level, 'off') as level, note from timetable_availability`;
  const timetableRequirements = await sql<TimetableRequirement>`select id, year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId", subject_id as "subjectId", teacher_user_id as "teacherUserId", lessons_per_week as "lessonsPerWeek", block_length as "blockLength", preferred_room as "preferredRoom", coalesce(distribution, '') as distribution, preferred_double_day as "preferredDoubleDay", coalesce(timing_preference, 'none') as "timingPreference" from timetable_requirements`;
  const subjectConstraints = await sql<SubjectConstraint>`select id, year_id as "yearId", term_id as "termId", subject_id as "subjectId", max_per_day as "maxPerDay", min_days_per_week as "minDaysPerWeek", no_afternoon as "noAfternoon", preferred_morning as "preferredMorning", avoid_consecutive_days as "avoidConsecutiveDays", no_last_period as "noLastPeriod", complexity, place_in_order as "placeInOrder", coalesce(distribution, '') as distribution, coalesce(color, '') as color, notes, double_count as "doubleCount", coalesce(max_before_break, 3) as "maxBeforeBreak" from subject_constraints`;
  const teacherContracts = await sql<TeacherContract>`select id, year_id as "yearId", term_id as "termId", teacher_user_id as "teacherUserId", coalesce(min_per_day, 0) as "minPerDay", max_per_day as "maxPerDay", max_per_week as "maxPerWeek", max_consecutive as "maxConsecutive", max_days as "maxDays", max_windows as "maxWindows", min_rest_periods as "minRestPeriods" from teacher_contracts`;
  const classConstraints = await sql<ClassConstraint>`select id, year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId", max_per_day as "maxPerDay", no_gaps as "noGaps" from class_constraints`;
  const lessonRelations = await sql<LessonRelation>`select id, year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId", left_subject_id as "leftSubjectId", right_subject_id as "rightSubjectId", relation from lesson_relations`;
  const timetableVersions = await sql<TimetableVersion>`select id, year_id as "yearId", term_id as "termId", label, created_at as "createdAt", created_by as "createdBy" from timetable_versions order by created_at desc`;
  const timetableStates = await sql<TimetableState>`select year_id as "yearId", term_id as "termId", published, effective_from::text as "effectiveFrom", published_at::text as "publishedAt" from timetable_state`;
  const timetablePermissionRows = await sql<{ admins_can_edit: boolean; staff_assignments_enabled: boolean }>`select admins_can_edit, staff_assignments_enabled from timetable_admin_permissions where id = 1`;
  const timetableAdminsCanEdit = Boolean(timetablePermissionRows[0]?.admins_can_edit);
  const timetableStaffAssignmentsEnabled = Boolean(timetablePermissionRows[0]?.staff_assignments_enabled);
  const timetableManager = canManageTimetable(me) || (me.role === "admin" && timetableAdminsCanEdit);
  const publishedTimetableScopes = new Set(timetableStates.filter((state) => state.published).map((state) => `${state.yearId}:${state.termId}`));
  const visibleTimetablePeriods = timetableManager ? timetablePeriods : timetablePeriods.filter((period) => publishedTimetableScopes.has(`${period.yearId}:${period.termId}`));
  let visibleTimetableEntries = timetableManager ? timetableEntries : timetableEntries.filter((entry) => publishedTimetableScopes.has(`${entry.yearId}:${entry.termId}`));
  if (me.role === "teacher") {
    const teachingClassScopes = assignments.filter((assignment) => assignment.userId === me.id && assignment.gradeId && ["class_teacher", "subject_teacher", "hod", "dos"].includes(assignment.kind));
    visibleTimetableEntries = visibleTimetableEntries.filter((entry) => entry.teacherUserId === me.id || teachingClassScopes.some((assignment) => assignment.gradeId === entry.gradeId && (!assignment.streamId || entry.streamId == null || assignment.streamId === entry.streamId)));
  }

  const staff = isAdmin(me.role)
    ? await sql<StaffMember>`
        select id, email, full_name as "fullName", role, active, learner_id as "learnerId", initials,
          priv_settings as "privSettings", priv_staff as "privStaff", priv_import as "privImport", priv_calendar as "privCalendar",
          is_deputy as "isDeputy", can_view_other_subjects as "canViewOtherSubjects",
          can_edit_other_subjects as "canEditOtherSubjects", delegated_responsibilities as "delegatedResponsibilities"
        from users order by role, full_name`
    : [];
  const safeStaff = staff.map((member) => ({ ...member, role: asRole(member.role) }));

  let familyReports: Decorated[] | null = null;
  if ((me.role === "student" || me.role === "parent") && canActorAccess(roleAccess, me.role, "familyResults", "view")) {
    const everyone = await learnersAtYear(sql, profile.activeYearId);
    const everyMark = (await sql<Mark>`
      select learner_id as "learnerId", subject_id as "subjectId", exam_id as "examId", score,
        year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId" from marks`)
      .filter((mark) => mark.yearId === profile.activeYearId && mark.termId === profile.activeTermId);
    const configuredAssessments = await sql<{ exam_id: string; active: boolean }>`select exam_id, active from term_assessments where year_id = ${profile.activeYearId} and term_id = ${profile.activeTermId}`;
    const activeIds = configuredAssessments.length ? new Set(configuredAssessments.filter((item) => item.active).map((item) => item.exam_id)) : null;
    const activePeriodMarks = activeIds ? everyMark.filter((mark) => activeIds.has(mark.examId)) : everyMark;
    const learnerMarkGrades = activePeriodMarks.filter((mark) => allowed.has(mark.learnerId)).map((mark) => mark.gradeId).filter((id): id is string => Boolean(id));
    const gradeIds = [...new Set([...learners.map((learner) => learner.gradeId), ...learnerMarkGrades])];
    familyReports = gradeIds.flatMap((gradeId) => {
      const historicalIds = new Set(activePeriodMarks.filter((mark) => mark.gradeId === gradeId).map((mark) => mark.learnerId));
      const group = everyone.filter((learner) => learner.gradeId === gradeId);
      const gradeMarks = activePeriodMarks.filter((mark) => mark.gradeId === gradeId);
      return decorate(buildBoards(group, gradeMarks, subjects, exams, bands), streams, exams).filter((row) =>
        learners.some((learner) => learner.id === row.learner.id),
      );
    });
  }

  return { me, roleAccess, profile, grades, streams, subjects, exams, bands, years, terms, termAssessments, markControls, calendars, learners, placements, marks, assignments, subjectTeacherSlots, termNotes, subjectRemarks, timetablePeriods: visibleTimetablePeriods, timetableEntries: visibleTimetableEntries, timetableRooms: timetableManager ? timetableRooms : [], timetableAvailability: timetableManager ? timetableAvailability : [], timetableRequirements: timetableManager ? timetableRequirements : [], subjectConstraints: timetableManager ? subjectConstraints : [], teacherContracts: timetableManager ? teacherContracts : [], classConstraints: timetableManager ? classConstraints : [], lessonRelations: timetableManager ? lessonRelations : [], timetableVersions: timetableManager ? timetableVersions : [], timetableStates, timetableAdminsCanEdit, timetableStaffAssignmentsEnabled, staff: safeStaff, childIds, familyReports };
});

export const changePassword = createServerFn({ method: "POST" })
  .validator((input: { current: string; next: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!data.next || data.next.length < 12 || data.next.length > 128) throw new Error("New password must be between 12 and 128 characters.");
    const sql = await getSql();
    const rows = await sql<{ password_hash: string; session_version: number }>`
      select password_hash, session_version from users where id = ${me.id}`;
    const row = rows[0];
    if (!row || !verifyPassword(data.current ?? "", row.password_hash)) throw new Error("Current password is not correct.");
    const version = row.session_version + 1;
    await sql`update users set password_hash = ${hashPassword(data.next)}, session_version = ${version} where id = ${me.id}`;
    const session = await sessionApi();
    await session.update({ userId: me.id, v: version });
    return { ok: true };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .validator((input: Profile) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) || !can(me, "settings")) throw new Error("Only admins can change school settings.");
    if (!data.name?.trim()) throw new Error("School name is required.");
    if (data.logoData && data.logoData.length > 350000) throw new Error("That logo is too large. Use an image under 250KB.");
    const sql = await getSql();
    await sql`
      update school_profile set
        name = ${data.name.trim()},
        po_box = ${data.poBox.trim()},
        mission = ${data.mission.trim()},
        vision = ${data.vision.trim()},
        motto = ${data.motto.trim()},
        head_teacher = ${data.headTeacher.trim()},
        dos = ${data.dos.trim()},
        location = ${data.location.trim()},
        contact = ${data.contact.trim()},
        email = ${data.email.trim()},
        academic_year = ${data.academicYear.trim()},
        term_name = ${data.termName.trim()},
        report_title = ${data.reportTitle.trim()},
        closing_date = ${data.closingDate.trim()},
        resumption_date = ${data.resumptionDate.trim()},
        cat_note = ${data.catNote.trim()},
        requirements = ${data.requirements.trim()},
        greeting = ${data.greeting.trim()},
        home_note = ${data.homeNote.trim()},
        public_base_url = ${data.publicBaseUrl.trim()},
        logo_data = ${data.logoData.startsWith("data:image") ? data.logoData : ""},
        show_qr = ${Boolean(data.showQr)},
        show_chart = ${Boolean(data.showChart)},
        show_remarks = ${Boolean(data.showRemarks)},
        show_positions = ${Boolean(data.showPositions)},
        color_t1 = ${data.term1Color || "#1d4e89"}, color_t2 = ${data.term2Color || "#9a7430"}, color_t3 = ${data.term3Color || "#1f7a4d"},
        whatsapp_group_enabled = ${Boolean(data.whatsappGroupEnabled)}, whatsapp_group_url = ${data.whatsappGroupUrl.trim().slice(0, 500)}, whatsapp_group_label = ${data.whatsappGroupLabel.trim().slice(0, 100)}
      where id = 1`;
    await sql`
      update term_dates set
        closing_date = ${data.closingDate.trim()},
        opening_date = ${data.resumptionDate.trim()},
        report_title = ${data.reportTitle.trim()},
        requirements = ${data.requirements.trim()}
      where year_id = ${data.activeYearId} and term_id = ${data.activeTermId}`;
    return { ok: true };
  });

export const saveBands = createServerFn({ method: "POST" })
  .validator((input: { bands: Band[] }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can edit the grading scale.");
    const bands = [...data.bands].sort((a, b) => a.minScore - b.minScore);
    if (bands.length < 4) throw new Error("Keep at least four grading bands.");
    const sql = await getSql();
    await sql`delete from grading_bands`;
    for (const band of bands) {
      await sql`
        insert into grading_bands (min_score, code, points, subject_remark, head_remark, class_remark)
        values (${band.minScore}, ${band.code.trim()}, ${band.points}, ${band.subjectRemark.trim()}, ${band.headRemark.trim()}, ${band.classRemark.trim()})`;
    }
    return { ok: true };
  });

export const saveSubjects = createServerFn({ method: "POST" })
  .validator((input: { subjects: Array<{ id: string; name: string; shortName: string; sort: number }> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can edit subjects.");
    const sql = await getSql();
    for (const subject of data.subjects) {
      if (!subject.name.trim()) throw new Error("Subject name cannot be empty.");
      await sql`
        update subjects set name = ${subject.name.trim().toUpperCase()}, short_name = ${subject.shortName.trim().toUpperCase()}, sort = ${subject.sort}
        where id = ${subject.id}`;
    }
    return { ok: true };
  });

export const addSubject = createServerFn({ method: "POST" })
  .validator((input: { name: string; shortName: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can add subjects.");
    const name = data.name?.trim().toUpperCase();
    const shortName = data.shortName?.trim().toUpperCase();
    if (!name || !shortName) throw new Error("Enter the subject name and a short label.");
    const sql = await getSql();
    const sortRows = await sql<{ n: number }>`select coalesce(max(sort), 0)::int as n from subjects`;
    const id = shortName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || newId("sub");
    await sql`
      insert into subjects (id, name, short_name, sort)
      values (${id}, ${name}, ${shortName}, ${(sortRows[0]?.n ?? 0) + 1})`;
    return { ok: true };
  });

export const deleteSubject = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can remove subjects.");
    const sql = await getSql();
    const subject = await sql<{ name: string }>`select name from subjects where id = ${data.id}`;
    if (!subject[0]) throw new Error("Subject was not found.");
    const marks = await sql<{ n: number }>`select count(*)::int as n from marks where subject_id = ${data.id}`;
    const assignments = await sql<{ n: number }>`select count(*)::int as n from assignments where subject_id = ${data.id}`;
    if ((marks[0]?.n ?? 0) > 0 || (assignments[0]?.n ?? 0) > 0) throw new Error(`${subject[0].name} cannot be removed because it has marks or teacher/class assignments. Archive or clear those records first.`);
    await sql`delete from subjects where id = ${data.id}`;
    return { ok: true };
  });

export const addExam = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) || !can(me, "settings")) throw new Error("You cannot add CATs/exams.");
    const name = data.name.trim();
    if (!name || name.length > 40) throw new Error("Enter a CAT name up to 40 characters.");
    const sql = await getSql();
    const max = await sql<{ n: number }>`select coalesce(max(sort), 0)::int as n from exams`;
    const id = newId("exam");
    const sort = (max[0]?.n ?? 0) + 1;
    await sql`insert into exams (id, name, code, sort) values (${id}, ${name}, ${`cat${sort}`}, ${sort})`;
    return { ok: true, id };
  });

export const saveExams = createServerFn({ method: "POST" })
  .validator((input: { exams: Array<{ id: string; name: string }> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can rename exams.");
    const sql = await getSql();
    for (const exam of data.exams) {
      if (!exam.name.trim()) throw new Error("Exam name cannot be empty.");
      await sql`update exams set name = ${exam.name.trim()} where id = ${exam.id}`;
    }
    return { ok: true };
  });

export const saveStream = createServerFn({ method: "POST" })
  .validator((input: { id?: string; gradeId: string; name: string; classTeacherLabel: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const name = data.name?.trim().toUpperCase();
    if (!name) throw new Error("Stream name is required.");
    const label = data.classTeacherLabel?.trim() ?? "";
    if (data.id) {
      if (!isAdmin(me.role)) {
        const own = await sql<{ id: string }>`
          select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${data.id}`;
        if (!own.length) throw new Error("You can only rename your own stream.");
      }
      await sql`update streams set name = ${name}, class_teacher_label = ${label} where id = ${data.id}`;
      return { ok: true };
    }
    if (!isAdmin(me.role)) throw new Error("Only admins can add a stream.");
    const sortRows = await sql<{ n: number }>`select coalesce(max(sort), 0)::int as n from streams where grade_id = ${data.gradeId}`;
    const id = newId("str");
    await sql`
      insert into streams (id, grade_id, name, class_teacher_label, sort)
      values (${id}, ${data.gradeId}, ${name}, ${label}, ${(sortRows[0]?.n ?? 0) + 1})`;
    return { ok: true };
  });

export const deleteStream = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can remove a stream.");
    const sql = await getSql();
    const used = await sql<{ n: number }>`select count(*)::int as n from learners where stream_id = ${data.id}`;
    if ((used[0]?.n ?? 0) > 0) throw new Error("Move learners out of this stream before deleting it.");
    await sql`delete from streams where id = ${data.id}`;
    return { ok: true };
  });

export const saveLearner = createServerFn({ method: "POST" })
  .validator((input: { id?: string; roll: number; fullName: string; gender: string; gradeId: string; streamId: string; admissionNumber?: string; yearId?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const name = data.fullName?.trim().toUpperCase();
    const gender = data.gender === "FEMALE" ? "FEMALE" : "MALE";
    const roll = Number(data.roll);
    if (!name) throw new Error("Learner name is required.");
    if (!Number.isInteger(roll) || roll < 1) throw new Error("Roll number must be 1 or higher.");
    if (data.id) {
      const current = await sql<{ stream_id: string }>`select stream_id from learners where id = ${data.id}`;
      if (!current[0]) throw new Error("Learner not found.");
      if (!isAdmin(me.role)) {
        const allowed = await sql<{ id: string }>`
          select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${current[0].stream_id}`;
        const target = await sql<{ id: string }>`
          select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${data.streamId}`;
        if (!allowed.length || !target.length) throw new Error("Class teachers can only edit learners in their stream.");
      }
      if (data.admissionNumber?.trim()) {
        const num = data.admissionNumber.trim().toUpperCase();
        const clash = await sql`select id from learners where upper(admission_number) = ${num} and id <> ${data.id}`;
        if (clash[0]) throw new Error("Admission number already used by another learner.");
        await sql`update learners set roll = ${roll}, full_name = ${name}, gender = ${gender}, grade_id = ${data.gradeId}, stream_id = ${data.streamId}, admission_number = ${num} where id = ${data.id}`;
      } else {
        await sql`update learners set roll = ${roll}, full_name = ${name}, gender = ${gender}, grade_id = ${data.gradeId}, stream_id = ${data.streamId} where id = ${data.id}`;
      }
      return { ok: true };
    }
    if (!isAdmin(me.role)) {
      const allowed = await sql<{ id: string }>`
        select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${data.streamId}`;
      if (!allowed.length) throw new Error("Only an admin or the class teacher can add learners.");
    }
    const id = newId("lrn");
    const cohort = await sql<{ academic_year: string }>`select academic_year from school_profile where id = 1`;
    const cohortYear = cohort[0]?.academic_year || String(new Date().getFullYear());
    const admissionNumber = data.admissionNumber?.trim().toUpperCase() || await freshAdmissionNumber(sql);
    const clash = await sql`select id from learners where upper(admission_number) = ${admissionNumber}`;
    if (clash[0]) throw new Error("Admission number already used by another learner.");
    await sql`
      insert into learners (id, roll, full_name, gender, grade_id, stream_id, public_code, admission_number, cohort_year)
      values (${id}, ${roll}, ${name}, ${gender}, ${data.gradeId}, ${data.streamId}, ${await freshCode(sql)}, ${admissionNumber}, ${cohortYear})`;
    if (data.yearId) {
      const year = await sql<{ id: string }>`select id from academic_years where id = ${data.yearId}`;
      if (!year[0]) throw new Error("Choose a valid academic year for this learner.");
      await sql`insert into learner_year_placements (learner_id, year_id, grade_id, stream_id) values (${id}, ${data.yearId}, ${data.gradeId}, ${data.streamId}) on conflict (learner_id, year_id) do update set grade_id = excluded.grade_id, stream_id = excluded.stream_id`;
    }
    return { ok: true, id };
  });

export const deleteLearner = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const rows = await sql<{ stream_id: string }>`select stream_id from learners where id = ${data.id}`;
    if (!rows[0]) throw new Error("Learner not found.");
    if (!isAdmin(me.role)) {
      const allowed = await sql<{ id: string }>`
        select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${rows[0].stream_id}`;
      if (!allowed.length) throw new Error("You cannot remove this learner.");
    }
    await sql`update learners set status = 'archived' where id = ${data.id}`;
    await sql`update users set active = false, session_version = session_version + 1 where learner_id = ${data.id}`;
    return { ok: true, archived: true };
  });

export const getMarkControl = createServerFn({ method: "GET" })
  .validator((input: { yearId: string; termId: string; examId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isPowerful(me)) throw new Error("Only the super admin and deputy super admins can view mark-entry controls.");
    const sql = await getSql();
    const rows = await sql<{ entry_allowed: boolean; edit_allowed: boolean; reason: string }>`select entry_allowed, edit_allowed, reason from mark_controls where year_id = ${data.yearId} and term_id = ${data.termId} and exam_id = ${data.examId}`;
    return rows[0] ? { entryAllowed: rows[0].entry_allowed, editAllowed: rows[0].edit_allowed, reason: rows[0].reason ?? "" } : { entryAllowed: true, editAllowed: true, reason: "" };
  });

export const saveMarkControl = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; examId: string; entryAllowed: boolean; editAllowed: boolean; reason?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isPowerful(me)) throw new Error("Only the super admin and deputy super admins can lock or unlock marks.");
    const reason = (data.reason ?? "").trim().slice(0, 300);
    const sql = await getSql();
    const valid = await sql`select (select count(*) from academic_years where id = ${data.yearId}) as years, (select count(*) from terms where id = ${data.termId}) as terms, (select count(*) from exams where id = ${data.examId}) as exams`;
    if (Number(valid[0]?.years) < 1 || Number(valid[0]?.terms) < 1 || Number(valid[0]?.exams) < 1) throw new Error("Choose a valid year, term and CAT.");
    await sql`insert into mark_controls (year_id, term_id, exam_id, entry_allowed, edit_allowed, reason, updated_by, updated_at)
      values (${data.yearId}, ${data.termId}, ${data.examId}, ${Boolean(data.entryAllowed)}, ${Boolean(data.editAllowed)}, ${reason}, ${me.id}, now())
      on conflict (year_id, term_id, exam_id) do update set entry_allowed = ${Boolean(data.entryAllowed)}, edit_allowed = ${Boolean(data.editAllowed)}, reason = ${reason}, updated_by = ${me.id}, updated_at = now()`;
    return { ok: true };
  });

export const saveMarks = createServerFn({ method: "POST" })
  .validator((input: { subjectId: string; examId: string; yearId: string; termId: string; rows: Array<{ learnerId: string; score: number | null }> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const yearId = data.yearId || "y2026";
    const termId = data.termId || "t3";
    const controls = await sql<{ entry_allowed: boolean; edit_allowed: boolean; reason: string }>`select entry_allowed, edit_allowed, reason from mark_controls where year_id = ${yearId} and term_id = ${termId} and exam_id = ${data.examId}`;
    const control = controls[0] ?? { entry_allowed: true, edit_allowed: true, reason: "" };
    // The super admin and deputies set the locks, so they are never blocked by them.
    const bypass = isPowerful(me);
    const note = control.reason ? ` (${control.reason})` : "";
    const live = await sql<Learner>`
      select id, roll, full_name as "fullName", gender, grade_id as "gradeId", stream_id as "streamId", status, public_code as "publicCode", admission_number as "admissionNumber", cohort_year as "cohortYear"
      from learners where status = 'active'`;
    // Marks belong to the class the learner was in during that year, not the class they are in now.
    const placed = new Map((await learnersAtYear(sql, yearId)).map((learner) => [learner.id, learner]));
    const byId = new Map(live.map((learner) => [learner.id, placed.get(learner.id) ?? learner]));
    const assignments = await sql<Assignment>`
      select id, user_id as "userId", kind, grade_id as "gradeId", stream_id as "streamId", subject_id as "subjectId"
      from assignments where user_id = ${me.id}`;
    const { canEditMark } = await import("@/lib/school/model");
    for (const row of data.rows) {
      const learner = byId.get(row.learnerId);
      if (!learner) throw new Error("A learner in this list no longer exists.");
      if (!canEditMark(me, assignments, learner, data.subjectId)) {
        throw new Error(`You are not assigned to enter ${data.subjectId} for ${learner.fullName}.`);
      }
      const existing = await sql<{ score: number }>`select score from marks where learner_id = ${row.learnerId} and subject_id = ${data.subjectId} and exam_id = ${data.examId} and year_id = ${yearId} and term_id = ${termId}`;
      const had = existing.length > 0;
      if (row.score == null) {
        if (!had) continue; // blank cell, nothing saved: nothing to lock
        if (!bypass && !control.edit_allowed) throw new Error(`Editing or clearing existing results is switched off for this academic year, term and CAT${note}.`);
        await sql`delete from marks where learner_id = ${row.learnerId} and subject_id = ${data.subjectId} and exam_id = ${data.examId} and year_id = ${yearId} and term_id = ${termId}`;
        continue;
      }
      const score = Math.round(Number(row.score));
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("Scores must be between 0 and 100.");
      if (had && Number(existing[0].score) === score) continue; // unchanged: not an edit
      if (!had && !bypass && !control.entry_allowed) throw new Error(`Mark entry is locked for this academic year, term and CAT${note}.`);
      if (had && !bypass && !control.edit_allowed) throw new Error(`Editing existing results is switched off for this academic year, term and CAT${note}.`);
      await sql`
        insert into marks (learner_id, subject_id, exam_id, year_id, term_id, grade_id, stream_id, score, updated_by, updated_at)
        values (${row.learnerId}, ${data.subjectId}, ${data.examId}, ${yearId}, ${termId}, ${learner.gradeId}, ${learner.streamId}, ${score}, ${me.id}, now())
        on conflict (learner_id, subject_id, exam_id, year_id, term_id)
        do update set score = ${score}, grade_id = ${learner.gradeId}, stream_id = ${learner.streamId}, status = 'recorded', updated_by = ${me.id}, updated_at = now()`;
    }
    return { ok: true };
  });

async function schoolPortalUrl(sql: Awaited<ReturnType<typeof getSql>>) {
  const rows = await sql<{ public_base_url: string }>`select public_base_url from school_profile where id = 1`;
  const configured = rows[0]?.public_base_url?.trim();
  return (process.env.BETTER_AUTH_URL?.trim() || configured || "https://mukuyujs.lovie.me").replace(/\/$/, "");
}

export const createStaff = createServerFn({ method: "POST" })
  .validator((input: {
    fullName: string;
    email: string;
    password: string;
    role: Role;
    privileges?: { settings?: boolean; staff?: boolean; import?: boolean; calendar?: boolean };
    assignment?: { kind: string; gradeId?: string; streamId?: string; subjectId?: string } | null;
  }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) || !can(me, "staff")) throw new Error("Your account cannot add staff.");
    const role = data.role;
    if (role === "super_admin") throw new Error("Super admin is created only at first setup.");
    // Admins with staff privilege may add other admins
    if (role !== "admin" && role !== "teacher" && role !== "parent" && role !== "student") throw new Error("Unknown role.");
    const email = data.email?.trim().toLowerCase();
    const fullName = data.fullName?.trim();
    if (!fullName) throw new Error("Name is required.");
    if (!email || !email.includes("@")) throw new Error("A valid email is required.");
    const issuedPassword = data.password?.trim() || tempPassword();
    if (issuedPassword.length < 12 || issuedPassword.length > 128) throw new Error("Use a password between 12 and 128 characters, or leave it blank to generate one.");
    const sql = await getSql();
    const duplicate = await sql<{ id: string }>`select id from users where email = ${email}`;
    if (duplicate[0]) throw new Error("An account already uses that email address.");
    const id = newId("usr");
    const priv = data.privileges ?? {};
    const settings = role === "admin" ? priv.settings !== false : false;
    const staff = role === "admin" ? priv.staff !== false : false;
    const allowImport = role === "admin" ? priv.import !== false : false;
    const calendar = role === "admin" ? priv.calendar !== false : false;
    await sql`
      insert into users (id, email, password_hash, full_name, role, priv_settings, priv_staff, priv_import, priv_calendar)
      values (${id}, ${email}, ${hashPassword(issuedPassword)}, ${fullName}, ${role}, ${settings}, ${staff}, ${allowImport}, ${calendar})`;
    const assignment = data.assignment;
    if (role === "teacher" && assignment?.kind) {
      await sql`
        insert into assignments (id, user_id, kind, grade_id, stream_id, subject_id)
        values (${newId("asg")}, ${id}, ${assignment.kind}, ${assignment.gradeId || null}, ${assignment.streamId || null}, ${assignment.subjectId || null})`;
    }
    const portalUrl = await schoolPortalUrl(sql);
    const subject = `Your ${role === "admin" ? "administrator" : "teacher"} account for Mukuyu School Portal`;
    const body = [`Hello ${fullName},`, `An account has been created for you in the Mukuyu School Portal.`, `Login email: ${email}`, `Temporary password: ${issuedPassword}`, `Portal link: ${portalUrl}`, `Sign in and change your password after your first login. If you did not expect this account, contact the school office.`].join("\n\n");
    await sql`insert into mail_outbox (id, to_email, subject, body) values (${newId("mail")}, ${email}, ${subject}, ${"Initial account credentials were issued. The temporary password is not retained in the mail log."})`;
    const sent = await sendPasswordEmail(email, subject, body);
    return { ok: true, email, password: issuedPassword, emailSent: sent.sent, emailNote: sent.sent ? "Initial password emailed" : sent.reason };
  });

export const addAssignment = createServerFn({ method: "POST" })
  .validator((input: { userId: string; kind: string; gradeId?: string; streamId?: string; subjectId?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can assign roles.");
    if (!["class_teacher", "subject_teacher", "hod", "dos"].includes(data.kind)) throw new Error("Unknown assignment.");
    if (data.kind === "class_teacher" && !data.streamId) throw new Error("Choose the stream for the class teacher.");
    if (data.kind !== "class_teacher" && data.kind !== "dos" && !data.subjectId) throw new Error("Choose the subject.");
    const sql = await getSql();
    const user = await sql<{ role: string; active: boolean }>`select role, active from users where id = ${data.userId}`;
    if (!user[0] || !["teacher", "admin", "super_admin"].includes(user[0].role)) throw new Error("Assignments are for staff who teach subjects.");
    if (!user[0].active) throw new Error("Enable the staff account before assigning teaching duties.");
    await sql`
      insert into assignments (id, user_id, kind, grade_id, stream_id, subject_id)
      values (${newId("asg")}, ${data.userId}, ${data.kind}, ${data.gradeId || null}, ${data.streamId || null}, ${data.subjectId || null})`;
    return { ok: true };
  });

export const removeAssignment = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can remove assignments.");
    const sql = await getSql();
    await sql`delete from assignments where id = ${data.id}`;
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .validator((input: { id: string; active: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "staff")) throw new Error("You do not have staff-management access to enable or disable accounts.");
    if (data.id === me.id) throw new Error("You cannot disable your own account.");
    const sql = await getSql();
    const rows = await sql<{ role: string }>`select role from users where id = ${data.id}`;
    if (rows[0]?.role === "super_admin" && me.role !== "super_admin") throw new Error("Only the super admin can change another super admin.");
    if (rows[0]?.role === "admin" && !isPowerful(me)) throw new Error("Only the super admin or deputy can change an admin account.");
    await sql`update users set active = ${data.active} where id = ${data.id}`;
    if (!data.active) await sql`update users set session_version = session_version + 1 where id = ${data.id}`;
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const email = data.email?.trim().toLowerCase();
    if (!email) throw new Error("Enter the email address.");
    const sql = await getSql();
    const rows = await sql<{ id: string; full_name: string; role: string }>`select id, full_name, role from users where email = ${email}`;
    const target = rows[0];
    if (!target) throw new Error("No account uses that email.");
    if (!["super_admin", "admin", "teacher", "student", "parent"].includes(target.role)) throw new Error("This account role cannot be reset here.");
    if (target.id === me.id) throw new Error("Use Settings to change your own password.");
    if (target.role === "super_admin" && !isTrueSuper(me)) throw new Error("Only the super admin can reset a super admin password.");
    if (target.role === "admin" && !isPowerful(me)) throw new Error("Only the super admin or deputy can reset an admin password.");
    if (target.role === "teacher" && !isAdmin(me.role)) throw new Error("Only an admin can reset a teacher password.");
    if (target.role === "parent" && !isAdmin(me.role)) throw new Error("Only an admin can reset a parent password.");
    if (target.role === "student" && !isAdmin(me.role) && me.role !== "teacher") throw new Error("You cannot reset this password.");
    if (!isAdmin(me.role) && me.role === "teacher" && target.role === "student") {
      const learner = await sql<{ stream_id: string }>`select stream_id from learners where id = (select learner_id from users where id = ${target.id})`;
      const assignment = await sql<{ id: string }>`select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and (stream_id = ${learner[0]?.stream_id} or stream_id is null)`;
      if (!assignment[0]) throw new Error("Only the student's class teacher can reset this password.");
    }
    const password = tempPassword();
    await sql`update users set password_hash = ${hashPassword(password)}, session_version = session_version + 1, active = true where id = ${target.id}`;
    const school = await sql<{ name: string }>`select name from school_profile where id = 1`;
    const portalUrl = await schoolPortalUrl(sql);
    const body = [
      `Dear ${target.full_name},`,
      `A temporary password has been issued for the ${school[0]?.name ?? "Mukuyu Junior School"} portal.`,
      `Email: ${email}`,
      `Temporary password: ${password}`,
      `Portal link: ${portalUrl}`,
      `Sign in and change this password immediately. If you did not request this, contact the school administrator.`,
    ].join("\n\n");
    const subject = "Your temporary Mukuyu portal password";
    // Do not save plaintext credentials in the mail log or user record.
    await sql`insert into mail_outbox (id, to_email, subject, body) values (${newId("mail")}, ${email}, ${subject}, ${"A temporary password was issued. For security, the credential is not stored in the mail log."})`;
    const sent = await sendPasswordEmail(email, subject, body);
    return { ok: true, email, emailSent: sent.sent, emailNote: sent.sent ? "Sent to the account email" : sent.reason, temporaryPassword: password };
  });

export const listMail = createServerFn({ method: "GET" }).handler(async (): Promise<MailItem[]> => {
  const me = await requireActor();
  if (!isPowerful(me)) throw new Error("Only the super admin or deputy can open the mail log.");
  const sql = await getSql();
  return sql<MailItem>`
    select id, to_email as "toEmail", subject, body, created_at::text as "createdAt"
    from mail_outbox order by created_at desc limit 80`;
});

export const createLearnerLogin = createServerFn({ method: "POST" })
  .validator((input: { learnerId: string; email: string; password: string; kind: "student" | "parent"; parentName?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can create learner or parent logins.");
    const email = data.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Enter a valid email.");
    if (!data.password || data.password.length < 12 || data.password.length > 128) throw new Error("Set a password between 12 and 128 characters.");
    const sql = await getSql();
    const learner = await sql<{ full_name: string }>`select full_name from learners where id = ${data.learnerId}`;
    if (!learner[0]) throw new Error("Learner not found.");
    if (data.kind === "student") {
      const existing = await sql<{ id: string }>`select id from users where learner_id = ${data.learnerId} and role = 'student'`;
      if (existing[0]) throw new Error("This learner already has a student login.");
      const emailTaken = await sql<{ id: string }>`select id from users where email = ${email}`;
      if (emailTaken[0]) throw new Error("That email already belongs to another account.");
      const id = newId("usr");
      await sql`
        insert into users (id, email, password_hash, full_name, role, learner_id, active)
        values (${id}, ${email}, ${hashPassword(data.password)}, ${learner[0].full_name}, 'student', ${data.learnerId}, true)`;
      return { ok: true, email, password: data.password, name: learner[0].full_name };
    }
    const parentName = data.parentName?.trim() || `Parent of ${learner[0].full_name}`;
    const found = await sql<{ id: string; role: string }>`select id, role from users where email = ${email}`;
    let parentId = found[0]?.id;
    if (found[0] && found[0].role !== "parent") throw new Error("That email already belongs to a staff or student account.");
    if (!parentId) {
      parentId = newId("usr");
      await sql`
        insert into users (id, email, password_hash, full_name, role, active)
        values (${parentId}, ${email}, ${hashPassword(data.password)}, ${parentName}, 'parent', true)`;
    } else {
      await sql`update users set password_hash = ${hashPassword(data.password)}, session_version = session_version + 1, active = true where id = ${parentId}`;
    }
    await sql`
      insert into parent_links (parent_user_id, learner_id) values (${parentId}, ${data.learnerId})
      on conflict do nothing`;
    return { ok: true, email, password: data.password, name: parentName };
  });

export const savePrivileges = createServerFn({ method: "POST" })
  .validator((input: { id: string; privSettings: boolean; privStaff: boolean; privImport: boolean; privCalendar: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isPowerful(me)) throw new Error("Only the super admin or deputy can change admin privileges.");
    const sql = await getSql();
    const rows = await sql<{ role: string }>`select role from users where id = ${data.id}`;
    if (rows[0]?.role !== "admin") throw new Error("Privileges are set on admin accounts.");
    await sql`
      update users set
        priv_settings = ${data.privSettings},
        priv_staff = ${data.privStaff},
        priv_import = ${data.privImport},
        priv_calendar = ${data.privCalendar}
      where id = ${data.id}`;
    return { ok: true };
  });

export const saveTermDate = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; closingDate: string; openingDate: string; reportTitle: string; requirements: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "calendar")) throw new Error("You cannot change term dates.");
    const sql = await getSql();
    await sql`
      insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements)
      values (${data.yearId}, ${data.termId}, ${data.closingDate.trim()}, ${data.openingDate.trim()}, ${data.reportTitle.trim()}, ${data.requirements.trim()})
      on conflict (year_id, term_id) do update set
        closing_date = ${data.closingDate.trim()},
        opening_date = ${data.openingDate.trim()},
        report_title = ${data.reportTitle.trim()},
        requirements = ${data.requirements.trim()}`;
    const active = await sql<{ active_year_id: string; active_term_id: string }>`select active_year_id, active_term_id from school_profile where id = 1`;
    if (active[0]?.active_year_id === data.yearId && active[0]?.active_term_id === data.termId) {
      await sql`
        update school_profile set
          closing_date = ${data.closingDate.trim()},
          resumption_date = ${data.openingDate.trim()},
          report_title = ${data.reportTitle.trim()},
          requirements = ${data.requirements.trim()}
        where id = 1`;
    }
    return { ok: true };
  });

export const setActivePeriod = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "calendar")) throw new Error("You cannot change the current term.");
    const sql = await getSql();
    const year = await sql<{ name: string }>`select name from academic_years where id = ${data.yearId}`;
    const term = await sql<{ name: string }>`select name from terms where id = ${data.termId}`;
    const dates = await sql<{ closing_date: string; opening_date: string; report_title: string; requirements: string }>`
      select closing_date, opening_date, report_title, requirements from term_dates where year_id = ${data.yearId} and term_id = ${data.termId}`;
    if (!year[0] || !term[0]) throw new Error("Choose a year and a term.");
    await sql`
      update school_profile set
        active_year_id = ${data.yearId},
        active_term_id = ${data.termId},
        academic_year = ${year[0].name},
        term_name = ${term[0].name.toUpperCase()},
        closing_date = ${dates[0]?.closing_date ?? ""},
        resumption_date = ${dates[0]?.opening_date ?? ""},
        report_title = ${dates[0]?.report_title || `${term[0].name.toUpperCase()} YEAR ${year[0].name} REPORT CARDS`},
        requirements = ${dates[0]?.requirements ?? ""}
      where id = 1`;
    return { ok: true };
  });

export const addYear = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "calendar")) throw new Error("You cannot add a year.");
    const name = data.name.trim();
    if (!/^\d{4}$/.test(name)) throw new Error("Enter a four-digit year, such as 2028.");
    const sql = await getSql();
    const id = `y${name}`;
    await sql`insert into academic_years (id, name, sort) values (${id}, ${name}, ${Number(name)}) on conflict (id) do nothing`;
    const terms = await sql<{ id: string; name: string }>`select id, name from terms order by sort`;
    for (const term of terms) {
      const title = `${term.name.toUpperCase()} YEAR ${name} REPORT CARDS`;
      await sql`
        insert into term_dates (year_id, term_id, report_title)
        values (${id}, ${term.id}, ${title})
        on conflict (year_id, term_id) do nothing`;
    }
    return { ok: true };
  });

export const importLearners = createServerFn({ method: "POST" })
  .validator((input: { gradeId: string; yearId: string; rows: Array<{ roll?: number; fullName: string; gender?: string; streamName?: string }> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "import") && me.role !== "teacher") throw new Error("You cannot import learners.");
    const rows = data.rows.filter((row) => row.fullName?.trim()).slice(0, 400);
    if (!rows.length) throw new Error("No learner names were found.");
    const sql = await getSql();
    const year = await sql<{ id: string; name: string }>`select id, name from academic_years where id = ${data.yearId}`;
    if (!year[0]) throw new Error("Choose a valid academic year for this import.");
    const streams = await sql<{ id: string; name: string }>`select id, name from streams where grade_id = ${data.gradeId}`;
    if (!streams.length) throw new Error("Add a stream for this grade first.");
    const existing = await sql<{ id: string; full_name: string; stream_id: string }>`
      select l.id, l.full_name, coalesce(p.stream_id, l.stream_id) as stream_id from learners l left join learner_year_placements p on p.learner_id = l.id and p.year_id = ${data.yearId} where coalesce(p.grade_id, l.grade_id) = ${data.gradeId} and l.status = 'active'`;
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      const name = row.fullName.trim().toUpperCase().replace(/\s+/g, " ");
      const gender = readGender(row.gender);
      const wanted = (row.streamName ?? "").trim().toUpperCase();
      const stream = streams.find((item) => item.name.toUpperCase() === wanted) ?? streams[0];
      if (!stream) continue;
      if (me.role === "teacher") {
        const allowed = await sql<{ id: string }>`
          select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${stream.id}`;
        if (!allowed.length) throw new Error("Class teachers can import only into their own stream.");
      } else if (!can(me, "import")) {
        throw new Error("You cannot import learners.");
      }
      const found = existing.find((item) => item.full_name === name);
      const roll = Number(row.roll);
      if (found) {
        // An import for a different academic year must not rewrite the learner's live class
        // or any other year's placement. Update only year-specific placement plus safe details.
        if (Number.isInteger(roll) && roll > 0 && gender) {
          await sql`update learners set gender = ${gender}, roll = ${roll} where id = ${found.id}`;
        } else if (Number.isInteger(roll) && roll > 0) {
          await sql`update learners set roll = ${roll} where id = ${found.id}`;
        } else if (gender) {
          await sql`update learners set gender = ${gender} where id = ${found.id}`;
        }
        await sql`insert into learner_year_placements (learner_id, year_id, grade_id, stream_id) values (${found.id}, ${data.yearId}, ${data.gradeId}, ${stream.id}) on conflict (learner_id, year_id) do update set grade_id = excluded.grade_id, stream_id = excluded.stream_id`;
        updated += 1;
        continue;
      }
      const used = await sql<{ n: number }>`select coalesce(max(roll), 0)::int as n from learners where grade_id = ${data.gradeId}`;
      const nextRoll = Number.isInteger(roll) && roll > 0 ? roll : (used[0]?.n ?? 0) + 1;
      const id = newId("lrn");
      const admissionNumber = await freshAdmissionNumber(sql);
      const cohort = await sql<{ academic_year: string }>`select academic_year from school_profile where id = 1`;
      const cohortYear = year[0].name || cohort[0]?.academic_year || String(new Date().getFullYear());
      await sql`
        insert into learners (id, roll, full_name, gender, grade_id, stream_id, public_code, admission_number, cohort_year)
        values (${id}, ${nextRoll}, ${name}, ${gender || "FEMALE"}, ${data.gradeId}, ${stream.id}, ${await freshCode(sql)}, ${admissionNumber}, ${cohortYear})`;
      await sql`insert into learner_year_placements (learner_id, year_id, grade_id, stream_id) values (${id}, ${data.yearId}, ${data.gradeId}, ${stream.id}) on conflict (learner_id, year_id) do update set grade_id = excluded.grade_id, stream_id = excluded.stream_id`;
      existing.push({ id, full_name: name, stream_id: stream.id });
      added += 1;
    }
    return { added, updated };
  });

export const childReport = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const roleAccess = await readRoleAccess(sql);
    if ((me.role === "parent" || me.role === "student") && !canActorAccess(roleAccess, me.role, "familyResults", "view")) throw new Error("Family results viewing is currently locked by the Super Admin.");
    let ids: string[] = [];
    if (me.role === "student" && me.learnerId) ids = [me.learnerId];
    if (me.role === "parent") {
      const links = await sql<{ learner_id: string }>`select learner_id from parent_links where parent_user_id = ${me.id}`;
      ids = links.map((row) => row.learner_id);
    }
    if (!ids.length && isAdmin(me.role)) return { rows: [] as Decorated[] };
    if (!ids.length) throw new Error("No learner is linked to this account.");
    const learnerGrades = await sql<{ id: string; grade_id: string }>`select id, grade_id from learners where status = 'active' and id = any(${ids}::text[])`;
    const historicGrades = await sql<{ grade_id: string }>`select distinct grade_id from marks where learner_id = any(${ids}::text[]) and year_id = ${data.yearId} and term_id = ${data.termId}`;
    const grades = [...new Set([...learnerGrades.map((row) => row.grade_id), ...historicGrades.map((row) => row.grade_id)])];
    const rows: Decorated[] = [];
    for (const gradeId of grades) {
      const book = await reportForGrade(sql, gradeId, data.yearId, data.termId, ids);
      rows.push(...book.rows);
    }
    return { rows };
  });


export async function buildSchoolBackupPayload(sql: Awaited<ReturnType<typeof getSql>>, generatedBy: string) {
  const [profile, grades, streams, subjects, exams, gradingBands, years, terms, termAssessments, termDates, learners, marks, assignments, parentLinks, accounts, movements, termNotes, subjectRemarks, timetablePeriods, timetableEntries, timetableRooms, timetableAvailability, timetableRequirements, teacherContracts, timetableStates, timetableVersions, welcomePage] = await Promise.all([
    sql`select * from school_profile order by id`,
    sql`select * from grades order by level`,
    sql`select * from streams order by grade_id, sort`,
    sql`select * from subjects order by sort`,
    sql`select * from exams order by sort`,
    sql`select * from grading_bands order by min_score`,
    sql`select * from academic_years order by sort`,
    sql`select * from terms order by sort`,
    sql`select * from term_assessments order by year_id, term_id, exam_id`,
    sql`select * from term_dates order by year_id, term_id`,
    sql`select * from learners order by grade_id, stream_id, roll`,
    sql`select * from marks order by year_id, term_id, learner_id, subject_id`,
    sql`select * from assignments order by user_id, kind`,
    sql`select * from parent_links order by parent_user_id, learner_id`,
    sql`select id, email, full_name, role, active, learner_id, is_deputy, initials, delegated_responsibilities, can_view_other_subjects, can_edit_other_subjects, priv_settings, priv_staff, priv_import, priv_calendar, created_at from users order by role, full_name`,
    sql`select * from learner_move_history order by moved_at`,
    sql`select * from learner_term_notes order by year_id, term_id, learner_id`,
    sql`select * from subject_remarks order by year_id, term_id, learner_id, subject_id`,
    sql`select * from timetable_periods order by year_id, term_id, sort`,
    sql`select * from timetable_entries order by year_id, term_id, day_of_week, period_id`,
    sql`select * from timetable_rooms order by name`,
    sql`select * from timetable_availability order by year_id, term_id, day_of_week`,
    sql`select * from timetable_requirements order by year_id, term_id, grade_id, subject_id`,
    sql`select * from teacher_contracts order by year_id, term_id, teacher_user_id`,
    sql`select * from timetable_state order by year_id, term_id`,
    sql`select * from timetable_versions order by created_at`,
    sql`select * from welcome_page order by id`,
  ]);
  const [dailyAttendance, homeworkTasks, homeworkProgress, schoolEvents, guardianContacts, guardianContactLog, parentMeetings, staffAbsences, learnerSupportEvents, emergencyProfiles] = await Promise.all([
    sql`select * from daily_attendance order by attendance_date, learner_id`,
    sql`select * from homework_tasks order by due_date`,
    sql`select * from homework_progress order by task_id, learner_id`,
    sql`select * from school_events order by event_date`,
    sql`select * from guardian_contacts order by learner_id, name`,
    sql`select * from guardian_contact_log order by created_at`,
    sql`select * from parent_meeting_requests order by created_at`,
    sql`select * from staff_absence_requests order by created_at`,
    sql`select * from learner_support_events order by created_at`,
    sql`select * from learner_emergency_profiles order by learner_id`,
  ]);
  return {
    format: "mukuyu-school-backup-v1",
    generatedAt: new Date().toISOString(),
    generatedBy,
    note: "This export excludes passwords, hashes, and the live audit trail. It includes private learner health, guardian, support, attendance and staff-request records; store it encrypted and restrict access.",
    tables: { school_profile: profile, grades, streams, subjects, exams, grading_bands: gradingBands, academic_years: years, terms, term_assessments: termAssessments, term_dates: termDates, learners, marks, assignments, parent_links: parentLinks, accounts, learner_move_history: movements, learner_term_notes: termNotes, subject_remarks: subjectRemarks, timetable_periods: timetablePeriods, timetable_entries: timetableEntries, timetable_rooms: timetableRooms, timetable_availability: timetableAvailability, timetable_requirements: timetableRequirements, teacher_contracts: teacherContracts, timetable_state: timetableStates, timetable_versions: timetableVersions, welcome_page: welcomePage, daily_attendance: dailyAttendance, homework_tasks: homeworkTasks, homework_progress: homeworkProgress, school_events: schoolEvents, guardian_contacts: guardianContacts, guardian_contact_log: guardianContactLog, parent_meeting_requests: parentMeetings, staff_absence_requests: staffAbsences, learner_support_events: learnerSupportEvents, learner_emergency_profiles: emergencyProfiles },
  } as {
    format: string;
    generatedAt: string;
    generatedBy: string;
    note: string;
    tables: Record<string, Array<Record<string, string | number | boolean | null>>>;
  };
}

export const getQrFeedbackSettings = createServerFn({method:"GET"}).handler(async()=>{const me=await requireActor();if(!isTrueSuper(me))throw new Error("Only the super admin can configure QR parent feedback.");const sql=await getSql();return(await sql<{recipientScope:string;allowTeacherSelection:boolean;autoreplyEnabled:boolean}>`select recipient_scope as "recipientScope",allow_teacher_selection as "allowTeacherSelection",autoreply_enabled as "autoreplyEnabled" from qr_feedback_settings where id=1`)[0]??{recipientScope:"class_teacher",allowTeacherSelection:true,autoreplyEnabled:false};});
export const saveQrFeedbackSettings = createServerFn({method:"POST"}).validator((input:{recipientScope:"teacher"|"class_teacher"|"admin"|"super_admin";allowTeacherSelection:boolean;autoreplyEnabled:boolean})=>input).handler(async({data})=>{const me=await requireActor();if(!isTrueSuper(me))throw new Error("Only the super admin can configure QR parent feedback.");const sql=await getSql();await sql`update qr_feedback_settings set recipient_scope=${data.recipientScope},allow_teacher_selection=${data.allowTeacherSelection},autoreply_enabled=${data.autoreplyEnabled},updated_at=now() where id=1`;return{ok:true};});
export const submitQrParentFeedback = createServerFn({method:"POST"}).validator((input:{code:string;parentName:string;parentEmail:string;teacherUserId?:string;message:string;website?:string})=>input).handler(async({data})=>{if(data.website?.trim())throw new Error("Unable to submit this message.");const code=data.code.trim().toLowerCase();const parentName=data.parentName.trim();const email=data.parentEmail.trim().toLowerCase();const message=data.message.trim();if(!/^[a-z0-9]{4,12}$/.test(code)||parentName.length<2||parentName.length>120||message.length<4||message.length>1500)throw new Error("Enter your name and a message (4–1,500 characters).");if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid email address or leave it blank.");const sql=await getSql();const learners=await sql<{id:string;fullName:string;gradeId:string;streamId:string;gradeName:string;streamName:string}>`select l.id,l.full_name as "fullName",l.grade_id as "gradeId",l.stream_id as "streamId",g.name as "gradeName",s.name as "streamName" from learners l join grades g on g.id=l.grade_id join streams s on s.id=l.stream_id where l.public_code=${code} and l.status='active'`;const learner=learners[0];if(!learner)throw new Error("This report link is no longer active.");const settings=(await sql<{recipient_scope:string;autoreply_enabled:boolean;allow_teacher_selection:boolean}>`select recipient_scope,autoreply_enabled,allow_teacher_selection from qr_feedback_settings where id=1`)[0]??{recipient_scope:"class_teacher",autoreply_enabled:false,allow_teacher_selection:true};const recent=await sql<{n:number}>`select count(*)::int as n from qr_parent_feedback where learner_id=${learner.id} and created_at>now()-interval '1 hour'`;if(Number(recent[0]?.n??0)>=8)throw new Error("Please wait before sending another message for this report.");let teacherId:string|null=null;if(data.teacherUserId&&settings.allow_teacher_selection&&["teacher","class_teacher"].includes(settings.recipient_scope)){const valid=await sql<{id:string}>`select u.id from users u join assignments a on a.user_id=u.id where u.id=${data.teacherUserId} and u.active=true and u.role in ('teacher','admin','super_admin') and a.stream_id=${learner.streamId} and a.kind in ('class_teacher','subject_teacher','hod')`;if(!valid[0])throw new Error("That teacher is not assigned to this class.");teacherId=valid[0].id;}const id=newId("qrf");await sql`insert into qr_parent_feedback(id,learner_id,learner_name,grade_name,stream_name,parent_name,parent_email,teacher_user_id,recipient_scope,message) values(${id},${learner.id},${learner.fullName},${learner.gradeName},${learner.streamName},${parentName},${email},${teacherId},${settings.recipient_scope},${message})`;let autoReplySent=false;if(settings.autoreply_enabled&&email&&process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:`We received your message about ${learner.fullName}`,text:`Dear ${parentName},\n\nThank you for contacting the school. Your message about ${learner.fullName} (${learner.gradeName} ${learner.streamName}) has been received by the school. A member of staff will follow up if needed.\n\nPlease do not reply with sensitive information.`})});autoReplySent=response.ok;}catch{autoReplySent=false;}}return{ok:true,autoReplySent};});
export const listQrParentFeedback = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!["teacher", "admin", "super_admin"].includes(me.role)) throw new Error("Only staff can view parent feedback.");
  const sql = await getSql();
  const assignments = await serviceAssignments(sql, me);
  const rows = await sql<{
    id: string; learnerId: string; learnerName: string; gradeName: string; streamName: string;
    streamId: string; parentName: string; parentEmail: string; teacherUserId: string | null;
    recipientScope: string; message: string; status: string; staffReply: string; createdAt: string;
  }>`select f.id,f.learner_id as "learnerId",f.learner_name as "learnerName",f.grade_name as "gradeName",
    f.stream_name as "streamName",l.stream_id as "streamId",f.parent_name as "parentName",f.parent_email as "parentEmail",
    f.teacher_user_id as "teacherUserId",f.recipient_scope as "recipientScope",f.message,f.status,
    f.staff_reply as "staffReply",f.created_at::text as "createdAt"
    from qr_parent_feedback f join learners l on l.id=f.learner_id order by f.created_at desc limit 300`;
  return rows.filter((row) => {
    if (me.role === "super_admin") return true;
    if (row.recipientScope === "super_admin") return false;
    if (row.recipientScope === "admin") return me.role === "admin";
    if (me.role === "admin") return row.recipientScope === "class_teacher";
    if (me.role !== "teacher") return false;
    if (row.recipientScope === "teacher") return row.teacherUserId === me.id;
    if (row.recipientScope !== "class_teacher") return false;
    if (row.teacherUserId) return row.teacherUserId === me.id;
    return assignments.some((assignment) => assignment.kind === "class_teacher" && assignment.streamId === row.streamId);
  }).map(({ streamId: _streamId, ...row }) => row);
});

export const replyQrParentFeedback = createServerFn({ method: "POST" })
  .validator((input: { id: string; reply: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const reply = data.reply?.trim() ?? "";
    if (reply.length < 2 || reply.length > 1200) throw new Error("Enter a brief reply (2–1,200 characters).");
    const sql = await getSql();
    const target = await sql<{
      teacherUserId: string | null; recipientScope: string; streamId: string;
      email: string; parentName: string; learnerName: string;
    }>`select f.teacher_user_id as "teacherUserId",f.recipient_scope as "recipientScope",l.stream_id as "streamId",
      f.parent_email as email,f.parent_name as "parentName",f.learner_name as "learnerName"
      from qr_parent_feedback f join learners l on l.id=f.learner_id where f.id=${data.id}`;
    const row = target[0];
    if (!row) throw new Error("This parent message is no longer available.");
    let permitted = me.role === "super_admin";
    if (!permitted && me.role === "admin") permitted = row.recipientScope === "admin" || row.recipientScope === "class_teacher";
    if (!permitted && me.role === "teacher") {
      const assignments = await serviceAssignments(sql, me);
      if (row.recipientScope === "teacher") permitted = row.teacherUserId === me.id;
      else if (row.recipientScope === "class_teacher") permitted = row.teacherUserId
        ? row.teacherUserId === me.id
        : assignments.some((assignment) => assignment.kind === "class_teacher" && assignment.streamId === row.streamId);
    }
    if (!permitted) throw new Error("This parent message is not assigned to your account.");
    let emailSent = false;
    if (row.email && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [row.email], subject: `Reply from the school about ${row.learnerName}`, text: `Dear ${row.parentName},\n\n${reply}\n\nSchool office` }),
        });
        emailSent = response.ok;
      } catch { emailSent = false; }
    }
    await sql`update qr_parent_feedback set staff_reply=${reply},status='replied',replied_at=now() where id=${data.id}`;
    return { ok: true, emailSent };
  });

export const getScheduledBackupSettings = createServerFn({method:"GET"}).handler(async()=>{const me=await requireActor();if(!isTrueSuper(me))throw new Error("Only the super admin can configure automatic backups.");const sql=await getSql();return(await sql<{enabled:boolean;recipientEmail:string;cadence:string}>`select enabled,recipient_email as "recipientEmail",cadence from scheduled_backup_settings where id=1`)[0]??{enabled:false,recipientEmail:"",cadence:"daily"};});
export const saveScheduledBackupSettings = createServerFn({method:"POST"}).validator((input:{enabled:boolean;recipientEmail:string;cadence:"daily"|"weekly"|"monthly"})=>input).handler(async({data})=>{const me=await requireActor();if(!isTrueSuper(me))throw new Error("Only the super admin can configure automatic backups.");if(data.enabled&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.recipientEmail.trim()))throw new Error("Enter a valid backup recipient email.");const sql=await getSql();await sql`update scheduled_backup_settings set enabled=${data.enabled},recipient_email=${data.recipientEmail.trim().toLowerCase()},cadence=${data.cadence},updated_at=now() where id=1`;return{ok:true};});

export const exportSchoolBackup = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!isAdmin(me.role)) throw new Error("Only school admins can export a school backup.");
  const sql = await getSql();
  const payload = await buildSchoolBackupPayload(sql, me.email);
  await sql`insert into office_backups (id, kind, note, payload, created_by) values (${newId("bak")}, 'manual', 'Downloaded school records backup', ${JSON.stringify(payload)}, ${me.id})`;
  await sql`delete from office_backups where kind = 'manual' and id not in (select id from office_backups where kind = 'manual' order by created_at desc limit 10)`;
  return payload;
});

export const restoreSchoolBackup = createServerFn({ method: "POST" })
  .validator((input: { payload: string; confirm: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can restore a backup.");
    if (data.confirm !== "RESTORE") throw new Error("Type RESTORE to confirm this operation.");
    if (!data.payload || data.payload.length > 4_000_000) throw new Error("Backup file is empty or larger than the 4 MB web-restore limit. Use a database-level restore for larger backups.");
    let parsed: any;
    try { parsed = JSON.parse(data.payload); } catch { throw new Error("The selected file is not valid JSON."); }
    if (parsed?.format !== "mukuyu-school-backup-v1" || !parsed.tables || !Array.isArray(parsed.tables.learners) || !Array.isArray(parsed.tables.marks)) throw new Error("This is not a supported Mukuyu School Portal backup.");
    const t = parsed.tables as Record<string, any[]>;
    const backupLearners = t.learners as Array<Record<string, unknown>>;
    const admissionSet = new Set<string>();
    for (const learner of backupLearners) {
      const admission = String(learner.admission_number ?? "").trim().toUpperCase();
      if (admission && admissionSet.has(admission)) throw new Error(`Backup contains duplicate admission number ${admission}. Fix the file before restoring.`);
      if (admission) admissionSet.add(admission);
    }
    for (const mark of t.marks as Array<Record<string, unknown>>) {
      const score = Number(mark.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("Backup contains a score outside 0–100. No records were restored.");
    }
    const sql = await getSql();
    for (const learner of backupLearners) {
      const admission = String(learner.admission_number ?? "").trim().toUpperCase();
      if (!admission) continue;
      const conflict = await sql`select id from learners where upper(admission_number) = ${admission} and id <> ${String(learner.id)}`;
      if (conflict[0]) throw new Error(`Admission number ${admission} is already assigned to a different learner in this database. No records were restored.`);
    }
    const safety = await buildSchoolBackupPayload(sql, me.email);
    await sql`insert into office_backups (id, kind, note, payload, created_by) values (${newId("bak")}, 'pre-restore', 'Automatic safety snapshot taken before merge restore', ${JSON.stringify(safety)}, ${me.id})`;
    await sql`delete from office_backups where kind = 'pre-restore' and id not in (select id from office_backups where kind = 'pre-restore' order by created_at desc limit 10)`;
    const restored = { years: 0, terms: 0, grades: 0, streams: 0, subjects: 0, exams: 0, learners: 0, marks: 0, assignments: 0, timetablePeriods: 0, timetableEntries: 0, timetableRooms: 0, timetableAvailability: 0, timetableRequirements: 0, teacherContracts: 0, timetableVersions: 0 };
    const text = (row: any, key: string, fallback = "") => row?.[key] == null ? fallback : String(row[key]);
    const num = (row: any, key: string, fallback = 0) => Number.isFinite(Number(row?.[key])) ? Number(row[key]) : fallback;
    const bool = (row: any, key: string, fallback = false) => row?.[key] == null ? fallback : Boolean(row[key]);

    for (const row of t.academic_years ?? []) { await sql`insert into academic_years (id, name, sort) values (${text(row,"id")}, ${text(row,"name")}, ${num(row,"sort")}) on conflict (id) do update set name = excluded.name, sort = excluded.sort`; restored.years++; }
    for (const row of t.terms ?? []) { await sql`insert into terms (id, name, sort) values (${text(row,"id")}, ${text(row,"name")}, ${num(row,"sort")}) on conflict (id) do update set name = excluded.name, sort = excluded.sort`; restored.terms++; }
    for (const row of t.grades ?? []) { await sql`insert into grades (id, name, level, report_title) values (${text(row,"id")}, ${text(row,"name")}, ${num(row,"level")}, ${text(row,"report_title")}) on conflict (id) do update set name = excluded.name, level = excluded.level, report_title = excluded.report_title`; restored.grades++; }
    for (const row of t.streams ?? []) { await sql`insert into streams (id, grade_id, name, class_teacher_label, sort) values (${text(row,"id")}, ${text(row,"grade_id")}, ${text(row,"name")}, ${text(row,"class_teacher_label")}, ${num(row,"sort")}) on conflict (id) do update set grade_id = excluded.grade_id, name = excluded.name, class_teacher_label = excluded.class_teacher_label, sort = excluded.sort`; restored.streams++; }
    for (const row of t.subjects ?? []) { await sql`insert into subjects (id, name, short_name, sort) values (${text(row,"id")}, ${text(row,"name")}, ${text(row,"short_name")}, ${num(row,"sort")}) on conflict (id) do update set name = excluded.name, short_name = excluded.short_name, sort = excluded.sort`; restored.subjects++; }
    for (const row of t.exams ?? []) { await sql`insert into exams (id, name, code, sort) values (${text(row,"id")}, ${text(row,"name")}, ${text(row,"code")}, ${num(row,"sort")}) on conflict (id) do update set name = excluded.name, code = excluded.code, sort = excluded.sort`; restored.exams++; }
    for (const row of t.grading_bands ?? []) { await sql`insert into grading_bands (min_score, code, points, subject_remark, head_remark, class_remark) values (${num(row,"min_score")}, ${text(row,"code")}, ${num(row,"points")}, ${text(row,"subject_remark")}, ${text(row,"head_remark")}, ${text(row,"class_remark")}) on conflict (min_score) do update set code = excluded.code, points = excluded.points, subject_remark = excluded.subject_remark, head_remark = excluded.head_remark, class_remark = excluded.class_remark`; }
    const profile = (t.school_profile ?? [])[0];
    if (profile) await sql`update school_profile set name=${text(profile,"name")}, po_box=${text(profile,"po_box")}, mission=${text(profile,"mission")}, vision=${text(profile,"vision")}, motto=${text(profile,"motto")}, head_teacher=${text(profile,"head_teacher")}, dos=${text(profile,"dos")}, location=${text(profile,"location")}, contact=${text(profile,"contact")}, email=${text(profile,"email")}, academic_year=${text(profile,"academic_year")}, term_name=${text(profile,"term_name")}, report_title=${text(profile,"report_title")}, closing_date=${text(profile,"closing_date")}, resumption_date=${text(profile,"resumption_date")}, cat_note=${text(profile,"cat_note")}, requirements=${text(profile,"requirements")}, greeting=${text(profile,"greeting")}, home_note=${text(profile,"home_note")}, public_base_url=${text(profile,"public_base_url")}, logo_data=${text(profile,"logo_data")}, active_year_id=${text(profile,"active_year_id")}, active_term_id=${text(profile,"active_term_id")}, show_qr=${bool(profile,"show_qr",true)}, show_chart=${bool(profile,"show_chart",true)}, show_remarks=${bool(profile,"show_remarks",true)}, show_positions=${bool(profile,"show_positions",true)}, report_exam_count=${num(profile,"report_exam_count",2)}, show_teacher_initials=${bool(profile,"show_teacher_initials")}, show_subject_teacher_initials=${bool(profile,"show_subject_teacher_initials")}, show_subject_rank=${bool(profile,"show_subject_rank")}, show_subject_spotlight=${bool(profile,"show_subject_spotlight")}, show_previous_term=${bool(profile,"show_previous_term")}, show_attendance=${bool(profile,"show_attendance")}, show_custom_remarks=${bool(profile,"show_custom_remarks")}, color_t1=${text(profile,"color_t1","#1d4e89")}, color_t2=${text(profile,"color_t2","#9a7430")}, color_t3=${text(profile,"color_t3","#1f7a4d")}, whatsapp_group_enabled=${bool(profile,"whatsapp_group_enabled")}, whatsapp_group_url=${text(profile,"whatsapp_group_url")}, whatsapp_group_label=${text(profile,"whatsapp_group_label")} where id=1`;
    const welcome = (t.welcome_page ?? [])[0];
    if (welcome) await sql`update welcome_page set title=${text(welcome,"title","Mukuyu Junior School")}, subtitle=${text(welcome,"subtitle","Learner Progress Portal")}, announcement=${text(welcome,"announcement")}, contact=${text(welcome,"contact")}, show_logo=${bool(welcome,"show_logo",true)}, logo_data=${text(welcome,"logo_data")}, background_start=${text(welcome,"background_start","#0e2a4a")}, background_end=${text(welcome,"background_end","#245b82")}, title_size=${num(welcome,"title_size",48)}, animated=${bool(welcome,"animated",true)}, music_enabled=${bool(welcome,"music_enabled")}, music_url=${text(welcome,"music_url")}, highlights=${text(welcome,"highlights")}, certification=${text(welcome,"certification","© 2026 Certified")}, footer_text=${text(welcome,"footer_text")}, appearance_json=${text(welcome,"appearance_json","{}")}, font_family=${text(welcome,"font_family","serif")}, animation_style=${text(welcome,"animation_style","aurora")} where id=1`;
    for (const row of t.timetable_rooms ?? []) { await sql`insert into timetable_rooms (id, name, capacity, room_type, features, active) values (${text(row,"id")}, ${text(row,"name")}, ${num(row,"capacity")}, ${text(row,"room_type")}, ${text(row,"features")}, ${bool(row,"active",true)}) on conflict (id) do update set name=excluded.name, capacity=excluded.capacity, room_type=excluded.room_type, features=excluded.features, active=excluded.active`; restored.timetableRooms++; }
    for (const row of t.learners ?? []) {
      const admission = text(row, "admission_number").trim() || await freshAdmissionNumber(sql);
      const cohort = text(row, "cohort_year", String(new Date().getFullYear()));
      await sql`insert into learners (id, roll, full_name, gender, grade_id, stream_id, status, public_code, admission_number, cohort_year) values (${text(row,"id")}, ${num(row,"roll")}, ${text(row,"full_name")}, ${text(row,"gender")}, ${text(row,"grade_id")}, ${text(row,"stream_id")}, ${text(row,"status","active")}, ${text(row,"public_code")}, ${admission}, ${cohort}) on conflict (id) do update set roll=excluded.roll, full_name=excluded.full_name, gender=excluded.gender, grade_id=excluded.grade_id, stream_id=excluded.stream_id, status=excluded.status, public_code=excluded.public_code, admission_number=excluded.admission_number, cohort_year=excluded.cohort_year`;
      restored.learners++;
    }
    for (const row of t.term_dates ?? []) await sql`insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values (${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"closing_date")}, ${text(row,"opening_date")}, ${text(row,"report_title")}, ${text(row,"requirements")}) on conflict (year_id, term_id) do update set closing_date=excluded.closing_date, opening_date=excluded.opening_date, report_title=excluded.report_title, requirements=excluded.requirements`;
    for (const row of t.term_assessments ?? []) await sql`insert into term_assessments (id, year_id, term_id, exam_id, active) values (${text(row,"id",newId("tas"))}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"exam_id")}, ${bool(row,"active",true)}) on conflict (year_id, term_id, exam_id) do update set active=excluded.active`;
    for (const row of t.timetable_periods ?? []) {
      await sql`insert into timetable_periods (id, year_id, term_id, label, start_time, end_time, sort, is_break) values (${text(row,"id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"label")}, ${text(row,"start_time")}, ${text(row,"end_time")}, ${num(row,"sort",1)}, ${bool(row,"is_break")}) on conflict (id) do update set year_id=excluded.year_id, term_id=excluded.term_id, label=excluded.label, start_time=excluded.start_time, end_time=excluded.end_time, sort=excluded.sort, is_break=excluded.is_break`;
      restored.timetablePeriods++;
    }
    for (const row of t.timetable_entries ?? []) {
      const period = await sql`select id from timetable_periods where id = ${text(row,"period_id")}`;
      const teacher = await sql`select id from users where id = ${text(row,"teacher_user_id")} and active = true`;
      if (!period[0] || !teacher[0]) continue;
      await sql`insert into timetable_entries (id, year_id, term_id, day_of_week, period_id, grade_id, stream_id, subject_id, teacher_user_id, room, notes, block_length, locked, created_by, created_at, updated_at) values (${text(row,"id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${num(row,"day_of_week",1)}, ${text(row,"period_id")}, ${text(row,"grade_id")}, ${row.stream_id ?? null}, ${text(row,"subject_id")}, ${text(row,"teacher_user_id")}, ${text(row,"room")}, ${text(row,"notes")}, ${Math.max(1, Math.min(3, num(row,"block_length",1)))}, ${bool(row,"locked")}, ${text(row,"created_by",me.id)}, ${text(row,"created_at",new Date().toISOString())}, ${text(row,"updated_at",new Date().toISOString())}) on conflict (id) do update set year_id=excluded.year_id, term_id=excluded.term_id, day_of_week=excluded.day_of_week, period_id=excluded.period_id, grade_id=excluded.grade_id, stream_id=excluded.stream_id, subject_id=excluded.subject_id, teacher_user_id=excluded.teacher_user_id, room=excluded.room, notes=excluded.notes, block_length=excluded.block_length, locked=excluded.locked, updated_at=excluded.updated_at`;
      restored.timetableEntries++;
    }
    for (const row of t.timetable_availability ?? []) {
      const period = await sql`select id from timetable_periods where id = ${text(row,"period_id")}`;
      if (!period[0]) continue;
      await sql`insert into timetable_availability (id, year_id, term_id, entity_type, entity_id, day_of_week, period_id, available, level, note) values (${text(row,"id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"entity_type")}, ${text(row,"entity_id")}, ${num(row,"day_of_week",1)}, ${text(row,"period_id")}, ${bool(row,"available")}, ${text(row,"level","off")}, ${text(row,"note")}) on conflict (year_id, term_id, entity_type, entity_id, day_of_week, period_id) do update set available=excluded.available, level=excluded.level, note=excluded.note`;
      restored.timetableAvailability++;
    }
    for (const row of t.timetable_requirements ?? []) {
      const teacher = await sql`select id from users where id = ${text(row,"teacher_user_id")} and active = true`;
      if (!teacher[0]) continue;
      await sql`insert into timetable_requirements (id, year_id, term_id, grade_id, stream_id, subject_id, teacher_user_id, lessons_per_week, block_length, preferred_room, distribution, preferred_double_day, timing_preference) values (${text(row,"id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"grade_id")}, ${row.stream_id ?? null}, ${text(row,"subject_id")}, ${text(row,"teacher_user_id")}, ${num(row,"lessons_per_week",1)}, ${Math.max(1, Math.min(3, num(row,"block_length",1)))}, ${text(row,"preferred_room")}, ${text(row,"distribution")}, ${row.preferred_double_day == null ? null : num(row,"preferred_double_day")}, ${text(row,"timing_preference","none")}) on conflict (id) do update set grade_id=excluded.grade_id, stream_id=excluded.stream_id, subject_id=excluded.subject_id, teacher_user_id=excluded.teacher_user_id, lessons_per_week=excluded.lessons_per_week, block_length=excluded.block_length, preferred_room=excluded.preferred_room, distribution=excluded.distribution, preferred_double_day=excluded.preferred_double_day, timing_preference=excluded.timing_preference`;
      restored.timetableRequirements++;
    }
    for (const row of t.teacher_contracts ?? []) {
      const teacher = await sql`select id from users where id = ${text(row,"teacher_user_id")} and active = true`;
      if (!teacher[0]) continue;
      await sql`insert into teacher_contracts (id, year_id, term_id, teacher_user_id, min_per_day, max_per_day, max_per_week, max_consecutive, max_days, max_windows, min_rest_periods) values (${text(row,"id",`tc_${text(row,"teacher_user_id")}_${text(row,"year_id")}_${text(row,"term_id")}`)}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"teacher_user_id")}, ${num(row,"min_per_day",0)}, ${num(row,"max_per_day",6)}, ${num(row,"max_per_week",30)}, ${num(row,"max_consecutive",4)}, ${num(row,"max_days",5)}, ${num(row,"max_windows",3)}, ${num(row,"min_rest_periods",0)}) on conflict (year_id, term_id, teacher_user_id) do update set min_per_day=excluded.min_per_day, max_per_day=excluded.max_per_day, max_per_week=excluded.max_per_week, max_consecutive=excluded.max_consecutive, max_days=excluded.max_days, max_windows=excluded.max_windows, min_rest_periods=excluded.min_rest_periods`;
      restored.teacherContracts++;
    }
    for (const row of t.timetable_state ?? []) await sql`insert into timetable_state (year_id, term_id, published, effective_from, published_at, updated_at) values (${text(row,"year_id")}, ${text(row,"term_id")}, ${bool(row,"published")}, ${row.effective_from ?? null}, ${row.published_at ?? null}, ${text(row,"updated_at",new Date().toISOString())}) on conflict (year_id, term_id) do update set published=excluded.published, effective_from=excluded.effective_from, published_at=excluded.published_at, updated_at=now()`;
    for (const row of t.timetable_versions ?? []) {
      const creator = await sql`select id from users where id = ${text(row,"created_by")}`;
      await sql`insert into timetable_versions (id, year_id, term_id, label, payload_json, created_by, created_at) values (${text(row,"id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"label")}, ${text(row,"payload_json","{}")}, ${creator[0] ? text(row,"created_by") : null}, ${text(row,"created_at",new Date().toISOString())}) on conflict (id) do update set label=excluded.label, payload_json=excluded.payload_json, created_at=excluded.created_at`;
      restored.timetableVersions++;
    }
    for (const row of t.assignments ?? []) {
      const user = await sql`select id from users where id = ${text(row,"user_id")}`;
      if (!user[0]) continue;
      await sql`insert into assignments (id, user_id, kind, grade_id, stream_id, subject_id) values (${text(row,"id")}, ${text(row,"user_id")}, ${text(row,"kind")}, ${row.grade_id ?? null}, ${row.stream_id ?? null}, ${row.subject_id ?? null}) on conflict (id) do update set user_id=excluded.user_id, kind=excluded.kind, grade_id=excluded.grade_id, stream_id=excluded.stream_id, subject_id=excluded.subject_id`;
      restored.assignments++;
    }
    for (const row of t.marks ?? []) {
      const learnerPlace = await sql<{ grade_id: string; stream_id: string }>`select grade_id, stream_id from learners where id = ${text(row,"learner_id")}`;
      if (!learnerPlace[0]) continue;
      const gradeSnapshot = text(row, "grade_id", learnerPlace[0].grade_id) || learnerPlace[0].grade_id;
      const streamSnapshot = text(row, "stream_id", learnerPlace[0].stream_id) || learnerPlace[0].stream_id;
      await sql`insert into marks (learner_id, subject_id, exam_id, year_id, term_id, grade_id, stream_id, score, status, updated_by, updated_at) values (${text(row,"learner_id")}, ${text(row,"subject_id")}, ${text(row,"exam_id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${gradeSnapshot}, ${streamSnapshot}, ${num(row,"score")}, ${text(row,"status","recorded")}, ${text(row,"updated_by",me.id)}, ${text(row,"updated_at",new Date().toISOString())}) on conflict (learner_id, subject_id, exam_id, year_id, term_id) do update set score=excluded.score, grade_id=excluded.grade_id, stream_id=excluded.stream_id, status=excluded.status, updated_by=excluded.updated_by, updated_at=excluded.updated_at`;
      restored.marks++;
    }
    for (const row of t.learner_term_notes ?? []) {
      const learner = await sql`select id from learners where id = ${text(row, "learner_id")}`;
      if (!learner[0]) continue;
      const present = row.days_present == null || row.days_present === "" ? null : num(row, "days_present");
      const expected = row.days_expected == null || row.days_expected === "" ? null : num(row, "days_expected");
      await sql`insert into learner_term_notes (learner_id, year_id, term_id, days_present, days_expected, conduct, comment) values (${text(row,"learner_id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${present}, ${expected}, ${text(row,"conduct")}, ${text(row,"comment")}) on conflict (learner_id, year_id, term_id) do update set days_present=excluded.days_present, days_expected=excluded.days_expected, conduct=excluded.conduct, comment=excluded.comment`;
    }
    for (const row of t.subject_remarks ?? []) {
      const learner = await sql`select id from learners where id = ${text(row, "learner_id")}`;
      if (!learner[0]) continue;
      await sql`insert into subject_remarks (learner_id, subject_id, year_id, term_id, remark) values (${text(row,"learner_id")}, ${text(row,"subject_id")}, ${text(row,"year_id")}, ${text(row,"term_id")}, ${text(row,"remark")}) on conflict (learner_id, subject_id, year_id, term_id) do update set remark=excluded.remark`;
    }
    for (const row of t.learner_move_history ?? []) await sql`insert into learner_move_history (id, learner_id, learner_name, from_grade_id, to_grade_id, from_stream_id, to_stream_id, moved_by, reason, moved_at) values (${text(row,"id")}, ${text(row,"learner_id")}, ${text(row,"learner_name")}, ${text(row,"from_grade_id")}, ${text(row,"to_grade_id")}, ${text(row,"from_stream_id")}, ${text(row,"to_stream_id")}, ${text(row,"moved_by",me.id)}, ${text(row,"reason","restored from backup")}, ${text(row,"moved_at",new Date().toISOString())}) on conflict (id) do nothing`;
    for (const row of t.parent_links ?? []) {
      const parent = await sql`select id from users where id = ${text(row,"parent_user_id")}`;
      const learner = await sql`select id from learners where id = ${text(row,"learner_id")}`;
      if (parent[0] && learner[0]) await sql`insert into parent_links (parent_user_id, learner_id) values (${text(row,"parent_user_id")}, ${text(row,"learner_id")}) on conflict do nothing`;
    }
    for (const row of t.daily_attendance ?? []) {
      const learner = await sql`select id from learners where id=${text(row,"learner_id")}`;
      if (!learner[0]) continue;
      const status = ["present","absent","late","excused"].includes(text(row,"status")) ? text(row,"status") : "present";
      await sql`insert into daily_attendance(id,learner_id,attendance_date,year_id,term_id,grade_id,stream_id,status,note,recorded_by,updated_at) values(${text(row,"id",newId("att"))},${text(row,"learner_id")},${text(row,"attendance_date")}::date,${text(row,"year_id")},${text(row,"term_id")},${text(row,"grade_id")},${text(row,"stream_id")},${status},${text(row,"note")},null,${text(row,"updated_at",new Date().toISOString())}) on conflict(learner_id,attendance_date) do update set year_id=excluded.year_id,term_id=excluded.term_id,grade_id=excluded.grade_id,stream_id=excluded.stream_id,status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`;
    }
    for (const row of t.homework_tasks ?? []) await sql`insert into homework_tasks(id,title,instructions,subject_id,grade_id,stream_id,year_id,term_id,due_date,assigned_by,created_at) values(${text(row,"id")},${text(row,"title")},${text(row,"instructions")},${text(row,"subject_id")},${text(row,"grade_id")},${row.stream_id??null},${text(row,"year_id")},${text(row,"term_id")},${text(row,"due_date")}::date,null,${text(row,"created_at",new Date().toISOString())}) on conflict(id) do update set title=excluded.title,instructions=excluded.instructions,due_date=excluded.due_date`;
    for (const row of t.homework_progress ?? []) await sql`insert into homework_progress(task_id,learner_id,status,updated_by,updated_at) values(${text(row,"task_id")},${text(row,"learner_id")},${text(row,"status","pending")==="complete"?"complete":"pending"},null,${text(row,"updated_at",new Date().toISOString())}) on conflict(task_id,learner_id) do update set status=excluded.status,updated_at=excluded.updated_at`;
    for (const row of t.school_events ?? []) await sql`insert into school_events(id,title,event_date,audience,venue,details) values(${text(row,"id")},${text(row,"title")},${text(row,"event_date")}::date,${["all","parents","students","teachers","staff"].includes(text(row,"audience"))?text(row,"audience"):"all"},${text(row,"venue")},${text(row,"details")}) on conflict(id) do update set title=excluded.title,event_date=excluded.event_date,audience=excluded.audience,venue=excluded.venue,details=excluded.details`;
    for (const row of t.guardian_contacts ?? []) await sql`insert into guardian_contacts(id,learner_id,name,relationship,phone,email,preferred_channel,notes,updated_at) values(${text(row,"id")},${text(row,"learner_id")},${text(row,"name")},${text(row,"relationship")},${text(row,"phone")},${text(row,"email")},${["phone","email","in_person"].includes(text(row,"preferred_channel"))?text(row,"preferred_channel"):"phone"},${text(row,"notes")},${text(row,"updated_at",new Date().toISOString())}) on conflict(id) do update set name=excluded.name,relationship=excluded.relationship,phone=excluded.phone,email=excluded.email,preferred_channel=excluded.preferred_channel,notes=excluded.notes,updated_at=excluded.updated_at`;
    for (const row of t.guardian_contact_log ?? []) await sql`insert into guardian_contact_log(id,learner_id,contact_id,direction,method,summary,follow_up_date,created_at) values(${text(row,"id")},${text(row,"learner_id")},${row.contact_id??null},${text(row,"direction")==="incoming"?"incoming":"outgoing"},${text(row,"method","phone")},${text(row,"summary")},${row.follow_up_date??null},${text(row,"created_at",new Date().toISOString())}) on conflict(id) do nothing`;
    for (const row of t.parent_meeting_requests ?? []) {
      const parent = await sql`select id from users where id=${text(row,"parent_user_id")}`;
      if (parent[0]) await sql`insert into parent_meeting_requests(id,learner_id,parent_user_id,topic,preferred_method,preferred_date,status,staff_response,created_at,updated_at) values(${text(row,"id")},${text(row,"learner_id")},${text(row,"parent_user_id")},${text(row,"topic")},${["phone","email","in_person"].includes(text(row,"preferred_method"))?text(row,"preferred_method"):"phone"},${row.preferred_date??null},${["pending","accepted","declined","follow_up"].includes(text(row,"status"))?text(row,"status"):"pending"},${text(row,"staff_response")},${text(row,"created_at",new Date().toISOString())},${text(row,"updated_at",new Date().toISOString())}) on conflict(id) do update set status=excluded.status,staff_response=excluded.staff_response,updated_at=excluded.updated_at`;
    }
    for (const row of t.staff_absence_requests ?? []) {
      const requester = await sql`select id from users where id=${text(row,"requester_id")}`;
      if (requester[0]) await sql`insert into staff_absence_requests(id,requester_id,start_date,end_date,category,note,status,review_note,created_at,updated_at) values(${text(row,"id")},${text(row,"requester_id")},${text(row,"start_date")}::date,${text(row,"end_date")}::date,${text(row,"category")},${text(row,"note")},${["pending","approved","declined","withdrawn"].includes(text(row,"status"))?text(row,"status"):"pending"},${text(row,"review_note")},${text(row,"created_at",new Date().toISOString())},${text(row,"updated_at",new Date().toISOString())}) on conflict(id) do update set start_date=excluded.start_date,end_date=excluded.end_date,category=excluded.category,note=excluded.note,status=excluded.status,review_note=excluded.review_note,updated_at=excluded.updated_at`;
    }
    for (const row of t.learner_support_events ?? []) await sql`insert into learner_support_events(id,learner_id,event_date,category,summary,due_date,status,outcome,updated_at) values(${text(row,"id")},${text(row,"learner_id")},${text(row,"event_date")}::date,${text(row,"category")},${text(row,"summary")},${row.due_date??null},${["open","in_progress","closed"].includes(text(row,"status"))?text(row,"status"):"open"},${text(row,"outcome")},${text(row,"updated_at",new Date().toISOString())}) on conflict(id) do update set category=excluded.category,summary=excluded.summary,due_date=excluded.due_date,status=excluded.status,outcome=excluded.outcome,updated_at=excluded.updated_at`;
    for (const row of t.learner_emergency_profiles ?? []) await sql`insert into learner_emergency_profiles(learner_id,contact_name,relationship,phone,critical_note,updated_at) values(${text(row,"learner_id")},${text(row,"contact_name")},${text(row,"relationship")},${text(row,"phone")},${text(row,"critical_note")},${text(row,"updated_at",new Date().toISOString())}) on conflict(learner_id) do update set contact_name=excluded.contact_name,relationship=excluded.relationship,phone=excluded.phone,critical_note=excluded.critical_note,updated_at=excluded.updated_at`;
    return { ok: true, restored, note: "Restore merged backed-up records into the database. Newer records not present in the file were not deleted. User accounts/passwords and the live admin audit trail were not replaced; existing accounts remain unchanged." };
  });

export const listBackupSnapshots = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!isTrueSuper(me)) throw new Error("Only the super admin can download restore safety snapshots.");
  const sql = await getSql();
  return sql<{ id: string; kind: string; note: string; payload: string; createdAt: string }>`select id, kind, note, payload, created_at as "createdAt" from office_backups where kind in ('pre-restore', 'scheduled') order by case when kind = 'pre-restore' then 0 else 1 end, created_at desc limit 5`;
});

export const getPublicReport = createServerFn({ method: "GET" })
  .validator((input: { code: string; yearId?: string; termId?: string }) => input)
  .handler(async ({ data }) => {
    const code = normalizeReportCode(data.code);
    if (!code) return null;
    const sql = await getSql();
    const roleAccess = await readRoleAccess(sql);
    if (!canActorAccess(roleAccess, "qr_guest", "reports", "view")) return { status: "disabled" as const };
    const numericValue = Number(code);
    const numericRoll = /^\d+$/.test(code) && Number.isSafeInteger(numericValue) && numericValue <= 2_147_483_647 ? numericValue : null;
    const learnerRows = await sql<Learner>`
      select id, roll, full_name as "fullName", gender, grade_id as "gradeId", stream_id as "streamId", status, public_code as "publicCode", admission_number as "admissionNumber", cohort_year as "cohortYear"
      from learners where status = 'active' and (public_code = ${code} or (${numericRoll}::int is not null and roll = ${numericRoll}))
      order by case when public_code = ${code} then 0 else 1 end limit 2`;
    const learner = resolveReportCode(learnerRows, code);
    if (!learner) return null;
    const profileRows = await sql<{
      name: string; poBox: string; mission: string; vision: string; motto: string; headTeacher: string; dos: string;
      location: string; contact: string; email: string; academicYear: string; termName: string; reportTitle: string;
      closingDate: string; resumptionDate: string; catNote: string; requirements: string; greeting: string; homeNote: string;
      publicBaseUrl: string; logoData: string; activeYearId: string; activeTermId: string;
      showQr: boolean; showChart: boolean; showRemarks: boolean; showPositions: boolean;
      reportExamCount: number; showTeacherInitials: boolean;
      showSubjectTeacherInitials: boolean; showSubjectRank: boolean; showSubjectSpotlight: boolean;
      showPreviousTerm: boolean; showAttendance: boolean; showCustomRemarks: boolean;
      term1Color: string; term2Color: string; term3Color: string; whatsappGroupEnabled: boolean; whatsappGroupUrl: string; whatsappGroupLabel: string;
    }>`
      select name, po_box as "poBox", mission, vision, motto, head_teacher as "headTeacher", dos,
        location, contact, email, academic_year as "academicYear", term_name as "termName",
        report_title as "reportTitle", closing_date as "closingDate", resumption_date as "resumptionDate",
        cat_note as "catNote", requirements, greeting, home_note as "homeNote",
        public_base_url as "publicBaseUrl", logo_data as "logoData",
        active_year_id as "activeYearId", active_term_id as "activeTermId",
        show_qr as "showQr", show_chart as "showChart", show_remarks as "showRemarks", show_positions as "showPositions",
        report_exam_count as "reportExamCount", show_teacher_initials as "showTeacherInitials",
      show_subject_teacher_initials as "showSubjectTeacherInitials", show_subject_rank as "showSubjectRank",
      show_subject_spotlight as "showSubjectSpotlight", show_previous_term as "showPreviousTerm",
      show_attendance as "showAttendance", show_custom_remarks as "showCustomRemarks",
        color_t1 as "term1Color", color_t2 as "term2Color", color_t3 as "term3Color", whatsapp_group_enabled as "whatsappGroupEnabled", whatsapp_group_url as "whatsappGroupUrl", whatsapp_group_label as "whatsappGroupLabel"
      from school_profile where id = 1`;
    const profile = profileRows[0];
    if (!profile) return null;
    const selectedYearId = data.yearId && (await sql<{ id: string }>`select id from academic_years where id = ${data.yearId}`)[0] ? data.yearId : profile.activeYearId;
    const selectedTermId = data.termId && (await sql<{ id: string }>`select id from terms where id = ${data.termId}`)[0] ? data.termId : profile.activeTermId;
    const selectedYear = await sql<{ name: string }>`select name from academic_years where id = ${selectedYearId}`;
    const selectedTerm = await sql<{ name: string }>`select name from terms where id = ${selectedTermId}`;
    profile.activeYearId = selectedYearId; profile.activeTermId = selectedTermId;
    profile.academicYear = selectedYear[0]?.name ?? profile.academicYear; profile.termName = selectedTerm[0]?.name ?? profile.termName;
    const placement = await sql<{ grade_id: string; stream_id: string }>`select grade_id, stream_id from marks where learner_id = ${learner.id} and year_id = ${selectedYearId} and term_id = ${selectedTermId} order by updated_at desc limit 1`;
    const reportGradeId = placement[0]?.grade_id ?? learner.gradeId;
    const reportStreamId = placement[0]?.stream_id ?? learner.streamId;
    const grades = await sql<{ id: string; name: string; level: number; reportTitle: string }>`
      select id, name, level, report_title as "reportTitle" from grades where id = ${reportGradeId}`;
    const book = await reportForGrade(sql, reportGradeId, selectedYearId, selectedTermId, [learner.id]);
    const row = book.rows[0];
    if (!row || !grades[0]) return null;
    const stream = book.streams.find((item) => item.id === reportStreamId);
    const placed = { ...learner, gradeId: reportGradeId, streamId: reportStreamId };
    const slots = await sql<SubjectTeacherSlot>`
      select a.subject_id as "subjectId", a.grade_id as "gradeId", a.stream_id as "streamId", u.initials
      from assignments a join users u on u.id = a.user_id
      where a.kind in ('subject_teacher', 'hod') and u.active = true and coalesce(trim(u.initials), '') <> ''`;
    const initials: Record<string, string> = {};
    for (const subject of book.subjects) {
      const value = initialsForSubject(slots, placed, subject.id);
      if (value) initials[subject.id] = value;
    }
    const notes = await sql<TermNote>`
      select learner_id as "learnerId", year_id as "yearId", term_id as "termId",
        days_present as "daysPresent", days_expected as "daysExpected", conduct, comment
      from learner_term_notes where learner_id = ${learner.id} and year_id = ${selectedYearId} and term_id = ${selectedTermId}`;
    const remarkRows = await sql<{ subjectId: string; remark: string }>`
      select subject_id as "subjectId", remark from subject_remarks
      where learner_id = ${learner.id} and year_id = ${selectedYearId} and term_id = ${selectedTermId}`;
    const customRemarks: Record<string, string> = {};
    for (const item of remarkRows) if (item.remark.trim()) customRemarks[item.subjectId] = item.remark.trim();
    const years = await sql<{ id: string; name: string; sort: number }>`select id, name, sort from academic_years`;
    const terms = await sql<{ id: string; name: string; sort: number }>`select id, name, sort from terms`;
    const prev = previousPeriod(years, terms, selectedYearId, selectedTermId);
    let previousMean: number | null = null;
    if (prev) {
      const prevMarks = await sql<Mark>`
        select learner_id as "learnerId", subject_id as "subjectId", exam_id as "examId", score,
          year_id as "yearId", term_id as "termId"
        from marks where learner_id = ${learner.id} and year_id = ${prev.yearId} and term_id = ${prev.termId}`;
      previousMean = meanForPeriod(placed, prevMarks, prev.yearId, prev.termId, book.subjects, book.exams, book.bands);
    }
    const extras: ReportExtras = { initials, previousMean, termNote: notes[0] ?? null, customRemarks };
    const feedbackSettings = (await sql<{ recipientScope: "teacher" | "class_teacher" | "admin" | "super_admin"; allowTeacherSelection: boolean; autoreplyEnabled: boolean }>`select recipient_scope as "recipientScope", allow_teacher_selection as "allowTeacherSelection", autoreply_enabled as "autoreplyEnabled" from qr_feedback_settings where id=1`)[0] ?? { recipientScope: "class_teacher" as const, allowTeacherSelection: true, autoreplyEnabled: false };
    const feedbackTeachers = feedbackSettings.allowTeacherSelection ? await sql<{id:string;fullName:string;subjectName:string}>`select distinct u.id, u.full_name as "fullName", coalesce(sb.name, 'Class teacher') as "subjectName" from assignments a join users u on u.id=a.user_id and u.active=true left join subjects sb on sb.id=a.subject_id where a.stream_id=${reportStreamId} and a.kind in ('class_teacher','subject_teacher','hod') order by u.full_name` : [];
    return { profile, grade: grades[0], stream, subjects: book.subjects, exams: book.exams, row, extras, reportPeriods: { years, terms }, feedbackSettings, feedbackTeachers };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "staff")) throw new Error("You do not have staff-management access to remove accounts.");
    if (data.id === me.id) throw new Error("You cannot remove your own account.");
    const sql = await getSql();
    const rows = await sql<{ role: string; is_deputy: boolean }>`select role, is_deputy from users where id = ${data.id}`;
    const target = rows[0];
    if (!target) throw new Error("Account not found.");
    if (target.role === "super_admin") throw new Error("The super admin cannot be removed.");
    if (target.role === "admin" && !isTrueSuper(me)) throw new Error("Only the super admin can remove another admin.");
    if (target.role !== "teacher" && !isTrueSuper(me)) throw new Error("Admins can delete teacher accounts only.");
    if (target.role !== "admin" && target.role !== "teacher" && target.role !== "student" && target.role !== "parent") throw new Error("This account type cannot be removed here.");
    await sql.transaction(async (tx) => {
      if (target.role === "teacher" || target.role === "admin") {
        const affectedScopes = await tx<{ year_id: string; term_id: string }>`
          select year_id, term_id from timetable_entries where teacher_user_id = ${data.id}
          union
          select e.year_id, e.term_id from timetable_substitutions s join timetable_entries e on e.id = s.entry_id where s.substitute_teacher_user_id = ${data.id}`;
        for (const scope of affectedScopes) {
          await captureTimetableVersion(tx, scope.year_id, scope.term_id, `Before ${target.role} account removal`, me.id);
          await tx`update timetable_state set published = false, effective_from = null, published_at = null, updated_at = now() where year_id = ${scope.year_id} and term_id = ${scope.term_id} and published = true`;
        }
        await tx`delete from timetable_requirements where teacher_user_id = ${data.id}`;
        await tx`delete from timetable_availability where entity_type = 'teacher' and entity_id = ${data.id}`;
        await tx`delete from timetable_substitutions where substitute_teacher_user_id = ${data.id}`;
        await tx`delete from timetable_invigilation where teacher_user_id = ${data.id}`;
        await tx`delete from timetable_duty_rota where teacher_user_id = ${data.id}`;
        await tx`delete from timetable_entries where teacher_user_id = ${data.id}`;
      }
      await tx`delete from assignments where user_id = ${data.id}`;
      await tx`delete from parent_links where parent_user_id = ${data.id}`;
      await tx`delete from users where id = ${data.id}`;
    });
    return { ok: true };
  });

export const changeStaffRole = createServerFn({ method: "POST" })
  .validator((input: { userId: string; requestedRole: "admin" | "teacher" }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isPowerful(me)) throw new Error("Only the super admin or a deputy super admin can change staff roles directly.");
    if (data.userId === me.id) throw new Error("You cannot change your own role.");
    if (data.requestedRole !== "admin" && data.requestedRole !== "teacher") throw new Error("Only teacher/admin role changes are supported.");
    const sql = await getSql();
    const targetRows = await sql<{ role: string; is_deputy: boolean }>`select role, is_deputy from users where id = ${data.userId}`;
    const target = targetRows[0];
    if (!target || !["admin", "teacher"].includes(target.role)) throw new Error("Only existing teacher or admin accounts can be changed.");
    if (target.role === data.requestedRole) throw new Error("The account already has that role.");
    if (target.is_deputy && !isTrueSuper(me)) throw new Error("Only the super admin can change a deputy super admin's role.");
    if (target.is_deputy && data.requestedRole === "teacher") throw new Error("Remove deputy super admin status before changing this account to teacher.");
    if (data.requestedRole === "teacher") {
      await sql`update users set role = 'teacher', is_deputy = false, priv_settings = false, priv_staff = false, priv_import = false, priv_calendar = false, session_version = session_version + 1 where id = ${data.userId}`;
    } else {
      await sql`update users set role = 'admin', is_deputy = false, priv_settings = false, priv_staff = false, priv_import = false, priv_calendar = false, session_version = session_version + 1 where id = ${data.userId}`;
    }
    await sql`update role_change_requests set status = 'cancelled' where user_id = ${data.userId} and status = 'pending'`;
    return { ok: true, role: data.requestedRole };
  });

export const requestStaffRoleChange = createServerFn({ method: "POST" })
  .validator((input: { userId: string; requestedRole: "admin" | "teacher" }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "admin" || me.isDeputy || !can(me, "staff")) throw new Error("Only a regular admin with staff permission can submit role-change requests; super admin and deputies approve them independently.");
    if (data.userId === me.id) throw new Error("You cannot request a role change for your own account.");
    if (data.requestedRole !== "admin" && data.requestedRole !== "teacher") throw new Error("Only teacher/admin role changes are supported.");
    const sql = await getSql();
    const target = await sql<{ role: string }>`select role from users where id = ${data.userId}`;
    if (!target[0] || !["admin", "teacher"].includes(target[0].role)) throw new Error("Only existing teacher or admin accounts can be changed.");
    if (target[0].role === data.requestedRole) throw new Error("The account already has that role.");
    const pending = await sql`select id from role_change_requests where user_id = ${data.userId} and status = 'pending'`;
    if (pending[0]) throw new Error("A role change is already pending for this account.");
    await sql`insert into role_change_requests (id, user_id, requested_role, requested_by, status) values (${newId("rolechange")}, ${data.userId}, ${data.requestedRole}, ${me.id}, 'pending')`;
    return { ok: true };
  });

export const listStaffRoleChangeRequests = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!isTrueSuper(me) && !me.isDeputy) throw new Error("Only the super admin and deputies can review role-change requests.");
  const sql = await getSql();
  return sql<{ id: string; userId: string; fullName: string; email: string; currentRole: string; requestedRole: string; requestedBy: string; requesterName: string; superApproved: boolean; deputyApproved: boolean; createdAt: string }>`
    select r.id, r.user_id as "userId", u.full_name as "fullName", u.email, u.role as "currentRole",
      r.requested_role as "requestedRole", r.requested_by as "requestedBy", requester.full_name as "requesterName",
      r.super_approved as "superApproved", r.deputy_approved as "deputyApproved", r.created_at as "createdAt"
    from role_change_requests r join users u on u.id = r.user_id left join users requester on requester.id = r.requested_by
    where r.status = 'pending' order by r.created_at asc`;
});

export const approveStaffRoleChange = createServerFn({ method: "POST" })
  .validator((input: { requestId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me) && !me.isDeputy) throw new Error("Only the super admin and deputies can approve role changes.");
    const sql = await getSql();
    const rows = await sql<{ user_id: string; requested_role: string; requested_by: string; super_approved: boolean; deputy_approved: boolean; status: string }>`select user_id, requested_role, requested_by, super_approved, deputy_approved, status from role_change_requests where id = ${data.requestId}`;
    const row = rows[0];
    if (!row || row.status !== "pending") throw new Error("Pending role-change request not found.");
    if (row.requested_by === me.id) throw new Error("You cannot approve a role change you requested.");
    if (isTrueSuper(me)) {
      if (row.super_approved) throw new Error("Super admin approval was already recorded.");
      await sql`update role_change_requests set super_approved = true where id = ${data.requestId}`;
    } else {
      if (!me.isDeputy) throw new Error("Deputy approval is required.");
      if (row.deputy_approved) throw new Error("Deputy approval was already recorded.");
      await sql`update role_change_requests set deputy_approved = true where id = ${data.requestId}`;
    }
    const refreshed = await sql<{ super_approved: boolean; deputy_approved: boolean }>`select super_approved, deputy_approved from role_change_requests where id = ${data.requestId}`;
    if (refreshed[0]?.super_approved && refreshed[0]?.deputy_approved) {
      await sql`update users set role = ${row.requested_role}, is_deputy = false where id = ${row.user_id}`;
      await sql`update role_change_requests set status = 'approved' where id = ${data.requestId}`;
    }
    return { ok: true, complete: Boolean(refreshed[0]?.super_approved && refreshed[0]?.deputy_approved) };
  });

export const setDeputy = createServerFn({ method: "POST" })
  .validator((input: { id: string; isDeputy: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the true super admin can appoint a deputy.");
    const sql = await getSql();
    const rows = await sql<{ role: string }>`select role from users where id = ${data.id}`;
    if (rows[0]?.role !== "admin") throw new Error("Only an admin can be made deputy super admin.");
    if (data.isDeputy) {
      const count = await sql<{ n: number }>`select count(*)::int as n from users where is_deputy = true and id <> ${data.id}`;
      if ((count[0]?.n ?? 0) >= 3) throw new Error("A maximum of three deputy super admins is allowed.");
    }
    await sql`update users set is_deputy = ${data.isDeputy}, delegated_responsibilities = case when ${data.isDeputy} then case when cardinality(coalesce(delegated_responsibilities, ARRAY[]::text[])) = 0 then ARRAY['settings','staff','import','calendar']::text[] else delegated_responsibilities end else ARRAY[]::text[] end where id = ${data.id}`;
    return { ok: true };
  });

export const saveInitials = createServerFn({ method: "POST" })
  .validator((input: { userId: string; initials: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me) && (!me.isDeputy || !can(me, "staff"))) throw new Error("Only the super admin or a deputy delegated staff responsibility can update teacher initials.");
    const initials = data.initials.trim().toUpperCase();
    if (initials.length > 12) throw new Error("Initials must be 12 characters or fewer.");
    const sql = await getSql();
    await sql`update users set initials = ${initials || null} where id = ${data.userId}`;
    return { ok: true };
  });

export const saveDeputyDelegations = createServerFn({ method: "POST" })
  .validator((input: { userId: string; responsibilities: string[] }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can delegate responsibilities.");
    const allowed = new Set(["settings", "staff", "import", "calendar"]);
    const responsibilities = [...new Set(data.responsibilities)].filter((item) => allowed.has(item));
    const sql = await getSql();
    const target = await sql<{ is_deputy: boolean }>`select is_deputy from users where id = ${data.userId} and role = 'admin'`;
    if (!target[0]?.is_deputy) throw new Error("Choose an appointed deputy super admin first.");
    await sql`update users set delegated_responsibilities = ${responsibilities}::text[] where id = ${data.userId}`;
    return { ok: true };
  });

export const saveTermAssessments = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; examIds: string[] }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!can(me, "calendar") && !isTrueSuper(me) && !me.isDeputy) throw new Error("You cannot configure CATs for a term.");
    const sql = await getSql();
    const year = await sql`select id from academic_years where id = ${data.yearId}`;
    const term = await sql`select id from terms where id = ${data.termId}`;
    if (!year[0] || !term[0]) throw new Error("Select a valid academic year and term.");
    const ids = [...new Set(data.examIds)].filter(Boolean);
    const allExams = await sql<{ id: string }>`select id from exams order by sort`;
    if (ids.some((id) => !allExams.some((exam) => exam.id === id))) throw new Error("One or more selected CATs no longer exist.");
    for (const exam of allExams) {
      const active = ids.includes(exam.id);
      await sql`insert into term_assessments (id, year_id, term_id, exam_id, active) values (${newId("tas")}, ${data.yearId}, ${data.termId}, ${exam.id}, ${active}) on conflict (year_id, term_id, exam_id) do update set active = ${active}`;
    }
    return { ok: true, activeCount: ids.length };
  });

export const saveReportOptions = createServerFn({ method: "POST" })
  .validator((input: {
    reportExamCount: number;
    showTeacherInitials: boolean;
    showSubjectTeacherInitials?: boolean;
    showSubjectRank?: boolean;
    showSubjectSpotlight?: boolean;
    showPreviousTerm?: boolean;
    showAttendance?: boolean;
    showCustomRemarks?: boolean;
  }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me) && !me.isDeputy) throw new Error("Only super admin or deputy super admins can set report CAT options.");
    const count = Math.max(1, Math.min(10, Math.floor(Number(data.reportExamCount) || 1)));
    const sql = await getSql();
    const total = await sql<{ n: number }>`select count(*)::int as n from exams`;
    if (count > (total[0]?.n ?? 0)) throw new Error(`Add at least ${count} CAT/exam entries first in Settings → Exams.`);
    await sql`update school_profile set
      report_exam_count = ${count},
      show_teacher_initials = ${Boolean(data.showTeacherInitials)},
      show_subject_teacher_initials = ${Boolean(data.showSubjectTeacherInitials)},
      show_subject_rank = ${Boolean(data.showSubjectRank)},
      show_subject_spotlight = ${Boolean(data.showSubjectSpotlight)},
      show_previous_term = ${Boolean(data.showPreviousTerm)},
      show_attendance = ${Boolean(data.showAttendance)},
      show_custom_remarks = ${Boolean(data.showCustomRemarks)}
      where id = 1`;
    return { ok: true };
  });

function wholeDays(value: number | null | undefined) {
  if (value == null || value === ("" as unknown)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 366) throw new Error("Attendance days must be a whole number from 0 to 366, or left blank.");
  return n;
}

export const saveTermNote = createServerFn({ method: "POST" })
  .validator((input: { learnerId: string; yearId: string; termId: string; daysPresent: number | null; daysExpected: number | null; conduct: string; comment: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const placed = (await learnersAtYear(sql, data.yearId)).find((learner) => learner.id === data.learnerId);
    if (!placed) throw new Error("That learner was not in a class for this year.");
    const assignments = await sql<Assignment>`
      select id, user_id as "userId", kind, grade_id as "gradeId", stream_id as "streamId", subject_id as "subjectId"
      from assignments where user_id = ${me.id}`;
    if (!canEditLearner(me, assignments, placed.streamId)) throw new Error("Only the class teacher or an admin can record attendance and conduct.");
    const present = wholeDays(data.daysPresent);
    const expected = wholeDays(data.daysExpected);
    if (present != null && expected != null && present > expected) throw new Error("Days present cannot be more than the days expected.");
    const conduct = (data.conduct ?? "").trim().slice(0, 40);
    const comment = (data.comment ?? "").trim().slice(0, 180);
    if (present == null && expected == null && !conduct && !comment) {
      await sql`delete from learner_term_notes where learner_id = ${data.learnerId} and year_id = ${data.yearId} and term_id = ${data.termId}`;
      return { ok: true };
    }
    await sql`insert into learner_term_notes (learner_id, year_id, term_id, days_present, days_expected, conduct, comment)
      values (${data.learnerId}, ${data.yearId}, ${data.termId}, ${present}, ${expected}, ${conduct}, ${comment})
      on conflict (learner_id, year_id, term_id) do update set days_present = ${present}, days_expected = ${expected}, conduct = ${conduct}, comment = ${comment}`;
    return { ok: true };
  });

export const saveSubjectRemarks = createServerFn({ method: "POST" })
  .validator((input: { subjectId: string; yearId: string; termId: string; rows: Array<{ learnerId: string; remark: string }> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const placed = new Map((await learnersAtYear(sql, data.yearId)).map((learner) => [learner.id, learner]));
    const assignments = await sql<Assignment>`
      select id, user_id as "userId", kind, grade_id as "gradeId", stream_id as "streamId", subject_id as "subjectId"
      from assignments where user_id = ${me.id}`;
    for (const row of data.rows) {
      const learner = placed.get(row.learnerId);
      if (!learner) throw new Error("A learner in this list was not in a class for this year.");
      if (!canEditMark(me, assignments, learner, data.subjectId)) throw new Error(`You are not assigned to write a remark for ${learner.fullName}.`);
      const remark = (row.remark ?? "").trim().slice(0, 80);
      if (!remark) {
        await sql`delete from subject_remarks where learner_id = ${row.learnerId} and subject_id = ${data.subjectId} and year_id = ${data.yearId} and term_id = ${data.termId}`;
        continue;
      }
      await sql`insert into subject_remarks (learner_id, subject_id, year_id, term_id, remark)
        values (${row.learnerId}, ${data.subjectId}, ${data.yearId}, ${data.termId}, ${remark})
        on conflict (learner_id, subject_id, year_id, term_id) do update set remark = ${remark}`;
    }
    return { ok: true };
  });

export const bulkMoveLearners = createServerFn({ method: "POST" })
  .validator((input: { learnerIds: string[]; targetGradeId: string; targetStreamId: string; targetYearId: string; reason?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin" && !me.isDeputy) throw new Error("Only the super admin or a deputy can perform bulk learner moves.");
    const ids = [...new Set(data.learnerIds)].filter(Boolean);
    if (!ids.length) throw new Error("Select at least one learner.");
    if (ids.length > 500) throw new Error("Move up to 500 learners per operation.");
    const sql = await getSql();
    const targetYear = await sql<{ id: string }>`select id from academic_years where id = ${data.targetYearId}`;
    if (!targetYear[0]) throw new Error("Choose a valid destination academic year.");
    const dest = await sql<{ id: string; grade_id: string }>`select id, grade_id from streams where id = ${data.targetStreamId} and grade_id = ${data.targetGradeId}`;
    if (!dest[0]) throw new Error("The selected stream does not belong to the target grade.");
    let moved = 0;
    for (const id of ids) {
      const learner = await sql<{ id: string; full_name: string; grade_id: string; stream_id: string }>`select id, full_name, grade_id, stream_id from learners where id = ${id} and status = 'active'`;
      const current = learner[0];
      if (!current) continue;
      const existingPlacement = await sql<{ grade_id: string; stream_id: string }>`select grade_id, stream_id from learner_year_placements where learner_id = ${id} and year_id = ${data.targetYearId}`;
      if (existingPlacement[0]?.grade_id === data.targetGradeId && existingPlacement[0]?.stream_id === data.targetStreamId) continue;
      if (await movesUpAGrade(sql, current.grade_id, data.targetGradeId)) await recordPlacements(sql, [current.id]);
      await sql`insert into learner_move_history (id, learner_id, learner_name, from_grade_id, to_grade_id, from_stream_id, to_stream_id, moved_by, reason) values (${newId("move")}, ${current.id}, ${current.full_name}, ${current.grade_id}, ${data.targetGradeId}, ${current.stream_id}, ${data.targetStreamId}, ${me.id}, ${data.reason || "bulk placement change"})`;
      await sql`insert into learner_year_placements (learner_id, year_id, grade_id, stream_id) values (${id}, ${data.targetYearId}, ${data.targetGradeId}, ${data.targetStreamId}) on conflict (learner_id, year_id) do update set grade_id = excluded.grade_id, stream_id = excluded.stream_id`;
      await sql`update learners set grade_id = ${data.targetGradeId}, stream_id = ${data.targetStreamId} where id = ${id}`;
      moved++;
    }
    return { ok: true, moved };
  });

export const promoteClass = createServerFn({ method: "POST" })
  .validator((input: { streamId: string; sourceYearId: string; targetGradeId: string; targetYearId: string; targetStreamId?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can promote a class.");
    const sql = await getSql();
    const stream = await sql<{ grade_id: string; name: string }>`select grade_id, name from streams where id = ${data.streamId}`;
    if (!stream[0]) throw new Error("Class not found.");
    const target = await sql<{ id: string; level: number }>`select id, level from grades where id = ${data.targetGradeId}`;
    if (!target[0]) throw new Error("Target grade not found.");
    const targetYear = await sql<{ id: string }>`select id from academic_years where id = ${data.targetYearId}`;
    if (!targetYear[0]) throw new Error("Choose a valid destination academic year.");
    const sourceGrade = await sql<{ level: number }>`select level from grades where id = ${stream[0].grade_id}`;
    if (!sourceGrade[0] || Number(target[0].level) <= Number(sourceGrade[0].level)) throw new Error("Class promotion must move learners to a higher grade.");
    const destStream = data.targetStreamId
      ? await sql<{ id: string }>`select id from streams where id = ${data.targetStreamId} and grade_id = ${data.targetGradeId}`
      : await sql<{ id: string }>`select id from streams where grade_id = ${data.targetGradeId} order by sort limit 1`;
    if (!destStream[0]) throw new Error("No destination stream in the next grade.");
    const sourceYear = await sql<{ id: string }>`select id from academic_years where id = ${data.sourceYearId}`;
    if (!sourceYear[0]) throw new Error("Choose a valid source academic year.");
    const sourceRows = (await learnersAtYear(sql, data.sourceYearId)).filter((learner) => learner.streamId === data.streamId);
    const classIds = sourceRows.map((row) => ({ id: row.id }));
    if (!classIds.length) throw new Error("No active learners are placed in this stream for the selected source year.");
    for (const learner of sourceRows) {
      await sql`insert into learner_year_placements (learner_id, year_id, grade_id, stream_id) values (${learner.id}, ${data.sourceYearId}, ${stream[0].grade_id}, ${data.streamId}) on conflict (learner_id, year_id) do nothing`;
      await sql`insert into learner_move_history (id, learner_id, learner_name, from_grade_id, to_grade_id, from_stream_id, to_stream_id, moved_by, reason) values (${newId("move")}, ${learner.id}, ${learner.fullName}, ${stream[0].grade_id}, ${data.targetGradeId}, ${data.streamId}, ${destStream[0].id}, ${me.id}, 'class promotion')`;
      await sql`insert into learner_year_placements (learner_id, year_id, grade_id, stream_id) values (${learner.id}, ${data.targetYearId}, ${data.targetGradeId}, ${destStream[0].id}) on conflict (learner_id, year_id) do update set grade_id = excluded.grade_id, stream_id = excluded.stream_id`;
      await sql`update learners set grade_id = ${data.targetGradeId}, stream_id = ${destStream[0].id} where id = ${learner.id}`;
    }
    return { ok: true, moved: classIds.length };
  });

export const bulkCreateStudentLogins = createServerFn({ method: "POST" })
  .validator((input: { streamId: string; domain?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) && me.role !== "teacher") throw new Error("Admins or class teachers can create student logins.");
    const sql = await getSql();
    if (me.role === "teacher") {
      const assignment = await sql<{ id: string }>`select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and stream_id = ${data.streamId}`;
      if (!assignment[0]) throw new Error("Only the assigned class teacher can create logins for this class.");
    }
    const learners = await sql<{ id: string; full_name: string; roll: number }>`
      select id, full_name, roll from learners where stream_id = ${data.streamId} and status = 'active' order by roll`;
    const domain = (data.domain || "student.mukuyu.school").replace(/^@/, "");
    const created: { name: string; email: string; password: string }[] = [];
    for (const learner of learners) {
      const existing = await sql<{ id: string }>`select id from users where learner_id = ${learner.id} and role = 'student'`;
      if (existing[0]) continue;
      const base = learner.full_name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || `student${learner.roll}`;
      let email = `${base}@${domain}`;
      let n = 1;
      while ((await sql<{ id: string }>`select id from users where email = ${email}`)[0]) {
        email = `${base}${n}@${domain}`;
        n++;
      }
      const password = tempPassword();
      await sql`
        insert into users (id, email, password_hash, full_name, role, learner_id, active)
        values (${newId("usr")}, ${email}, ${hashPassword(password)}, ${learner.full_name}, 'student', ${learner.id}, true)`;
      created.push({ name: learner.full_name, email, password });
    }
    return { ok: true, created };
  });

export const resetStudentPassword = createServerFn({ method: "POST" })
  .validator((input: { learnerId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    const sql = await getSql();
    const user = await sql<{ id: string; full_name: string; email: string }>`
      select id, full_name, email from users where learner_id = ${data.learnerId} and role = 'student'`;
    if (!user[0]) throw new Error("This learner has no student login yet.");
    // Permission: admin, deputy, super, or class teacher of the stream
    let allowed = isAdmin(me.role);
    if (!allowed && me.role === "teacher") {
      const stream = await sql<{ stream_id: string }>`select stream_id from learners where id = ${data.learnerId}`;
      const asg = await sql<{ id: string }>`
        select id from assignments where user_id = ${me.id} and kind = 'class_teacher' and (stream_id = ${stream[0]?.stream_id} or stream_id is null)`;
      allowed = Boolean(asg[0]);
    }
    if (!allowed) throw new Error("You cannot reset this student's password.");
    const password = tempPassword();
    await sql`update users set password_hash = ${hashPassword(password)}, session_version = session_version + 1, active = true where id = ${user[0].id}`;
    const subject = "Your temporary Mukuyu student portal password";
    const portalUrl = await schoolPortalUrl(sql);
    const body = `Hello ${user[0].full_name},\n\nYour student portal password has been reset.\nLogin: ${user[0].email}\nTemporary password: ${password}\nPortal link: ${portalUrl}\n\nSign in and change this password after logging in. If you did not request this, contact the school.`;
    const sent = await sendPasswordEmail(user[0].email, subject, body);
    return { ok: true, email: user[0].email, password, name: user[0].full_name, emailSent: sent.sent, emailNote: sent.sent ? "sent by email" : sent.reason };
  });

type EmailAttachment = { filename: string; content: string };

async function sendEmail(to: string, subject: string, body: string, attachments: EmailAttachment[] = []) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Mukuyu School Portal <no-reply@mukuyujss.lovie.me>";
  if (!apiKey) return { sent: false, reason: "No email service configured (set RESEND_API_KEY)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text: body, ...(attachments.length ? { attachments } : {}) }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { sent: false, reason: err.slice(0, 200) };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Send failed" };
  }
}

async function sendPasswordEmail(to: string, subject: string, body: string) {
  return sendEmail(to, subject, body);
}

export const listCredentials = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!isPowerful(me)) throw new Error("Only the super admin or deputy can view account credential status.");
  const sql = await getSql();
  return sql<{ id: string; fullName: string; email: string; role: string; active: boolean }>`
    select id, full_name as "fullName", email, role, active
    from users
    where role in ('admin', 'teacher', 'student', 'parent')
    order by role, full_name`;
});

export const moveLearner = createServerFn({ method: "POST" })
  .validator((input: { learnerId: string; direction: "up" | "down" | "same"; targetGradeId?: string; targetStreamId?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can move learners.");
    const sql = await getSql();
    const learner = await sql<{ grade_id: string; stream_id: string; full_name: string }>`
      select grade_id, stream_id, full_name from learners where id = ${data.learnerId}`;
    if (!learner[0]) throw new Error("Learner not found.");
    const grades = await sql<{ id: string; level: number }>`select id, level from grades order by level`;
    const current = grades.find((g) => g.id === learner[0].grade_id);
    if (!current) throw new Error("Current grade missing.");
    let targetGradeId = data.targetGradeId;
    if (!targetGradeId) {
      if (data.direction === "up") {
        const next = grades.find((g) => g.level > current.level);
        if (!next) throw new Error("Already in the highest grade.");
        targetGradeId = next.id;
      } else if (data.direction === "down") {
        const prev = [...grades].reverse().find((g) => g.level < current.level);
        if (!prev) throw new Error("Already in the lowest grade.");
        targetGradeId = prev.id;
      } else {
        targetGradeId = current.id;
      }
    }
    const dest = data.targetStreamId
      ? await sql<{ id: string }>`select id from streams where id = ${data.targetStreamId} and grade_id = ${targetGradeId}`
      : await sql<{ id: string }>`select id from streams where grade_id = ${targetGradeId} order by sort limit 1`;
    if (!dest[0]) throw new Error("No stream in the target grade.");
    if (await movesUpAGrade(sql, learner[0].grade_id, targetGradeId)) await recordPlacements(sql, [data.learnerId]);
    await sql`insert into learner_move_history (id, learner_id, learner_name, from_grade_id, to_grade_id, from_stream_id, to_stream_id, moved_by, reason) values (${newId("move")}, ${data.learnerId}, ${learner[0].full_name}, ${learner[0].grade_id}, ${targetGradeId}, ${learner[0].stream_id}, ${dest[0].id}, ${me.id}, ${data.direction})`;
    await sql`update learners set grade_id = ${targetGradeId}, stream_id = ${dest[0].id} where id = ${data.learnerId}`;
    return { ok: true, name: learner[0].full_name };
  });

// ---------- Upgrade features ----------

export const bulkDeleteLearners = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the super admin can bulk-delete learners.");
    const ids = [...new Set(data.ids)].filter(Boolean);
    if (!ids.length || ids.length > 500) throw new Error("Select between 1 and 500 learners to archive.");
    const sql = await getSql();
    const safety = await buildSchoolBackupPayload(sql, me.email);
    await sql`insert into office_backups (id,kind,note,payload,created_by) values (${newId("bak")},'pre-delete',${`Safety snapshot before archiving ${ids.length} selected learner(s)`},${JSON.stringify(safety)},${me.id})`;
    await sql`delete from office_backups where kind='pre-delete' and id not in (select id from office_backups where kind='pre-delete' order by created_at desc limit 10)`;
    let archived = 0;
    for (const id of ids) {
      const learner = await sql<{ id: string }>`select id from learners where id = ${id} and status = 'active'`;
      if (!learner[0]) continue;
      // Archive instead of hard-delete: keep marks, admission number, cohort and movement history recoverable.
      await sql`update learners set status = 'archived' where id = ${id}`;
      await sql`update users set active = false, session_version = session_version + 1 where learner_id = ${id}`;
      archived++;
    }
    return { ok: true, deleted: archived, archived };
  });

export const clearBulkResults = createServerFn({ method: "POST" })
  .validator((input: { gradeId: string; streamId?: string; yearId: string; termId: string; examId?: string; confirmText: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can clear bulk learner results.");
    const sql = await getSql();
    const grade = (await sql<{ name: string }>`select name from grades where id=${data.gradeId}`)[0];
    const year = (await sql<{ name: string }>`select name from academic_years where id=${data.yearId}`)[0];
    const term = (await sql<{ name: string }>`select name from terms where id=${data.termId}`)[0];
    const stream = data.streamId ? (await sql<{ name: string; grade_id: string }>`select name,grade_id from streams where id=${data.streamId}`)[0] : null;
    const exam = data.examId ? (await sql<{ name: string }>`select name from exams where id=${data.examId}`)[0] : null;
    if (!grade || !year || !term || (data.streamId && (!stream || stream.grade_id !== data.gradeId)) || (data.examId && !exam)) throw new Error("Choose a valid class, academic year, term and assessment.");
    const scope = `${grade.name}${stream ? ` ${stream.name}` : " (all streams)"} · ${year.name} · ${term.name} · ${exam?.name ?? "all assessments"}`;
    if (data.confirmText.trim() !== `CLEAR ${scope}`) throw new Error(`To confirm, type exactly: CLEAR ${scope}`);
    const safety = await buildSchoolBackupPayload(sql, me.email);
    const backupId = newId("bak");
    await sql`insert into office_backups (id,kind,note,payload,created_by) values (${backupId},'pre-delete',${`Safety snapshot before clearing marks: ${scope}`},${JSON.stringify(safety)},${me.id})`;
    const rows = data.streamId
      ? data.examId
        ? await sql<{ id: string }>`delete from marks where grade_id=${data.gradeId} and stream_id=${data.streamId} and year_id=${data.yearId} and term_id=${data.termId} and exam_id=${data.examId} returning learner_id as id`
        : await sql<{ id: string }>`delete from marks where grade_id=${data.gradeId} and stream_id=${data.streamId} and year_id=${data.yearId} and term_id=${data.termId} returning learner_id as id`
      : data.examId
        ? await sql<{ id: string }>`delete from marks where grade_id=${data.gradeId} and year_id=${data.yearId} and term_id=${data.termId} and exam_id=${data.examId} returning learner_id as id`
        : await sql<{ id: string }>`delete from marks where grade_id=${data.gradeId} and year_id=${data.yearId} and term_id=${data.termId} returning learner_id as id`;
    await sql`delete from office_backups where kind='pre-delete' and id not in (select id from office_backups where kind='pre-delete' order by created_at desc limit 10)`;
    return { ok: true, cleared: rows.length, scope, backupId };
  });

export const listArchivedLearners = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (!isTrueSuper(me)) throw new Error("Only the super admin can view archived learners.");
  const sql = await getSql();
  return sql<Learner>`
    select id, roll, full_name as "fullName", gender, grade_id as "gradeId", stream_id as "streamId",
      status, public_code as "publicCode", admission_number as "admissionNumber", cohort_year as "cohortYear"
    from learners where status = 'archived' order by full_name`;
});

export const restoreArchivedLearner = createServerFn({ method: "POST" })
  .validator((input: { learnerId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can restore archived learners.");
    const sql = await getSql();
    const learner = await sql<{ id: string; full_name: string }>`select id, full_name from learners where id = ${data.learnerId} and status = 'archived'`;
    if (!learner[0]) throw new Error("Archived learner not found.");
    await sql`update learners set status = 'active' where id = ${data.learnerId}`;
    await sql`update users set active = true, session_version = session_version + 1 where learner_id = ${data.learnerId}`;
    return { ok: true, name: learner[0].full_name };
  });

/**
 * Super admin only. Permanently removes every learner in one class together with their marks,
 * logins, parent links and movement history. A safety snapshot of the whole school is saved first.
 */
export const deleteClassLearners = createServerFn({ method: "POST" })
  .validator((input: { streamId: string; confirmText: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the super admin can delete all learner details in a class.");
    const sql = await getSql();
    const stream = (await sql<{ name: string; grade_name: string }>`
      select s.name, g.name as grade_name from streams s join grades g on g.id = s.grade_id where s.id = ${data.streamId}`)[0];
    if (!stream) throw new Error("Class not found.");
    const label = `${stream.grade_name} ${stream.name}`;
    if ((data.confirmText ?? "").trim().replace(/\s+/g, " ").toUpperCase() !== `DELETE ${label}`.toUpperCase()) {
      throw new Error(`To confirm, type exactly: DELETE ${label}`);
    }
    const rows = await sql<{ id: string }>`select id from learners where stream_id = ${data.streamId}`;
    const ids = rows.map((row) => row.id);
    if (!ids.length) throw new Error("There are no learners in this class.");
    // Safety net: keep a full copy of the school's data (restorable from Settings) before anything is removed.
    const safety = await buildSchoolBackupPayload(sql, me.email);
    await sql`insert into office_backups (id, kind, note, payload, created_by) values (${newId("bak")}, 'pre-delete', ${`Automatic safety snapshot before deleting ${label}`}, ${JSON.stringify(safety)}, ${me.id})`;
    await sql`delete from office_backups where kind = 'pre-delete' and id not in (select id from office_backups where kind = 'pre-delete' order by created_at desc limit 10)`;
    const marks = await sql<{ learner_id: string }>`delete from marks where learner_id = any(${ids}::text[]) returning learner_id`;
    await sql`delete from parent_links where learner_id = any(${ids}::text[])`;
    await sql`delete from learner_move_history where learner_id = any(${ids}::text[])`;
    await sql`delete from learner_year_placements where learner_id = any(${ids}::text[])`;
    await sql`delete from users where role = 'student' and learner_id = any(${ids}::text[])`;
    await sql`update users set learner_id = null, active = false, session_version = session_version + 1 where learner_id = any(${ids}::text[])`;
    await sql`delete from learners where id = any(${ids}::text[])`;
    return { ok: true, deleted: ids.length, marksDeleted: marks.length, label };
  });

export const setAdmissionNumber = createServerFn({ method: "POST" })
  .validator((input: { learnerId: string; admissionNumber: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can set admission numbers.");
    const sql = await getSql();
    const num = data.admissionNumber.trim().toUpperCase();
    if (!num) throw new Error("Admission number required.");
    const clash = await sql`select id from learners where upper(admission_number) = ${num} and id <> ${data.learnerId}`;
    if (clash[0]) throw new Error("Admission number already used by another learner.");
    await sql`update learners set admission_number = ${num} where id = ${data.learnerId}`;
    return { ok: true };
  });

export const approveMarksPeriod = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; gradeId: string; streamId?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) || (!isTrueSuper(me) && !me.isDeputy && !can(me, "calendar"))) throw new Error("Only super admin, deputies or an admin with calendar permission can approve marks.");
    const sql = await getSql();
    const result = data.streamId
      ? await sql`update marks set status = 'approved' where year_id = ${data.yearId} and term_id = ${data.termId} and grade_id = ${data.gradeId} and stream_id = ${data.streamId} returning learner_id`
      : await sql`update marks set status = 'approved' where year_id = ${data.yearId} and term_id = ${data.termId} and grade_id = ${data.gradeId} returning learner_id`;
    return { ok: true, approved: result.length };
  });

export const getMissingMarks = createServerFn({ method: "GET" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) && me.role !== "teacher") throw new Error("Access denied.");
    const sql = await getSql();
    const learners = await sql<{ id: string; full_name: string; grade_id: string; stream_id: string }>`
      select id, full_name, grade_id, stream_id from learners where status = 'active'`;
    const subjects = await sql<{ id: string; name: string }>`select id, name from subjects order by sort`;
    const allExams = await sql<{ id: string; name: string }>`select id, name from exams order by sort`;
    const assessmentRows = await sql<{ exam_id: string; active: boolean }>`select exam_id, active from term_assessments where year_id = ${data.yearId} and term_id = ${data.termId}`;
    const exams = assessmentRows.length ? allExams.filter((exam) => assessmentRows.some((row) => row.exam_id === exam.id && row.active)) : allExams;
    const marks = await sql<{ learner_id: string; subject_id: string; exam_id: string }>`
      select learner_id, subject_id, exam_id from marks where year_id = ${data.yearId} and term_id = ${data.termId}`;
    const have = new Set(marks.map(m => `${m.learner_id}|${m.subject_id}|${m.exam_id}`));
    const missing: { learner: string; subject: string; exam: string }[] = [];
    for (const l of learners) {
      for (const s of subjects) {
        for (const e of exams) {
          if (!have.has(`${l.id}|${s.id}|${e.id}`)) {
            missing.push({ learner: l.full_name, subject: s.name, exam: e.name });
          }
        }
      }
    }
    return { missing: missing.slice(0, 500), total: missing.length };
  });

function safeAppearance(value: unknown): AppearancePalette {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next = { ...DEFAULT_APPEARANCE } as AppearancePalette;
  for (const key of Object.keys(DEFAULT_APPEARANCE) as Array<keyof AppearancePalette>) {
    const candidate = source[key];
    if (typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate)) next[key] = candidate;
  }
  return next;
}

export const saveAppearance = createServerFn({ method: "POST" })
  .validator((input: { appearance: AppearancePalette }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can change the portal appearance.");
    const sql = await getSql();
    const appearance = safeAppearance(data.appearance);
    await sql`update welcome_page set appearance_json = ${JSON.stringify(appearance)}, updated_at = now() where id = 1`;
    return { ok: true, appearance };
  });

export const saveWelcomePage = createServerFn({ method: "POST" })
  .validator((input: { title: string; subtitle: string; announcement: string; contact: string; logoData?: string; backgroundStart?: string; backgroundEnd?: string; titleSize?: number; animated?: boolean; musicEnabled?: boolean; musicUrl?: string; highlights?: string; certification?: string; footerText?: string; fontFamily?: string; animationStyle?: string; paragraphColoursEnabled?: boolean; paragraphColourInterval?: number; display?: WelcomeDisplayOptions }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the super admin can edit the welcome page.");
    const sql = await getSql();
    const color = (value: string | undefined, fallback: string) => value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    const titleSize = Math.max(28, Math.min(72, Math.round(data.titleSize ?? 48)));
    const paragraphColourInterval = Math.max(2, Math.min(30, Math.round(data.paragraphColourInterval ?? 4)));
    const fontFamily = ["serif", "sans-serif", "Georgia, serif", "Inter, system-ui, sans-serif", "monospace"].includes(data.fontFamily || "") ? data.fontFamily! : "serif";
    const animationStyle = ["aurora", "ribbons", "pulse", "none"].includes(data.animationStyle || "") ? data.animationStyle! : "aurora";
    let musicUrl = (data.musicUrl || "").trim();
    if (musicUrl && !isSupportedMusicSource(musicUrl)) {
      type ParsedMusicPlaylist = { kind?: unknown; genre?: unknown; tracks?: unknown; options?: unknown };
      let parsedPlaylist: ParsedMusicPlaylist | null = null;
      try {
        parsedPlaylist = JSON.parse(musicUrl) as ParsedMusicPlaylist;
      } catch { parsedPlaylist = null; }
      const rawTracks = Array.isArray(parsedPlaylist?.tracks) ? parsedPlaylist.tracks : [];
      const validAutoMusic = parsedPlaylist?.kind === "mukuyu-auto-music";
      const validPlaylist = parsedPlaylist?.kind === "mukuyu-playlist" && rawTracks.length > 0 && rawTracks.length <= 30 && rawTracks.every((raw) => {
        if (!raw || typeof raw !== "object") return false;
        const track = raw as Record<string, unknown>;
        return typeof track.title === "string" && Boolean(track.title.trim()) && typeof track.url === "string" && isSupportedMusicSource(track.url) && (track.fallbackUrl === undefined || (typeof track.fallbackUrl === "string" && isSupportedMusicSource(track.fallbackUrl)));
      });
      if (!validPlaylist && !validAutoMusic || !parsedPlaylist) throw new Error("Use an HTTPS audio source, an uploaded audio file, a supported in-page music provider link, an automatic online music mode, or a playlist of those sources.");
      if (validAutoMusic) {
        const autoGenre = typeof parsedPlaylist.genre === "string" && parsedPlaylist.genre.trim() ? parsedPlaylist.genre.trim().slice(0, 80) : "Mixed";
        musicUrl = JSON.stringify({ kind: "mukuyu-auto-music", genre: autoGenre, options: normalizeMusicOptions(parsedPlaylist.options) });
      } else {
      const playlistGenre = typeof parsedPlaylist.genre === "string" && parsedPlaylist.genre.trim() ? parsedPlaylist.genre.trim().slice(0, 80) : "Mixed";
      musicUrl = JSON.stringify({
        kind: "mukuyu-playlist",
        genre: playlistGenre,
        tracks: rawTracks.map((raw) => {
          const track = raw as Record<string, unknown>;
          const genre = typeof track.genre === "string" && track.genre.trim() ? track.genre.trim().slice(0, 80) : playlistGenre;
          const fallbackUrl = typeof track.fallbackUrl === "string" ? track.fallbackUrl.trim() : "";
          return {
            title: (track.title as string).trim().slice(0, 160),
            genre,
            url: (track.url as string).trim(),
            ...(fallbackUrl ? { fallbackUrl } : {}),
            ...normalizeMusicAttribution(track),
          };
        }),
        options: normalizeMusicOptions(parsedPlaylist.options),
      });
      }
    }
    if (musicUrl.length > 700000) throw new Error("Keep a playlist under 20 KB or an uploaded audio file under 500 KB.");
    if ((data.logoData || "").length > 350000) throw new Error("Please use a logo smaller than 250 KB.");
    const displayControlsJson = data.display ? JSON.stringify(normalizeWelcomeDisplay(data.display)) : null;
    await sql`
      update welcome_page set title = ${data.title.slice(0,100)}, subtitle = ${data.subtitle.slice(0,160)},
        announcement = ${data.announcement.slice(0,2000)}, contact = ${data.contact.slice(0,200)},
        logo_data = ${data.logoData || ""}, background_start = ${color(data.backgroundStart, "#0e2a4a")},
        background_end = ${color(data.backgroundEnd, "#245b82")}, title_size = ${titleSize}, animated = ${data.animated ?? true},
        music_enabled = ${Boolean(data.musicEnabled && musicUrl)}, music_url = ${musicUrl.slice(0,700000)}, highlights = ${(data.highlights || "").slice(0,3000)}, font_family = ${fontFamily}, animation_style = ${animationStyle}, paragraph_colours_enabled = ${data.paragraphColoursEnabled ?? true}, paragraph_colour_interval = ${paragraphColourInterval}, certification = ${(data.certification || "© 2026 Certified").slice(0,200)}, footer_text = ${(data.footerText || "").slice(0,1000)}, display_controls_json = coalesce(${displayControlsJson}, display_controls_json), updated_at = now() where id = 1`;
    return { ok: true };
  });

async function spotifyAccessToken() {
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now() + 60_000) return spotifyTokenCache.accessToken;
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Spotify search is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET as server-only deployment secrets.");
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    spotifyTokenCache = null;
    if (response.status === 401 || response.status === 400) throw new Error("Spotify rejected the app credentials. Check the server-side Client ID and Client Secret.");
    throw new Error(`Spotify authentication is temporarily unavailable (${response.status}).`);
  }
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token || typeof payload.expires_in !== "number") {
    throw new Error("Spotify returned an incomplete authentication response.");
  }
  spotifyTokenCache = { accessToken: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return payload.access_token;
}

export const searchSpotifyCatalog = createServerFn({ method: "GET" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can search Spotify from Music Studio.");
    const query = typeof data.query === "string" ? data.query.trim().slice(0, 100) : "";
    if (query.length < 2) throw new Error("Enter at least two characters to search Spotify.");
    const token = await spotifyAccessToken();
    const response = await fetch(spotifyTrackSearchUrl(query, "KE"), {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      if (response.status === 401) {
        spotifyTokenCache = null;
        throw new Error("Spotify rejected the search token. Check the app credentials and try again.");
      }
      if (response.status === 403) throw new Error("Spotify denied this app's catalog access. Check its Developer Mode eligibility and account requirements.");
      if (response.status === 429) throw new Error("Spotify is receiving too many searches right now. Wait a moment and try again.");
      throw new Error(`Spotify catalog search failed (${response.status}).`);
    }
    return normalizeSpotifyTrackResults(await response.json());
  });

async function soundCloudAccessToken() {
  if (soundCloudTokenCache && soundCloudTokenCache.expiresAt > Date.now() + 60_000) return soundCloudTokenCache.accessToken;
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID?.trim();
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("SoundCloud catalog search is not configured. Add SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET as server-only deployment secrets.");
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    soundCloudTokenCache = null;
    if (response.status === 401 || response.status === 400) throw new Error("SoundCloud rejected the app credentials. Check the server-side Client ID and Client Secret.");
    throw new Error(`SoundCloud authentication is temporarily unavailable (${response.status}).`);
  }
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token || typeof payload.expires_in !== "number") {
    throw new Error("SoundCloud returned an incomplete authentication response.");
  }
  soundCloudTokenCache = { accessToken: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return payload.access_token;
}

export const searchMusicCatalog = createServerFn({ method: "GET" })
  .validator((input: { provider: MusicCatalogProvider; query: string }) => input)
  .handler(async ({ data }): Promise<MusicCatalogResult[]> => {
    const me = await requireActor();
    if (!isTrueSuper(me)) throw new Error("Only the super admin can search music catalogs from Music Studio.");
    const provider = data.provider;
    if (provider !== "YouTube" && provider !== "SoundCloud" && provider !== "Jamendo" && provider !== "Internet Archive") throw new Error("Choose a supported music source.");
    const query = typeof data.query === "string" ? data.query.trim().slice(0, 100) : "";
    if (query.length < 2) throw new Error("Enter at least two characters to search music.");

    if (provider === "YouTube") {
      const apiKey = process.env.YOUTUBE_API_KEY?.trim();
      if (!apiKey) throw new Error("YouTube catalog search is not configured. Add YOUTUBE_API_KEY as a server-only deployment secret. You can still paste a YouTube link into the playlist.");
      const response = await fetch(youtubeSearchUrl(query, apiKey), { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) {
        if (response.status === 403) throw new Error("YouTube denied this search. Check the API key, enabled YouTube Data API, key restrictions, and daily quota.");
        throw new Error(`YouTube catalog search failed (${response.status}).`);
      }
      return normalizeYouTubeSearchResults(await response.json());
    }

    if (provider === "SoundCloud") {
      const token = await soundCloudAccessToken();
      const response = await fetch(soundCloudSearchUrl(query), {
        headers: { authorization: `OAuth ${token}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        if (response.status === 401) { soundCloudTokenCache = null; throw new Error("SoundCloud rejected the search token. Check the app credentials and try again."); }
        if (response.status === 403) throw new Error("SoundCloud denied catalog access. Check that your registered app is approved for public track search.");
        if (response.status === 429) throw new Error("SoundCloud is receiving too many searches right now. Wait a moment and try again.");
        throw new Error(`SoundCloud catalog search failed (${response.status}).`);
      }
      return normalizeSoundCloudSearchResults(await response.json());
    }

    if (provider === "Internet Archive") {
      const response = await fetch(internetArchiveSearchUrl(query), { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`Internet Archive search failed (${response.status}).`);
      const results = normalizeInternetArchiveResults(await response.json());
      const playable = await Promise.all(results.map(async (result) => {
        try {
          const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(result.id)}`, { signal: AbortSignal.timeout(6_000) });
          if (!metadataResponse.ok) return null;
          const metadata = await metadataResponse.json() as { files?: unknown };
          const files = Array.isArray(metadata.files) ? metadata.files : [];
          const candidate = files
            .filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === "object")
            .map((file) => ({ name: typeof file.name === "string" ? file.name : "", format: typeof file.format === "string" ? file.format.toLowerCase() : "", size: Number(file.size) || 0 }))
            .filter((file) => /^(mp3|vbr mp3|ogg vorbis|oga|m4a|aac)$/.test(file.format) && file.name && file.size > 0 && file.size < 150_000_000)
            .sort((a, b) => (a.format === "mp3" ? -1 : 0) - (b.format === "mp3" ? -1 : 0) || a.size - b.size)[0];
          const playbackUrl = candidate ? safeInternetArchiveFileUrl(result.id, candidate.name) : "";
          return playbackUrl ? { ...result, playbackUrl } : null;
        } catch {
          return null;
        }
      }));
      return playable.filter((result): result is MusicCatalogResult => Boolean(result));
    }

    const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
    if (!clientId) throw new Error("Jamendo catalog search is not configured. Add JAMENDO_CLIENT_ID as a server-only deployment setting. You can still paste a supported provider link into the playlist.");
    const response = await fetch(jamendoSearchUrl(query, clientId), { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Jamendo rejected the client ID. Check the server-side Jamendo developer app settings.");
      if (response.status === 429) throw new Error("Jamendo is receiving too many searches right now. Wait a moment and try again.");
      throw new Error(`Jamendo catalog search failed (${response.status}).`);
    }
    return normalizeJamendoSearchResults(await response.json());
  });

export const searchAutomaticMusic = createServerFn({ method: "GET" })
  .validator((input: { genre?: string }) => input)
  .handler(async ({ data }): Promise<MusicCatalogResult[]> => {
    await requireActor();
    const genre = typeof data.genre === "string" ? data.genre.trim().slice(0, 60) : "Mixed";
    const response = await fetch(genre && genre !== "Mixed" ? internetArchiveGenreSearchUrl(genre) : internetArchiveSearchUrl("music"), { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Automatic music search failed (${response.status}).`);
    const results = normalizeInternetArchiveResults(await response.json());
    const playable = await Promise.all(results.map(async (result) => {
      try {
        const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(result.id)}`, { signal: AbortSignal.timeout(6_000) });
        if (!metadataResponse.ok) return null;
        const metadata = await metadataResponse.json() as { files?: unknown };
        const files = Array.isArray(metadata.files) ? metadata.files : [];
        const candidate = files.filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === "object")
          .map((file) => ({ name: typeof file.name === "string" ? file.name : "", format: typeof file.format === "string" ? file.format.toLowerCase() : "", size: Number(file.size) || 0 }))
          .filter((file) => /^(mp3|vbr mp3|ogg vorbis|oga|m4a|aac)$/.test(file.format) && file.name && file.size > 0 && file.size < 150_000_000)
          .sort((a, b) => (a.format === "mp3" ? -1 : 0) - (b.format === "mp3" ? -1 : 0) || a.size - b.size)[0];
        const playbackUrl = candidate ? safeInternetArchiveFileUrl(result.id, candidate.name) : "";
        return playbackUrl ? { ...result, playbackUrl } : null;
      } catch {
        return null;
      }
    }));
    return playable.filter((result): result is MusicCatalogResult => Boolean(result));
  });

export const getWelcomePage = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ title: string; subtitle: string; announcement: string; contact: string; showLogo: boolean; logoData: string; backgroundStart: string; backgroundEnd: string; titleSize: number; animated: boolean; musicEnabled: boolean; musicUrl: string; highlights: string; certification: string; footerText: string; appearanceJson: string; displayControlsJson: string; paragraphColoursEnabled: boolean; paragraphColourInterval: number }>`select title, subtitle, announcement, contact, show_logo as "showLogo", logo_data as "logoData", background_start as "backgroundStart", background_end as "backgroundEnd", title_size as "titleSize", animated, music_enabled as "musicEnabled", music_url as "musicUrl", highlights, certification, footer_text as "footerText", appearance_json as "appearanceJson", display_controls_json as "displayControlsJson", font_family as "fontFamily", animation_style as "animationStyle", paragraph_colours_enabled as "paragraphColoursEnabled", paragraph_colour_interval as "paragraphColourInterval" from welcome_page where id = 1`;
  const row = rows[0];
  if (!row) return { title: "Mukuyu Junior School", subtitle: "Learner Progress Portal", announcement: "", contact: "", showLogo: true, logoData: "", backgroundStart: "#0e2a4a", backgroundEnd: "#245b82", titleSize: 48, fontFamily: "serif", animationStyle: "aurora", animated: true, musicEnabled: false, musicUrl: "", highlights: "", certification: "© 2026 Certified", footerText: "", paragraphColoursEnabled: true, paragraphColourInterval: 4, appearance: DEFAULT_APPEARANCE, display: DEFAULT_WELCOME_DISPLAY };
  const actor = await readActor();
  const canReadMusic = canReadPortalMusic(actor?.role);
  let parsed: unknown = {};
  let parsedDisplay: unknown = {};
  try { parsed = JSON.parse(row.appearanceJson || "{}"); } catch { parsed = {}; }
  try { parsedDisplay = JSON.parse(row.displayControlsJson || "{}"); } catch { parsedDisplay = {}; }
  return { ...row, musicEnabled: canReadMusic && row.musicEnabled, musicUrl: canReadMusic ? row.musicUrl : "", appearance: safeAppearance(parsed), display: normalizeWelcomeDisplay(parsedDisplay) };
});

function timeMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

export const setTimetableAdminPermission = createServerFn({ method: "POST" })
  .validator((input: { adminsCanEdit: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the super admin can allow or deny timetable editing for admins.");
    const sql = await getSql();
    await sql`insert into timetable_admin_permissions (id, admins_can_edit, updated_by, updated_at) values (1, ${Boolean(data.adminsCanEdit)}, ${me.id}, now()) on conflict (id) do update set admins_can_edit = excluded.admins_can_edit, updated_by = excluded.updated_by, updated_at = now()`;
    return { ok: true, adminsCanEdit: Boolean(data.adminsCanEdit) };
  });

export const setTimetableStaffAssignmentsEnabled = createServerFn({ method: "POST" })
  .validator((input: { enabled: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the super admin can allow or prevent staff subject assignments from being used in the timetable.");
    const enabled = Boolean(data.enabled);
    const sql = await getSql();
    await sql`insert into timetable_admin_permissions (id, admins_can_edit, staff_assignments_enabled, updated_by, updated_at) values (1, false, ${enabled}, ${me.id}, now()) on conflict (id) do update set staff_assignments_enabled = excluded.staff_assignments_enabled, updated_by = excluded.updated_by, updated_at = now()`;
    return { ok: true, enabled };
  });

export const saveSubjectConstraint = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; subjectId: string; maxPerDay: number; minDaysPerWeek: number; noAfternoon: boolean; preferredMorning: boolean; avoidConsecutiveDays: boolean; noLastPeriod?: boolean; complexity?: number; placeInOrder?: boolean; distribution?: string; color?: string; notes?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const id = `sc_${data.subjectId}_${data.yearId}_${data.termId}`;
    const complexity = Math.max(1, Math.min(3, Math.trunc(Number(data.complexity ?? 1))));
    await sql`
      insert into subject_constraints (id, year_id, term_id, subject_id, max_per_day, min_days_per_week, no_afternoon, preferred_morning, avoid_consecutive_days, no_last_period, complexity, place_in_order, distribution, color, notes)
      values (${id}, ${data.yearId}, ${data.termId}, ${data.subjectId}, ${Math.max(1, Math.min(8, data.maxPerDay))}, ${Math.max(1, Math.min(5, data.minDaysPerWeek))}, ${Boolean(data.noAfternoon)}, ${Boolean(data.preferredMorning)}, ${Boolean(data.avoidConsecutiveDays)}, ${Boolean(data.noLastPeriod)}, ${complexity}, ${data.placeInOrder !== false}, ${(data.distribution || "").trim().slice(0, 40)}, ${(data.color || "").slice(0, 20)}, ${(data.notes || "").slice(0, 500)})
      on conflict (year_id, term_id, subject_id) do update set
        max_per_day = excluded.max_per_day,
        min_days_per_week = excluded.min_days_per_week,
        no_afternoon = excluded.no_afternoon,
        preferred_morning = excluded.preferred_morning,
        avoid_consecutive_days = excluded.avoid_consecutive_days,
        no_last_period = excluded.no_last_period,
        complexity = excluded.complexity,
        place_in_order = excluded.place_in_order,
        distribution = excluded.distribution,
        color = excluded.color,
        notes = excluded.notes`;
    return { ok: true, id };
  });

export const saveTimetablePeriod = createServerFn({ method: "POST" })
  .validator((input: { id?: string; yearId: string; termId: string; label: string; startTime: string; endTime: string; isBreak?: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const label = data.label.trim().slice(0, 40);
    const startTime = data.startTime.trim();
    const endTime = data.endTime.trim();
    if (!label) throw new Error("Enter a period label.");
    if (!Number.isFinite(timeMinutes(startTime)) || !Number.isFinite(timeMinutes(endTime)) || timeMinutes(endTime) <= timeMinutes(startTime)) {
      throw new Error("Enter valid start and end times; the end must be after the start.");
    }
    const sql = await getSql();
    await ensureTimetableDraft(sql, data.yearId, data.termId);
    const valid = await sql`select 1 from academic_years where id = ${data.yearId} union all select 1 from terms where id = ${data.termId}`;
    if (valid.length !== 2) throw new Error("Choose a valid academic year and term.");
    if (data.id) {
      const existing = await sql`select id from timetable_periods where id = ${data.id} and year_id = ${data.yearId} and term_id = ${data.termId}`;
      if (!existing[0]) throw new Error("Timetable period not found.");
      await sql`update timetable_periods set label = ${label}, start_time = ${startTime}, end_time = ${endTime}, is_break = ${Boolean(data.isBreak)} where id = ${data.id}`;
      return { ok: true, id: data.id };
    }
    const sortRows = await sql<{ n: number }>`select coalesce(max(sort), 0)::int as n from timetable_periods where year_id = ${data.yearId} and term_id = ${data.termId}`;
    const id = newId("period");
    await sql`insert into timetable_periods (id, year_id, term_id, label, start_time, end_time, sort, is_break) values (${id}, ${data.yearId}, ${data.termId}, ${label}, ${startTime}, ${endTime}, ${(sortRows[0]?.n ?? 0) + 1}, ${Boolean(data.isBreak)})`;
    return { ok: true, id };
  });

export const deleteTimetablePeriod = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const period = await sql<{ year_id: string; term_id: string }>`select year_id, term_id from timetable_periods where id = ${data.id}`;
    if (period[0]) await ensureTimetableDraft(sql, period[0].year_id, period[0].term_id);
    const used = await sql<{ n: number }>`select count(*)::int as n from timetable_entries where period_id = ${data.id}`;
    if ((used[0]?.n ?? 0) > 0) throw new Error("Remove the timetable entries in this period before deleting it.");
    await sql`delete from timetable_periods where id = ${data.id}`;
    return { ok: true };
  });

export const saveTimetableEntry = createServerFn({ method: "POST" })
  .validator((input: { id?: string; yearId: string; termId: string; dayOfWeek: number; periodId: string; gradeId: string; streamId?: string; subjectId: string; teacherUserId: string; room?: string; notes?: string; blockLength?: number; locked?: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const dayOfWeek = Number(data.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) throw new Error("Choose a weekday from Monday to Friday.");
    const blockLength = Math.max(1, Math.min(3, Math.trunc(Number(data.blockLength ?? 1))));
    const room = (data.room ?? "").trim().slice(0, 60);
    const notes = (data.notes ?? "").trim().slice(0, 160);
    const streamId = data.streamId?.trim() || null;
    const locked = Boolean(data.locked);
    const sql = await getSql();
    await ensureTimetableDraft(sql, data.yearId, data.termId);
    const periodRows = await sql<{ id: string; sort: number; is_break: boolean; label: string; start_time: string }>`select id, sort, is_break, label, start_time from timetable_periods where year_id = ${data.yearId} and term_id = ${data.termId} order by sort`;
    const periodIndex = periodRows.findIndex((period) => period.id === data.periodId);
    const blockPeriods = periodRows.slice(periodIndex, periodIndex + blockLength);
    if (periodIndex < 0 || blockPeriods.length !== blockLength || blockPeriods.some((period, index) => period.is_break || (index > 0 && period.sort !== blockPeriods[index - 1].sort + 1))) throw new Error("Choose enough consecutive lesson periods for this block; breaks cannot be included.");
    const grade = await sql<{ id: string }>`select id from grades where id = ${data.gradeId}`;
    const subject = await sql<{ id: string; name: string; short_name: string }>`select id, name, short_name from subjects where id = ${data.subjectId}`;
    const teacher = await sql<{ id: string; role: string; full_name: string }>`select id, role, full_name from users where id = ${data.teacherUserId} and active = true`;
    if (!grade[0] || !subject[0]) throw new Error("Choose a valid grade and subject.");
    if (!teacher[0] || !["teacher", "admin", "super_admin"].includes(teacher[0].role)) throw new Error("Choose an active teacher, admin, or super admin.");
    if (streamId) {
      const stream = await sql`select id from streams where id = ${streamId} and grade_id = ${data.gradeId}`;
      if (!stream[0]) throw new Error("The selected stream does not belong to the selected grade.");
    }
    const ruleRows = await sql<{ no_afternoon: boolean; no_last_period: boolean; max_per_day: number }>`select no_afternoon, no_last_period, max_per_day from subject_constraints where year_id = ${data.yearId} and term_id = ${data.termId} and subject_id = ${data.subjectId}`;
    const maths = /math/i.test(`${subject[0].short_name} ${subject[0].name}`);
    const noAfternoon = ruleRows[0]?.no_afternoon ?? maths;
    const noLast = Boolean(ruleRows[0]?.no_last_period);
    const maxPerDay = ruleRows[0]?.max_per_day ?? 2;
    const lunch = periodRows.find((period) => period.is_break && /lunch/i.test(period.label));
    const afternoon = (period: { sort: number; start_time: string }) => lunch ? period.sort > lunch.sort : period.start_time >= "13:00";
    if (noAfternoon && blockPeriods.some(afternoon)) throw new Error(`${subject[0].name} cannot be taught after lunch. Choose a morning or pre-lunch period.`);
    const lessons = periodRows.filter((period) => !period.is_break);
    const lessonPositionBySort = new Map(lessons.map((period, index) => [period.sort, index]));
    if (noLast && blockPeriods.some((period) => period.id === lessons[lessons.length - 1]?.id)) throw new Error(`${subject[0].name} cannot be placed on the last lesson of the day.`);
    const targetSorts = new Set(blockPeriods.map((period) => period.sort));
    const conflicts = await sql<{ id: string; teacher_user_id: string; grade_id: string; stream_id: string | null; subject_id: string; room: string; block_length: number; sort: number }>`select e.id, e.teacher_user_id, e.grade_id, e.stream_id, e.subject_id, e.room, e.block_length, p.sort from timetable_entries e join timetable_periods p on p.id = e.period_id where e.year_id = ${data.yearId} and e.term_id = ${data.termId} and e.day_of_week = ${dayOfWeek} and (${data.id || ""} = '' or e.id <> ${data.id || ""})`;
    let sameSubject = blockLength;
    for (const other of conflicts) {
      const otherSorts = new Set(Array.from({ length: Math.max(1, Math.min(other.block_length || 1, 3)) }, (_, index) => other.sort + index));
      const overlap = [...targetSorts].some((sort) => otherSorts.has(sort));
      if (other.subject_id === data.subjectId && other.grade_id === data.gradeId && (other.stream_id === streamId || other.stream_id == null || streamId == null)) sameSubject += other.block_length || 1;
      if (!overlap) continue;
      if (other.teacher_user_id === data.teacherUserId) throw new Error(`${teacher[0].full_name} is already teaching another lesson during this block.`);
      if (room && other.room && other.room.toLowerCase() === room.toLowerCase()) throw new Error(`Room ${room} is already in use during this block.`);
      if (other.grade_id === data.gradeId && (other.stream_id === null || streamId === null || other.stream_id === streamId)) throw new Error("This class or grade-wide slot is already occupied during this block.");
    }
    const teacherContract = await sql<{ min_rest_periods: number }>`select min_rest_periods from teacher_contracts where year_id = ${data.yearId} and term_id = ${data.termId} and teacher_user_id = ${data.teacherUserId}`;
    const minRestPeriods = Number(teacherContract[0]?.min_rest_periods ?? 0);
    if (minRestPeriods > 0) {
      const targetPositions = [...targetSorts].map((sort) => lessonPositionBySort.get(sort)).filter((position): position is number => position != null);
      const startPosition = Math.min(...targetPositions);
      const endPosition = Math.max(...targetPositions);
      const tooClose = conflicts.some((other) => {
        if (other.teacher_user_id !== data.teacherUserId) return false;
        const otherSorts = Array.from({ length: Math.max(1, Math.min(other.block_length || 1, 3)) }, (_, index) => other.sort + index);
        const otherPositions = otherSorts.map((sort) => lessonPositionBySort.get(sort)).filter((position): position is number => position != null);
        if (!targetPositions.length || !otherPositions.length) return false;
        const otherStart = Math.min(...otherPositions);
        const otherEnd = Math.max(...otherPositions);
        const gap = startPosition > otherEnd ? startPosition - otherEnd - 1 : otherStart > endPosition ? otherStart - endPosition - 1 : -1;
        return gap >= 0 && gap < minRestPeriods;
      });
      if (tooClose) throw new Error(`${teacher[0].full_name} needs ${minRestPeriods} free lesson period(s) between separate blocks. Choose a later period or another day.`);
    }
    if (sameSubject > maxPerDay) throw new Error(`${subject[0].name} would have ${sameSubject} lessons that day. The maximum is ${maxPerDay}.`);
    const linkedRules = await sql<{ left_subject_id: string; right_subject_id: string; relation: string }>`select left_subject_id, right_subject_id, relation from lesson_relations where year_id = ${data.yearId} and term_id = ${data.termId} and grade_id = ${data.gradeId} and (stream_id is null or ${streamId ?? ""} = '' or stream_id = ${streamId})`;
    for (const rule of linkedRules) {
      if (rule.relation !== "not_consecutive" && rule.relation !== "different_day") continue;
      const otherSubjectId = rule.left_subject_id === data.subjectId ? rule.right_subject_id : rule.right_subject_id === data.subjectId ? rule.left_subject_id : "";
      if (!otherSubjectId) continue;
      const linked = conflicts.filter((other) => other.subject_id === otherSubjectId && other.grade_id === data.gradeId && (other.stream_id === null || streamId === null || other.stream_id === streamId));
      if (rule.relation === "different_day" && linked.length) throw new Error(`${subject[0].name} and the linked subject are required on different days.`);
      if (rule.relation === "not_consecutive" && linked.some((other) => {
        const otherSorts = Array.from({ length: Math.max(1, Math.min(other.block_length || 1, 3)) }, (_, index) => other.sort + index);
        return otherSorts.some((sort) => targetSorts.has(sort - 1) || targetSorts.has(sort + 1));
      })) throw new Error(`${subject[0].name} cannot be placed in an adjacent period to its linked subject.`);
    }
    const unavailable = await sql<{ entity_type: string; entity_id: string; period_id: string; level: string }>`select entity_type, entity_id, period_id, coalesce(level, 'off') as level from timetable_availability where year_id = ${data.yearId} and term_id = ${data.termId} and day_of_week = ${dayOfWeek} and available = false`;
    const roomRecord = room ? await sql<{ id: string }>`select id from timetable_rooms where lower(name) = lower(${room})` : [];
    const classStreamIds = (await sql<{ id: string }>`select id from streams where grade_id = ${data.gradeId}`).map((stream) => stream.id);
    if (unavailable.some((item) => (item.level || "off") === "off" && blockPeriods.some((period) => period.id === item.period_id) && ((item.entity_type === "teacher" && item.entity_id === data.teacherUserId) || (item.entity_type === "grade" && item.entity_id === data.gradeId) || (item.entity_type === "stream" && (item.entity_id === streamId || (streamId === null && classStreamIds.includes(item.entity_id)))) || (item.entity_type === "room" && item.entity_id === roomRecord[0]?.id) || (item.entity_type === "subject" && item.entity_id === data.subjectId)))) throw new Error("This lesson overlaps a teacher, class, stream, room, or subject off-time.");
    if (data.id) {
      const existing = await sql`select id from timetable_entries where id = ${data.id}`;
      if (!existing[0]) throw new Error("Timetable entry not found.");
      await sql`update timetable_entries set year_id = ${data.yearId}, term_id = ${data.termId}, day_of_week = ${dayOfWeek}, period_id = ${data.periodId}, grade_id = ${data.gradeId}, stream_id = ${streamId}, subject_id = ${data.subjectId}, teacher_user_id = ${data.teacherUserId}, room = ${room}, notes = ${notes}, block_length = ${blockLength}, locked = ${locked}, updated_at = now() where id = ${data.id}`;
      return { ok: true, id: data.id };
    }
    const id = newId("tte");
    await sql`insert into timetable_entries (id, year_id, term_id, day_of_week, period_id, grade_id, stream_id, subject_id, teacher_user_id, room, notes, block_length, locked, created_by) values (${id}, ${data.yearId}, ${data.termId}, ${dayOfWeek}, ${data.periodId}, ${data.gradeId}, ${streamId}, ${data.subjectId}, ${data.teacherUserId}, ${room}, ${notes}, ${blockLength}, ${locked}, ${me.id})`;
    return { ok: true, id };
  });

export const deleteTimetableEntry = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const entry = await sql<{ year_id: string; term_id: string }>`select year_id, term_id from timetable_entries where id = ${data.id}`;
    if (entry[0]) await ensureTimetableDraft(sql, entry[0].year_id, entry[0].term_id);
    await sql`delete from timetable_entries where id = ${data.id}`;
    return { ok: true };
  });

export const clearTimetableEntries = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const cleared = await sql.transaction(async (tx) => {
      await ensureTimetableDraft(tx, data.yearId, data.termId);
      const entries = await tx<{ id: string }>`select id from timetable_entries where year_id = ${data.yearId} and term_id = ${data.termId}`;
      if (!entries.length) return 0;
      await captureTimetableVersion(tx, data.yearId, data.termId, "Before clearing scheduled lessons", me.id);
      await tx`delete from timetable_entries where year_id = ${data.yearId} and term_id = ${data.termId}`;
      return entries.length;
    });
    return { ok: true, cleared };
  });

export const emailTimetable = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; recipientIds: string[]; pdfBase64: string; fileName: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const ids = [...new Set(data.recipientIds)].filter(Boolean).slice(0, 100);
    if (!ids.length) throw new Error("Select at least one teacher email recipient.");
    const pdfBase64 = data.pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(pdfBase64) || pdfBase64.length > 8_000_000) throw new Error("The generated PDF is invalid or too large to email.");
    const fileName = (data.fileName || "mukuyu-timetable.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const sql = await getSql();
    const recipients = await sql<{ id: string; email: string; full_name: string }>`select id, email, full_name from users where id = any(${ids}::text[]) and active = true and role in ('teacher','admin','super_admin') order by full_name`;
    if (recipients.length !== ids.length) throw new Error("One or more selected recipients are no longer active teaching staff.");
    const year = await sql<{ name: string }>`select name from academic_years where id = ${data.yearId}`;
    const term = await sql<{ name: string }>`select name from terms where id = ${data.termId}`;
    const subject = `Mukuyu timetable · ${year[0]?.name ?? data.yearId} ${term[0]?.name ?? data.termId}`;
    const body = `Hello {name},\n\nAttached is the Mukuyu School timetable for ${year[0]?.name ?? data.yearId}, ${term[0]?.name ?? data.termId}.\n\nPlease contact the school office if a lesson or room needs correction.`;
    let sent = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const recipient of recipients) {
      const result = await sendEmail(recipient.email, subject, body.replace("{name}", recipient.full_name), [{ filename: fileName, content: pdfBase64 }]);
      await sql`insert into mail_outbox (id, to_email, subject, body) values (${newId("mail")}, ${recipient.email}, ${subject}, ${result.sent ? "Timetable PDF sent successfully." : `Timetable PDF email failed: ${result.reason}`})`;
      if (result.sent) sent++;
      else { failed++; failures.push(`${recipient.full_name}: ${result.reason}`); }
    }
    return { ok: true, sent, failed, failures };
  });

export const emailPersonalTimetable = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; recipientId: string; pdfBase64: string; classPdfBase64?: string; fileName: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const pdfBase64 = data.pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(pdfBase64) || pdfBase64.length > 8_000_000) throw new Error("The generated teacher PDF is invalid or too large to email.");
    const classPdfBase64 = (data.classPdfBase64 ?? "").replace(/^data:application\/pdf;base64,/, "").trim();
    if (classPdfBase64 && (!/^[A-Za-z0-9+/=]+$/.test(classPdfBase64) || classPdfBase64.length > 8_000_000)) throw new Error("The generated class timetable pack is invalid or too large to email.");
    const fileName = (data.fileName || "teacher-timetable.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const sql = await getSql();
    const recipient = await sql<{ id: string; email: string; full_name: string }>`select id, email, full_name from users where id = ${data.recipientId} and active = true and role in ('teacher','admin','super_admin')`;
    if (!recipient[0]) throw new Error("The selected teacher is no longer active or cannot receive a timetable.");
    const year = await sql<{ name: string }>`select name from academic_years where id = ${data.yearId}`;
    const term = await sql<{ name: string }>`select name from terms where id = ${data.termId}`;
    const period = `${year[0]?.name ?? data.yearId} ${term[0]?.name ?? data.termId}`;
    const subject = `Your Mukuyu teacher timetable · ${period}`;
    const body = `Hello ${recipient[0].full_name},\n\nAttached is your individual teaching timetable for ${period}. The PDF uses the same arranged timetable grid shown in the Mukuyu website view, with periods across, weekdays down, breaks, rooms, and class details.\n\nPlease contact the school office if a lesson or room needs correction.`;
    const safeTeacherName = recipient[0].full_name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 50);
    const attachments = [{ filename: fileName, content: pdfBase64 }, ...(classPdfBase64 ? [{ filename: `mukuyu-class-timetables-${safeTeacherName}-${period.replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`, content: classPdfBase64 }] : [])];
    const result = await sendEmail(recipient[0].email, subject, body, attachments);
    await sql`insert into mail_outbox (id, to_email, subject, body) values (${newId("mail")}, ${recipient[0].email}, ${subject}, ${result.sent ? "Personal teacher timetable PDF sent successfully." : `Personal teacher timetable email failed: ${result.reason}`})`;
    return { ok: true, sent: result.sent ? 1 : 0, failed: result.sent ? 0 : 1, failure: result.sent ? "" : result.reason };
  });

export const listNotificationRecipients = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  if (me.role !== "super_admin" && !me.isDeputy) throw new Error("Only super admin or deputies can view notification recipients.");
  const sql = await getSql();
  return sql<{ id: string; fullName: string; email: string; role: string }>`
    select id, full_name as "fullName", email, role from users
    where active = true order by full_name limit 500`;
});

export const sendNotification = createServerFn({ method: "POST" })
  .validator((input: { title: string; body: string; toRole?: string; toUser?: string; alsoEmail?: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin" && !me.isDeputy) throw new Error("Only super admin or deputies can send notifications.");
    const title = data.title.trim();
    const body = data.body.trim();
    if (!title || !body) throw new Error("Enter both a notification title and message.");
    if (title.length > 120 || body.length > 4000) throw new Error("The title or message is too long.");
    const sql = await getSql();
    const recipients = data.toUser
      ? await sql<{ email: string; full_name: string }>`select email, full_name from users where id = ${data.toUser} and active = true`
      : data.toRole
        ? await sql<{ email: string; full_name: string }>`select email, full_name from users where role = ${data.toRole} and active = true order by full_name limit 101`
        : await sql<{ email: string; full_name: string }>`select email, full_name from users where active = true order by full_name limit 101`;
    if (!recipients.length) throw new Error("No active recipients were found.");
    if (recipients.length > 100) throw new Error("Notifications are limited to 100 recipients per send. Choose a smaller group.");
    await sql`
      insert into notifications (id, from_user, to_role, to_user, title, body)
      values (${newId("ntf")}, ${me.id}, ${data.toRole || null}, ${data.toUser || null}, ${title}, ${body})`;
    let emailSent = 0;
    let emailFailed = 0;
    const portalUrl = await schoolPortalUrl(sql);
    for (const recipient of recipients) {
      const result = await sendPasswordEmail(recipient.email, title, `${body}\n\nMukuyu School Portal: ${portalUrl}`);
      if (result.sent) emailSent++;
      else emailFailed++;
    }
    return { ok: true, emailSent, emailFailed, emailRequested: true };
  });

export const listNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const me = await requireActor();
  const sql = await getSql();
  return sql<{ id: string; title: string; body: string; createdAt: string }>`
    select id, title, body, created_at as "createdAt"
    from notifications
    where to_user = ${me.id} or (to_user is null and to_role = ${me.role}) or (to_user is null and to_role is null)
    order by created_at desc limit 50`;
});

export const deleteYear = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (me.role !== "super_admin") throw new Error("Only the super admin can delete an academic year.");
    const sql = await getSql();
    const used = await sql`select id from marks where year_id = ${data.id} limit 1`;
    if (used.length) throw new Error("This year has marks. Remove or reassign marks before deleting the year.");
    await sql`delete from academic_years where id = ${data.id}`;
    return { ok: true };
  });

export const deleteExam = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role)) throw new Error("Only admins can delete CATs.");
    const sql = await getSql();
    await sql`delete from marks where exam_id = ${data.id}`;
    await sql`delete from exams where id = ${data.id}`;
    return { ok: true };
  });

export const importMarksExcel = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; examId: string; rows: { admissionNumber?: string; fullName?: string; subject: string; score: number }[] }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!isAdmin(me.role) && me.role !== "teacher") throw new Error("Access denied.");
    if (!data.rows.length || data.rows.length > 5000) throw new Error("Upload between 1 and 5,000 subject marks at a time.");
    const sql = await getSql();
    const year = await sql`select id from academic_years where id = ${data.yearId}`;
    const term = await sql`select id from terms where id = ${data.termId}`;
    const exam = await sql`select id from exams where id = ${data.examId}`;
    if (!year[0] || !term[0] || !exam[0]) throw new Error("Select a valid academic year, term and CAT/exam.");
    const controlRows = await sql<{ entry_allowed: boolean; edit_allowed: boolean }>`select entry_allowed, edit_allowed from mark_controls where year_id = ${data.yearId} and term_id = ${data.termId} and exam_id = ${data.examId}`;
    const control = controlRows[0] ?? { entry_allowed: true, edit_allowed: true };
    const bypass = isPowerful(me);
    const placedAtYear = new Map((await learnersAtYear(sql, data.yearId)).map((placed) => [placed.id, placed]));
    const availableSubjects = await sql<{ id: string; name: string; short_name: string }>`select id, name, short_name from subjects order by sort`;
    const normalizeSubject = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
    const activeLearners = await sql<{ id: string; full_name: string; admission_number: string | null; grade_id: string; stream_id: string }>`select id, full_name, admission_number, grade_id, stream_id from learners where status = 'active'`;
    const normalizeName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
    const byAdmission = new Map(activeLearners.flatMap((learner) => learner.admission_number?.trim() ? [[learner.admission_number.trim().toUpperCase(), learner] as const] : []));
    const byName = new Map<string, typeof activeLearners>();
    activeLearners.forEach((learner) => {
      const key = normalizeName(learner.full_name);
      byName.set(key, [...(byName.get(key) ?? []), learner]);
    });
    let saved = 0;
    const errors: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < data.rows.length; i += 1) {
      const row = data.rows[i];
      const line = i + 2;
      const admission = (row.admissionNumber ?? "").trim().toUpperCase();
      const fullName = normalizeName(row.fullName ?? "");
      if (!admission && !fullName) { errors.push(`Row ${line}: provide either an admission number or learner name.`); continue; }
      const score = Number(row.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) { errors.push(`Row ${line}: score must be between 0 and 100.`); continue; }
      const nameMatches = fullName ? (byName.get(fullName) ?? []) : [];
      const found = admission ? byAdmission.get(admission) : nameMatches.length === 1 ? nameMatches[0] : undefined;
      if (!found) {
        if (nameMatches.length > 1) errors.push(`Row ${line}: learner name '${row.fullName}' matches more than one active learner; use an admission number.`);
        else errors.push(`Row ${line}: ${admission ? `admission number ${admission}` : `learner name '${row.fullName}'`} was not found.`);
        continue;
      }
      const at = placedAtYear.get(found.id);
      const learner = at ? { ...found, grade_id: at.gradeId, stream_id: at.streamId } : found;
      if (fullName && fullName !== normalizeName(learner.full_name)) {
        errors.push(`Row ${line}: name does not match admission ${admission}; verify the learner.`); continue;
      }
      const subjectName = row.subject.trim();
      const normalizedHeader = normalizeSubject(subjectName).replace(/\s+(?:out of|maximum|marks?)\s+\d+(?:\.\d+)?$/, "").trim();
      const matches = availableSubjects.filter((subject) => [subject.name, subject.short_name].filter(Boolean).some((name) => {
        const normalizedName = normalizeSubject(name);
        return normalizedHeader === normalizedName || normalizedHeader === `${normalizedName} score` || normalizedHeader === `${normalizedName} marks` || normalizedHeader === `${normalizedName} out of 100`;
      }));
      if (matches.length !== 1) { errors.push(`Row ${line}: subject '${subjectName}' was ${matches.length ? "ambiguous" : "not recognized"}. Use the subject name or short name shown in the portal.`); continue; }
      const matchedSubject = matches[0];
      const key = `${learner.id}|${matchedSubject.id}`;
      if (seen.has(key)) { errors.push(`Row ${line}: duplicate learner/subject row.`); continue; }
      seen.add(key);
      if (me.role === "teacher") {
        const assigned = await sql<{ id: string }>`select id from assignments where user_id = ${me.id} and subject_id = ${matchedSubject.id} and (grade_id is null or grade_id = ${learner.grade_id}) and (stream_id is null or stream_id = ${learner.stream_id})`;
        if (!assigned[0]) { errors.push(`Row ${line}: you are not assigned to this subject/class.`); continue; }
      }
      const existing = await sql<{ score: number }>`select score from marks where learner_id = ${learner.id} and subject_id = ${matchedSubject.id} and exam_id = ${data.examId} and year_id = ${data.yearId} and term_id = ${data.termId}`;
      if (existing.length && Number(existing[0].score) === Math.round(score)) continue; // unchanged: not an edit
      if (!existing.length && !bypass && !control.entry_allowed) { errors.push(`Row ${line}: mark entry is locked for this year, term and CAT.`); continue; }
      if (existing.length && !bypass && !control.edit_allowed) { errors.push(`Row ${line}: editing an existing result is disabled for this year, term and CAT.`); continue; }
      await sql`
        insert into marks (learner_id, subject_id, exam_id, score, year_id, term_id, grade_id, stream_id, updated_by)
        values (${learner.id}, ${matchedSubject.id}, ${data.examId}, ${score}, ${data.yearId}, ${data.termId}, ${learner.grade_id}, ${learner.stream_id}, ${me.id})
        on conflict (learner_id, subject_id, exam_id, year_id, term_id) do update set score = ${score}, grade_id = ${learner.grade_id}, stream_id = ${learner.stream_id}, status = 'recorded', updated_by = ${me.id}, updated_at = now()`;
      saved++;
    }
    return { ok: true, saved, errors };
  });


async function captureTimetableVersion(sql: Sql, yearId: string, termId: string, label: string, userId: string) {
  const periods = await sql`select * from timetable_periods where year_id = ${yearId} and term_id = ${termId} order by sort`;
  const entries = await sql`select * from timetable_entries where year_id = ${yearId} and term_id = ${termId} order by day_of_week, period_id`;
  const id = newId("ttv");
  await sql`insert into timetable_versions (id, year_id, term_id, label, payload_json, created_by) values (${id}, ${yearId}, ${termId}, ${label.slice(0, 120)}, ${JSON.stringify({ periods, entries })}, ${userId})`;
  return id;
}

async function ensureTimetableDraft(sql: Sql, yearId: string, termId: string) {
  const state = await sql`select published from timetable_state where year_id = ${yearId} and term_id = ${termId}`;
  if (state[0]?.published) throw new Error("This timetable is published and read-only. Unpublish it before making changes.");
}

type TimetableIssue = { severity: "error" | "warning"; message: string; fix?: { kind: "repair" | "reset_distribution" | "relax_rest" | "raise_teacher_limit" | "raise_subject_max_day"; label: string; requirementId?: string; teacherUserId?: string; subjectId?: string } };
const TIMETABLE_DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

async function timetableBundle(sql: Sql, yearId: string, termId: string) {
  const periods = await sql<{ id: string; sort: number; isBreak: boolean; label: string; startTime: string; endTime: string }>`select id, sort, is_break as "isBreak", label, start_time as "startTime", end_time as "endTime" from timetable_periods where year_id = ${yearId} and term_id = ${termId} order by sort`;
  const subjects = await sql<{ id: string; name: string; short_name: string }>`select id, name, short_name from subjects`;
  const grades = await sql<{ id: string; name: string; level: number }>`select id, name, level from grades`;
  const streams = await sql<{ id: string; name: string; grade_id: string }>`select id, name, grade_id from streams`;
  const teachers = await sql<{ id: string; full_name: string }>`select id, full_name from users`;
  const rules = await sql<{ subject_id: string; max_per_day: number; min_days_per_week: number; no_afternoon: boolean; preferred_morning: boolean; avoid_consecutive_days: boolean; no_last_period: boolean; complexity: number; place_in_order: boolean; double_count: number | null; max_before_break: number }>`select subject_id, max_per_day, min_days_per_week, no_afternoon, preferred_morning, avoid_consecutive_days, no_last_period, complexity, place_in_order, double_count, coalesce(max_before_break, 3) as max_before_break from subject_constraints where year_id = ${yearId} and term_id = ${termId}`;
  const availability = await sql<{ entity_type: string; entity_id: string; day_of_week: number; period_id: string; level: "off" | "avoid" | "prefer" }>`select entity_type, entity_id, day_of_week, period_id, coalesce(level, 'off') as level from timetable_availability where year_id = ${yearId} and term_id = ${termId} and available = false`;
  const teacherRules = await sql<{ teacher_user_id: string; min_per_day: number; max_per_day: number; max_per_week: number; max_consecutive: number; max_days: number; max_windows: number; min_rest_periods: number }>`select teacher_user_id, coalesce(min_per_day, 0) as min_per_day, max_per_day, max_per_week, max_consecutive, max_days, max_windows, min_rest_periods from teacher_contracts where year_id = ${yearId} and term_id = ${termId}`;
  const classRules = await sql<{ grade_id: string; stream_id: string | null; max_per_day: number; no_gaps: boolean }>`select grade_id, stream_id, max_per_day, no_gaps from class_constraints where year_id = ${yearId} and term_id = ${termId}`;
  const relations = await sql<{ grade_id: string; stream_id: string | null; left_subject_id: string; right_subject_id: string; relation: "before" | "same_day" | "different_day" | "not_consecutive" }>`select grade_id, stream_id, left_subject_id, right_subject_id, relation from lesson_relations where year_id = ${yearId} and term_id = ${termId}`;
  const requirements = await sql<{ id: string; grade_id: string; stream_id: string | null; subject_id: string; teacher_user_id: string; lessons_per_week: number; block_length: number; preferred_room: string; distribution: string; preferred_double_day: number | null; timing_preference: "none" | "before_break" | "before_lunch" }>`select id, grade_id, stream_id, subject_id, teacher_user_id, lessons_per_week, block_length, preferred_room, coalesce(distribution, '') as distribution, preferred_double_day, coalesce(timing_preference, 'none') as timing_preference from timetable_requirements where year_id = ${yearId} and term_id = ${termId}`;
  const assignments = await sql<{ grade_id: string; stream_id: string | null; subject_id: string; user_id: string }>`select distinct a.grade_id, a.stream_id, a.subject_id, a.user_id from assignments a join users u on u.id = a.user_id and u.active = true join subjects s on s.id = a.subject_id join grades g on g.id = a.grade_id left join streams st on st.id = a.stream_id and st.grade_id = a.grade_id where a.kind = 'subject_teacher' and a.subject_id is not null and a.grade_id is not null and (a.stream_id is null or st.id is not null)`;
  const rooms = await sql<{ id: string; name: string; active: boolean; capacity: number }>`select id, name, active, capacity from timetable_rooms`;
  const classSizes = await sql<{ gradeId: string; streamId: string | null; learners: number }>`select grade_id as "gradeId", stream_id as "streamId", count(*)::int as learners from learners where status = 'active' group by grade_id, stream_id`;
  const entries = await sql<{ id: string; day_of_week: number; period_id: string; grade_id: string; stream_id: string | null; subject_id: string; teacher_user_id: string; room: string; block_length: number; locked: boolean; sort: number }>`select e.id, e.day_of_week, e.period_id, e.grade_id, e.stream_id, e.subject_id, e.teacher_user_id, e.room, e.block_length, e.locked, p.sort from timetable_entries e join timetable_periods p on p.id = e.period_id where e.year_id = ${yearId} and e.term_id = ${termId}`;
  const subjectRules: EngineSubjectRule[] = subjects.map((subject) => {
    const row = rules.find((item) => item.subject_id === subject.id);
    const maths = /math/i.test(`${subject.short_name} ${subject.name}`);
    return {
      subjectId: subject.id,
      maxPerDay: row?.max_per_day ?? (maths ? 1 : 2),
      minDaysPerWeek: row?.min_days_per_week ?? 1,
      noAfternoon: row ? Boolean(row.no_afternoon) : maths,
      preferredMorning: row ? Boolean(row.preferred_morning) : maths,
      avoidConsecutiveDays: row ? Boolean(row.avoid_consecutive_days) : false,
      noLastPeriod: Boolean(row?.no_last_period),
      complexity: row?.complexity ?? (maths ? 2 : 1),
      placeInOrder: row ? Boolean(row.place_in_order) : true,
      doubleCount: row?.double_count == null ? null : Number(row.double_count),
      maxBeforeBreak: row ? Number(row.max_before_break) || 3 : 3,
    };
  });
  const roomId = (name: string) => rooms.find((room) => room.name.toLowerCase() === name.toLowerCase())?.id ?? "";
  const cover = (sort: number, block: number) => {
    const sorted = [...periods].sort((a, b) => a.sort - b.sort);
    const start = sorted.find((period) => period.sort === sort);
    if (!start) return { periodIds: [] as string[], sorts: [] as number[] };
    const periodIds = [start.id];
    const sorts = [start.sort];
    for (const period of sorted) {
      if (period.sort <= start.sort || periodIds.length >= block) continue;
      if (period.isBreak || period.sort !== sorts[sorts.length - 1] + 1) break;
      periodIds.push(period.id);
      sorts.push(period.sort);
    }
    return { periodIds, sorts };
  };
  const toPlacement = (entry: typeof entries[number], order = 0, locked = false): EnginePlacement => {
    const covered = cover(entry.sort, Math.max(1, entry.block_length || 1));
    return {
      locked,
      day: entry.day_of_week,
      periodId: entry.period_id,
      periodIds: covered.periodIds.length ? covered.periodIds : [entry.period_id],
      sorts: covered.sorts.length ? covered.sorts : [entry.sort],
      unit: { id: entry.id, gradeId: entry.grade_id, streamId: entry.stream_id, subjectId: entry.subject_id, teacherUserId: entry.teacher_user_id, room: entry.room, roomId: roomId(entry.room), block: Math.max(1, entry.block_length || 1), order },
    };
  };
  const names = {
    day: (day: number) => TIMETABLE_DAYS[day] ?? `Day ${day}`,
    teacher: (id: string) => teachers.find((teacher) => teacher.id === id)?.full_name ?? "Teacher",
    subject: (id: string) => subjects.find((subject) => subject.id === id)?.name ?? "Subject",
    classLabel: (gradeId: string, streamId: string | null) => {
      const grade = grades.find((item) => item.id === gradeId);
      const stream = streams.find((item) => item.id === streamId);
      return `${grade?.level ?? ""}${stream?.name ?? grade?.name ?? "Class"}`;
    },
    period: (id: string) => periods.find((period) => period.id === id)?.label ?? "Period",
  };
  return { periods, subjects, streams, availability, subjectRules, teacherRules, classRules, relations, requirements, assignments, rooms, classSizes, entries, roomId, toPlacement, names };
}

async function timetableIssues(sql: Sql, yearId: string, termId: string): Promise<TimetableIssue[]> {
  const bundle = await timetableBundle(sql, yearId, termId);
  const placements = bundle.entries.map((entry, index) => bundle.toPlacement(entry, index, Boolean(entry.locked)));
  return auditTimetable({
    periods: bundle.periods,
    placements,
    availability: bundle.availability.map((item) => ({ entityType: item.entity_type, entityId: item.entity_id, day: item.day_of_week, periodId: item.period_id, level: item.level === "avoid" || item.level === "prefer" ? item.level : "off", streamGradeId: item.entity_type === "stream" ? bundle.streams.find((stream) => stream.id === item.entity_id)?.grade_id : undefined })),
    subjectRules: bundle.subjectRules,
    teacherRules: bundle.teacherRules.map((rule) => ({ teacherUserId: rule.teacher_user_id, minPerDay: rule.min_per_day, maxPerDay: rule.max_per_day, maxPerWeek: rule.max_per_week, maxConsecutive: rule.max_consecutive, maxDays: rule.max_days, maxWindows: rule.max_windows, minRestPeriods: rule.min_rest_periods })),
    classRules: bundle.classRules.map((rule) => ({ gradeId: rule.grade_id, streamId: rule.stream_id, maxPerDay: rule.max_per_day, noGaps: Boolean(rule.no_gaps) })),
    relations: bundle.relations.map((relation) => ({ gradeId: relation.grade_id, streamId: relation.stream_id, leftSubjectId: relation.left_subject_id, rightSubjectId: relation.right_subject_id, relation: relation.relation })),
    requirements: bundle.requirements.map((requirement) => ({ id: requirement.id, gradeId: requirement.grade_id, streamId: requirement.stream_id, subjectId: requirement.subject_id, teacherUserId: requirement.teacher_user_id, lessonsPerWeek: requirement.lessons_per_week, blockLength: requirement.block_length, distribution: requirement.distribution, preferredDoubleDay: requirement.preferred_double_day, timingPreference: requirement.timing_preference })),
    rooms: bundle.rooms.map((room) => ({ name: room.name, active: Boolean(room.active), capacity: Number(room.capacity) || 0 })),
    classSizes: bundle.classSizes.map((item) => ({ gradeId: item.gradeId, streamId: item.streamId, learners: Number(item.learners) || 0 })),
    assignments: bundle.assignments.map((item) => ({ gradeId: item.grade_id, streamId: item.stream_id, subjectId: item.subject_id, teacherUserId: item.user_id })),
    names: bundle.names,
  });
}

async function subjectTeacherCoverage(sql: Sql, yearId: string, termId: string) {
  const assignments = await sql<{ grade_id: string; grade_name: string; stream_id: string | null; stream_name: string | null; subject_id: string; subject_name: string; teacher_user_id: string; teacher_name: string }>`
    select distinct a.grade_id, g.name as grade_name, a.stream_id, st.name as stream_name,
      a.subject_id, s.name as subject_name, a.user_id as teacher_user_id, u.full_name as teacher_name
    from assignments a
    join grades g on g.id = a.grade_id
    join subjects s on s.id = a.subject_id
    join users u on u.id = a.user_id and u.active = true
    left join streams st on st.id = a.stream_id and st.grade_id = a.grade_id
    where a.kind = 'subject_teacher' and a.subject_id is not null and a.grade_id is not null
      and (a.stream_id is null or st.id is not null)
    order by g.name, st.name nulls first, s.name, u.full_name`;
  const requirements = await sql<{ grade_id: string; stream_id: string | null; subject_id: string; teacher_user_id: string }>`select grade_id, stream_id, subject_id, teacher_user_id from timetable_requirements where year_id = ${yearId} and term_id = ${termId}`;
  const streams = await sql<{ id: string; grade_id: string }>`select id, grade_id from streams`;
  const matches = (assignment: typeof assignments[number]) => {
    const matching = requirements.filter((requirement) => requirement.grade_id === assignment.grade_id && requirement.subject_id === assignment.subject_id && requirement.teacher_user_id === assignment.teacher_user_id);
    if (assignment.stream_id) return matching.some((requirement) => requirement.stream_id == null || requirement.stream_id === assignment.stream_id);
    if (matching.some((requirement) => requirement.stream_id == null)) return true;
    const gradeStreams = streams.filter((stream) => stream.grade_id === assignment.grade_id).map((stream) => stream.id);
    return gradeStreams.length > 0 && gradeStreams.every((streamId) => matching.some((requirement) => requirement.stream_id === streamId));
  };
  return assignments.map((assignment) => ({
    gradeId: assignment.grade_id,
    grade: assignment.grade_name,
    streamId: assignment.stream_id,
    stream: assignment.stream_name || "Whole grade",
    subjectId: assignment.subject_id,
    subject: assignment.subject_name,
    teacherId: assignment.teacher_user_id,
    teacher: assignment.teacher_name,
    hasWeeklyCard: matches(assignment),
  }));
}

function balancedDistribution(lessons: number) {
  const base = Math.floor(lessons / 5);
  const extra = lessons % 5;
  return Array.from({ length: 5 }, (_, day) => base + (day < extra ? 1 : 0)).filter(Boolean).join("+");
}

async function createMissingAssignmentRequirements(sql: Sql, yearId: string, termId: string, lessonsPerWeek: number) {
  if (!Number.isInteger(lessonsPerWeek) || lessonsPerWeek < 1 || lessonsPerWeek > 15) throw new Error("Default assigned-subject load must be from 1 to 15 periods per week.");
  const coverage = await subjectTeacherCoverage(sql, yearId, termId);
  const missing = coverage.filter((row) => !row.hasWeeklyCard);
  const distribution = balancedDistribution(lessonsPerWeek);
  for (const assignment of missing) {
    await sql`insert into timetable_requirements (id, year_id, term_id, grade_id, stream_id, subject_id, teacher_user_id, lessons_per_week, block_length, preferred_room, distribution)
      values (${newId("ttr")}, ${yearId}, ${termId}, ${assignment.gradeId}, ${assignment.streamId}, ${assignment.subjectId}, ${assignment.teacherId}, ${lessonsPerWeek}, 1, '', ${distribution})
      on conflict do nothing`;
  }
  return { assignments: coverage.length, existing: coverage.length - missing.length, missing: missing.length, created: missing.length, lessonsPerWeek, distribution };
}

export const saveTimetableRoom = createServerFn({ method: "POST" })
  .validator((input: { id?: string; name: string; capacity?: number; roomType?: string; features?: string; active?: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const name = data.name.trim().slice(0, 80);
    const capacity = Math.max(0, Math.min(10000, Math.trunc(Number(data.capacity ?? 0))));
    if (!name || !Number.isFinite(capacity)) throw new Error("Enter a room name and valid capacity.");
    const sql = await getSql();
    const duplicate = await sql<{ id: string }>`select id from timetable_rooms where lower(name) = lower(${name}) and (${data.id ?? ""} = '' or id <> ${data.id ?? ""})`;
    if (duplicate.length) throw new Error("A room with that name already exists.");
    const id = data.id || newId("room");
    if (data.id) await sql`update timetable_rooms set name = ${name}, capacity = ${capacity}, room_type = ${(data.roomType ?? "").trim().slice(0, 80)}, features = ${(data.features ?? "").trim().slice(0, 300)}, active = ${data.active ?? true} where id = ${id}`;
    else await sql`insert into timetable_rooms (id, name, capacity, room_type, features, active) values (${id}, ${name}, ${capacity}, ${(data.roomType ?? "").trim().slice(0, 80)}, ${(data.features ?? "").trim().slice(0, 300)}, ${data.active ?? true})`;
    return { ok: true, id };
  });

export const deleteTimetableRoom = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const room = await sql<{ name: string }>`select name from timetable_rooms where id = ${data.id}`;
    if (!room[0]) return { ok: true };
    const used = await sql`select id from timetable_entries where lower(room) = lower(${room[0].name}) limit 1`;
    if (used.length) throw new Error("This room is used by a scheduled lesson. Reassign those lessons first.");
    await sql`delete from timetable_availability where entity_type = 'room' and entity_id = ${data.id}`;
    await sql`delete from timetable_rooms where id = ${data.id}`;
    return { ok: true };
  });

type TimetableAvailabilitySlot = { dayOfWeek: number; periodId: string; level: AvailabilityLevel; note?: string };
type TimetableAvailabilityMap = { yearId: string; termId: string; entityType: "teacher" | "grade" | "stream" | "room" | "subject"; entityId: string; slots: TimetableAvailabilitySlot[] };

async function writeTimetableAvailabilityMap(sql: Sql, userId: string, data: TimetableAvailabilityMap) {
  if (data.slots.length > 80) throw new Error("Too many off-time cells.");
  await ensureTimetableDraft(sql, data.yearId, data.termId);
  let resourceName = "";
  let streamGradeId = "";
  let valid: Record<string, unknown>[] = [];
  if (data.entityType === "teacher") valid = await sql`select id from users where id = ${data.entityId} and active = true and role in ('teacher','admin','super_admin')`;
  if (data.entityType === "grade") valid = await sql`select id from grades where id = ${data.entityId}`;
  if (data.entityType === "stream") {
    const streams = await sql<{ id: string; grade_id: string }>`select id, grade_id from streams where id = ${data.entityId}`;
    valid = streams;
    streamGradeId = streams[0]?.grade_id ?? "";
  }
  if (data.entityType === "room") {
    const rooms = await sql<{ id: string; name: string }>`select id, name from timetable_rooms where id = ${data.entityId} and active = true`;
    valid = rooms;
    resourceName = rooms[0]?.name ?? "";
  }
  if (data.entityType === "subject") valid = await sql`select id from subjects where id = ${data.entityId}`;
  if (!valid.length) throw new Error("Choose an existing active teacher, grade, stream, room, or subject.");
  const bell = await sql<{ id: string; sort: number; is_break: boolean }>`select id, sort, is_break from timetable_periods where year_id = ${data.yearId} and term_id = ${data.termId} order by sort`;
  const byPeriod = new Map(bell.map((period) => [period.id, period]));
  const previousRows = await sql<{ day_of_week: number; period_id: string; note: string }>`select day_of_week, period_id, note from timetable_availability where year_id = ${data.yearId} and term_id = ${data.termId} and entity_type = ${data.entityType} and entity_id = ${data.entityId}`;
  const previousNotes = new Map(previousRows.map((item) => [`${item.day_of_week}:${item.period_id}`, item.note]));
  const normalized = new Map<string, TimetableAvailabilitySlot>();
  for (const slot of data.slots) {
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 1 || slot.dayOfWeek > 5) throw new Error("Choose a weekday from Monday to Friday.");
    const period = byPeriod.get(slot.periodId);
    if (!period || period.is_break) throw new Error("Time-off can only be set on a lesson period in this bell schedule.");
    const level: AvailabilityLevel = slot.level === "avoid" || slot.level === "prefer" ? slot.level : "off";
    const key = `${slot.dayOfWeek}:${slot.periodId}`;
    normalized.set(key, { dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, level, note: (slot.note ?? previousNotes.get(key) ?? "").trim().slice(0, 160) });
  }
  const entries = await sql<{ id: string; day_of_week: number; period_id: string; grade_id: string; stream_id: string | null; subject_id: string; teacher_user_id: string; room: string; block_length: number; period_sort: number }>`select e.id, e.day_of_week, e.period_id, e.grade_id, e.stream_id, e.subject_id, e.teacher_user_id, e.room, e.block_length, p.sort as period_sort from timetable_entries e join timetable_periods p on p.id = e.period_id where e.year_id = ${data.yearId} and e.term_id = ${data.termId}`;
  const offSlots = [...normalized.values()].filter((slot) => slot.level === "off");
  const offSortsByDay = new Map<number, Set<number>>();
  for (const slot of offSlots) {
    const sort = byPeriod.get(slot.periodId)!.sort;
    (offSortsByDay.get(slot.dayOfWeek) ?? offSortsByDay.set(slot.dayOfWeek, new Set()).get(slot.dayOfWeek)!).add(sort);
  }
  const conflicts = entries.filter((entry) => {
    const resourceMatches = data.entityType === "teacher" ? entry.teacher_user_id === data.entityId
      : data.entityType === "grade" ? entry.grade_id === data.entityId
        : data.entityType === "stream" ? entry.stream_id === data.entityId || (!entry.stream_id && entry.grade_id === streamGradeId)
          : data.entityType === "subject" ? entry.subject_id === data.entityId
            : Boolean(resourceName && entry.room.trim().toLowerCase() === resourceName.trim().toLowerCase());
    if (!resourceMatches) return false;
    const offSorts = offSortsByDay.get(entry.day_of_week);
    if (!offSorts) return false;
    const length = Math.max(1, Math.min(3, entry.block_length || 1));
    return Array.from({ length }, (_, offset) => entry.period_sort + offset).some((sort) => offSorts.has(sort));
  });
  const conflictIds = [...new Set(conflicts.map((entry) => entry.id))];
  await sql.transaction(async (tx) => {
    if (conflictIds.length) await captureTimetableVersion(tx, data.yearId, data.termId, `Before applying ${data.entityType} off-time`, userId);
    await tx`delete from timetable_availability where year_id = ${data.yearId} and term_id = ${data.termId} and entity_type = ${data.entityType} and entity_id = ${data.entityId}`;
    for (const slot of normalized.values()) {
      await tx`insert into timetable_availability (id, year_id, term_id, entity_type, entity_id, day_of_week, period_id, available, level, note) values (${newId("tav")}, ${data.yearId}, ${data.termId}, ${data.entityType}, ${data.entityId}, ${slot.dayOfWeek}, ${slot.periodId}, false, ${slot.level}, ${slot.note ?? ""}) on conflict (year_id, term_id, entity_type, entity_id, day_of_week, period_id) do update set available = false, level = excluded.level, note = excluded.note`;
    }
    if (conflictIds.length) await tx`delete from timetable_entries where id = any(${conflictIds}::text[])`;
  });
  return { ok: true, saved: normalized.size, removedLessons: conflictIds.length };
}

export const saveTimetableAvailability = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; entityType: "teacher" | "grade" | "stream" | "room" | "subject"; entityId: string; dayOfWeek: number; periodId: string; note?: string; level?: AvailabilityLevel }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const level: AvailabilityLevel = data.level === "avoid" || data.level === "prefer" ? data.level : "off";
    const sql = await getSql();
    const previous = await sql<{ day_of_week: number; period_id: string; level: AvailabilityLevel; note: string }>`select day_of_week, period_id, coalesce(level, 'off') as level, note from timetable_availability where year_id = ${data.yearId} and term_id = ${data.termId} and entity_type = ${data.entityType} and entity_id = ${data.entityId}`;
    const slots: TimetableAvailabilitySlot[] = previous.filter((slot) => slot.day_of_week !== data.dayOfWeek || slot.period_id !== data.periodId).map((slot) => ({ dayOfWeek: slot.day_of_week, periodId: slot.period_id, level: slot.level, note: slot.note }));
    slots.push({ dayOfWeek: data.dayOfWeek, periodId: data.periodId, level, note: data.note });
    return writeTimetableAvailabilityMap(sql, me.id, { yearId: data.yearId, termId: data.termId, entityType: data.entityType, entityId: data.entityId, slots });
  });

export const saveAvailabilityMap = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; entityType: "teacher" | "grade" | "stream" | "room" | "subject"; entityId: string; slots: Array<{ dayOfWeek: number; periodId: string; level: AvailabilityLevel }> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    return writeTimetableAvailabilityMap(sql, me.id, data);
  });

export const deleteTimetableAvailability = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    await sql`delete from timetable_availability where id = ${data.id}`;
    return { ok: true };
  });

export const saveTimetableRequirement = createServerFn({ method: "POST" })
  .validator((input: { id?: string; yearId: string; termId: string; gradeId: string; streamId?: string; subjectId: string; teacherUserId: string; lessonsPerWeek: number; blockLength: number; preferredRoom?: string; distribution?: string; preferredDoubleDay?: number | null; timingPreference?: "none" | "before_break" | "before_lunch" }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const count = Math.trunc(Number(data.lessonsPerWeek));
    const block = Math.trunc(Number(data.blockLength));
    const distribution = (data.distribution ?? "").trim().replace(/\s+/g, "").slice(0, 40);
    const preferredDoubleDay = data.preferredDoubleDay == null || Number(data.preferredDoubleDay) === 0 ? null : Math.trunc(Number(data.preferredDoubleDay));
    const timingPreference = data.timingPreference ?? "none";
    if (count < 1 || count > 40 || block < 1 || block > 3) throw new Error("Weekly lessons must be 1–40 and blocks must be 1, 2, or 3 periods.");
    if (preferredDoubleDay != null && (preferredDoubleDay < 1 || preferredDoubleDay > 5 || count < 2)) throw new Error("A selected double lesson needs at least two weekly lessons and a weekday from Monday to Friday.");
    if (!["none", "before_break", "before_lunch"].includes(timingPreference)) throw new Error("Choose a valid lesson timing preference.");
    if (distribution && !isValidDistribution(distribution, count)) throw new Error("Use whole-number blocks from 1–3 that add up to the weekly lesson target, such as 5 lessons as 1+1+1+1+1 or 2+1+1+1.");
    if (!distribution && count % block !== 0) throw new Error("Weekly lesson count must be divisible by the chosen block length, or set an aSc distribution such as 2+1+1+1.");
    const sql = await getSql();
    const valid = await sql`select (select count(*) from academic_years where id = ${data.yearId}) as years, (select count(*) from terms where id = ${data.termId}) as terms, (select count(*) from grades where id = ${data.gradeId}) as grades, (select count(*) from subjects where id = ${data.subjectId}) as subjects, (select count(*) from users where id = ${data.teacherUserId} and active = true and role in ('teacher','admin','super_admin')) as teachers`;
    const v = valid[0] as { years: number; terms: number; grades: number; subjects: number; teachers: number } | undefined;
    if (!v || Number(v.years) !== 1 || Number(v.terms) !== 1 || Number(v.grades) !== 1 || Number(v.subjects) !== 1 || Number(v.teachers) !== 1) throw new Error("One of the selected academic year, term, grade, subject, or teacher is no longer valid.");
    const streamId = data.streamId || null;
    if (streamId) {
      const stream = await sql`select id from streams where id = ${streamId} and grade_id = ${data.gradeId}`;
      if (!stream.length) throw new Error("The selected stream does not belong to the selected grade.");
    }
    const duplicate = data.id ? [] : await sql<{ id: string }>`select id from timetable_requirements where year_id = ${data.yearId} and term_id = ${data.termId} and grade_id = ${data.gradeId} and stream_id is not distinct from ${streamId} and subject_id = ${data.subjectId} and teacher_user_id = ${data.teacherUserId} limit 1`;
    const id = data.id || duplicate[0]?.id || newId("ttr");
    const preferredRoom = (data.preferredRoom ?? "").trim().slice(0, 80);
    if (data.id || duplicate[0]) await sql`update timetable_requirements set year_id = ${data.yearId}, term_id = ${data.termId}, grade_id = ${data.gradeId}, stream_id = ${streamId}, subject_id = ${data.subjectId}, teacher_user_id = ${data.teacherUserId}, lessons_per_week = ${count}, block_length = ${block}, preferred_room = ${preferredRoom}, distribution = ${distribution}, preferred_double_day = ${preferredDoubleDay}, timing_preference = ${timingPreference} where id = ${id}`;
    else await sql`insert into timetable_requirements (id, year_id, term_id, grade_id, stream_id, subject_id, teacher_user_id, lessons_per_week, block_length, preferred_room, distribution, preferred_double_day, timing_preference) values (${id}, ${data.yearId}, ${data.termId}, ${data.gradeId}, ${streamId}, ${data.subjectId}, ${data.teacherUserId}, ${count}, ${block}, ${preferredRoom}, ${distribution}, ${preferredDoubleDay}, ${timingPreference})`;
    return { ok: true, id };
  });

export const deleteTimetableRequirement = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    await sql`delete from timetable_requirements where id = ${data.id}`;
    return { ok: true };
  });

export const inspectTimetableAssignments = createServerFn({ method: "GET" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!me.active) throw new Error("This account is inactive.");
    const sql = await getSql();
    const rows = await subjectTeacherCoverage(sql, data.yearId, data.termId);
    return { assignments: rows, total: rows.length, existing: rows.filter((row) => row.hasWeeklyCard).length, missing: rows.filter((row) => !row.hasWeeklyCard).length };
  });

export const seedTimetableRequirements = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; lessonsPerWeek?: number }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const setting = await sql<{ staff_assignments_enabled: boolean }>`select staff_assignments_enabled from timetable_admin_permissions where id = 1`;
    if (!setting[0]?.staff_assignments_enabled) throw new Error("Staff subject assignments are disabled for timetable use. Ask the super admin to enable them first.");
    const result = await createMissingAssignmentRequirements(sql, data.yearId, data.termId, data.lessonsPerWeek ?? 5);
    return { ok: true, ...result };
  });

export const saveTeacherContract = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; teacherUserId: string; minPerDay?: number; maxPerDay: number; maxPerWeek: number; maxConsecutive: number; maxDays: number; maxWindows: number; minRestPeriods?: number }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const id = `tc_${data.teacherUserId}_${data.yearId}_${data.termId}`;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(value))));
    await sql`insert into teacher_contracts (id, year_id, term_id, teacher_user_id, min_per_day, max_per_day, max_per_week, max_consecutive, max_days, max_windows, min_rest_periods) values (${id}, ${data.yearId}, ${data.termId}, ${data.teacherUserId}, ${clamp(data.minPerDay ?? 0, 0, 8)}, ${clamp(data.maxPerDay, 1, 12)}, ${clamp(data.maxPerWeek, 1, 50)}, ${clamp(data.maxConsecutive, 1, 10)}, ${clamp(data.maxDays, 1, 5)}, ${clamp(data.maxWindows, 0, 8)}, ${clamp(data.minRestPeriods ?? 0, 0, 2)}) on conflict (year_id, term_id, teacher_user_id) do update set min_per_day = excluded.min_per_day, max_per_day = excluded.max_per_day, max_per_week = excluded.max_per_week, max_consecutive = excluded.max_consecutive, max_days = excluded.max_days, max_windows = excluded.max_windows, min_rest_periods = excluded.min_rest_periods`;
    return { ok: true };
  });

export const saveClassConstraint = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; gradeId: string; streamId?: string; maxPerDay: number; noGaps: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const streamId = data.streamId || null;
    const existing = await sql<{ id: string }>`select id from class_constraints where year_id = ${data.yearId} and term_id = ${data.termId} and grade_id = ${data.gradeId} and coalesce(stream_id, '') = ${streamId ?? ""}`;
    const id = existing[0]?.id || newId("tcc");
    const maxPerDay = Math.max(1, Math.min(12, Math.trunc(Number(data.maxPerDay))));
    if (existing[0]) await sql`update class_constraints set max_per_day = ${maxPerDay}, no_gaps = ${Boolean(data.noGaps)} where id = ${id}`;
    else await sql`insert into class_constraints (id, year_id, term_id, grade_id, stream_id, max_per_day, no_gaps) values (${id}, ${data.yearId}, ${data.termId}, ${data.gradeId}, ${streamId}, ${maxPerDay}, ${Boolean(data.noGaps)})`;
    return { ok: true };
  });

export const saveLessonRelation = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; gradeId: string; streamId?: string; leftSubjectId: string; rightSubjectId: string; relation: "before" | "same_day" | "different_day" | "not_consecutive" }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    if (data.leftSubjectId === data.rightSubjectId) throw new Error("Choose two different subjects.");
    if (!["before", "same_day", "different_day", "not_consecutive"].includes(data.relation)) throw new Error("Choose a card relation.");
    const sql = await getSql();
    await sql`insert into lesson_relations (id, year_id, term_id, grade_id, stream_id, left_subject_id, right_subject_id, relation) values (${newId("rel")}, ${data.yearId}, ${data.termId}, ${data.gradeId}, ${data.streamId || null}, ${data.leftSubjectId}, ${data.rightSubjectId}, ${data.relation})`;
    return { ok: true };
  });

export const deleteLessonRelation = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    await sql`delete from lesson_relations where id = ${data.id}`;
    return { ok: true };
  });

export const reorderTimetablePeriods = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; orderedIds: string[] }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    await ensureTimetableDraft(sql, data.yearId, data.termId);
    const rows = await sql<{ id: string }>`select id from timetable_periods where year_id = ${data.yearId} and term_id = ${data.termId} order by sort`;
    const current = rows.map((row) => row.id);
    if (current.length !== data.orderedIds.length || current.some((id) => !data.orderedIds.includes(id))) throw new Error("The period order does not match this timetable.");
    await sql.transaction(async (tx) => {
      await tx`update timetable_periods set sort = -sort where year_id = ${data.yearId} and term_id = ${data.termId}`;
      for (let index = 0; index < data.orderedIds.length; index += 1) {
        await tx`update timetable_periods set sort = ${index + 1} where id = ${data.orderedIds[index]}`;
      }
    });
    return { ok: true };
  });

export const applyMukuyuBell = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    await ensureTimetableDraft(sql, data.yearId, data.termId);
    const used = await sql`select id from timetable_entries where year_id = ${data.yearId} and term_id = ${data.termId} limit 1`;
    if (used.length) throw new Error("Clear the lessons on this draft before replacing the bell. Locked and placed cards use the current period ids.");
    const bell: Array<[string, string, string, boolean]> = [
      ["1", "08:20", "09:00", false],
      ["2", "09:00", "09:40", false],
      ["First break", "09:40", "09:50", true],
      ["3", "09:50", "10:30", false],
      ["4", "10:30", "11:10", false],
      ["Second break", "11:10", "11:30", true],
      ["5", "11:30", "12:10", false],
      ["6", "12:10", "12:50", false],
      ["Lunch break", "12:50", "14:00", true],
      ["7", "14:00", "14:40", false],
      ["8", "14:40", "15:20", false],
    ];
    await sql.transaction(async (tx) => {
      await tx`delete from timetable_periods where year_id = ${data.yearId} and term_id = ${data.termId}`;
      for (let index = 0; index < bell.length; index += 1) {
        const [label, start, end, isBreak] = bell[index];
        await tx`insert into timetable_periods (id, year_id, term_id, label, start_time, end_time, sort, is_break) values (${newId("period")}, ${data.yearId}, ${data.termId}, ${label}, ${start}, ${end}, ${index + 1}, ${isBreak})`;
      }
    });
    return { ok: true, periods: bell.length };
  });

export const validateTimetable = createServerFn({ method: "GET" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    if (!me.active) throw new Error("This account is inactive.");
    const sql = await getSql();
    const issues = await timetableIssues(sql, data.yearId, data.termId);
    return { issues, errors: issues.filter((issue) => issue.severity === "error").length, warnings: issues.filter((issue) => issue.severity === "warning").length };
  });

export const generateTimetable = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; profile?: EngineOptimizationProfile; detectAssignments?: boolean; defaultLessonsPerWeek?: number; previewOnly?: boolean; repair?: boolean }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    let bundle = await timetableBundle(sql, data.yearId, data.termId);
    if (!bundle.periods.some((period) => !period.isBreak)) throw new Error("Add at least one lesson period before generating a timetable.");
    let assignmentSync: Awaited<ReturnType<typeof createMissingAssignmentRequirements>> | null = null;
    if (data.detectAssignments && !data.previewOnly) {
      const setting = await sql<{ staff_assignments_enabled: boolean }>`select staff_assignments_enabled from timetable_admin_permissions where id = 1`;
      if (!setting[0]?.staff_assignments_enabled) throw new Error("Staff subject assignments are disabled for timetable use. Ask the super admin to enable them first.");
      const publishState = await sql`select published from timetable_state where year_id = ${data.yearId} and term_id = ${data.termId}`;
      if (publishState[0]?.published) throw new Error("Unpublish this timetable before generating a draft.");
      assignmentSync = await createMissingAssignmentRequirements(sql, data.yearId, data.termId, data.defaultLessonsPerWeek ?? 5);
      bundle = await timetableBundle(sql, data.yearId, data.termId);
    }
    if (!bundle.requirements.length) throw new Error("Add weekly lesson requirements before using the automatic generator.");
    for (const requirement of bundle.requirements) {
      if (requirement.preferred_room && !bundle.rooms.some((room) => room.active && room.name.toLowerCase() === requirement.preferred_room.toLowerCase())) throw new Error(`Preferred room ${requirement.preferred_room} is missing or inactive.`);
      if (!isValidDistribution(requirement.distribution, requirement.lessons_per_week)) throw new Error(`${bundle.names.classLabel(requirement.grade_id, requirement.stream_id)} · ${bundle.names.subject(requirement.subject_id)} has an invalid weekly pattern. Edit the lesson card so its 1–3 period blocks add up to ${requirement.lessons_per_week}.`);
    }
    const lockedEntries = bundle.entries.filter((entry) => entry.locked);
    const locked = lockedEntries.map((entry) => bundle.toPlacement(entry, 0, true));
    const lockedPeriodsFor = (requirement: typeof bundle.requirements[number]) => lockedEntries
      .filter((entry) => entry.grade_id === requirement.grade_id && entry.stream_id === requirement.stream_id && entry.subject_id === requirement.subject_id && entry.teacher_user_id === requirement.teacher_user_id)
      .reduce((sum, entry) => sum + Math.max(1, entry.block_length || 1), 0);
    const units = bundle.requirements.flatMap((requirement) => {
      const subjectRuleRow = bundle.subjectRules.find((rule) => rule.subjectId === requirement.subject_id);
      const savedPattern = applyDoubleRule(parseDistribution(requirement.distribution, requirement.lessons_per_week, requirement.block_length), subjectRuleRow?.doubleCount);
      const doubleDay = savedPattern.includes(3) || subjectRuleRow?.doubleCount === 0 ? null : requirement.preferred_double_day;
      const fullPattern = distributionWithDoubleDay(savedPattern, doubleDay);
      const remainingBlocks = subtractLessonPeriods(fullPattern, lockedPeriodsFor(requirement));
      const preferredDoubleCount = remainingBlocks.filter((block) => block >= 2).length;
      return remainingBlocks.map((block, order) => ({
        id: `${requirement.id}:${order}`,
        gradeId: requirement.grade_id,
        streamId: requirement.stream_id,
        subjectId: requirement.subject_id,
        teacherUserId: requirement.teacher_user_id,
        room: requirement.preferred_room,
        roomId: bundle.roomId(requirement.preferred_room),
        block,
        order,
        preferredDay: block >= 2 && preferredDoubleCount === 1 ? doubleDay ?? undefined : undefined,
        timingPreference: requirement.timing_preference,
      }));
    });
    const draft = buildTimetableDraft({
      periods: bundle.periods,
      units,
      availability: bundle.availability.map((item) => ({ entityType: item.entity_type, entityId: item.entity_id, day: item.day_of_week, periodId: item.period_id, level: item.level === "avoid" || item.level === "prefer" ? item.level : "off", streamGradeId: item.entity_type === "stream" ? bundle.streams.find((stream) => stream.id === item.entity_id)?.grade_id : undefined })),
      subjectRules: bundle.subjectRules,
      teacherRules: bundle.teacherRules.map((rule) => ({ teacherUserId: rule.teacher_user_id, minPerDay: rule.min_per_day, maxPerDay: rule.max_per_day, maxPerWeek: rule.max_per_week, maxConsecutive: rule.max_consecutive, maxDays: rule.max_days, maxWindows: rule.max_windows, minRestPeriods: rule.min_rest_periods })),
      classRules: bundle.classRules.map((rule) => ({ gradeId: rule.grade_id, streamId: rule.stream_id, maxPerDay: rule.max_per_day, noGaps: Boolean(rule.no_gaps) })),
      relations: bundle.relations.map((relation) => ({ gradeId: relation.grade_id, streamId: relation.stream_id, leftSubjectId: relation.left_subject_id, rightSubjectId: relation.right_subject_id, relation: relation.relation })),
      locked,
      profile: data.profile ?? "balanced",
      existing: data.repair ? bundle.entries.filter((entry) => !entry.locked).map((entry) => bundle.toPlacement(entry, 0, false)) : undefined,
      attempts: 14,
    });
    const unplaced = draft.unplaced.map((item) => `${bundle.names.subject(item.unit.subjectId)} · ${bundle.names.classLabel(item.unit.gradeId, item.unit.streamId)} (${item.unit.block}-period block): ${item.reason}`);
    const unplacedDetails = draft.unplaced.map((item) => {
      const teacherName = bundle.names.teacher(item.unit.teacherUserId);
      const subjectName = bundle.names.subject(item.unit.subjectId);
      const className = bundle.names.classLabel(item.unit.gradeId, item.unit.streamId);
      const fixes: Array<{ kind: "raise_subject_max_day" | "relax_rest" | "raise_teacher_limit"; label: string; subjectId?: string; teacherUserId?: string }> = [];
      if (item.reasonCode === "subject-max-day") fixes.push({ kind: "raise_subject_max_day", label: `Allow ${subjectName} one more lesson a day`, subjectId: item.unit.subjectId });
      if (item.reasonCode === "teacher-rest") fixes.push({ kind: "relax_rest", label: `Remove ${teacherName}'s rest requirement`, teacherUserId: item.unit.teacherUserId });
      if (["teacher-max-day", "teacher-max-week", "teacher-max-days"].includes(item.reasonCode)) fixes.push({ kind: "raise_teacher_limit", label: `Raise ${teacherName}'s workload limit`, teacherUserId: item.unit.teacherUserId });
      const advice = item.reasonCode === "time-off" ? `Every fitting period for ${subjectName} in ${className} is marked Off. Free one cell in the time-off map, or give the lesson a different shape.`
        : item.reasonCode === "clash" ? `${teacherName} or ${className} is booked in every possible period. Assign a second teacher for one stream, or free a period for ${teacherName}.`
        : item.reasonCode === "afternoon" || item.reasonCode === "last-period" ? `${subjectName} is barred from the periods that are still free. Allow afternoons/last period for it, or free a morning period.`
        : item.reasonCode === "class-max-day" ? `${className} is at its daily lesson maximum. Raise the class maximum per day.`
        : item.reasonCode === "no-fit" ? `A ${item.unit.block}-period double does not fit between breaks. Make it single lessons.`
        : "Loosen the rule shown, then run the automatic fix again.";
      return { text: `${subjectName} · ${className} (${item.unit.block}-period block): ${item.reason}`, advice, fixes };
    });
    const relaxedNotes = draft.relaxed.map((item) => `${bundle.names.day(item.day)} · ${bundle.names.period(item.periodId)} · ${bundle.names.classLabel(item.unit.gradeId, item.unit.streamId)} · ${bundle.names.subject(item.unit.subjectId)}: placed by relaxing a soft rule (${item.reason}).`);
    const preview = draft.placements.map((item) => `${bundle.names.day(item.day)} · ${bundle.names.period(item.periodId)}${item.unit.block > 1 ? ` · ${item.unit.block} consecutive periods` : ""} · ${bundle.names.classLabel(item.unit.gradeId, item.unit.streamId)} · ${bundle.names.subject(item.unit.subjectId)} · ${bundle.names.teacher(item.unit.teacherUserId)}`);
    const requiredPeriods = bundle.requirements.reduce((sum, requirement) => sum + requirement.lessons_per_week, 0);
    const lockedRequirementPeriods = bundle.requirements.reduce((sum, requirement) => sum + lockedPeriodsFor(requirement), 0);
    const placedPeriods = lockedRequirementPeriods + draft.placements.reduce((sum, item) => sum + item.sorts.length, 0);
    const unplacedPeriods = draft.unplaced.reduce((sum, item) => sum + item.unit.block, 0);
    if (data.previewOnly) return { ok: true, previewOnly: true, entries: draft.placements.length, placedPeriods, requiredPeriods, unplacedPeriods, unplaced, unplacedDetails, relaxed: relaxedNotes, dropped: draft.dropped, kept: locked.length, profile: data.profile ?? "balanced", assignmentSync: null, preview };
    if (unplacedPeriods > 0) {
      const firstProblem = unplaced[0] || "one or more required lesson periods could not be placed";
      throw new Error(`${data.repair ? "Automatic repair" : "Automatic generation"} stopped without replacing the current timetable: ${placedPeriods}/${requiredPeriods} required periods fit, but ${unplacedPeriods} remain unplaced. ${firstProblem} Use the preview and apply one of its suggested fixes, then run again.`);
    }
    const state = await sql`select published from timetable_state where year_id = ${data.yearId} and term_id = ${data.termId}`;
    if (state[0]?.published) throw new Error("Unpublish this timetable before replacing it with a generated draft.");
    await sql.transaction(async (tx) => {
      const existing = await tx`select id from timetable_entries where year_id = ${data.yearId} and term_id = ${data.termId} limit 1`;
      if (existing.length) await captureTimetableVersion(tx, data.yearId, data.termId, data.repair ? "Before automatic fix" : "Before automatic generation", me.id);
      await tx`delete from timetable_entries where year_id = ${data.yearId} and term_id = ${data.termId} and locked = false`;
      for (const item of draft.placements) {
        await tx`insert into timetable_entries (id, year_id, term_id, day_of_week, period_id, grade_id, stream_id, subject_id, teacher_user_id, room, notes, block_length, locked, created_by) values (${newId("tte")}, ${data.yearId}, ${data.termId}, ${item.day}, ${item.periodId}, ${item.unit.gradeId}, ${item.unit.streamId}, ${item.unit.subjectId}, ${item.unit.teacherUserId}, ${item.unit.room}, ${data.repair ? 'Auto-fixed draft' : 'Auto-generated draft'}, ${item.unit.block}, false, ${me.id})`;
      }
    });
    return { ok: true, previewOnly: false, entries: draft.placements.length, placedPeriods, requiredPeriods, unplacedPeriods, unplaced, unplacedDetails, relaxed: relaxedNotes, dropped: draft.dropped, kept: locked.length, profile: data.profile ?? "balanced", assignmentSync, preview };
  });

const SINGLES = (count: number) => Array.from({ length: count }, () => 1);
function distributionText(blocks: number[]) {
  const text = blocks.join("+");
  return text.length <= 40 ? text : "";
}

export const applySubjectPlan = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; subjectId: string; gradeId?: string; lessonsPerWeek?: number; doubleCount?: number; maxBeforeBreak?: number }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const subject = await sql<{ id: string; name: string; short_name: string }>`select id, name, short_name from subjects where id = ${data.subjectId}`;
    if (!subject[0]) throw new Error("Choose a valid subject.");
    const maths = /math/i.test(`${subject[0].short_name} ${subject[0].name}`);
    const id = `sc_${data.subjectId}_${data.yearId}_${data.termId}`;
    await sql`insert into subject_constraints (id, year_id, term_id, subject_id, max_per_day, min_days_per_week, no_afternoon, preferred_morning, avoid_consecutive_days, no_last_period, complexity, place_in_order, distribution, color, notes)
      values (${id}, ${data.yearId}, ${data.termId}, ${data.subjectId}, ${maths ? 1 : 2}, 1, ${maths}, ${maths}, false, false, ${maths ? 2 : 1}, true, '', '', '')
      on conflict (year_id, term_id, subject_id) do nothing`;
    const current = await sql<{ double_count: number | null }>`select double_count from subject_constraints where year_id = ${data.yearId} and term_id = ${data.termId} and subject_id = ${data.subjectId}`;
    let doubleCount: number | null = current[0]?.double_count == null ? null : Number(current[0].double_count);
    if (data.doubleCount !== undefined) {
      doubleCount = data.doubleCount < 0 ? null : Math.max(0, Math.min(10, Math.trunc(Number(data.doubleCount))));
      await sql`update subject_constraints set double_count = ${doubleCount} where id = ${id}`;
    }
    if (data.maxBeforeBreak !== undefined) {
      await sql`update subject_constraints set max_before_break = ${Math.max(1, Math.min(10, Math.trunc(Number(data.maxBeforeBreak)) || 3))} where id = ${id}`;
    }
    let updated = 0;
    if (data.lessonsPerWeek !== undefined || data.doubleCount !== undefined) {
      const lessons = data.lessonsPerWeek === undefined ? null : Math.trunc(Number(data.lessonsPerWeek));
      if (lessons !== null && (lessons < 1 || lessons > 40)) throw new Error("Lessons per week must be from 1 to 40.");
      const cards = await sql<{ id: string; lessons_per_week: number; distribution: string }>`select id, lessons_per_week, coalesce(distribution, '') as distribution from timetable_requirements where year_id = ${data.yearId} and term_id = ${data.termId} and subject_id = ${data.subjectId} and (${data.gradeId ?? ""} = '' or grade_id = ${data.gradeId ?? ""})`;
      for (const card of cards) {
        const count = lessons ?? card.lessons_per_week;
        let distribution = card.distribution;
        if (doubleCount != null) distribution = distributionText(applyDoubleRule(SINGLES(count), doubleCount));
        else if (lessons !== null && lessons !== card.lessons_per_week) distribution = distributionText(SINGLES(count));
        else if (data.doubleCount !== undefined) distribution = card.distribution;
        if (!isValidDistribution(distribution, count)) distribution = distributionText(SINGLES(count));
        const doubleDay = doubleCount === 0 || count < 2 ? null : undefined;
        if (doubleDay === null) await sql`update timetable_requirements set lessons_per_week = ${count}, distribution = ${distribution}, preferred_double_day = null where id = ${card.id}`;
        else await sql`update timetable_requirements set lessons_per_week = ${count}, distribution = ${distribution} where id = ${card.id}`;
        updated += 1;
      }
    }
    return { ok: true, updated };
  });

export const applyTimetableFix = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; kind: "reset_distribution" | "relax_rest" | "raise_teacher_limit" | "raise_subject_max_day"; requirementId?: string; teacherUserId?: string; subjectId?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    if (data.kind === "relax_rest" && data.teacherUserId) {
      await sql`update teacher_contracts set min_rest_periods = 0 where year_id = ${data.yearId} and term_id = ${data.termId} and teacher_user_id = ${data.teacherUserId}`;
    } else if (data.kind === "raise_teacher_limit" && data.teacherUserId) {
      const rows = await sql<{ total: number }>`select coalesce(sum(lessons_per_week), 0)::int as total from timetable_requirements where year_id = ${data.yearId} and term_id = ${data.termId} and teacher_user_id = ${data.teacherUserId}`;
      const total = Math.min(50, Number(rows[0]?.total ?? 0));
      const perDay = Math.min(12, Math.ceil(total / 5) + 1);
      const id = `tc_${data.teacherUserId}_${data.yearId}_${data.termId}`;
      await sql`insert into teacher_contracts (id, year_id, term_id, teacher_user_id, max_per_day, max_per_week, max_consecutive, max_days, max_windows, min_rest_periods) values (${id}, ${data.yearId}, ${data.termId}, ${data.teacherUserId}, ${perDay}, ${Math.max(1, total)}, 4, 5, 3, 0)
        on conflict (year_id, term_id, teacher_user_id) do update set max_per_week = greatest(teacher_contracts.max_per_week, excluded.max_per_week), max_per_day = greatest(teacher_contracts.max_per_day, excluded.max_per_day)`;
    } else if (data.kind === "raise_subject_max_day" && data.subjectId) {
      const id = `sc_${data.subjectId}_${data.yearId}_${data.termId}`;
      await sql`insert into subject_constraints (id, year_id, term_id, subject_id, max_per_day, min_days_per_week, no_afternoon, preferred_morning, avoid_consecutive_days, no_last_period, complexity, place_in_order, distribution, color, notes)
        values (${id}, ${data.yearId}, ${data.termId}, ${data.subjectId}, 3, 1, false, false, false, false, 1, true, '', '', '')
        on conflict (year_id, term_id, subject_id) do update set max_per_day = least(8, subject_constraints.max_per_day + 1)`;
    } else if (data.kind === "reset_distribution" && data.requirementId) {
      const rows = await sql<{ lessons_per_week: number }>`select lessons_per_week from timetable_requirements where id = ${data.requirementId}`;
      if (rows[0]) await sql`update timetable_requirements set distribution = ${distributionText(SINGLES(Number(rows[0].lessons_per_week)))}, preferred_double_day = null where id = ${data.requirementId}`;
    } else throw new Error("That fix needs more details.");
    return { ok: true };
  });

export const publishTimetable = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string; effectiveFrom: string; label?: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.effectiveFrom)) throw new Error("Choose a valid timetable effective date.");
    const sql = await getSql();
    const issues = await timetableIssues(sql, data.yearId, data.termId);
    const errors = issues.filter((issue) => issue.severity === "error");
    if (errors.length) throw new Error(`Resolve ${errors.length} timetable conflict(s) before publishing. ${errors[0].message}`);
    await sql.transaction(async (tx) => {
      await captureTimetableVersion(tx, data.yearId, data.termId, data.label?.trim() || `Published ${data.effectiveFrom}`, me.id);
      await tx`insert into timetable_state (year_id, term_id, published, effective_from, published_at, updated_at) values (${data.yearId}, ${data.termId}, true, ${data.effectiveFrom}, now(), now()) on conflict (year_id, term_id) do update set published = true, effective_from = excluded.effective_from, published_at = now(), updated_at = now()`;
    });
    return { ok: true, issues };
  });

export const unpublishTimetable = createServerFn({ method: "POST" })
  .validator((input: { yearId: string; termId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    await sql`update timetable_state set published = false, updated_at = now() where year_id = ${data.yearId} and term_id = ${data.termId}`;
    return { ok: true };
  });

export const restoreTimetableVersion = createServerFn({ method: "POST" })
  .validator((input: { versionId: string }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor();
    await requireTimetableEditor(me);
    const sql = await getSql();
    const version = await sql<{ id: string; year_id: string; term_id: string; label: string; payload_json: string }>`select id, year_id, term_id, label, payload_json from timetable_versions where id = ${data.versionId}`;
    if (!version[0]) throw new Error("Timetable version not found.");
    const state = await sql`select published from timetable_state where year_id = ${version[0].year_id} and term_id = ${version[0].term_id}`;
    if (state[0]?.published) throw new Error("Unpublish this timetable before restoring an older version.");
    let payload: { periods?: Array<Record<string, unknown>>; entries?: Array<Record<string, unknown>> };
    try { payload = JSON.parse(version[0].payload_json); } catch { throw new Error("This saved timetable version is invalid."); }
    let skippedDeletedTeacherEntries = 0;
    await sql.transaction(async (tx) => {
      await captureTimetableVersion(tx, version[0].year_id, version[0].term_id, "Before restoring a version", me.id);
      await tx`delete from timetable_entries where year_id = ${version[0].year_id} and term_id = ${version[0].term_id}`;
      for (const row of payload.periods ?? []) {
        await tx`insert into timetable_periods (id, year_id, term_id, label, start_time, end_time, sort, is_break) values (${String(row.id)}, ${version[0].year_id}, ${version[0].term_id}, ${String(row.label)}, ${String(row.start_time)}, ${String(row.end_time)}, ${Number(row.sort) || 1}, ${Boolean(row.is_break)}) on conflict (id) do update set label = excluded.label, start_time = excluded.start_time, end_time = excluded.end_time, sort = excluded.sort, is_break = excluded.is_break`;
      }
      const periodIds = (payload.periods ?? []).map((row) => String(row.id));
      if (periodIds.length) await tx`delete from timetable_periods where year_id = ${version[0].year_id} and term_id = ${version[0].term_id} and not (id = any(${periodIds}::text[]))`;
      else await tx`delete from timetable_periods where year_id = ${version[0].year_id} and term_id = ${version[0].term_id}`;
      for (const row of payload.entries ?? []) {
        const teacherUserId = String(row.teacher_user_id ?? "");
        const teacher = await tx<{ id: string }>`select id from users where id = ${teacherUserId}`;
        if (!teacher[0]) { skippedDeletedTeacherEntries += 1; continue; }
        await tx`insert into timetable_entries (id, year_id, term_id, day_of_week, period_id, grade_id, stream_id, subject_id, teacher_user_id, room, notes, block_length, locked, created_by) values (${String(row.id)}, ${version[0].year_id}, ${version[0].term_id}, ${Number(row.day_of_week)}, ${String(row.period_id)}, ${String(row.grade_id)}, ${row.stream_id == null ? null : String(row.stream_id)}, ${String(row.subject_id)}, ${String(row.teacher_user_id)}, ${String(row.room ?? "")}, ${String(row.notes ?? "")}, ${Math.max(1, Math.min(3, Number(row.block_length) || 1))}, ${Boolean(row.locked)}, ${me.id})`;
      }
    });
    return { ok: true, label: version[0].label, skippedDeletedTeacherEntries };
  });


// School Services: additive non-timetable workflows with server-side role and learner scoping.
type ServiceAssignment = { userId: string; kind: string; gradeId: string | null; streamId: string | null; subjectId: string | null };
async function serviceAssignments(sql: SqlHandle, me: Me): Promise<ServiceAssignment[]> {
  return sql<ServiceAssignment>`select user_id as "userId", kind, grade_id as "gradeId", stream_id as "streamId", subject_id as "subjectId" from assignments where user_id = ${me.id}`;
}
function serviceCanStream(me: Me, assignments: ServiceAssignment[], streamId: string, subjectId?: string, classOnly = false) {
  if (isAdmin(me.role)) return true;
  if (me.role !== "teacher") return false;
  return assignments.some((a) => {
    if (a.kind === "class_teacher" && a.streamId === streamId) return true;
    if (a.kind === "dos" && (!a.streamId || a.streamId === streamId)) return true;
    if (!classOnly && subjectId && (a.kind === "subject_teacher" || a.kind === "hod") && a.subjectId === subjectId && (!a.streamId || a.streamId === streamId)) return true;
    return false;
  });
}
function requirePowerfulService(me: Me, action: string) {
  if (!isPowerful(me)) throw new Error(`Only the super admin or deputy super admins can ${action}.`);
}
async function writeServiceAudit(sql: SqlHandle, me: Me, action: string, targetType: string, targetId: string, summary: string) {
  await sql`insert into school_audit_log (id, actor_id, actor_name, actor_role, action, target_type, target_id, summary) values (${newId("aud")}, ${me.id}, ${me.fullName}, ${me.role}, ${action}, ${targetType}, ${targetId.slice(0, 180)}, ${summary.slice(0, 500)})`;
}
async function linkedFamilyLearnerIds(sql: SqlHandle, me: Me) {
  if (me.role === "student" && me.learnerId) return [me.learnerId];
  if (me.role !== "parent") return [];
  const rows = await sql<{ learnerId: string }>`select learner_id as "learnerId" from parent_links where parent_user_id = ${me.id} union select learner_id as "learnerId" from users where id = ${me.id} and learner_id is not null`;
  return rows.map((row) => row.learnerId);
}

export const getSchoolServices = createServerFn({ method: "GET" })
  .validator((input: { date?: string }) => input)
  .handler(async ({ data }) => {
    try {
    const me = await requireActor();
    const sql = await getSql();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date! : new Date().toISOString().slice(0, 10);
    const assignments = await serviceAssignments(sql, me);
    const familyIds = await linkedFamilyLearnerIds(sql, me);
    const classStreams = await sql<{id:string;gradeId:string;gradeName:string;name:string}>`select s.id,s.grade_id as "gradeId",g.name as "gradeName",s.name from streams s join grades g on g.id=s.grade_id order by g.level,s.sort`;
    const staffIds = isAdmin(me.role) ? classStreams.map((s) => s.id) : classStreams.filter((s) => serviceCanStream(me, assignments, s.id)).map((s) => s.id);
    const learnerRows = await sql<{id:string;fullName:string;roll:number;gradeId:string;streamId:string;gender:string;admissionNumber:string|null}>`select id, full_name as "fullName", roll, grade_id as "gradeId", stream_id as "streamId", gender, admission_number as "admissionNumber" from learners where status = 'active' order by grade_id, stream_id, roll`;
    const learners = isAdmin(me.role) ? learnerRows : me.role === "parent" || me.role === "student" ? learnerRows.filter((l) => familyIds.includes(l.id)) : learnerRows.filter((l) => staffIds.includes(l.streamId));
    const allEvents = await sql<{id:string;title:string;eventDate:string;audience:string;venue:string;details:string}>`select id, title, event_date::text as "eventDate", audience, venue, details from school_events where event_date >= current_date - interval '30 days' order by event_date limit 200`;
    const eventAudience = me.role === "parent" ? ["all","parents"] : me.role === "student" ? ["all","students"] : me.role === "teacher" ? ["all","teachers","staff"] : ["all","staff","teachers","students","parents"];
    const events = allEvents.filter((e) => eventAudience.includes(e.audience));
    const allTasks = await sql<{id:string;title:string;instructions:string;subjectId:string;gradeId:string;streamId:string|null;yearId:string;termId:string;dueDate:string;assignedBy:string|null}>`select id,title,instructions,subject_id as "subjectId",grade_id as "gradeId",stream_id as "streamId",year_id as "yearId",term_id as "termId",due_date::text as "dueDate",assigned_by as "assignedBy" from homework_tasks order by due_date`;
    const homework = allTasks.filter((t) => isAdmin(me.role) || (me.role === "parent" || me.role === "student" ? learners.some((l) => l.gradeId === t.gradeId && (!t.streamId || l.streamId === t.streamId)) : t.streamId ? serviceCanStream(me, assignments, t.streamId, t.subjectId) : assignments.some((a) => a.gradeId === t.gradeId && (a.kind === "class_teacher" || a.kind === "dos" || (a.kind === "subject_teacher" && a.subjectId === t.subjectId)))));
    const progressRows = homework.length ? await sql.query<{taskId:string;learnerId:string;status:string;updatedAt:string}>(`select task_id as "taskId", learner_id as "learnerId", status, updated_at::text as "updatedAt" from homework_progress where task_id = any($1::text[])`, [homework.map((task) => task.id)]) : [];
    const visibleLearnerIds = new Set(learners.map((l) => l.id));
    const homeworkProgress = isAdmin(me.role) || me.role === "teacher" ? progressRows : progressRows.filter((r) => visibleLearnerIds.has(r.learnerId));
    const attendanceRows = await sql<{id:string;learnerId:string;attendanceDate:string;yearId:string;termId:string;gradeId:string;streamId:string;status:string;note:string}>`select id, learner_id as "learnerId", attendance_date::text as "attendanceDate", year_id as "yearId", term_id as "termId", grade_id as "gradeId", stream_id as "streamId", status, note from daily_attendance where attendance_date = ${date}::date`;
    const attendance = attendanceRows.filter((r) => isAdmin(me.role) || serviceCanStream(me, assignments, r.streamId, undefined, true));
    let guardianContacts: Array<{id:string;learnerId:string;name:string;relationship:string;phone:string;email:string;preferredChannel:string;notes:string}> = [];
    let guardianLogs: Array<{id:string;learnerId:string;contactId:string|null;direction:string;method:string;summary:string;followUpDate:string|null;createdAt:string}> = [];
    let emergencyProfiles: Array<{learnerId:string;contactName:string;relationship:string;phone:string;criticalNote:string}> = [];
    let supportEvents: Array<{id:string;learnerId:string;eventDate:string;category:string;summary:string;followUpOwner:string|null;dueDate:string|null;status:string;outcome:string}> = [];
    let audit: Array<{id:string;actorName:string;actorRole:string;action:string;targetType:string;targetId:string;summary:string;createdAt:string}> = [];
    if (isAdmin(me.role) || me.role === "teacher") {
      const contactRows = await sql<{id:string;learnerId:string;name:string;relationship:string;phone:string;email:string;preferredChannel:string;notes:string}>`select id, learner_id as "learnerId", name, relationship, phone, email, preferred_channel as "preferredChannel", notes from guardian_contacts order by name`;
      const allowedLearner = (learnerId: string) => isAdmin(me.role) || learners.some((l) => l.id === learnerId && serviceCanStream(me, assignments, l.streamId, undefined, true));
      guardianContacts = contactRows.filter((r) => allowedLearner(r.learnerId));
      const logs = await sql<{id:string;learnerId:string;contactId:string|null;direction:string;method:string;summary:string;followUpDate:string|null;createdAt:string}>`select id, learner_id as "learnerId", contact_id as "contactId", direction, method, summary, follow_up_date::text as "followUpDate", created_at::text as "createdAt" from guardian_contact_log order by created_at desc limit 200`;
      guardianLogs = logs.filter((r) => allowedLearner(r.learnerId));
      const profiles = await sql<{learnerId:string;contactName:string;relationship:string;phone:string;criticalNote:string}>`select learner_id as "learnerId", contact_name as "contactName", relationship, phone, critical_note as "criticalNote" from learner_emergency_profiles`;
      emergencyProfiles = profiles.filter((r) => allowedLearner(r.learnerId));
    }
    if (isPowerful(me)) {
      supportEvents = await sql<{id:string;learnerId:string;eventDate:string;category:string;summary:string;followUpOwner:string|null;dueDate:string|null;status:string;outcome:string}>`select id, learner_id as "learnerId", event_date::text as "eventDate", category, summary, follow_up_owner as "followUpOwner", due_date::text as "dueDate", status, outcome from learner_support_events order by updated_at desc limit 300`;
      audit = await sql<{id:string;actorName:string;actorRole:string;action:string;targetType:string;targetId:string;summary:string;createdAt:string}>`select id, actor_name as "actorName", actor_role as "actorRole", action, target_type as "targetType", target_id as "targetId", summary, created_at::text as "createdAt" from school_audit_log order by created_at desc limit 300`;
    }
    const meetingAll = await sql<{id:string;learnerId:string;parentUserId:string;topic:string;preferredMethod:string;preferredDate:string|null;status:string;staffResponse:string;createdAt:string}>`select id, learner_id as "learnerId", parent_user_id as "parentUserId", topic, preferred_method as "preferredMethod", preferred_date::text as "preferredDate", status, staff_response as "staffResponse", created_at::text as "createdAt" from parent_meeting_requests order by created_at desc limit 300`;
    const meetings = meetingAll.filter((r) => r.parentUserId === me.id || isAdmin(me.role) || (me.role === "teacher" && learners.some((l) => l.id === r.learnerId && serviceCanStream(me, assignments, l.streamId, undefined, true))));
    const absenceRows = await sql<{id:string;requesterId:string;requesterName:string;startDate:string;endDate:string;category:string;note:string;status:string;reviewNote:string;createdAt:string}>`select a.id, a.requester_id as "requesterId", u.full_name as "requesterName", a.start_date::text as "startDate", a.end_date::text as "endDate", a.category, a.note, a.status, a.review_note as "reviewNote", a.created_at::text as "createdAt" from staff_absence_requests a join users u on u.id = a.requester_id order by a.created_at desc limit 300`;
    const absences = absenceRows.filter((r) => r.requesterId === me.id || isPowerful(me));
    const years = await sql<{id:string;name:string}>`select id,name from academic_years order by sort`;
    const terms = await sql<{id:string;name:string}>`select id,name from terms order by sort`;
    const subjects = await sql<{id:string;name:string}>`select id,name from subjects order by sort`;
    return { date, me: { id: me.id, role: me.role, isDeputy: me.isDeputy }, learners, events, homework, homeworkProgress, attendance, guardianContacts, guardianLogs, emergencyProfiles, meetings, absences, supportEvents, audit, years, terms, subjects, streams: classStreams, assignments, canManage: isPowerful(me), canReviewLeave: isPowerful(me), canViewAudit: isPowerful(me), canViewSensitive: isAdmin(me.role) || me.role === "teacher" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";
      throw new Error(message.startsWith("School Services") ? message : `School Services could not load. ${message}`);
    }
  });

export const saveDailyAttendance = createServerFn({ method: "POST" })
  .validator((input: { date:string; yearId:string; termId:string; records:Array<{learnerId:string;status:"present"|"absent"|"late"|"excused";note?:string}> }) => input)
  .handler(async ({ data }) => {
    const me = await requireActor(); const sql = await getSql(); const assignments = await serviceAssignments(sql, me);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || data.records.length > 500) throw new Error("Choose a valid date and a class list under 500 learners.");
    const written = new Set<string>();
    for (const record of data.records) {
      if (!new Set(["present","absent","late","excused"]).has(record.status)) throw new Error("Invalid attendance status.");
      const learner = await sql<{gradeId:string;streamId:string}>`select grade_id as "gradeId",stream_id as "streamId" from learners where id=${record.learnerId} and status='active'`;
      if (!learner[0] || !serviceCanStream(me, assignments, learner[0].streamId, undefined, true)) throw new Error("You do not have attendance access to one or more learners in this class.");
      await sql`insert into daily_attendance (id,learner_id,attendance_date,year_id,term_id,grade_id,stream_id,status,note,recorded_by) values (${newId("att")},${record.learnerId},${data.date}::date,${data.yearId},${data.termId},${learner[0].gradeId},${learner[0].streamId},${record.status},${(record.note ?? "").slice(0,300)},${me.id}) on conflict (learner_id,attendance_date) do update set year_id=excluded.year_id,term_id=excluded.term_id,grade_id=excluded.grade_id,stream_id=excluded.stream_id,status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by,updated_at=now()`;
      written.add(learner[0].streamId);
    }
    await writeServiceAudit(sql, me, "attendance_saved", "daily_attendance", data.date, `${data.records.length} attendance record(s) saved.`);
    return { saved:data.records.length, streams:[...written] };
  });

export const createHomeworkTask = createServerFn({ method: "POST" })
  .validator((input: {title:string;instructions:string;subjectId:string;gradeId:string;streamId?:string;yearId:string;termId:string;dueDate:string}) => input)
  .handler(async ({ data }) => {
    const me=await requireActor(); const sql=await getSql(); const assignments=await serviceAssignments(sql,me);
    const title=data.title.trim(); if(!title||title.length>140||data.instructions.length>3000||!/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) throw new Error("Enter a title under 140 characters, short instructions, and a due date.");
    const stream= data.streamId ? await sql<{gradeId:string}>`select grade_id as "gradeId" from streams where id=${data.streamId}` : null;
    if(data.streamId&&!stream?.[0]) throw new Error("Choose a valid class stream.");
    const allowed = isAdmin(me.role) || (data.streamId ? serviceCanStream(me,assignments,data.streamId,data.subjectId) : assignments.some((a)=>a.gradeId===data.gradeId&&a.subjectId===data.subjectId&&(a.kind==="subject_teacher"||a.kind==="hod"||a.kind==="class_teacher"||a.kind==="dos")));
    if(!allowed || (stream?.[0] && stream[0].gradeId!==data.gradeId)) throw new Error("You are not assigned to teach this class and subject.");
    const id=newId("hw"); await sql`insert into homework_tasks (id,title,instructions,subject_id,grade_id,stream_id,year_id,term_id,due_date,assigned_by) values (${id},${title},${data.instructions.trim()},${data.subjectId},${data.gradeId},${data.streamId||null},${data.yearId},${data.termId},${data.dueDate}::date,${me.id})`;
    const learners = data.streamId ? await sql<{id:string}>`select id from learners where stream_id=${data.streamId} and status='active'` : await sql<{id:string}>`select id from learners where grade_id=${data.gradeId} and status='active'`;
    for(const learner of learners) await sql`insert into homework_progress (task_id,learner_id,status,updated_by) values (${id},${learner.id},'pending',${me.id}) on conflict do nothing`;
    await writeServiceAudit(sql,me,"homework_created","homework",id,`Assigned work to ${learners.length} learner(s).`); return {id,count:learners.length};
  });
export const setHomeworkProgress = createServerFn({ method: "POST" })
  .validator((input:{taskId:string;learnerId:string;status:"pending"|"complete"})=>input)
  .handler(async({data})=>{ const me=await requireActor(); const sql=await getSql(); const task=await sql<{gradeId:string;streamId:string|null;subjectId:string}>`select grade_id as "gradeId",stream_id as "streamId",subject_id as "subjectId" from homework_tasks where id=${data.taskId}`; if(!task[0]) throw new Error("Homework item not found."); const links=await linkedFamilyLearnerIds(sql,me); const learner=await sql<{streamId:string;gradeId:string}>`select stream_id as "streamId",grade_id as "gradeId" from learners where id=${data.learnerId} and status='active'`; if(!learner[0]||learner[0].gradeId!==task[0].gradeId||(task[0].streamId&&learner[0].streamId!==task[0].streamId)) throw new Error("This learner is not assigned this homework."); const own=(me.role==="student"&&me.learnerId===data.learnerId)||(me.role==="parent"&&links.includes(data.learnerId)); const assignments=await serviceAssignments(sql,me); const staff=serviceCanStream(me,assignments,learner[0].streamId,task[0].subjectId); if(!own&&!staff&&!isAdmin(me.role)) throw new Error("You do not have access to this homework record."); await sql`insert into homework_progress(task_id,learner_id,status,updated_by) values(${data.taskId},${data.learnerId},${data.status},${me.id}) on conflict(task_id,learner_id) do update set status=excluded.status,updated_by=excluded.updated_by,updated_at=now()`; return {ok:true}; });

export const createSchoolEvent = createServerFn({ method: "POST" })
 .validator((input:{title:string;eventDate:string;audience:"all"|"parents"|"students"|"teachers"|"staff";venue:string;details:string})=>input)
 .handler(async({data})=>{const me=await requireActor();if(!can(me,"calendar"))throw new Error("You do not have calendar permission.");if(!data.title.trim()||data.title.length>140||!/^\d{4}-\d{2}-\d{2}$/.test(data.eventDate)||data.details.length>2000)throw new Error("Enter a title, valid date, and concise event details.");const sql=await getSql();const id=newId("evt");await sql`insert into school_events(id,title,event_date,audience,venue,details,created_by) values(${id},${data.title.trim()},${data.eventDate}::date,${data.audience},${data.venue.slice(0,160)},${data.details.trim()},${me.id})`;await writeServiceAudit(sql,me,"event_created","event",id,data.title.trim());return{id};});

async function requireLearnerContactAccess(sql:SqlHandle,me:Me,learnerId:string){const learner=await sql<{streamId:string}>`select stream_id as "streamId" from learners where id=${learnerId} and status='active'`;if(!learner[0])throw new Error("Active learner not found.");const assignments=await serviceAssignments(sql,me);if(!serviceCanStream(me,assignments,learner[0].streamId,undefined,true))throw new Error("Only school admins and the assigned class teacher can access this learner's contact information.");return learner[0];}
export const saveGuardianContact = createServerFn({method:"POST"}).validator((input:{id?:string;learnerId:string;name:string;relationship:string;phone:string;email:string;preferredChannel:"phone"|"email"|"in_person";notes:string})=>input).handler(async({data})=>{const me=await requireActor();const sql=await getSql();await requireLearnerContactAccess(sql,me,data.learnerId);if(!data.name.trim()||data.name.length>120||data.notes.length>500)throw new Error("Enter a contact name and keep notes under 500 characters.");const id=data.id||newId("gct");if(data.id){const own=await sql`select id from guardian_contacts where id=${data.id} and learner_id=${data.learnerId}`;if(!own[0])throw new Error("Contact not found.");await sql`update guardian_contacts set name=${data.name.trim()},relationship=${data.relationship.slice(0,80)},phone=${data.phone.slice(0,60)},email=${data.email.slice(0,160)},preferred_channel=${data.preferredChannel},notes=${data.notes.trim()},updated_at=now() where id=${id}`;}else await sql`insert into guardian_contacts(id,learner_id,name,relationship,phone,email,preferred_channel,notes,created_by) values(${id},${data.learnerId},${data.name.trim()},${data.relationship.slice(0,80)},${data.phone.slice(0,60)},${data.email.slice(0,160)},${data.preferredChannel},${data.notes.trim()},${me.id})`;await writeServiceAudit(sql,me,"guardian_contact_saved","learner",data.learnerId,"Guardian contact record updated.");return{id};});
export const logGuardianContact = createServerFn({method:"POST"}).validator((input:{learnerId:string;contactId?:string;direction:"incoming"|"outgoing";method:string;summary:string;followUpDate?:string})=>input).handler(async({data})=>{const me=await requireActor();const sql=await getSql();await requireLearnerContactAccess(sql,me,data.learnerId);if(!data.summary.trim()||data.summary.length>1000)throw new Error("Enter a concise contact outcome under 1000 characters.");const id=newId("gcl");await sql`insert into guardian_contact_log(id,learner_id,contact_id,direction,method,summary,follow_up_date,created_by) values(${id},${data.learnerId},${data.contactId||null},${data.direction},${data.method.slice(0,40)},${data.summary.trim()},${data.followUpDate||null}::date,${me.id})`;return{id};});

export const createParentMeetingRequest = createServerFn({method:"POST"}).validator((input:{learnerId:string;topic:string;preferredMethod:"phone"|"email"|"in_person";preferredDate?:string})=>input).handler(async({data})=>{const me=await requireActor();const sql=await getSql();if(me.role!=="parent")throw new Error("Meeting requests are for parent accounts.");const links=await linkedFamilyLearnerIds(sql,me);if(!links.includes(data.learnerId))throw new Error("You can request a meeting only for a linked child.");if(!data.topic.trim()||data.topic.length>300)throw new Error("Choose a brief topic under 300 characters.");const id=newId("mtg");await sql`insert into parent_meeting_requests(id,learner_id,parent_user_id,topic,preferred_method,preferred_date) values(${id},${data.learnerId},${me.id},${data.topic.trim()},${data.preferredMethod},${data.preferredDate||null}::date)`;await writeServiceAudit(sql,me,"meeting_requested","learner",data.learnerId,"Parent requested a school conversation.");return{id};});
export const respondParentMeeting = createServerFn({method:"POST"}).validator((input:{id:string;status:"accepted"|"declined"|"follow_up";response:string})=>input).handler(async({data})=>{const me=await requireActor();const sql=await getSql();const req=await sql<{learnerId:string}>`select learner_id as "learnerId" from parent_meeting_requests where id=${data.id}`;if(!req[0])throw new Error("Meeting request not found.");if(!isAdmin(me.role)){const learner=await sql<{streamId:string}>`select stream_id as "streamId" from learners where id=${req[0].learnerId}`;const assignments=await serviceAssignments(sql,me);if(me.role!=="teacher"||!learner[0]||!serviceCanStream(me,assignments,learner[0].streamId,undefined,true))throw new Error("Only an administrator or the assigned class teacher can respond.");}if(data.response.length>800)throw new Error("Keep the reply under 800 characters.");await sql`update parent_meeting_requests set status=${data.status},staff_response=${data.response.trim()},handled_by=${me.id},updated_at=now() where id=${data.id}`;await writeServiceAudit(sql,me,"meeting_request_handled","meeting_request",data.id,`Request status: ${data.status}.`);return{ok:true};});

export const createStaffAbsenceRequest = createServerFn({method:"POST"}).validator((input:{startDate:string;endDate:string;category:string;note:string})=>input).handler(async({data})=>{const me=await requireActor();if(!["teacher","admin","super_admin"].includes(me.role))throw new Error("Only staff accounts can submit absence requests.");if(!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)||data.endDate<data.startDate||!data.category.trim()||data.note.length>500)throw new Error("Enter valid absence dates and category.");const sql=await getSql();const id=newId("abs");await sql`insert into staff_absence_requests(id,requester_id,start_date,end_date,category,note) values(${id},${me.id},${data.startDate}::date,${data.endDate}::date,${data.category.slice(0,80)},${data.note.trim()})`;await writeServiceAudit(sql,me,"absence_requested","staff_absence",id,"Staff absence request submitted.");return{id};});
export const reviewStaffAbsenceRequest = createServerFn({method:"POST"}).validator((input:{id:string;status:"approved"|"declined"|"withdrawn";note:string})=>input).handler(async({data})=>{const me=await requireActor();const sql=await getSql();const row=await sql<{requesterId:string;status:string}>`select requester_id as "requesterId",status from staff_absence_requests where id=${data.id}`;if(!row[0])throw new Error("Absence request not found.");if(data.status==="withdrawn"){if(row[0].requesterId!==me.id||row[0].status!=="pending")throw new Error("Only the requester can withdraw a pending request.");await sql`update staff_absence_requests set status='withdrawn',updated_at=now() where id=${data.id}`;}else{requirePowerfulService(me,"review staff leave requests");if(row[0].status!=="pending")throw new Error("Only pending requests can be reviewed.");await sql`update staff_absence_requests set status=${data.status},reviewer_id=${me.id},review_note=${data.note.slice(0,500)},updated_at=now() where id=${data.id}`;await writeServiceAudit(sql,me,"staff_absence_reviewed","absence_request",data.id,data.status);}return{ok:true};});

export const saveLearnerSupportEvent = createServerFn({method:"POST"}).validator((input:{id?:string;learnerId:string;eventDate:string;category:string;summary:string;followUpOwner?:string;dueDate?:string;status:"open"|"in_progress"|"closed";outcome:string})=>input).handler(async({data})=>{const me=await requireActor();requirePowerfulService(me,"manage confidential learner support records");if(!data.summary.trim()||data.summary.length>1500||!/^\d{4}-\d{2}-\d{2}$/.test(data.eventDate))throw new Error("Enter a dated, factual summary under 1500 characters.");const sql=await getSql();const id=data.id||newId("sup");if(data.id){await sql`update learner_support_events set status=${data.status},outcome=${data.outcome.slice(0,1000)},follow_up_owner=${data.followUpOwner||null},due_date=${data.dueDate||null}::date,updated_at=now() where id=${id}`;}else await sql`insert into learner_support_events(id,learner_id,event_date,category,summary,follow_up_owner,due_date,status,outcome,created_by) values(${id},${data.learnerId},${data.eventDate}::date,${data.category.slice(0,80)},${data.summary.trim()},${data.followUpOwner||null},${data.dueDate||null}::date,${data.status},${data.outcome.slice(0,1000)},${me.id})`;await writeServiceAudit(sql,me,"support_followup_saved","learner_support",id,`Confidential support follow-up ${data.status}.`);return{id};});
export const saveLearnerEmergencyProfile = createServerFn({method:"POST"}).validator((input:{learnerId:string;contactName:string;relationship:string;phone:string;criticalNote:string})=>input).handler(async({data})=>{const me=await requireActor();const sql=await getSql();await requireLearnerContactAccess(sql,me,data.learnerId);if(data.criticalNote.length>500)throw new Error("Keep urgent-response information under 500 characters.");await sql`insert into learner_emergency_profiles(learner_id,contact_name,relationship,phone,critical_note,updated_by) values(${data.learnerId},${data.contactName.slice(0,120)},${data.relationship.slice(0,80)},${data.phone.slice(0,60)},${data.criticalNote.trim()},${me.id}) on conflict(learner_id) do update set contact_name=excluded.contact_name,relationship=excluded.relationship,phone=excluded.phone,critical_note=excluded.critical_note,updated_by=excluded.updated_by,updated_at=now()`;await writeServiceAudit(sql,me,"emergency_profile_saved","learner",data.learnerId,"Emergency contact/critical response profile updated.");return{ok:true};});
