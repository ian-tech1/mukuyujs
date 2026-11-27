import { useMemo, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { inputClass } from "@/components/school/gate";
import { btnDownload } from "@/components/school/download-button";
import { buildBoards, isAdmin, learnersForYear, type Exam, type Learner, type Mark } from "@/lib/school/model";

export function StudentsProgressView({ ws: sourceWs, flash }: Gate) {
  const defaultYear = sourceWs.profile.activeYearId || sourceWs.years[0]?.id || "";
  const defaultTerm = sourceWs.profile.activeTermId || sourceWs.terms[0]?.id || "";
  const orderedYears = useMemo(() => [...sourceWs.years].sort((a, b) => a.sort - b.sort), [sourceWs.years]);
  const orderedTerms = useMemo(() => [...sourceWs.terms].sort((a, b) => a.sort - b.sort), [sourceWs.terms]);
  const orderedSubjects = useMemo(() => [...sourceWs.subjects].sort((a, b) => a.sort - b.sort), [sourceWs.subjects]);
  const orderedExams = useMemo(() => [...sourceWs.exams].sort((a, b) => a.sort - b.sort), [sourceWs.exams]);
  const [yearIds, setYearIds] = useState<string[]>(defaultYear ? [defaultYear] : []);
  const [termIds, setTermIds] = useState<string[]>(defaultTerm ? [defaultTerm] : []);
  const [examIds, setExamIds] = useState<string[]>(() => orderedExams.map((exam) => exam.id));
  const [gradeFilter, setGradeFilter] = useState("all");
  const [streamFilter, setStreamFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState(orderedSubjects[0]?.id ?? "all");

  const selectedPeriods = useMemo(() => yearIds.flatMap((yearId) => termIds.map((termId) => ({ yearId, termId }))), [yearIds, termIds]);
  const selectedPeriodKeys = useMemo(() => new Set(selectedPeriods.map(({ yearId, termId }) => `${yearId}|${termId}`)), [selectedPeriods]);
  const selectedExamSet = useMemo(() => new Set(examIds), [examIds]);
  const columns = useMemo(() => selectedPeriods.flatMap(({ yearId, termId }) => orderedExams.filter((exam) => selectedExamSet.has(exam.id)).map((exam) => ({ yearId, termId, exam }))), [selectedPeriods, orderedExams, selectedExamSet]);
  const yearLearners = useMemo(() => {
    const byId = new Map<string, Learner>();
    for (const yearId of yearIds) for (const learner of learnersForYear(sourceWs, yearId)) byId.set(learner.id, learner);
    return [...byId.values()];
  }, [sourceWs, yearIds]);
  const selectedLearners = useMemo(() => yearLearners.filter((learner) =>
    (gradeFilter === "all" || learner.gradeId === gradeFilter) && (streamFilter === "all" || learner.streamId === streamFilter),
  ), [yearLearners, gradeFilter, streamFilter]);
  const selectedIds = useMemo(() => new Set(selectedLearners.map((learner) => learner.id)), [selectedLearners]);
  const selectedMarks = useMemo(() => sourceWs.marks.filter((mark) => selectedIds.has(mark.learnerId) && selectedPeriodKeys.has(`${mark.yearId}|${mark.termId}`) && selectedExamSet.has(mark.examId)), [sourceWs.marks, selectedIds, selectedPeriodKeys, selectedExamSet]);
  const subjects = orderedSubjects;
  const exams = orderedExams;
  const selectedSubject = sourceWs.subjects.find((subject) => subject.id === subjectFilter);
  const boards = useMemo(() => buildBoards(selectedLearners, selectedMarks, subjects, exams, sourceWs.bands), [selectedLearners, selectedMarks, subjects, exams, sourceWs.bands]);
  const progressRows = boards.map((board) => {
    const values = columns.map(({ yearId, termId, exam }) => valueFor(board.learner, yearId, termId, exam, selectedSubject, selectedMarks));
    const recorded = values.filter((value): value is number => value != null);
    const first = recorded[0];
    const last = recorded.at(-1);
    return { board, values, change: first != null && last != null && recorded.length > 1 ? last - first : null };
  });
  const progressStreams = sourceWs.streams.filter((stream) => gradeFilter === "all" || stream.gradeId === gradeFilter);

  function exportCsv(scope: "class" | "stream" | "grade") {
    const scopeLearners = yearLearners.filter((learner) => {
      if (scope === "grade") return gradeFilter !== "all" && learner.gradeId === gradeFilter;
      if (scope === "stream") return streamFilter !== "all" && learner.streamId === streamFilter;
      return gradeFilter !== "all" && streamFilter !== "all" && learner.gradeId === gradeFilter && learner.streamId === streamFilter;
    });
    const rows = scopeLearners.map((learner) => {
      const values = columns.map(({ yearId, termId, exam }) => valueFor(learner, yearId, termId, exam, selectedSubject, selectedMarks));
      const recorded = values.filter((value): value is number => value != null);
      const change = recorded.length > 1 ? (recorded.at(-1)! - recorded[0]!).toFixed(1) : "";
      return [learner.fullName, learner.admissionNumber || "", sourceWs.grades.find((grade) => grade.id === learner.gradeId)?.name || "", sourceWs.streams.find((stream) => stream.id === learner.streamId)?.name || "", selectedSubject?.name ?? "All subjects (overall)", ...values.map((value) => value == null ? "" : value.toFixed(1)), change];
    });
    const headers = ["Learner", "Admission number", "Grade", "Stream", "Subject", ...columns.map(({ yearId, termId, exam }) => columnLabel(sourceWs, yearId, termId, exam)), "Change"];
    const csv = [headers, ...rows].map((row) => row.slice(0, headers.length).map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const label = scope === "grade" ? sourceWs.grades.find((grade) => grade.id === gradeFilter)?.name : scope === "stream" ? sourceWs.streams.find((stream) => stream.id === streamFilter)?.name : `${sourceWs.grades.find((grade) => grade.id === gradeFilter)?.name}-${sourceWs.streams.find((stream) => stream.id === streamFilter)?.name}`;
    link.download = `mukuyu-students-progress-${scope}-${String(label || "selection").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    flash(`Students progress downloaded for the selected ${scope}.`);
  }

  if (sourceWs.me.role !== "teacher" && !isAdmin(sourceWs.me.role)) return null;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Teacher and admin view</p><h1 className="mt-1 font-serif text-3xl text-navy">Students progress</h1><p className="mt-1 max-w-3xl text-sm text-muted">Compare students across any combination of academic years, terms, exams, subjects, grades, and streams. Positive change compares the first selected exam with the latest selected exam.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{progressRows.length} students</span></header>
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card" aria-label="Students progress filters"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MultiChoiceDropdown label="Academic years" options={orderedYears.map((year) => ({ id: year.id, label: year.name }))} selected={yearIds} onChange={setYearIds} /><MultiChoiceDropdown label="Terms" options={orderedTerms.map((term) => ({ id: term.id, label: term.name }))} selected={termIds} onChange={setTermIds} /><MultiChoiceDropdown label="Exams" options={orderedExams.map((exam) => ({ id: exam.id, label: exam.name }))} selected={examIds} onChange={setExamIds} /><label className="text-xs font-semibold text-navy">Subject<select className={`${inputClass} mt-1`} value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects (overall)</option>{orderedSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div><p className="mt-2 text-xs text-muted">Tap a selector to check or uncheck as many years, terms, and exams as needed.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-navy">Grade scope<select className={`${inputClass} mt-1`} value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setStreamFilter("all"); }}><option value="all">All grades</option>{sourceWs.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><label className="text-xs font-semibold text-navy">Stream scope<select className={`${inputClass} mt-1`} value={streamFilter} onChange={(event) => setStreamFilter(event.target.value)}><option value="all">All streams</option>{progressStreams.map((stream) => <option key={stream.id} value={stream.id}>{sourceWs.grades.find((grade) => grade.id === stream.gradeId)?.name} · {stream.name}</option>)}</select></label></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" className={btnDownload.emerald} disabled={gradeFilter === "all" || streamFilter === "all" || !columns.length} onClick={() => exportCsv("class")}>Download class progress</button><button type="button" className={btnDownload.blue} disabled={streamFilter === "all" || !columns.length} onClick={() => exportCsv("stream")}>Download stream progress</button><button type="button" className={btnDownload.violet} disabled={gradeFilter === "all" || !columns.length} onClick={() => exportCsv("grade")}>Download grade progress</button></div></section>
    <section className="overflow-x-auto rounded-xl border border-line bg-card" aria-label="Exam-over-exam student progress"><div className="border-b border-line bg-emerald-50/60 px-3 py-2 text-xs font-semibold text-emerald-800">Showing {selectedSubject?.name ?? "all subjects (overall)"} across {columns.length} selected exam{columns.length === 1 ? "" : "s"}</div><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="sticky left-0 bg-paper p-3">Student</th><th className="p-3">Grade / stream</th>{columns.map(({ yearId, termId, exam }) => <th key={`${yearId}|${termId}|${exam.id}`} className="p-3 text-right">{columnLabel(sourceWs, yearId, termId, exam)}</th>)}<th className="p-3 text-right">Change</th></tr></thead><tbody>{progressRows.length && columns.length ? progressRows.map(({ board, values, change }) => <tr key={board.learner.id} className="border-b border-line/70 last:border-0"><td className="sticky left-0 bg-card p-3"><span className="font-semibold text-navy">{board.learner.fullName}</span><span className="block text-xs text-muted">{board.learner.admissionNumber || "No admission number"}</span></td><td className="p-3 text-xs text-muted">{sourceWs.grades.find((grade) => grade.id === board.learner.gradeId)?.name || "—"} · {sourceWs.streams.find((stream) => stream.id === board.learner.streamId)?.name || "No stream"}</td>{values.map((value, index) => <td key={columns[index] ? `${columns[index].yearId}|${columns[index].termId}|${columns[index].exam.id}` : index} className="p-3 text-right font-semibold">{value == null ? "—" : value.toFixed(1)}</td>)}<td className={`p-3 text-right font-bold ${change == null ? "text-muted" : change >= 0 ? "text-good" : "text-bad"}`}>{change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}`}</td></tr>) : <tr><td colSpan={columns.length + 3} className="p-6 text-center text-sm text-muted">{columns.length ? "No students or recorded exam marks match this scope yet." : "Select at least one academic year, term, and exam."}</td></tr>}</tbody></table></section>
    <p className="text-xs text-muted">Progress and downloads use every selected year–term–exam combination. Student results remain subject to the existing marks-view permissions.</p>
  </div>;
}

function valueFor(learner: Learner, yearId: string, termId: string, exam: Exam, subject: { id: string } | undefined, marks: Mark[]) {
  if (subject) return marks.find((mark) => mark.learnerId === learner.id && mark.yearId === yearId && mark.termId === termId && mark.examId === exam.id && mark.subjectId === subject.id)?.score ?? null;
  const scores = marks.filter((mark) => mark.learnerId === learner.id && mark.yearId === yearId && mark.termId === termId && mark.examId === exam.id).map((mark) => mark.score);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function columnLabel(ws: Gate["ws"], yearId: string, termId: string, exam: Exam) {
  return `${ws.years.find((year) => year.id === yearId)?.name ?? yearId} · ${ws.terms.find((term) => term.id === termId)?.name ?? termId} · ${exam.name}`;
}

function MultiChoiceDropdown({ label, options, selected, onChange }: { label: string; options: Array<{ id: string; label: string }>; selected: string[]; onChange: (value: string[]) => void }) {
  const selectedLabels = options.filter((option) => selected.includes(option.id)).map((option) => option.label);
  const summary = selected.length === 0 ? "None selected" : selected.length === options.length ? "All selected" : selectedLabels.length <= 2 ? selectedLabels.join(", ") : `${selected.length} selected`;
  return <details className="relative text-xs"><summary className={`${inputClass} flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-navy`}><span className="truncate">{label}: {summary}</span><span aria-hidden="true">⌄</span></summary><div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-card p-2 shadow-xl"><div className="mb-1 flex justify-between gap-2 border-b border-line px-2 pb-2"><button type="button" className="text-xs font-semibold text-info" onClick={() => onChange(options.map((option) => option.id))}>Select all</button><button type="button" className="text-xs font-semibold text-muted" onClick={() => onChange([])}>Clear</button></div>{options.map((option) => <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-info/10"><input type="checkbox" className="size-4 accent-navy" checked={selected.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} /><span>{option.label}</span></label>)}</div></details>;
}
