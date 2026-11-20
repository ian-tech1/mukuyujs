import { useEffect, useMemo, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import { bandFor, buildBoards, canEditMark, learnersForYear, markControlFor } from "@/lib/school/model";
import { approveMarksPeriod, clearBulkResults, importMarksExcel, saveMarks, saveSubjectRemarks } from "@/lib/school/api";
import { parseMarkSpreadsheet, marksFromDelimited, type MarkSheetRow } from "@/lib/school/sheet";

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
  const lockText = (exempt ? "" : [!control.entryAllowed ? "new marks cannot be entered" : "", !control.editAllowed ? "saved marks cannot be changed or cleared" : ""].filter(Boolean).join(" and "));
  const cellLocked = (learnerId: string) => {
    if (exempt) return false;
    const saved = period.marks.some((mark) => mark.learnerId === learnerId && mark.subjectId === subjectId && mark.examId === examId);
    return saved ? !control.editAllowed : !control.entryAllowed;
  };
  const [scores, setScores] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [uploadRows, setUploadRows] = useState<MarkSheetRow[]>([]);
  const [uploadText, setUploadText] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
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

  const editable = learners.some((learner) => canEditMark(ws.me, ws.assignments, learner, subjectId));
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
  const lockBanner = lockText ? <p className="rounded-md border border-amber-300 bg-card px-3 py-2 text-sm">Locked for this year, term and CAT: {lockText}.{control.reason ? ` ${control.reason}` : ""}</p> : null;
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
        <p className="text-sm text-muted">Copy the complete Excel range, including its header row, and paste below. Include Admission Number or Learner Name plus one column for every subject. Subject names and short names are recognized; fractions such as 30/40 are converted to percentages. Blank cells are left unchanged.</p>
        <textarea aria-label="Paste spreadsheet marks" className={`${inputClass} marks-paste-grid h-36 py-3 font-mono text-xs`} placeholder={'Admission Number\tLearner Name\tMathematics\tEnglish\tIntegrated Science\nMKS-2026-12345\tAMINA YUSUF\t30/40\t81\t33/40'} value={uploadText} onChange={(event) => { setUploadText(event.target.value); try { setUploadRows(marksFromDelimited(event.target.value)); } catch { setUploadRows([]); } }} />
        <input className="block text-sm" type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const parsed = await parseMarkSpreadsheet(file); setUploadRows(parsed); flash(`${parsed.length} learner row(s) read. Review the preview before saving.`); }
          catch (error) { flash(errText(error), true); }
        }} />
        <p className="rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-navy">{uploadRows.length} learner rows · {uploadRows.reduce((n, row) => n + Object.values(row.scores).filter((score) => score != null).length, 0)} numeric subject marks detected</p>
        {uploadRows.length ? <div className="marks-grid-scroll max-h-64 overflow-auto rounded-xl border border-line"><table className="marks-preview-table text-xs"><thead><tr><th className="sticky left-0 z-10 p-2 text-left">Admission</th><th className="p-2 text-left">Learner</th>{[...new Set(uploadRows.flatMap((row) => Object.keys(row.scores)))].map((name) => <th key={name} className="p-2 text-right">{name}</th>)}</tr></thead><tbody>{uploadRows.slice(0, 100).map((row, index) => <tr key={`${row.admissionNumber || row.fullName}-${index}`}><td className="sticky left-0 p-2">{row.admissionNumber || "—"}</td><td className="p-2">{row.fullName || "—"}</td>{[...new Set(uploadRows.flatMap((item) => Object.keys(item.scores)))].map((name) => <td key={name} className="p-2 text-right tabular-nums">{row.scores[name] ?? "—"}</td>)}</tr>)}</tbody></table>{uploadRows.length > 100 ? <p className="p-2 text-xs text-muted">Previewing first 100 of {uploadRows.length} rows; all rows will be validated on save.</p> : null}</div> : null}
        <button className={btnClass} type="button" disabled={!uploadRows.length || uploadBusy} onClick={async () => {
          const flat = uploadRows.flatMap((row) => Object.entries(row.scores).filter(([, score]) => score != null).map(([subject, score]) => ({ admissionNumber: row.admissionNumber, fullName: row.fullName, subject, score: score as number })));
          if (!flat.length) { flash("No numeric subject scores were found.", true); return; }
          setUploadBusy(true);
          try {
            const result = await importMarksExcel({ data: { yearId: period.yearId, termId: period.termId, examId, rows: flat } });
            flash(result.errors.length ? `${result.saved} mark(s) saved; ${result.errors.length} row(s) need attention. First issue: ${result.errors[0]}` : `${result.saved} mark(s) saved successfully.`);
            setUploadRows([]); setUploadText(""); await refresh();
          } catch (error) { flash(errText(error), true); }
          finally { setUploadBusy(false); }
        }}>{uploadBusy ? "Saving marks…" : "Validate and save uploaded marks"}</button>
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
  const grade = ws.grades.find((item) => item.id === gradeId)?.name ?? "selected grade";
  const stream = streamId ? ws.streams.find((item) => item.id === streamId)?.name : null;
  const year = ws.years.find((item) => item.id === yearId)?.name ?? "selected year";
  const term = ws.terms.find((item) => item.id === termId)?.name ?? "selected term";
  const exam = !allAssessments ? ws.exams.find((item) => item.id === examId)?.name : null;
  const scope = `${grade}${stream ? ` ${stream}` : " (all streams)"} · ${year} · ${term} · ${exam ?? "all assessments"}`;
  return <section className="space-y-3 rounded-xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-4">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-rose-800">Super admin only · destructive action</p>
    <h2 className="font-serif text-xl text-navy">Clear selected bulk results</h2>
    <p className="text-sm text-muted">Scope follows the selected grade, stream, academic year and term above. By default only the selected assessment is cleared; enable the all-assessments option to clear every assessment in that period. A complete safety snapshot is saved before marks are removed. Download and securely store a separate backup first.</p>
    <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={allAssessments} onChange={(event) => setAllAssessments(event.target.checked)} />Clear all assessments in this selected scope (not just {ws.exams.find((item) => item.id === examId)?.name ?? "the selected assessment"})</label>
    <p className="rounded-lg bg-white/80 p-3 text-sm"><strong>Selected scope:</strong> {scope}</p>
    <button className="inline-flex h-11 items-center justify-center rounded-md border border-bad/50 px-4 text-sm font-bold text-bad hover:bg-rose-100" type="button" onClick={async () => {
      if (!confirm(`A full safety snapshot will be saved first. Clear marks for ${scope}? This removes marks and changes reports for the selected scope.`)) return;
      const typed = prompt(`To confirm, type exactly:
CLEAR ${scope}`);
      if (typed == null) return;
      try {
        const result = await clearBulkResults({ data: { gradeId, streamId: streamId || undefined, yearId, termId, examId: allAssessments ? undefined : examId, confirmText: typed } });
        flash(`${result.cleared} mark result(s) cleared. Safety snapshot ${result.backupId} was created first.`);
        await refresh();
      } catch (error) { flash(errText(error), true); }
    }}>Save safety snapshot and clear results</button>
  </section>;
}
