import { useMemo, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, errText, inputClass } from "@/components/school/gate";
import { applySubjectPlan, deleteLessonRelation, deleteTimetableRequirement, saveLessonRelation, saveTeacherContract, saveTimetableRequirement } from "@/lib/school/api";
import type { TimetablePeriod } from "@/lib/school/model";
import { coveredPeriodIds } from "@/components/school/timetable-sheet";

type Props = Gate & { yearId: string; termId: string; periods: TimetablePeriod[] };
const DOUBLE_OPTIONS: Array<[string, string]> = [["card", "Follow each lesson card"], ["0", "Never double"], ["1", "1 double a week"], ["2", "2 doubles a week"]];
const panel = "rounded-xl border border-line bg-paper p-4";

/**
 * Planning bars: lessons per subject, doubles, subjects that must not follow each other,
 * teacher recovery time, and teacher → grade/stream allocations.
 */
export function TimetablePlanner({ ws, refresh, flash, yearId, termId, periods }: Props) {
  const [busy, setBusy] = useState(false);
  const [scopeGrade, setScopeGrade] = useState("");
  const [lessonDraft, setLessonDraft] = useState<Record<string, string>>({});
  const [doubleDraft, setDoubleDraft] = useState<Record<string, string>>({});
  const [breakDraft, setBreakDraft] = useState<Record<string, string>>({});
  const [apart, setApart] = useState({ gradeId: "", left: ws.subjects[0]?.id ?? "", right: ws.subjects[1]?.id ?? "" });
  const [teacherDraft, setTeacherDraft] = useState<Record<string, { maxConsecutive: string; rest: string }>>({});
  const [assign, setAssign] = useState({ teacherId: "", subjectId: ws.subjects[0]?.id ?? "", gradeId: ws.grades[0]?.id ?? "", streamIds: [] as string[], allStreams: true, lessons: "5" });

  const teachers = ws.staff.filter((person) => person.active && ["teacher", "admin", "super_admin"].includes(person.role));
  const cards = useMemo(() => ws.timetableRequirements.filter((item) => item.yearId === yearId && item.termId === termId), [ws.timetableRequirements, yearId, termId]);
  const entries = useMemo(() => ws.timetableEntries.filter((item) => item.yearId === yearId && item.termId === termId), [ws.timetableEntries, yearId, termId]);
  const constraints = useMemo(() => (ws.subjectConstraints ?? []).filter((item) => item.yearId === yearId && item.termId === termId), [ws.subjectConstraints, yearId, termId]);
  const contracts = useMemo(() => (ws.teacherContracts ?? []).filter((item) => item.yearId === yearId && item.termId === termId), [ws.teacherContracts, yearId, termId]);
  const relations = useMemo(() => (ws.lessonRelations ?? []).filter((item) => item.yearId === yearId && item.termId === termId && item.relation === "not_consecutive"), [ws.lessonRelations, yearId, termId]);
  const subjectName = (id: string) => ws.subjects.find((item) => item.id === id)?.shortName || ws.subjects.find((item) => item.id === id)?.name || "Subject";

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try { flash(await action()); await refresh(); }
    catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }

  function rowInfo(subjectId: string) {
    const subjectCards = cards.filter((card) => card.subjectId === subjectId && (!scopeGrade || card.gradeId === scopeGrade));
    const target = subjectCards.reduce((sum, card) => sum + card.lessonsPerWeek, 0);
    const placed = entries.filter((entry) => entry.subjectId === subjectId && (!scopeGrade || entry.gradeId === scopeGrade)).reduce((sum, entry) => sum + coveredPeriodIds(entry, periods).length, 0);
    const common = subjectCards.length ? String(subjectCards[0].lessonsPerWeek) : "";
    const mixed = new Set(subjectCards.map((card) => card.lessonsPerWeek)).size > 1;
    return { count: subjectCards.length, target, placed, common, mixed };
  }
  function savedDouble(subjectId: string) {
    const saved = constraints.find((item) => item.subjectId === subjectId);
    return saved?.doubleCount == null ? "card" : String(saved.doubleCount);
  }

  async function saveSubject(subjectId: string, fields: "lessons" | "double") {
    const info = rowInfo(subjectId);
    const payload: { yearId: string; termId: string; subjectId: string; gradeId?: string; lessonsPerWeek?: number; doubleCount?: number; maxBeforeBreak?: number } = { yearId, termId, subjectId, gradeId: scopeGrade || undefined };
    if (fields === "lessons") {
      const lessons = Number(lessonDraft[subjectId] ?? info.common);
      if (Number.isFinite(lessons) && lessons >= 1) payload.lessonsPerWeek = Math.trunc(lessons);
      const before = Number(breakDraft[subjectId] ?? constraints.find((item) => item.subjectId === subjectId)?.maxBeforeBreak ?? 3);
      if (Number.isFinite(before) && before >= 1) payload.maxBeforeBreak = Math.trunc(before);
    } else {
      const value = doubleDraft[subjectId] ?? savedDouble(subjectId);
      payload.doubleCount = value === "card" ? -1 : Number(value);
    }
    await run(async () => {
      const result = await applySubjectPlan({ data: payload });
      return `${subjectName(subjectId)} saved${result.updated ? ` · ${result.updated} lesson card(s) updated` : ""}. Tap “Fix timetable automatically” to place the new numbers.`;
    });
  }

  async function saveAllSubjects(fields: "lessons" | "double") {
    setBusy(true);
    try {
      for (const subject of ws.subjects) {
        const info = rowInfo(subject.id);
        const payload: { yearId: string; termId: string; subjectId: string; gradeId?: string; lessonsPerWeek?: number; doubleCount?: number; maxBeforeBreak?: number } = { yearId, termId, subjectId: subject.id, gradeId: scopeGrade || undefined };
        if (fields === "lessons") {
          if (lessonDraft[subject.id] === undefined && breakDraft[subject.id] === undefined) continue;
          const lessons = Number(lessonDraft[subject.id] ?? info.common);
          if (Number.isFinite(lessons) && lessons >= 1) payload.lessonsPerWeek = Math.trunc(lessons);
          if (breakDraft[subject.id] !== undefined) payload.maxBeforeBreak = Math.max(1, Math.trunc(Number(breakDraft[subject.id])) || 3);
        } else {
          if (doubleDraft[subject.id] === undefined) continue;
          payload.doubleCount = doubleDraft[subject.id] === "card" ? -1 : Number(doubleDraft[subject.id]);
        }
        await applySubjectPlan({ data: payload });
      }
      setLessonDraft({}); setBreakDraft({}); setDoubleDraft({});
      flash("Subject plan saved. Tap “Fix timetable automatically” to place it.");
      await refresh();
    } catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }

  async function addApart() {
    if (apart.left === apart.right) { flash("Choose two different subjects.", true); return; }
    const targetGrades = apart.gradeId ? [apart.gradeId] : ws.grades.map((grade) => grade.id);
    await run(async () => {
      let added = 0;
      for (const gradeId of targetGrades) {
        const exists = relations.some((item) => item.gradeId === gradeId && !item.streamId && ((item.leftSubjectId === apart.left && item.rightSubjectId === apart.right) || (item.leftSubjectId === apart.right && item.rightSubjectId === apart.left)));
        if (exists) continue;
        await saveLessonRelation({ data: { yearId, termId, gradeId, leftSubjectId: apart.left, rightSubjectId: apart.right, relation: "not_consecutive" } });
        added += 1;
      }
      return added ? `${subjectName(apart.left)} and ${subjectName(apart.right)} will not follow each other (${added} grade(s)).` : "That pair is already set.";
    });
  }

  async function saveTeacher(teacherId: string) {
    const saved = contracts.find((item) => item.teacherUserId === teacherId);
    const draft = teacherDraft[teacherId];
    await run(async () => {
      await saveTeacherContract({ data: { yearId, termId, teacherUserId: teacherId, maxPerDay: saved?.maxPerDay ?? 6, maxPerWeek: saved?.maxPerWeek ?? 30, maxConsecutive: Number(draft?.maxConsecutive ?? saved?.maxConsecutive ?? 4), maxDays: saved?.maxDays ?? 5, maxWindows: saved?.maxWindows ?? 3, minRestPeriods: Number(draft?.rest ?? saved?.minRestPeriods ?? 0) } });
      return "Teacher relaxation saved.";
    });
  }

  const assignStreams = ws.streams.filter((stream) => stream.gradeId === assign.gradeId);
  async function saveAssignment() {
    if (!assign.teacherId) { flash("Choose a teacher.", true); return; }
    const lessons = Math.trunc(Number(assign.lessons));
    if (!(lessons >= 1)) { flash("Enter the lessons per week.", true); return; }
    const targets: Array<string | null> = assign.allStreams || !assignStreams.length ? [null] : assign.streamIds;
    if (!targets.length) { flash("Choose at least one stream, or tick All streams.", true); return; }
    const clashing = cards.filter((card) => card.gradeId === assign.gradeId && card.subjectId === assign.subjectId && card.teacherUserId !== assign.teacherId && targets.some((target) => target === null || card.streamId === null || card.streamId === target));
    if (clashing.length && !confirm(`${clashing.length} lesson card(s) for this subject and class already belong to another teacher. Replace them with this teacher?`)) return;
    await run(async () => {
      for (const card of clashing) await deleteTimetableRequirement({ data: { id: card.id } });
      for (const target of targets) {
        const existing = cards.find((card) => card.gradeId === assign.gradeId && card.subjectId === assign.subjectId && card.teacherUserId === assign.teacherId && (card.streamId ?? null) === target);
        const subjectDouble = constraints.find((item) => item.subjectId === assign.subjectId)?.doubleCount;
        const singles = Array.from({ length: lessons }, () => 1);
        const blocks = subjectDouble && subjectDouble > 0 ? [...Array.from({ length: Math.min(Math.floor(lessons / 2), subjectDouble) }, () => 2), ...Array.from({ length: lessons - 2 * Math.min(Math.floor(lessons / 2), subjectDouble) }, () => 1)] : singles;
        const distribution = blocks.join("+").length <= 40 ? blocks.join("+") : "";
        await saveTimetableRequirement({ data: { yearId, termId, id: existing?.id, gradeId: assign.gradeId, streamId: target ?? undefined, subjectId: assign.subjectId, teacherUserId: assign.teacherId, lessonsPerWeek: lessons, blockLength: 1, preferredRoom: existing?.preferredRoom ?? "", distribution, preferredDoubleDay: null, timingPreference: existing?.timingPreference ?? "none" } });
      }
      const teacher = teachers.find((person) => person.id === assign.teacherId)?.fullName ?? "Teacher";
      return `${teacher} now teaches ${subjectName(assign.subjectId)} · ${ws.grades.find((grade) => grade.id === assign.gradeId)?.name} · ${targets[0] === null ? "all streams" : `${targets.length} stream(s)`}.`;
    });
  }

  return <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-2">
      <div className={panel + " xl:col-span-2"}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-serif text-lg text-navy">Subjects and lessons per week</h3><p className="text-xs text-muted">Type how many lessons each subject must have. The automatic builder counts these exactly (a subject set to 5 will get 5). “Before-break max” limits how many of its lessons may sit in the two periods before a break.</p></div>
          <label className="text-xs font-semibold text-navy">Apply to<select className={inputClass + " mt-1"} value={scopeGrade} onChange={(event) => setScopeGrade(event.target.value)}><option value="">All grades</option>{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
        </div>
        <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {ws.subjects.map((subject) => {
            const info = rowInfo(subject.id);
            const short = info.target - info.placed;
            const saved = constraints.find((item) => item.subjectId === subject.id);
            return <div key={subject.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-3 py-2 text-xs">
              <strong className="min-w-[7rem]">{subject.shortName || subject.name}</strong>
              <label className="flex items-center gap-1">lessons / week <input className="w-14 rounded border px-1 py-1" type="number" min="1" max="40" placeholder={info.count ? (info.mixed ? "mixed" : info.common) : "—"} value={lessonDraft[subject.id] ?? (info.mixed ? "" : info.common)} onChange={(event) => setLessonDraft({ ...lessonDraft, [subject.id]: event.target.value })} /></label>
              <label className="flex items-center gap-1">before-break max <input className="w-12 rounded border px-1 py-1" type="number" min="1" max="10" value={breakDraft[subject.id] ?? String(saved?.maxBeforeBreak ?? 3)} onChange={(event) => setBreakDraft({ ...breakDraft, [subject.id]: event.target.value })} /></label>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${!info.count ? "bg-slate-100 text-slate-700" : short === 0 ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{!info.count ? "no cards" : short === 0 ? `${info.placed}/${info.target} placed` : short > 0 ? `${info.placed}/${info.target} · ${short} missing` : `${info.placed}/${info.target} · ${-short} extra`}</span>
              <button type="button" className="ml-auto font-semibold text-info" disabled={busy} onClick={() => saveSubject(subject.id, "lessons")}>Save</button>
            </div>;
          })}
        </div>
        <button type="button" className={btnClass + " mt-3"} disabled={busy} onClick={() => saveAllSubjects("lessons")}>Save all changed subjects</button>
      </div>

      <div className={panel}>
        <h3 className="font-serif text-lg text-navy">Double lessons (back-to-back)</h3>
        <p className="text-xs text-muted">Choose which subjects get doubles. Every other subject set to “Never double” will only ever have single lessons. A double is two consecutive periods that never cross a break.</p>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {ws.subjects.map((subject) => <div key={subject.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs">
            <strong>{subject.shortName || subject.name}</strong>
            <select className="rounded border px-2 py-1" value={doubleDraft[subject.id] ?? savedDouble(subject.id)} onChange={(event) => setDoubleDraft({ ...doubleDraft, [subject.id]: event.target.value })}>{DOUBLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>)}
        </div>
        <button type="button" className={btnClass + " mt-3"} disabled={busy} onClick={() => saveAllSubjects("double")}>Save double-lesson rules</button>
      </div>

      <div className={panel}>
        <h3 className="font-serif text-lg text-navy">Subjects that must not follow each other</h3>
        <p className="text-xs text-muted">Pick two subjects that should never sit in neighbouring periods (for example Mathematics and Science). Choose one grade or all grades.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select className={inputClass} value={apart.left} onChange={(event) => setApart({ ...apart, left: event.target.value })} aria-label="First subject">{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.shortName || subject.name}</option>)}</select>
          <select className={inputClass} value={apart.right} onChange={(event) => setApart({ ...apart, right: event.target.value })} aria-label="Second subject">{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.shortName || subject.name}</option>)}</select>
          <select className={inputClass} value={apart.gradeId} onChange={(event) => setApart({ ...apart, gradeId: event.target.value })} aria-label="Grade"><option value="">All grades</option>{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select>
        </div>
        <button type="button" className={btnClass + " mt-3"} disabled={busy} onClick={addApart}>Keep these apart</button>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">{relations.map((item) => <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs"><span>{ws.grades.find((grade) => grade.id === item.gradeId)?.name}: {subjectName(item.leftSubjectId)} ↔ {subjectName(item.rightSubjectId)}</span><button type="button" className="font-semibold text-bad" disabled={busy} onClick={() => run(async () => { await deleteLessonRelation({ data: { id: item.id } }); return "Pair removed."; })}>×</button></li>)}{!relations.length ? <li className="text-xs text-muted">No pairs set yet.</li> : null}</ul>
      </div>

      <div className={panel + " xl:col-span-2"}>
        <h3 className="font-serif text-lg text-navy">Teacher relaxation</h3>
        <p className="text-xs text-muted">“Relax after” sets how many lessons in a row a teacher may teach before a break from teaching. “Free periods after a lesson” gives a rest gap between separate lessons (0, 1 or 2). Both are respected when the timetable is built.</p>
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {teachers.map((teacher) => {
            const saved = contracts.find((item) => item.teacherUserId === teacher.id);
            const draft = teacherDraft[teacher.id];
            return <div key={teacher.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-3 py-2 text-xs">
              <strong className="min-w-[8rem]">{teacher.fullName}</strong>
              <label className="flex items-center gap-1">relax after <input className="w-12 rounded border px-1 py-1" type="number" min="1" max="10" value={draft?.maxConsecutive ?? String(saved?.maxConsecutive ?? 4)} onChange={(event) => setTeacherDraft({ ...teacherDraft, [teacher.id]: { maxConsecutive: event.target.value, rest: draft?.rest ?? String(saved?.minRestPeriods ?? 0) } })} /> lessons</label>
              <label className="flex items-center gap-1">free periods after a lesson <select className="rounded border px-1 py-1" value={draft?.rest ?? String(saved?.minRestPeriods ?? 0)} onChange={(event) => setTeacherDraft({ ...teacherDraft, [teacher.id]: { maxConsecutive: draft?.maxConsecutive ?? String(saved?.maxConsecutive ?? 4), rest: event.target.value } })}><option value="0">0 · none</option><option value="1">1</option><option value="2">2</option></select></label>
              <button type="button" className="ml-auto font-semibold text-info" disabled={busy || !draft} onClick={() => saveTeacher(teacher.id)}>Save</button>
            </div>;
          })}
          {!teachers.length ? <p className="text-xs text-muted">No active teachers found.</p> : null}
        </div>
      </div>

      <div className={panel + " xl:col-span-2"}>
        <h3 className="font-serif text-lg text-navy">Assign a teacher to a grade and stream</h3>
        <p className="text-xs text-muted">Pick the teacher, the subject, the grade, then tick the streams they teach — or All streams. Lessons per week are created for each stream chosen. To avoid English 7 North followed by English 7 South, the builder places a teacher’s back-to-back lessons in different grades with the same stream when it can (English 7 North, then English 8 North).</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select className={inputClass} value={assign.teacherId} onChange={(event) => setAssign({ ...assign, teacherId: event.target.value })} aria-label="Teacher"><option value="">Choose teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>
          <select className={inputClass} value={assign.subjectId} onChange={(event) => setAssign({ ...assign, subjectId: event.target.value })} aria-label="Subject">{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
          <select className={inputClass} value={assign.gradeId} onChange={(event) => setAssign({ ...assign, gradeId: event.target.value, streamIds: [], allStreams: true })} aria-label="Grade">{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select>
          <input className={inputClass} type="number" min="1" max="40" value={assign.lessons} onChange={(event) => setAssign({ ...assign, lessons: event.target.value })} aria-label="Lessons per week" placeholder="Lessons / week" />
          <button type="button" className={btnClass} disabled={busy} onClick={saveAssignment}>Assign</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1 font-semibold"><input type="checkbox" checked={assign.allStreams} onChange={(event) => setAssign({ ...assign, allStreams: event.target.checked, streamIds: [] })} /> All streams</label>
          {!assign.allStreams ? assignStreams.map((stream) => <label key={stream.id} className="flex items-center gap-1"><input type="checkbox" checked={assign.streamIds.includes(stream.id)} onChange={(event) => setAssign({ ...assign, streamIds: event.target.checked ? [...assign.streamIds, stream.id] : assign.streamIds.filter((id) => id !== stream.id) })} /> {stream.name}</label>) : null}
        </div>
      </div>
    </div>
  </div>;
}
