import { useEffect, useMemo, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import { bandFor, buildBoards, canEditMark, canEnterMark, learnersForYear, markControlFor } from "@/lib/school/model";
import { approveMarksPeriod, clearBulkResults, importMarksExcel, saveMarks, saveSubjectRemarks } from "@/lib/school/api";
import { parseMarkSpreadsheet, marksFromDelimited, type MarkSheetRow } from "@/lib/school/sheet";
import { resolveSubjectHeader } from "@/lib/school/subject-header";

function parseEnteredScore(raw: string, denominator = 100): number | null {
  const value = raw.trim();
  if (!value) return null;
  const fraction = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const obtained = Number(fraction[1]);
    const maximum = Number(fraction[2]);
    if (!Number.isFinite(obtained) || !Number.isFinite(maximum) || maximum <= 0 || obtained < 0 || obtained > maximum) return Number.NaN;
    return Math.round((obtained / maximum) * 100);
  }
  const score = Number(value);
  if (!Number.isFinite(score)) return Number.NaN;
  if (score < 0 || score > denominator) return Number.NaN;
  return Math.round((score / denominator) * 100);
}

export function MarksView({ ws, refresh, flash }: Gate) {
  const [, refreshDeadlineClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refreshDeadlineClock((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const subjects = [...ws.subjects].sort((a, b) => a.sort - b.sort);
  const exams = [...ws.exams].sort((a, b) => a.sort - b.sort);
  const period = useSchoolPeriod(ws);
  const [gradeId, setGradeId] = useState(ws.grades[0]?.id ?? "");
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  const [streamId, setStreamId] = useState(streams[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const [subjectMaximums, setSubjectMaximums] = useState<Record<string, string>>({});
  const subjectMaximum = Math.max(1, Number(subjectMaximums[subjectId] || 100) || 100);
  const learners = useMemo(
    () => learnersForYear(ws, period.yearId).filter((learner) => learner.gradeId === gradeId && (!streamId || learner.streamId === streamId)).sort((a, b) => a.roll - b.roll),
    [ws, period.yearId, gradeId, streamId],
  );
  // Locks set by the super admin or a deputy for this year, term and CAT. They never block the people who set them.
  const control = markControlFor(ws, period.yearId, period.termId, examId);
  const exempt = ws.me.role === "super_admin" || ws.me.isDeputy;
  const deadlinePassed = Boolean(control.deadlineAt && new Date(control.deadlineAt).getTime() <= Date.now());
  const entryLocked = !control.entryAllowed || deadlinePassed;
  const editLocked = !control.editAllowed || deadlinePassed;
  const lockText = (exempt ? "" : [entryLocked ? "new marks are locked" : "", editLocked ? "saved marks are locked against changes" : ""].filter(Boolean).join(" and "));
  const cellLocked = (learnerId: string) => {
    if (exempt) return false;
    const saved = period.marks.some((mark) => mark.learnerId === learnerId && mark.subjectId === subjectId && mark.examId === examId);
    const learner = learners.find((row) => row.id === learnerId);
    return !learner || !canEnterMark(ws.me, ws.assignments, learner, subjectId, control, saved ? editLocked : entryLocked);
  };
  const [scores, setScores] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [uploadRows, setUploadRows] = useState<MarkSheetRow[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const uploadSubjects = useMemo(() => [...new Set(uploadRows.flatMap((row) => Object.keys(row.scores)))].map((header) => ({ header, subject: resolveSubjectHeader(header, subjects) })), [uploadRows, subjects]);
  const uploadColumns = uploadRows.length ? [...new Set(uploadRows.flatMap((row) => Object.keys(row.scores)))] : subjects.map((subject) => subject.name);
  function setUploadCell(rowIndex: number, columnIndex: number, raw: string) {
    const next = [...uploadRows];
    while (next.length <= rowIndex) next.push({ admissionNumber: "", fullName: "", scores: Object.fromEntries(uploadColumns.map((name) => [name, null])) });
    const row = { ...next[rowIndex], scores: { ...next[rowIndex].scores } };
    if (columnIndex === 0) row.admissionNumber = raw;
    else if (columnIndex === 1) row.fullName = raw;
    else {
      const header = uploadColumns[columnIndex - 2];
      const value = raw.trim();
      if (!value) row.scores[header] = null;
      else {
        const fraction = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        row.scores[header] = fraction
          ? Number(fraction[2]) > 0 ? Math.round((Number(fraction[1]) / Number(fraction[2])) * 10000) / 100 : Number.NaN
          : Number(value);
      }
    }
    next[rowIndex] = row;
    setUploadRows(next);
    setUploadErrors([]);
  }
  function renameUploadHeader(oldName: string, nextName: string) {
    const label = nextName.trim();
    if (!label || label === oldName) return;
    setUploadRows((rows) => rows.map((row) => {
      const scores = { ...row.scores };
      if (Object.hasOwn(scores, oldName)) { scores[label] = scores[oldName]; delete scores[oldName]; }
      return { ...row, scores };
    }));
  }
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const learner of learners) {
      const mark = period.marks.find((item) => item.learnerId === learner.id && item.subjectId === subjectId && item.examId === examId);
      next[learner.id] = mark ? String(mark.score) : "";
    }
    setScores(next);
  }, [learners, period.marks, subjectId, examId]);
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const learner of learners) {
      const row = ws.subjectRemarks.find((item) => item.learnerId === learner.id && item.subjectId === subjectId && item.yearId === period.yearId && item.termId === period.termId);
      next[learner.id] = row?.remark ?? "";
    }
    setRemarks(next);
  }, [learners, ws.subjectRemarks, subjectId, period.yearId, period.termId]);

  const editable = learners.some((learner) => canEnterMark(ws.me, ws.assignments, learner, subjectId, control, false) || canEnterMark(ws.me, ws.assignments, learner, subjectId, control, true));
  const filled = learners.filter((learner) => (scores[learner.id] ?? "").trim() !== "").length;
  const progress = learners.length ? Math.round((filled / learners.length) * 100) : 0;

  function fillFromPrevious() {
    const ordered = [...exams].sort((a, b) => a.sort - b.sort);
    const index = ordered.findIndex((exam) => exam.id === examId);
    const previous = index > 0 ? ordered[index - 1] : null;
    if (!previous) { flash("There is no earlier CAT to copy from.", true); return; }
    const next = { ...scores };
    let copied = 0;
    for (const learner of learners) {
      if (!canEditMark(ws.me, ws.assignments, learner, subjectId) || cellLocked(learner.id)) continue;
      if ((next[learner.id] ?? "").trim() !== "") continue;
      const mark = period.marks.find((item) => item.learnerId === learner.id && item.subjectId === subjectId && item.examId === previous.id);
      if (mark == null) continue;
      next[learner.id] = String(mark.score);
      copied += 1;
    }
    setScores(next);
    flash(copied ? `Filled ${copied} blank score${copied === 1 ? "" : "s"} from ${previous.name}. Save this subject to keep them.` : `No blank scores had a ${previous.name} mark to copy.`);
  }

  function downloadCsv() {
    const subject = subjects.find((item) => item.id === subjectId);
    const exam = exams.find((item) => item.id === examId);
    const lines = [["Admission number", "Learner", "Roll", subject?.name ?? "Score", "Level"].join(",")];
    for (const learner of learners) {
      const raw = scores[learner.id] ?? "";
      const numeric = raw.trim() === "" ? null : Number(raw);
      const band = numeric != null && !Number.isNaN(numeric) ? bandFor(numeric, ws.bands) : null;
      lines.push([csvCell(learner.admissionNumber), csvCell(learner.fullName), String(learner.roll), csvCell(raw), csvCell(band?.code ?? "")].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${subject?.shortName ?? "marks"}-${exam?.code ?? "cat"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function save() {
    try {
      const parsedScores = learners.map((learner) => ({ learner, score: parseEnteredScore(scores[learner.id] ?? "", subjectMaximum) }));
      const invalid = parsedScores.find(({ score }) => score != null && (!Number.isFinite(score) || score < 0 || score > 100));
      if (invalid) {
        flash(`Invalid score for ${invalid.learner.fullName}. Enter a mark from 0 to ${subjectMaximum}, or use obtained/maximum such as 30/70.`, true);
        return;
      }
      await saveMarks({
        data: {
          subjectId,
          examId,
          yearId: period.yearId,
          termId: period.termId,
          rows: parsedScores.filter(({ learner }) => canEditMark(ws.me, ws.assignments, learner, subjectId) && !cellLocked(learner.id)).map(({ learner, score }) => ({
            learnerId: learner.id,
            score,
          })),
        },
      });
      flash("Learner\x27s results saved.");
      await refresh();
    } catch (error) {
      flash(errText(error), true);
    }
  }

  const boards = buildBoards(learners, period.marks, subjects, exams, ws.bands);
  const lockBanner = lockText || control.deadlineAt ? <p className="rounded-md border border-amber-300 bg-card px-3 py-2 text-sm">{deadlinePassed ? `Deadline passed (${new Date(control.deadlineAt!).toLocaleString()}); marks are automatically locked. ` : control.deadlineAt ? `Entry deadline: ${new Date(control.deadlineAt).toLocaleString()}. ` : ""}{lockText ? `Locked for this year, term and CAT: ${lockText}.` : exempt && deadlinePassed ? "Super Admin and deputies retain override access." : "Entry and editing are currently open."}{control.reason ? ` ${control.reason}` : ""}{deadlinePassed && !exempt ? " Contact the Super Admin or a Deputy Super Admin for an authorized override." : ""}</p> : null;
  const configuredAssessments = ws.termAssessments.filter((item) => item.yearId === period.yearId && item.termId === period.termId);
  const requiredExams = configuredAssessments.length ? exams.filter((exam) => configuredAssessments.some((item) => item.examId === exam.id && item.active)) : exams;
  const missingMarkRows = learners.flatMap((learner) => subjects.flatMap((subject) => requiredExams.filter((exam) => !period.marks.some((mark) => mark.learnerId === learner.id && mark.subjectId === subject.id && mark.examId === exam.id && (!mark.gradeId || mark.gradeId === gradeId))).map((exam) => ({ learner, subject, exam }))));
  const missingTeacherRows = ws.assignments
    .filter((assignment) => assignment.subjectId && (!assignment.gradeId || assignment.gradeId === gradeId) && (!assignment.streamId || assignment.streamId === streamId))
    .filter((assignment) => !learners.some((learner) => requiredExams.some((exam) => period.marks.some((mark) =>
      mark.learnerId === learner.id && mark.subjectId === assignment.subjectId && mark.examId === exam.id && (!mark.gradeId || mark.gradeId === gradeId)
    ))))
    .map((assignment) => ({ assignment, teacher: ws.staff.find((staff) => staff.id === assignment.userId)?.fullName ?? (assignment.userId === ws.me.id ? ws.me.fullName : assignment.userId) }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-3xl text-navy">Enter marks</h1>
        <p className="text-sm text-muted">Learners stay in roll order. Choose the year and term. A learner's marks are kept from Grade 7 through Grade 9.</p>
      </header>
      <PeriodBar ws={ws} yearId={period.yearId} termId={period.termId} onYear={period.setYearId} onTerm={period.setTermId} />
      <div className="grid gap-2 sm:grid-cols-4">
        <select className={inputClass} value={gradeId} onChange={(event) => { setGradeId(event.target.value); const next = ws.streams.find((stream) => stream.gradeId === event.target.value); setStreamId(next?.id ?? ""); }}>
          {ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
        </select>
        <select className={inputClass} value={streamId} onChange={(event) => setStreamId(event.target.value)}>
          <option value="">All streams</option>
          {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
        </select>
        <select className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <select className={inputClass} value={examId} onChange={(event) => setExamId(event.target.value)}>
          {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-card p-3">
        <label className="text-sm font-medium" htmlFor="subject-mark-maximum">Marks for {subjects.find((subject) => subject.id === subjectId)?.name ?? "this subject"} are out of:</label>
        <input id="subject-mark-maximum" className={inputClass + " max-w-32"} type="number" min="1" max="1000" step="1" value={subjectMaximums[subjectId] ?? "100"} onChange={(event) => setSubjectMaximums({ ...subjectMaximums, [subjectId]: event.target.value })} />
        <span className="text-xs text-muted">Enter marks normally (e.g. 34 out of 50); the system saves the percentage. You can also enter 34/50 directly.</span>
      </div>
      {!editable ? <p className="text-sm text-warn">You can read this sheet. Saving is limited to your assigned subject, class, or an admin role.</p> : null}
      <p className="rounded-md border border-line bg-card px-3 py-2 text-sm text-muted">Enter a percentage (e.g. 43) or a score as obtained/maximum (e.g. 30/70 or 45/80). Fraction scores are automatically converted to a percentage for grading, analysis and reports when saved.</p>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted"><span>This sheet</span><span>{filled} of {learners.length} entered ({progress}%)</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-card">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2">No.</th><th className="px-3 py-2">Learner</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Level</th></tr>
          </thead>
          <tbody>
            {learners.map((learner, index) => {
              const raw = scores[learner.id] ?? "";
              const numeric = parseEnteredScore(raw);
              const band = numeric != null && Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? bandFor(numeric, ws.bands) : null;
              const allowed = canEditMark(ws.me, ws.assignments, learner, subjectId);
              const mean = boards.find((board) => board.learner.id === learner.id)?.avgMean;
              return (
                <tr key={learner.id} className="border-t border-line">
                  <td className="px-3 py-2">{learner.roll}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{learner.fullName}</span>
                    <span className="ml-2 text-xs text-muted">{ws.streams.find((stream) => stream.id === learner.streamId)?.name} · mean {mean == null ? "—" : mean.toFixed(1)}</span>
                    {(() => { const saved = period.marks.find((mark) => mark.learnerId === learner.id && mark.subjectId === subjectId && mark.examId === examId); return saved ? <span className="block text-[11px] text-muted">Last saved {saved.updatedAt ? new Date(saved.updatedAt).toLocaleString() : "date unavailable"}{saved.updatedByName ? ` by ${saved.updatedByName}` : ""}</span> : null; })()}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="h-11 w-24 rounded-md border border-line px-2"
                      inputMode="numeric"
                      disabled={!allowed || cellLocked(learner.id)}
                      value={raw}
                      onChange={(event) => setScores({ ...scores, [learner.id]: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          const next = document.querySelector<HTMLInputElement>(`[data-mark="${index + 1}"]`);
                          next?.focus();
                        }
                      }}
                      data-mark={index}
                    />
                  </td>
                  <td className="px-3 py-2">{band ? `${band.code} · ${band.subjectRemark}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lockBanner}
      <div className="flex flex-wrap gap-2">
        <button className={btnClass} type="button" onClick={save} disabled={!editable}>Save this subject</button>
        <button className={btnGhost} type="button" onClick={fillFromPrevious} disabled={!editable}>Fill blanks from the previous CAT</button>
        <button className={btnGhost} type="button" onClick={downloadCsv} disabled={!learners.length}>Download this sheet (CSV)</button>
      </div>
      {editable ? <section className="space-y-3 rounded-md border border-line bg-card p-4">
        <h2 className="font-serif text-xl text-navy">Subject remarks for the report card</h2>
        <p className="text-sm text-muted">A remark written here replaces the automatic level remark for this subject, this year and this term — and only when that switch is on in report layout. Clear a remark and save to go back to the automatic one. Initials are not typed here; they come from the subject teacher's saved initials.</p>
        <div className="max-h-72 space-y-2 overflow-auto">
          {learners.map((learner) => {
            const allowed = canEditMark(ws.me, ws.assignments, learner, subjectId);
            return (
              <label key={learner.id} className="grid items-center gap-2 text-sm sm:grid-cols-[14rem_1fr]">
                <span>{learner.fullName}</span>
                <input className={inputClass} maxLength={80} disabled={!allowed} value={remarks[learner.id] ?? ""} onChange={(event) => setRemarks({ ...remarks, [learner.id]: event.target.value })} placeholder="Leave blank to use the automatic remark" />
              </label>
            );
          })}
        </div>
        <button className={btnClass} type="button" onClick={async () => {
          try {
            await saveSubjectRemarks({ data: {
              subjectId, yearId: period.yearId, termId: period.termId,
              rows: learners.filter((learner) => canEditMark(ws.me, ws.assignments, learner, subjectId)).map((learner) => ({ learnerId: learner.id, remark: remarks[learner.id] ?? "" })),
            } });
            flash("Subject remarks saved.");
            await refresh();
          } catch (error) { flash(errText(error), true); }
        }}>Save subject remarks</button>
      </section> : null}
      {(ws.me.role === "super_admin" || ws.me.isDeputy || ws.me.privImport || ws.me.role === "admin") ? <section className="marks-import-panel space-y-3 rounded-2xl border border-line p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-info">Spreadsheet import</p><h2 className="font-serif text-xl text-navy">Paste or upload marks</h2></div><span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-navy">{subjects.length} available subjects</span></div>
        <p className="text-sm text-muted">Paste a complete Excel range directly into any cell below (include its header row). Or upload a workbook, then edit each cell here. Use Admission Number or Learner Name and add one column per subject. Tab moves between cells; arrow keys move up/down. Blank score cells are left unchanged.</p>
        <p className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-sm text-navy">Learner names may contain spelling differences: the system accepts a unique match at 65% similarity or higher. Close or duplicate matches are held for review; use an admission number when a name is uncertain.</p>
        <input className="block text-sm" type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const parsed = await parseMarkSpreadsheet(file); setUploadRows(parsed); setUploadErrors([]); flash(`${parsed.length} learner row(s) read into the editable grid. Review the subject matches before saving.`); }
          catch (error) { flash(errText(error), true); }
        }} />
        <p className="rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-navy">{uploadRows.filter((row) => row.admissionNumber || row.fullName).length} learner rows · {uploadRows.reduce((n, row) => n + Object.values(row.scores).filter((score) => score != null).length, 0)} subject mark cells. Click any cell to edit; subject headings can also be corrected.</p>
        {uploadSubjects.length ? <div className="grid gap-1 rounded-xl border border-line bg-white/75 p-3 text-xs sm:grid-cols-2"><p className="sm:col-span-2 font-semibold text-navy">Subject column check before import</p>{uploadSubjects.map(({ header, subject }) => <p key={header} className={subject ? "text-good" : "font-semibold text-bad"}>{subject ? `✓ ${header} → ${subject.name}` : `Needs review: ${header} does not match one unique subject`}</p>)}</div> : null}
        <div className="marks-grid-scroll max-h-[28rem] overflow-auto rounded-xl border border-line bg-white" onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (!/[\t\n]/.test(text)) return;
          event.preventDefault();
          try { const parsed = marksFromDelimited(text); setUploadRows(parsed); setUploadErrors([]); flash(`${parsed.length} pasted learner row(s) arranged in the grid.`); }
          catch (error) { flash(errText(error), true); }
        }}>
          <table className="marks-preview-table min-w-max border-separate border-spacing-0 text-xs"><thead><tr><th className="sticky left-0 z-20 min-w-36 bg-slate-100 p-2 text-left">Admission</th><th className="sticky left-36 z-20 min-w-48 bg-slate-100 p-2 text-left">Learner name</th>{uploadColumns.map((name) => <th key={name} className="sticky top-0 z-10 min-w-32 bg-slate-100 p-1 text-left"><input className="w-full min-w-28 rounded border border-line bg-white px-2 py-2 font-semibold" aria-label={`Subject heading ${name}`} defaultValue={name} onBlur={(event) => { if (!event.target.value.trim()) event.target.value = name; else renameUploadHeader(name, event.target.value); }} /></th>)}</tr></thead><tbody>{Array.from({ length: Math.max(uploadRows.length, 6) }, (_, index) => {
            const row = uploadRows[index];
            return <tr key={index}><td className="sticky left-0 z-[1] border-t border-line bg-white p-1"><input data-grid-cell={`${index}:0`} aria-label={`Row ${index + 1} admission number`} className="w-36 rounded border border-line px-2 py-2" value={row?.admissionNumber ?? ""} onChange={(event) => setUploadCell(index, 0, event.target.value)} /></td><td className="sticky left-36 z-[1] border-t border-line bg-white p-1"><input data-grid-cell={`${index}:1`} aria-label={`Row ${index + 1} learner name`} className="w-48 rounded border border-line px-2 py-2" value={row?.fullName ?? ""} onChange={(event) => setUploadCell(index, 1, event.target.value)} /></td>{uploadColumns.map((name, columnIndex) => <td key={name} className="border-t border-line p-1"><input data-grid-cell={`${index}:${columnIndex + 2}`} aria-label={`Row ${index + 1} ${name}`} inputMode="decimal" className="w-28 rounded border border-line px-2 py-2 text-right tabular-nums focus:border-sky-500" value={row?.scores[name] == null ? "" : String(row.scores[name])} onChange={(event) => setUploadCell(index, columnIndex + 2, event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); document.querySelector<HTMLInputElement>(`[data-grid-cell="${Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1))}:${columnIndex + 2}"]`)?.focus(); } }} /></td>)}</tr>;
          })}</tbody></table>
        </div>
        <div className="flex flex-wrap gap-2"><button className={btnGhost} type="button" onClick={() => setUploadRows((rows) => [...rows, { admissionNumber: "", fullName: "", scores: Object.fromEntries(uploadColumns.map((name) => [name, null])) }])}>Add learner row</button><button className={btnGhost} type="button" disabled={!uploadRows.length} onClick={() => setUploadRows((rows) => rows.slice(0, -1))}>Remove last row</button><button className={btnGhost} type="button" onClick={() => { setUploadRows([]); setUploadErrors([]); }}>Clear grid</button></div>
        <button className={btnClass} type="button" disabled={!uploadRows.length || uploadBusy} onClick={async () => {
          const flat = uploadRows.flatMap((row) => Object.entries(row.scores).filter(([, score]) => score != null).map(([subject, score]) => ({ admissionNumber: row.admissionNumber, fullName: row.fullName, subject, score: score as number })));
          if (!flat.length) { flash("No numeric subject scores were found.", true); return; }
          if (flat.some(({ score }) => !Number.isFinite(score) || score < 0 || score > 100)) { flash("Correct invalid mark cells first. Enter a score from 0 to 100, or use obtained/maximum such as 30/40.", true); return; }
          if (uploadSubjects.some(({ subject }) => !subject)) { flash("Review the unmatched subject columns above. Only recognized subject headers can be saved.", true); return; }
          setUploadBusy(true);
          try {
            const result = await importMarksExcel({ data: { yearId: period.yearId, termId: period.termId, examId, rows: flat } });
            setUploadErrors(result.errors);
            flash(result.errors.length ? `${result.saved} mark(s) saved; ${result.errors.length} row(s) need attention. See the full error list below.` : `${result.saved} mark(s) saved successfully.` , result.errors.length > 0);
            if (!result.errors.length) setUploadRows([]);
            await refresh();
          } catch (error) { flash(errText(error), true); }
          finally { setUploadBusy(false); }
        }}>{uploadBusy ? "Saving marks…" : "Validate and save uploaded marks"}</button>
        {uploadErrors.length ? <div className="max-h-48 overflow-auto rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900" role="alert"><p className="font-bold">{uploadErrors.length} row(s) were not saved. Correct the learner/subject data and retry; already-saved unchanged marks will not be duplicated.</p><ul className="mt-2 list-inside list-disc space-y-1">{uploadErrors.slice(0, 100).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>{uploadErrors.length > 100 ? <p className="mt-2">Showing the first 100 errors.</p> : null}</div> : null}
      </section> : null}
      {ws.me.role === "super_admin" ? <ClearBulkResultsCard ws={ws} gradeId={gradeId} streamId={streamId} yearId={period.yearId} termId={period.termId} examId={examId} flash={flash} refresh={refresh} /> : null}
      {(ws.me.role === "super_admin" || ws.me.isDeputy || (ws.me.role === "admin" && ws.me.privCalendar)) ? <section className="rounded-md border border-line bg-card p-4 space-y-3"><h2 className="font-serif text-xl text-navy">Approve recorded marks</h2><p className="text-sm text-muted">Approval applies to existing marks for the selected academic year, term and grade/stream. Any later edit or import changes the affected mark back to Recorded so it must be reviewed again.</p><p className="text-sm">Approved marks: {period.marks.filter((mark) => mark.status === "approved" && mark.gradeId === gradeId && (!streamId || mark.streamId === streamId)).length} · Recorded but not approved: {period.marks.filter((mark) => mark.status !== "approved" && mark.gradeId === gradeId && (!streamId || mark.streamId === streamId)).length}</p><button className={btnClass} type="button" onClick={async () => { if (!confirm(`Approve all currently recorded marks for ${ws.grades.find((grade) => grade.id === gradeId)?.name ?? "this grade"}, ${ws.terms.find((term) => term.id === period.termId)?.name ?? "selected term"}?`)) return; try { const result = await approveMarksPeriod({ data: { yearId: period.yearId, termId: period.termId, gradeId, streamId: streamId || undefined } }); flash(`${result.approved} mark(s) approved.`); await refresh(); } catch (error) { flash(errText(error), true); } }}>Approve marks for selected period</button></section> : null}
      <section className="rounded-md border border-line bg-card p-4 space-y-3">
        <h2 className="font-serif text-xl text-navy">Missing marks and teacher follow-up</h2>
        <p className="text-sm text-muted">Checks the selected grade/stream for the selected year and term. Only CATs enabled for that term are counted when a term CAT list has been configured.</p>
        <div className="grid gap-2 sm:grid-cols-3"><div className="rounded bg-paper p-3"><p className="text-xs text-muted">Missing mark cells</p><p className="text-2xl font-semibold">{missingMarkRows.length}</p></div><div className="rounded bg-paper p-3"><p className="text-xs text-muted">Learners affected</p><p className="text-2xl font-semibold">{new Set(missingMarkRows.map((row) => row.learner.id)).size}</p></div><div className="rounded bg-paper p-3"><p className="text-xs text-muted">Teacher assignments with no marks yet</p><p className="text-2xl font-semibold">{missingTeacherRows.length}</p></div></div>
        {missingMarkRows.length ? <div className="max-h-48 overflow-auto text-sm"><p className="font-semibold">First missing marks</p><ul className="mt-1 space-y-1">{missingMarkRows.slice(0, 50).map((row) => <li key={`${row.learner.id}-${row.subject.id}-${row.exam.id}`}>{row.learner.admissionNumber ?? "No admission"} · {row.learner.fullName} · {row.subject.name} · {row.exam.name}</li>)}</ul></div> : <p className="text-sm text-good">No missing mark cells for the selected period and roster.</p>}
        {missingTeacherRows.length ? <div><p className="font-semibold text-sm">Teacher follow-up</p><ul className="mt-1 space-y-1 text-sm">{missingTeacherRows.map(({ assignment, teacher }) => <li key={assignment.id}>{teacher} — {subjects.find((subject) => subject.id === assignment.subjectId)?.name ?? assignment.subjectId} has no marks entered for this roster yet.</li>)}</ul></div> : null}
      </section>
    </div>
  );
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function ClearBulkResultsCard({ ws, gradeId, streamId, yearId, termId, examId, flash, refresh }: {
  ws: Gate["ws"]; gradeId: string; streamId: string; yearId: string; termId: string; examId: string;
  flash: Gate["flash"]; refresh: Gate["refresh"];
}) {
  const [allAssessments, setAllAssessments] = useState(false);
  const [targetYearId, setTargetYearId] = useState(yearId);
  const [targetTermId, setTargetTermId] = useState(termId);
  const [targetExamId, setTargetExamId] = useState(examId);
  useEffect(() => { setTargetYearId(yearId); }, [yearId]);
  useEffect(() => { setTargetTermId(termId); }, [termId]);
  useEffect(() => { setTargetExamId(examId); }, [examId]);
  const grade = ws.grades.find((item) => item.id === gradeId)?.name ?? "selected grade";
  const stream = streamId ? ws.streams.find((item) => item.id === streamId)?.name : null;
  const year = ws.years.find((item) => item.id === targetYearId)?.name ?? "selected year";
  const term = ws.terms.find((item) => item.id === targetTermId)?.name ?? "selected term";
  const exam = !allAssessments ? ws.exams.find((item) => item.id === targetExamId)?.name : null;
  const scope = `${grade}${stream ? ` ${stream}` : " (all streams)"} · ${year} · ${term} · ${exam ?? "all assessments"}`;
  return <section className="space-y-3 rounded-xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-4">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-rose-800">Super admin only · destructive action</p>
    <h2 className="font-serif text-xl text-navy">Clear selected bulk results</h2>
    <p className="text-sm text-muted">Choose the year, term, and CAT to clear. The selected class/stream above also applies. The portal creates a complete safety snapshot before marks are removed; download and securely store a separate backup first.</p>
    <div className="grid gap-2 sm:grid-cols-3" aria-label="Bulk result deletion scope">
      <label className="space-y-1 text-xs font-semibold text-muted">Academic year<select className={inputClass} value={targetYearId} onChange={(event) => setTargetYearId(event.target.value)}>{ws.years.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="space-y-1 text-xs font-semibold text-muted">Term<select className={inputClass} value={targetTermId} onChange={(event) => setTargetTermId(event.target.value)}>{ws.terms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="space-y-1 text-xs font-semibold text-muted">CAT / assessment<select className={inputClass} value={targetExamId} onChange={(event) => { setTargetExamId(event.target.value); setAllAssessments(false); }}>{ws.exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={allAssessments} onChange={(event) => setAllAssessments(event.target.checked)} />Clear every assessment in this year and term instead of only {ws.exams.find((item) => item.id === targetExamId)?.name ?? "the selected CAT"}</label>
    <p className="rounded-lg bg-white/80 p-3 text-sm"><strong>Selected scope:</strong> {scope}</p>
    <button className="inline-flex h-11 items-center justify-center rounded-md border border-bad/50 px-4 text-sm font-bold text-bad hover:bg-rose-100" type="button" onClick={async () => {
      if (!confirm(`A full safety snapshot will be saved first. Clear marks for ${scope}? This removes marks and changes reports for the selected scope.`)) return;
      const typed = prompt(`To confirm, type exactly:
CLEAR ${scope}`);
      if (typed == null) return;
      try {
        const result = await clearBulkResults({ data: { gradeId, streamId: streamId || undefined, yearId: targetYearId, termId: targetTermId, examId: allAssessments ? undefined : targetExamId, confirmText: typed } });
        flash(`${result.cleared} mark result(s) cleared. Safety snapshot ${result.backupId} was created first.`);
        await refresh();
      } catch (error) { flash(errText(error), true); }
    }}>Save safety snapshot and clear results</button>
  </section>;
}
