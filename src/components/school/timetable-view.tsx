import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { emailPersonalTimetable, deleteTimetablePeriod, saveTimetableEntry, saveTimetablePeriod, generateTimetable, applyMukuyuBell, reorderTimetablePeriods, clearTimetableEntries } from "@/lib/school/api";
import { canManageTimetable, type TimetableEntry, type TimetablePeriod } from "@/lib/school/model";
import { downloadTimetablePdf, timetablePdfBase64 } from "@/lib/school/timetable-pdf";
import { TimetableOperations } from "@/components/school/timetable-operations";
import { TimetableAdvancedStudio } from "@/components/school/timetable-advanced-studio";
import { AscTimetableSheet, classCode, coveredPeriodIds } from "@/components/school/timetable-sheet";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function emptyEntry(ws: Gate["ws"]) {
  const teacher = ws.staff.find((member) => member.role === "teacher" || member.role === "admin" || member.role === "super_admin")?.id ?? ws.me.id;
  return { dayOfWeek: 1, periodId: ws.timetablePeriods.find((period) => period.yearId === ws.profile.activeYearId && period.termId === ws.profile.activeTermId)?.id ?? "", gradeId: ws.grades[0]?.id ?? "", streamId: "", subjectId: ws.subjects[0]?.id ?? "", teacherUserId: teacher, room: "", notes: "", blockLength: 1, locked: false };
}

export function TimetableView({ ws, refresh, flash }: Gate) {
  const manager = canManageTimetable(ws.me) || (ws.me.role === "admin" && ws.timetableAdminsCanEdit);
  const isTeacher = ws.me.role === "teacher";
  const [yearId, setYearId] = useState(ws.profile.activeYearId || ws.years[0]?.id || "");
  const [termId, setTermId] = useState(ws.profile.activeTermId || ws.terms[0]?.id || "");
  const [gradeFilter, setGradeFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState(isTeacher ? ws.me.id : "");
  const [roomFilter, setRoomFilter] = useState("");
  const [viewMode, setViewMode] = useState(isTeacher ? "teacher" : "class");
  const [dayFilter, setDayFilter] = useState(0);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");
  const [showBreaks, setShowBreaks] = useState(true);
  const [compactGrid, setCompactGrid] = useState(false);
  const [presetSaved, setPresetSaved] = useState(false);
  const [pdfMode, setPdfMode] = useState<"class" | "teacher" | "summary">(isTeacher ? "teacher" : "class");
  const [periodDraft, setPeriodDraft] = useState({ label: "Lesson 1", startTime: "08:00", endTime: "08:40", isBreak: false, id: "" });
  const [entryDraft, setEntryDraft] = useState(() => emptyEntry(ws) as ReturnType<typeof emptyEntry> & { id?: string });
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipientMode, setRecipientMode] = useState<"all" | "selected" | "single">("selected");
  const [busy, setBusy] = useState(false);
  const periods = useMemo(() => ws.timetablePeriods.filter((period) => period.yearId === yearId && period.termId === termId).sort((a, b) => a.sort - b.sort), [ws.timetablePeriods, yearId, termId]);
  const allEntries = useMemo(() => ws.timetableEntries.filter((entry) => entry.yearId === yearId && entry.termId === termId), [ws.timetableEntries, yearId, termId]);
  const visibleEntries = useMemo(() => allEntries.filter((entry) => {
    const query = lessonSearch.trim().toLowerCase();
    if (gradeFilter && entry.gradeId !== gradeFilter) return false;
    if (streamFilter && entry.streamId !== streamFilter) return false;
    if (teacherFilter && entry.teacherUserId !== teacherFilter) return false;
    if (roomFilter && entry.room.toLowerCase() !== roomFilter.toLowerCase()) return false;
    if (subjectFilter && entry.subjectId !== subjectFilter) return false;
    if (dayFilter && entry.dayOfWeek !== dayFilter) return false;
    if (query && ![entry.teacherName, entry.room, entry.notes, ws.subjects.find((subject) => subject.id === entry.subjectId)?.name, ws.grades.find((grade) => grade.id === entry.gradeId)?.name].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))) return false;
    return true;
  }), [allEntries, dayFilter, gradeFilter, lessonSearch, roomFilter, streamFilter, subjectFilter, teacherFilter, ws.grades, ws.subjects]);
  const teacherOptions = ws.staff.filter((member) => member.active && (member.role === "teacher" || member.role === "admin" || member.role === "super_admin"));
  if (!teacherOptions.some((member) => member.id === ws.me.id) && ["teacher", "admin", "super_admin"].includes(ws.me.role)) teacherOptions.push({ id: ws.me.id, email: ws.me.email, fullName: ws.me.fullName, role: ws.me.role, isDeputy: ws.me.isDeputy } as typeof ws.staff[number]);
  const entryStreams = ws.streams.filter((stream) => stream.gradeId === entryDraft.gradeId);
  const filterStreams = ws.streams.filter((stream) => !gradeFilter || stream.gradeId === gradeFilter);
  const roomOptions = [...new Set([...ws.timetableRooms.map((room) => room.name), ...allEntries.map((entry) => entry.room).filter(Boolean)])].sort();
  const yearName = ws.years.find((year) => year.id === yearId)?.name ?? yearId;
  const termName = ws.terms.find((term) => term.id === termId)?.name ?? termId;
  const timetablePublished = ws.timetableStates.find((state) => state.yearId === yearId && state.termId === termId)?.published ?? false;
  const pdfOptions = { schoolName: ws.profile.name, yearName, termName, periods, entries: visibleEntries, grades: ws.grades, streams: ws.streams, subjects: ws.subjects, staff: ws.staff, assignments: ws.assignments, groupMode: pdfMode };
  const sheetPeriods = showBreaks ? periods : periods.filter((period) => !period.isBreak);
  const coveredPeriodCount = (entry: TimetableEntry) => coveredPeriodIds(entry, periods).length;
  const entryCountByDay = DAYS.map((day, index) => ({ day, count: visibleEntries.filter((entry) => entry.dayOfWeek === index + 1).reduce((sum, entry) => sum + coveredPeriodCount(entry), 0) }));
  const busiestDay = [...entryCountByDay].sort((a, b) => b.count - a.count)[0];
  const visiblePeriodCount = visibleEntries.reduce((sum, entry) => sum + coveredPeriodCount(entry), 0);
  const roomUsage = new Set(visibleEntries.map((entry) => entry.room.trim()).filter(Boolean)).size;
  const todayDay = new Date().getDay();
  const todayTimetableDay = todayDay >= 1 && todayDay <= 5 ? todayDay : 1;
  const nextLesson = allEntries.filter((entry) => entry.dayOfWeek === todayTimetableDay && (!isTeacher || entry.teacherUserId === ws.me.id)).map((entry) => ({ entry, period: periods.find((period) => period.id === entry.periodId) })).filter((item) => item.period && !item.period.isBreak).sort((a, b) => (a.period?.sort ?? 0) - (b.period?.sort ?? 0))[0];

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key === "/" && event.target instanceof HTMLElement && !["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-timetable-search]")?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  async function savePeriod(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveTimetablePeriod({ data: { yearId, termId, ...periodDraft, id: periodDraft.id || undefined } });
      setPeriodDraft({ label: `Lesson ${periods.length + 2}`, startTime: "08:40", endTime: "09:20", isBreak: false, id: "" });
      flash(periodDraft.id ? "Timetable period updated." : "Timetable period added.");
      await refresh();
    } catch (error) { flash(errText(error), true); } finally { setBusy(false); }
  }

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!entryDraft.periodId) { flash("Add a timetable period first.", true); return; }
    setBusy(true);
    try {
      await saveTimetableEntry({ data: { yearId, termId, ...entryDraft, dayOfWeek: Number(entryDraft.dayOfWeek), streamId: entryDraft.streamId || undefined } });
      setEntryDraft({ ...entryDraft, id: undefined, periodId: entryDraft.periodId, room: "", notes: "", blockLength: 1 });
      flash("Timetable lesson saved. Teacher, class, room, availability, and block conflicts are checked automatically.");
      await refresh();
    } catch (error) { flash(errText(error), true); } finally { setBusy(false); }
  }

  async function downloadPdf() {
    try {
      await downloadTimetablePdf(`mukuyu-${pdfMode}-timetables-${yearName}-${termName}.pdf`.replace(/\s+/g, "-"), pdfOptions);
      flash(pdfMode === "summary" ? "Whole-school timetable summary PDF downloaded." : "Timetable PDF downloaded.");
    } catch (error) { flash(errText(error), true); }
  }

  function downloadCsv() {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = visibleEntries.map((entry) => {
      const period = periods.find((item) => item.id === entry.periodId);
      const grade = ws.grades.find((item) => item.id === entry.gradeId)?.name ?? "";
      const stream = ws.streams.find((item) => item.id === entry.streamId)?.name ?? "All streams";
      const subject = ws.subjects.find((item) => item.id === entry.subjectId)?.name ?? "";
      return [DAYS[entry.dayOfWeek - 1] ?? `Day ${entry.dayOfWeek}`, period?.label ?? "", period?.startTime ?? "", period?.endTime ?? "", Math.max(1, entry.blockLength || 1), grade, stream, subject, entry.teacherName, entry.room, entry.notes, entry.locked ? "Pinned" : "Open"];
    });
    const csv = [["Day", "Period", "Start", "End", "Consecutive periods", "Grade", "Stream", "Subject", "Teacher", "Room", "Notes", "Pin status"], ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mukuyu-timetable-${pdfMode}-${yearName}-${termName}.csv`.replace(/[^a-zA-Z0-9._-]+/g, "_");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    flash(`${rows.length} filtered timetable row(s) exported to CSV.`);
  }

  function clearFilters() {
    setGradeFilter(""); setStreamFilter(""); setTeacherFilter(""); setRoomFilter(""); setSubjectFilter(""); setDayFilter(0); setLessonSearch("");
  }

  function showMyTimetable() {
    setViewMode("teacher"); setTeacherFilter(ws.me.id); setGradeFilter(""); setStreamFilter(""); setRoomFilter(""); setSubjectFilter(""); setDayFilter(0); setLessonSearch(""); setPdfMode("teacher");
  }

  function showClassTimetable() {
    setViewMode("class"); setTeacherFilter(""); setGradeFilter(""); setStreamFilter(""); setRoomFilter(""); setSubjectFilter(""); setDayFilter(0); setLessonSearch(""); setPdfMode("class");
  }

  function saveViewPreset() {
    try { window.localStorage.setItem("mukuyu-timetable-view-preset-v1", JSON.stringify({ yearId, termId, gradeFilter, streamFilter, teacherFilter, roomFilter, subjectFilter, dayFilter, lessonSearch, viewMode, showBreaks, compactGrid })); } catch { /* Keep the live view usable when storage is blocked. */ }
    setPresetSaved(true);
    flash("Timetable view preset saved on this device.");
  }

  function loadViewPreset() {
    try {
      const saved = JSON.parse(window.localStorage.getItem("mukuyu-timetable-view-preset-v1") || "null") as Partial<Record<string, unknown>> | null;
      if (!saved) { flash("No timetable view preset has been saved yet.", true); return; }
      setGradeFilter(typeof saved.gradeFilter === "string" ? saved.gradeFilter : ""); setStreamFilter(typeof saved.streamFilter === "string" ? saved.streamFilter : ""); setTeacherFilter(typeof saved.teacherFilter === "string" ? saved.teacherFilter : ""); setRoomFilter(typeof saved.roomFilter === "string" ? saved.roomFilter : ""); setSubjectFilter(typeof saved.subjectFilter === "string" ? saved.subjectFilter : ""); setDayFilter(typeof saved.dayFilter === "number" ? saved.dayFilter : 0); setLessonSearch(typeof saved.lessonSearch === "string" ? saved.lessonSearch : ""); setViewMode(typeof saved.viewMode === "string" ? saved.viewMode : "class"); setShowBreaks(saved.showBreaks !== false); setCompactGrid(saved.compactGrid === true); setPresetSaved(true); flash("Saved timetable view restored.");
    } catch { flash("The saved timetable view could not be restored.", true); }
  }

  function downloadJson() {
    const payload = visibleEntries.map((entry) => ({ day: DAYS[entry.dayOfWeek - 1] ?? entry.dayOfWeek, period: periods.find((period) => period.id === entry.periodId)?.label ?? "", start: periods.find((period) => period.id === entry.periodId)?.startTime ?? "", end: periods.find((period) => period.id === entry.periodId)?.endTime ?? "", consecutivePeriods: Math.max(1, entry.blockLength || 1), grade: ws.grades.find((grade) => grade.id === entry.gradeId)?.name ?? "", stream: ws.streams.find((stream) => stream.id === entry.streamId)?.name ?? "All streams", subject: ws.subjects.find((subject) => subject.id === entry.subjectId)?.name ?? "", teacher: entry.teacherName, room: entry.room, notes: entry.notes, locked: Boolean(entry.locked) }));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ year: yearName, term: termName, entries: payload }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `mukuyu-timetable-${yearName}-${termName}.json`.replace(/[^a-zA-Z0-9._-]+/g, "_"); link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); flash("Filtered timetable JSON downloaded.");
  }

  async function copyNextLesson() {
    if (!nextLesson?.period) { flash("There is no lesson found for today.", true); return; }
    const entry = nextLesson.entry;
    const text = `${DAYS[entry.dayOfWeek - 1]} · ${nextLesson.period.label} ${nextLesson.period.startTime}–${nextLesson.period.endTime} · ${ws.subjects.find((subject) => subject.id === entry.subjectId)?.name ?? "Lesson"} · ${entry.room || "Room to confirm"}`;
    try { await navigator.clipboard.writeText(text); flash("Next lesson copied."); } catch { flash("Copy is unavailable in this browser.", true); }
  }

  async function emailPdf() {
    const effectiveRecipients = recipientMode === "all" ? teacherOptions.map((teacher) => teacher.id) : recipientMode === "single" ? recipientIds.slice(0, 1) : recipientIds;
    if (!effectiveRecipients.length) { flash(recipientMode === "single" ? "Choose one teacher email recipient." : "Select at least one teacher email recipient.", true); return; }
    setBusy(true);
    try {
      let sent = 0;
      let failed = 0;
      const failures: string[] = [];
      for (const recipientId of effectiveRecipients) {
        const personalEntries = allEntries.filter((entry) => entry.teacherUserId === recipientId);
        const recipient = teacherOptions.find((teacher) => teacher.id === recipientId);
        if (!personalEntries.length) { failed++; failures.push(`${recipient?.fullName ?? "Teacher"}: no timetable lessons found.`); continue; }
        const taughtClasses = new Set<string>();
        for (const entry of personalEntries) {
          if (entry.streamId) taughtClasses.add(`${entry.gradeId}|${entry.streamId}`);
          else for (const stream of ws.streams.filter((item) => item.gradeId === entry.gradeId)) taughtClasses.add(`${entry.gradeId}|${stream.id}`);
        }
        const classEntries = allEntries.filter((entry) => [...taughtClasses].some((key) => {
          const [grade, stream] = key.split("|");
          return entry.gradeId === grade && (entry.streamId === stream || entry.streamId == null);
        }));
        const pdfBase64 = await timetablePdfBase64({ ...pdfOptions, groupMode: "teacher", entries: personalEntries });
        const classPdfBase64 = classEntries.length ? await timetablePdfBase64({ ...pdfOptions, groupMode: "class", entries: classEntries }) : "";
        const result = await emailPersonalTimetable({ data: { yearId, termId, recipientId, pdfBase64, classPdfBase64, fileName: `mukuyu-teacher-timetable-${recipient?.fullName ?? recipientId}-${yearName}-${termName}.pdf`.replace(/\s+/g, "-") } });
        sent += result.sent;
        failed += result.failed;
        if (result.failure) failures.push(`${recipient?.fullName ?? "Teacher"}: ${result.failure}`);
      }
      flash(failed ? `${sent} personal timetable email(s) sent; ${failed} failed. ${failures[0] || ""}` : `${sent} personal timetable PDF email(s) sent successfully.`);
    } catch (error) { flash(errText(error), true); } finally { setBusy(false); }
  }

  async function movePeriod(index: number, direction: -1 | 1) {
    const next = [...periods];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setBusy(true);
    try { await reorderTimetablePeriods({ data: { yearId, termId, orderedIds: next.map((period) => period.id) } }); await refresh(); }
    catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }

  function changeYear(nextYearId: string) {
    setYearId(nextYearId);
    setGradeFilter("");
    setStreamFilter("");
    setEntryDraft((current) => ({ ...current, periodId: ws.timetablePeriods.find((period) => period.yearId === nextYearId && period.termId === termId)?.id ?? "" }));
  }

  function changeTerm(nextTermId: string) {
    setTermId(nextTermId);
    setGradeFilter("");
    setStreamFilter("");
    setEntryDraft((current) => ({ ...current, periodId: ws.timetablePeriods.find((period) => period.yearId === yearId && period.termId === nextTermId)?.id ?? "" }));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">Academic operations</p>
          <h1 className="font-serif text-3xl text-navy">Timetable</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{isTeacher ? "Your published personal timetable opens first. Switch to Class timetable to view the full published schedules for classes assigned to you, then download either view." : "Build a clean weekly master timetable by year, term, class, subject, teacher, room, and period. Conflicts are stopped before they are saved."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={inputClass} value={yearId} onChange={(event) => changeYear(event.target.value)} aria-label="Timetable academic year">{ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
          <select className={inputClass} value={termId} onChange={(event) => changeTerm(event.target.value)} aria-label="Timetable term">{ws.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select>
        </div>
      </header>
      {manager ? <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <div>
          <strong className="text-navy">Automatic generation</strong>
          <p className="mt-0.5 text-xs text-muted">Create a draft timetable from your weekly requirements, subject constraints, and availability rules.</p>
        </div>
        <button className={btnClass} type="button" disabled={busy || timetablePublished} onClick={async () => {
          if (!confirm("Generate a new timetable draft? Current lessons will be replaced (a version snapshot is saved first).")) return;
          setBusy(true);
          try {
            const result = await generateTimetable({ data: { yearId, termId } });
            const missed = result.unplaced?.length ? ` ${result.unplacedPeriods ?? 0} required period(s) remain unplaced. ${result.unplaced[0]}` : " All required weekly periods were placed.";
            flash(`Timetable draft generated (${result.entries} blocks; ${result.placedPeriods ?? 0}/${result.requiredPeriods ?? 0} required periods covered).${missed}`);
            await refresh();
          } catch (error) { flash(errText(error), true); }
          finally { setBusy(false); }
        }}>Generate Timetable</button>
      </div> : null}

      <section className="timetable-command-strip rounded-2xl border border-line bg-card p-4 shadow-card" aria-labelledby="timetable-tools-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Timetable command strip</p><h2 id="timetable-tools-title" className="font-serif text-2xl text-navy">See the week at a glance</h2><p className="mt-1 text-sm text-muted">Use quick filters and device-saved views without changing the official schedule.</p></div><span className="rounded-full bg-paper px-3 py-2 text-xs font-semibold text-muted">Press <kbd className="rounded border border-line bg-card px-1.5 py-0.5">/</kbd> to search</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-line bg-paper p-3"><p className="text-xs text-muted">Filtered periods covered</p><p className="font-serif text-2xl text-navy">{visiblePeriodCount}</p><p className="text-xs text-muted">in {visibleEntries.length} block(s), across {allEntries.length} total</p></div><div className="rounded-xl border border-line bg-paper p-3"><p className="text-xs text-muted">Busiest day</p><p className="font-serif text-2xl text-navy">{busiestDay?.count ? busiestDay.day : "—"}</p><p className="text-xs text-muted">{busiestDay?.count ?? 0} covered periods</p></div><div className="rounded-xl border border-line bg-paper p-3"><p className="text-xs text-muted">Rooms in use</p><p className="font-serif text-2xl text-navy">{roomUsage}</p><p className="text-xs text-muted">unique rooms in view</p></div><div className="rounded-xl border border-line bg-paper p-3"><p className="text-xs text-muted">Today</p><p className="font-serif text-2xl text-navy">{DAYS[todayTimetableDay - 1]}</p><p className="text-xs text-muted">{allEntries.filter((entry) => entry.dayOfWeek === todayTimetableDay).reduce((sum, entry) => sum + coveredPeriodCount(entry), 0)} covered periods</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{isTeacher ? <><button className={btnGhost} type="button" onClick={showMyTimetable}>My timetable</button><button className={btnGhost} type="button" onClick={showClassTimetable}>Class timetable</button></> : null}<button className={btnGhost} type="button" onClick={() => setDayFilter(todayTimetableDay)}>Show today</button><button className={btnGhost} type="button" onClick={() => setDayFilter(0)}>Show full week</button><button className={btnGhost} type="button" onClick={saveViewPreset}>{presetSaved ? "Saved view ✓" : "Save view"}</button><button className={btnGhost} type="button" onClick={loadViewPreset}>Restore view</button><button className={btnGhost} type="button" onClick={downloadJson}>Download JSON</button><button className={btnGhost} type="button" onClick={() => window.print()}>Print view</button><button className={btnGhost} type="button" onClick={clearFilters}>Clear filters</button></div>
        {nextLesson?.period ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/20 bg-info/5 p-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-info">Next lesson today</p><p className="font-semibold text-navy">{nextLesson.period.label} · {ws.subjects.find((subject) => subject.id === nextLesson.entry.subjectId)?.name ?? "Lesson"}</p><p className="text-xs text-muted">{nextLesson.period.startTime}–{nextLesson.period.endTime} · {nextLesson.entry.room || "Room to confirm"} · {nextLesson.entry.teacherName}</p></div><button className={btnGhost} type="button" onClick={() => void copyNextLesson()}>Copy next lesson</button></div> : null}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-serif text-xl text-navy">Weekly master timetable</h2><p className="text-sm text-muted">{visibleEntries.length} scheduled block(s) covering {visiblePeriodCount} period(s) · {yearName} · {termName}</p></div>
          <div className="flex flex-wrap gap-2">{manager ? <button className="rounded-md border border-bad bg-card px-4 py-2 text-sm font-semibold text-bad disabled:opacity-50" type="button" disabled={busy || timetablePublished || allEntries.length === 0} title={timetablePublished ? "Unpublish this timetable before clearing lessons." : "Clear lesson entries only; keep weekdays, bell periods and times."} onClick={async () => {
            if (!confirm(`Clear all ${allEntries.length} scheduled lesson block(s) for ${yearName} · ${termName}? This removes the scheduled subject/class/teacher entries, including pinned lessons. Weekdays, bell periods, labels, start/end times, weekly requirements, and Staff assignments stay. A recovery version is saved first.`)) return;
            setBusy(true);
            try {
              const result = await clearTimetableEntries({ data: { yearId, termId } });
              setEntryDraft((current) => ({ ...current, id: undefined, locked: false }));
              flash(`${result.cleared} scheduled lesson block(s) cleared. Weekdays and bell times were kept; a recovery version was saved.`);
              await refresh();
            } catch (error) { flash(errText(error), true); }
            finally { setBusy(false); }
          }}>Clear lessons (keep bell times)</button> : null}<button className={btnGhost} type="button" onClick={downloadPdf}>Download {pdfMode === "class" ? "class sheets" : pdfMode === "teacher" ? "teacher sheets" : "whole-school summary"} PDF</button><button className={btnGhost} type="button" onClick={downloadCsv}>Export filtered timetable CSV</button>{manager ? <button className={btnClass} type="button" disabled={busy} onClick={emailPdf}>Email teacher PDFs + class schedules</button> : null}</div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          <select className={inputClass} value={viewMode} onChange={(event) => { const mode = event.target.value; setViewMode(mode); if (mode === "class") { setTeacherFilter(""); setRoomFilter(""); } else if (mode === "teacher") { setGradeFilter(""); setStreamFilter(""); setRoomFilter(""); setTeacherFilter(["teacher"].includes(ws.me.role) ? ws.me.id : ""); } else if (mode === "room") { setGradeFilter(""); setStreamFilter(""); setTeacherFilter(""); } else { setGradeFilter(""); setStreamFilter(""); setTeacherFilter(""); setRoomFilter(""); } }} aria-label="Timetable view"><option value="master">Master view</option><option value="class">Class view</option><option value="teacher">Teacher view</option><option value="room">Room view</option><option value="subject">Subject view</option></select>
          <select className={inputClass} value={pdfMode} onChange={(event) => setPdfMode(event.target.value as "class" | "teacher" | "summary")} aria-label="PDF timetable format"><option value="class">PDF: one sheet per class</option><option value="teacher">PDF: one sheet per teacher</option><option value="summary">PDF: whole-school daily summary</option></select>
          <select className={inputClass} value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setStreamFilter(""); }} aria-label="Filter timetable by grade"><option value="">All grades</option>{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select>
          <select className={inputClass} value={streamFilter} onChange={(event) => setStreamFilter(event.target.value)} aria-label="Filter timetable by stream"><option value="">All streams</option>{filterStreams.map((stream) => <option key={stream.id} value={stream.id}>{ws.grades.find((grade) => grade.id === stream.gradeId)?.name} · {stream.name}</option>)}</select>
          <select className={inputClass} value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} aria-label="Filter timetable by teacher"><option value="">All teachers</option>{teacherOptions.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select>
          <select className={inputClass} value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} aria-label="Filter timetable by room"><option value="">All rooms</option>{roomOptions.map((room) => <option key={room} value={room}>{room}</option>)}</select>
          <select className={inputClass} value={dayFilter} onChange={(event) => setDayFilter(Number(event.target.value))} aria-label="Filter timetable by day"><option value={0}>All days</option>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select>
          <select className={inputClass} value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter timetable by subject"><option value="">All subjects</option>{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
          <input data-timetable-search className={inputClass} value={lessonSearch} onChange={(event) => setLessonSearch(event.target.value)} placeholder="Search lesson, teacher, room…" aria-label="Search timetable" />
          <label className="flex items-center gap-2 rounded-md border border-line bg-card px-3 text-xs font-semibold text-navy"><input type="checkbox" checked={showBreaks} onChange={(event) => setShowBreaks(event.target.checked)} />Show breaks</label>
          <label className="flex items-center gap-2 rounded-md border border-line bg-card px-3 text-xs font-semibold text-navy"><input type="checkbox" checked={compactGrid} onChange={(event) => setCompactGrid(event.target.checked)} />Compact grid</label>
        </div>
        <div className={`mt-4 overflow-x-auto ${compactGrid ? "timetable-grid-compact" : ""}`}>
          <ClassSheets ws={ws} periods={sheetPeriods} entries={visibleEntries} viewMode={viewMode} yearName={yearName} termName={termName} gradeFilter={gradeFilter} streamFilter={streamFilter} teacherFilter={teacherFilter} roomFilter={roomFilter} editable={manager && !timetablePublished} onCell={(day, periodId, entry) => {
            if (entry) setEntryDraft({ id: entry.id, dayOfWeek: entry.dayOfWeek, periodId: entry.periodId, gradeId: entry.gradeId, streamId: entry.streamId ?? "", subjectId: entry.subjectId, teacherUserId: entry.teacherUserId, room: entry.room, notes: entry.notes, blockLength: entry.blockLength || 1, locked: Boolean(entry.locked) });
            else setEntryDraft((current) => ({ ...current, id: undefined, dayOfWeek: day, periodId, locked: false }));
          }} />
        </div>
      </section>

      {manager ? <>
        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <form className="rounded-2xl border border-line bg-card p-4 shadow-card" onSubmit={savePeriod}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Step 1</p><h2 className="mt-1 font-serif text-xl text-navy">Bell periods</h2><p className="mt-1 text-sm text-muted">Breaks are their own columns, not lessons. Tick the box for first break, second break, or lunch.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3"><input className={inputClass} value={periodDraft.label} onChange={(event) => setPeriodDraft({ ...periodDraft, label: event.target.value })} placeholder="Lesson 1" required /><input className={inputClass} type="time" value={periodDraft.startTime} onChange={(event) => setPeriodDraft({ ...periodDraft, startTime: event.target.value })} required /><input className={inputClass} type="time" value={periodDraft.endTime} onChange={(event) => setPeriodDraft({ ...periodDraft, endTime: event.target.value })} required /></div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={periodDraft.isBreak} onChange={(event) => setPeriodDraft({ ...periodDraft, isBreak: event.target.checked })}/>This column is a break or lunch, not a lesson</label>
            <div className="mt-3 flex flex-wrap gap-2"><button className={btnClass} type="submit" disabled={busy || timetablePublished}>{periodDraft.id ? "Save period changes" : "Add column"}</button><button className={btnGhost} type="button" disabled={busy || timetablePublished} onClick={async () => { if (!confirm("Replace this bell with lessons 1–8, first break, second break, and lunch?")) return; setBusy(true); try { await applyMukuyuBell({ data: { yearId, termId } }); flash("Mukuyu bell applied."); await refresh(); } catch (error) { flash(errText(error), true); } finally { setBusy(false); } }}>Use Mukuyu Term 2 bell</button>{periodDraft.id ? <button className={btnGhost} type="button" onClick={() => setPeriodDraft({ label: `Lesson ${periods.length + 1}`, startTime: "08:00", endTime: "08:40", isBreak: false, id: "" })}>Cancel edit</button> : null}</div>
            <ul className="mt-4 space-y-1 text-sm">{periods.map((period, index) => <li key={period.id} className="flex justify-between gap-2 rounded-lg bg-paper px-3 py-2"><span>{period.isBreak ? "Break" : "Lesson"} · {period.label}</span><span className="flex items-center gap-2"><span className="text-muted">{period.startTime}–{period.endTime}</span><button type="button" className="font-semibold text-info" disabled={timetablePublished || index === 0} onClick={() => movePeriod(index, -1)}>Up</button><button type="button" className="font-semibold text-info" disabled={timetablePublished || index === periods.length - 1} onClick={() => movePeriod(index, 1)}>Down</button><button type="button" className="font-semibold text-info" disabled={timetablePublished} onClick={() => setPeriodDraft({ id: period.id, label: period.label, startTime: period.startTime, endTime: period.endTime, isBreak: period.isBreak })}>Edit</button><button type="button" className="font-semibold text-bad" disabled={timetablePublished} onClick={async () => { if (!confirm(`Delete ${period.label}?`)) return; try { await deleteTimetablePeriod({ data: { id: period.id } }); flash("Period removed."); await refresh(); } catch (error) { flash(errText(error), true); } }}>Delete</button></span></li>)}</ul>
          </form>
          <form className="rounded-2xl border border-line bg-card p-4 shadow-card" onSubmit={saveEntry}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Step 2</p><h2 className="mt-1 font-serif text-xl text-navy">{entryDraft.id ? "Edit / move a lesson" : "Add a lesson"}</h2><p className="mt-1 text-sm text-muted">A teacher, class, or room cannot be double-booked. Linked blocks cannot cross breaks.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><select className={inputClass} value={entryDraft.dayOfWeek} onChange={(event) => setEntryDraft({ ...entryDraft, dayOfWeek: Number(event.target.value) })}>{DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select><select className={inputClass} value={entryDraft.periodId} onChange={(event) => setEntryDraft({ ...entryDraft, periodId: event.target.value })}><option value="">Choose period</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.label} · {period.startTime}–{period.endTime}</option>)}</select><select className={inputClass} value={entryDraft.gradeId} onChange={(event) => setEntryDraft({ ...entryDraft, gradeId: event.target.value, streamId: "" })}>{ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select><select className={inputClass} value={entryDraft.streamId} onChange={(event) => setEntryDraft({ ...entryDraft, streamId: event.target.value })}><option value="">All streams / grade-wide</option>{entryStreams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select><select className={inputClass} value={entryDraft.subjectId} onChange={(event) => setEntryDraft({ ...entryDraft, subjectId: event.target.value })}>{ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><select className={inputClass} value={entryDraft.teacherUserId} onChange={(event) => setEntryDraft({ ...entryDraft, teacherUserId: event.target.value })}>{teacherOptions.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName} · {teacher.role === "admin" && teacher.isDeputy ? "Deputy" : teacher.role}</option>)}</select><input className={inputClass} value={entryDraft.room} onChange={(event) => setEntryDraft({ ...entryDraft, room: event.target.value })} placeholder="Room (optional)" /><input className={inputClass} value={entryDraft.notes} onChange={(event) => setEntryDraft({ ...entryDraft, notes: event.target.value })} placeholder="Notes (optional)" /></div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-sm">Linked periods<select className={inputClass + " ml-2"} value={entryDraft.blockLength} onChange={(event) => setEntryDraft({ ...entryDraft, blockLength: Number(event.target.value) })}><option value={1}>1 · Single</option><option value={2}>2 · Double</option><option value={3}>3 · Triple</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(entryDraft.locked)} onChange={(event) => setEntryDraft({ ...entryDraft, locked: event.target.checked })} />Pin so generation will not move it</label><button className={btnClass} type="submit" disabled={busy || timetablePublished || !periods.length}>{entryDraft.id ? "Save lesson changes" : "Save lesson"}</button>{entryDraft.id ? <button className={btnGhost} type="button" onClick={() => setEntryDraft({ ...entryDraft, id: undefined, locked: false })}>Cancel edit</button> : null}</div>
          </form>
        </section>
        <TimetableOperations ws={ws} refresh={refresh} flash={flash} yearId={yearId} termId={termId} periods={periods} />
        <TimetableAdvancedStudio ws={ws} refresh={refresh} yearId={yearId} termId={termId} flash={flash} />
        <section className="rounded-2xl border border-line bg-card p-4 shadow-card"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Step 3</p><h2 className="mt-1 font-serif text-xl text-navy">Email timetable PDFs</h2><p className="mt-1 text-sm text-muted">The attachment uses the same landscape timetable grid as the website view: periods across, weekdays down, breaks highlighted, rooms and class details included. Choose all teachers, selected teachers, or one specific teacher.</p></div><div className="flex gap-2"><button className={btnGhost} type="button" onClick={() => setRecipientIds(teacherOptions.map((teacher) => teacher.id))}>Select all</button><button className={btnGhost} type="button" onClick={() => setRecipientIds([])}>Clear</button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><select className={inputClass} value={recipientMode} onChange={(event) => setRecipientMode(event.target.value as typeof recipientMode)} aria-label="Teacher timetable email recipient mode"><option value="all">All teachers</option><option value="selected">Selected teachers</option><option value="single">One specific teacher</option></select><p className="rounded-lg border border-line bg-paper p-2 text-xs text-muted">{recipientMode === "all" ? "Every active teaching staff member receives their own timetable." : recipientMode === "single" ? "Choose one teacher below." : "Choose any number of teachers below."}</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{teacherOptions.map((teacher) => <label key={teacher.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm"><input type={recipientMode === "single" ? "radio" : "checkbox"} name="timetable-recipient" checked={recipientIds.includes(teacher.id)} onChange={(event) => setRecipientIds(recipientMode === "single" ? [teacher.id] : event.target.checked ? [...recipientIds, teacher.id] : recipientIds.filter((id) => id !== teacher.id))} /><span><strong>{teacher.fullName}</strong><span className="block text-xs text-muted">{teacher.email}</span></span></label>)}</div></section>
      </> : <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><strong>Published timetable</strong><p className="mt-1">This schedule is read-only for your account. Ask the super admin to enable admin timetable editing, or ask an authorized timetable manager to add or correct a lesson.</p></section>}
    </div>
  );
}

function ClassSheets({ ws, periods, entries, viewMode, yearName, termName, gradeFilter, streamFilter, teacherFilter, roomFilter, editable, onCell }: { ws: Gate["ws"]; periods: TimetablePeriod[]; entries: TimetableEntry[]; viewMode: string; yearName: string; termName: string; gradeFilter: string; streamFilter: string; teacherFilter: string; roomFilter: string; editable: boolean; onCell: (day: number, periodId: string, entry: TimetableEntry | null) => void }) {
  if (!periods.length) return <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{ws.me.role === "teacher" ? "No published timetable is available for this year and term yet. Ask an authorized timetable manager to publish it." : "No bell yet. Add lesson and break columns below, or use the Mukuyu Term 2 bell."}</p>;
  const streams = ws.streams.filter((stream) => (!gradeFilter || stream.gradeId === gradeFilter) && (!streamFilter || stream.id === streamFilter));
  const sheets = viewMode === "teacher"
    ? [...new Set(entries.map((entry) => entry.teacherUserId))].map((teacherId) => ({ key: teacherId, title: `TEACHER · ${entries.find((entry) => entry.teacherUserId === teacherId)?.teacherName ?? "Teacher"}`, subtitle: `${termName} ${yearName}`, mode: "teacher" as const, rows: entries.filter((entry) => entry.teacherUserId === teacherId) }))
    : viewMode === "room"
      ? [...new Set(entries.map((entry) => entry.room).filter(Boolean))].map((room) => ({ key: room, title: `ROOM · ${room}`, subtitle: `${termName} ${yearName}`, mode: "room" as const, rows: entries.filter((entry) => entry.room === room) }))
      : viewMode === "subject"
        ? ws.subjects.filter((subject) => entries.some((entry) => entry.subjectId === subject.id)).map((subject) => ({ key: subject.id, title: subject.name, subtitle: `${termName} ${yearName}`, mode: "subject" as const, rows: entries.filter((entry) => entry.subjectId === subject.id) }))
        : (streams.length ? streams : [{ id: "all", gradeId: gradeFilter || ws.grades[0]?.id || "", name: "", classTeacherLabel: "", sort: 0 }]).map((stream) => {
            const grade = ws.grades.find((item) => item.id === stream.gradeId);
            const rows = entries.filter((entry) => entry.gradeId === stream.gradeId && (stream.id === "all" || entry.streamId === stream.id || entry.streamId == null));
            return { key: stream.id, title: `${termName.toUpperCase()} ${yearName} ${classCode(grade, stream.id === "all" ? undefined : stream)}`, subtitle: stream.classTeacherLabel ? `Class teacher: ${stream.classTeacherLabel}` : "Class timetable", mode: "class" as const, rows };
          });
  const visible = sheets.filter((sheet) => viewMode === "class" ? ws.me.role !== "teacher" || sheet.rows.length > 0 : sheet.rows.length || roomFilter || teacherFilter);
  if (!visible.length) return <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Nothing is scheduled for this filter yet.</p>;
  return <div className="space-y-6">{visible.map((sheet) => <AscTimetableSheet key={sheet.key} schoolName={ws.profile.name} title={sheet.title} subtitle={sheet.subtitle} periods={periods} entries={sheet.rows} subjects={ws.subjects} staff={ws.staff} grades={ws.grades} streams={ws.streams} mode={sheet.mode} editable={editable && sheet.mode === "class"} onCell={onCell} />)}</div>;
}
