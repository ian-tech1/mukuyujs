import { useMemo, useState } from "react";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import type { Gate } from "@/components/school/gate";
import { inputClass } from "@/components/school/gate";
import { btnDownload } from "@/components/school/download-button";
import { buildBoards, isAdmin, learnersForYear } from "@/lib/school/model";

export function StudentsProgressView({ ws: sourceWs, flash }: Gate) {
  const period = useSchoolPeriod(sourceWs);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [streamFilter, setStreamFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState(sourceWs.subjects[0]?.id ?? "all");
  const yearLearners = useMemo(() => learnersForYear(sourceWs, period.yearId), [sourceWs, period.yearId]);
  const subjects = useMemo(() => [...sourceWs.subjects].sort((a, b) => a.sort - b.sort), [sourceWs.subjects]);
  const exams = useMemo(() => [...sourceWs.exams].sort((a, b) => a.sort - b.sort), [sourceWs.exams]);
  const selectedLearners = useMemo(() => yearLearners.filter((learner) =>
    (gradeFilter === "all" || learner.gradeId === gradeFilter) &&
    (streamFilter === "all" || learner.streamId === streamFilter),
  ), [yearLearners, gradeFilter, streamFilter]);
  const selectedIds = useMemo(() => new Set(selectedLearners.map((learner) => learner.id)), [selectedLearners]);
  const selectedMarks = useMemo(() => period.marks.filter((mark) => selectedIds.has(mark.learnerId)), [period.marks, selectedIds]);
  const boards = useMemo(() => buildBoards(selectedLearners, selectedMarks, subjects, exams, sourceWs.bands), [selectedLearners, selectedMarks, subjects, exams, sourceWs.bands]);
  const selectedSubject = sourceWs.subjects.find((subject) => subject.id === subjectFilter);
  const progressRows = boards.map((board) => {
    const values = valuesForBoard(board);
    const recorded = values.filter((value): value is number => value != null);
    const first = recorded[0];
    const last = recorded.at(-1);
    return { board, values, change: first != null && last != null && recorded.length > 1 ? last - first : null };
  });
  const progressStreams = sourceWs.streams.filter((stream) => gradeFilter === "all" || stream.gradeId === gradeFilter);
  const selectedYear = sourceWs.years.find((year) => year.id === period.yearId);
  const selectedTerm = sourceWs.terms.find((term) => term.id === period.termId);
  const selectedGrade = sourceWs.grades.find((grade) => grade.id === gradeFilter);
  const selectedStream = sourceWs.streams.find((stream) => stream.id === streamFilter);

  function valuesForBoard(board: typeof boards[number]) {
    return exams.map((exam) => {
      if (!selectedSubject) return board.means[exam.id] ?? null;
      return selectedMarks.find((mark) => mark.learnerId === board.learner.id && mark.subjectId === selectedSubject.id && mark.examId === exam.id)?.score ?? null;
    });
  }

  function exportCsv(scope: "class" | "stream" | "grade") {
    const scopeLearners = yearLearners.filter((learner) => {
      if (scope === "grade") return gradeFilter !== "all" && learner.gradeId === gradeFilter;
      if (scope === "stream") return streamFilter !== "all" && learner.streamId === streamFilter;
      return gradeFilter !== "all" && streamFilter !== "all" && learner.gradeId === gradeFilter && learner.streamId === streamFilter;
    });
    const ids = new Set(scopeLearners.map((learner) => learner.id));
    const scopeBoards = buildBoards(scopeLearners, period.marks.filter((mark) => ids.has(mark.learnerId)), subjects, exams, sourceWs.bands);
    const rows = scopeBoards.map((board) => {
      const values = valuesForBoard(board).map((value) => value ?? "");
      const recorded = values.filter((value): value is number => typeof value === "number");
      const change = recorded.length > 1 ? (recorded.at(-1)! - recorded[0]!).toFixed(1) : "";
      return [board.learner.fullName, board.learner.admissionNumber || "", sourceWs.grades.find((grade) => grade.id === board.learner.gradeId)?.name || "", sourceWs.streams.find((stream) => stream.id === board.learner.streamId)?.name || "", selectedSubject?.name ?? "All subjects (overall)", ...values.map((value) => typeof value === "number" ? value.toFixed(1) : ""), change];
    });
    const csv = [["Learner", "Admission number", "Grade", "Stream", "Subject", ...exams.map((exam) => exam.name), "Change"], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const label = scope === "grade" ? selectedGrade?.name : scope === "stream" ? selectedStream?.name : `${selectedGrade?.name}-${selectedStream?.name}`;
    link.download = `mukuyu-students-progress-${scope}-${String(label || "selection").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    flash(`Students progress downloaded for the selected ${scope}.`);
  }

  if (sourceWs.me.role !== "teacher" && !isAdmin(sourceWs.me.role)) return null;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Teacher and admin view</p><h1 className="mt-1 font-serif text-3xl text-navy">Students progress</h1><p className="mt-1 max-w-3xl text-sm text-muted">Follow each student from one exam to the next. Positive change shows improvement from the first recorded exam to the latest recorded exam in the selected scope.</p></div>
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{progressRows.length} students</span>
    </header>
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card" aria-label="Students progress filters">
      <div className="flex flex-wrap items-center justify-between gap-3"><PeriodBar ws={sourceWs} yearId={period.yearId} termId={period.termId} onYear={period.setYearId} onTerm={period.setTermId} /><span className="text-xs text-muted">{selectedTerm?.name ?? sourceWs.profile.termName} · {selectedYear?.name ?? sourceWs.profile.academicYear}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-navy">Subject<select className={`${inputClass} mt-1`} value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects (overall)</option>{sourceWs.subjects.slice().sort((a, b) => a.sort - b.sort).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label className="text-xs font-semibold text-navy">Grade scope<select className={`${inputClass} mt-1`} value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setStreamFilter("all"); }}><option value="all">All grades</option>{sourceWs.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><label className="text-xs font-semibold text-navy">Stream scope<select className={`${inputClass} mt-1`} value={streamFilter} onChange={(event) => setStreamFilter(event.target.value)}><option value="all">All streams</option>{progressStreams.map((stream) => <option key={stream.id} value={stream.id}>{sourceWs.grades.find((grade) => grade.id === stream.gradeId)?.name} · {stream.name}</option>)}</select></label></div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={btnDownload.emerald} disabled={gradeFilter === "all" || streamFilter === "all"} onClick={() => exportCsv("class")}>Download class progress</button><button type="button" className={btnDownload.blue} disabled={streamFilter === "all"} onClick={() => exportCsv("stream")}>Download stream progress</button><button type="button" className={btnDownload.violet} disabled={gradeFilter === "all"} onClick={() => exportCsv("grade")}>Download grade progress</button></div>
    </section>
    <section className="overflow-x-auto rounded-xl border border-line bg-card" aria-label="Exam-over-exam student progress"><div className="border-b border-line bg-emerald-50/60 px-3 py-2 text-xs font-semibold text-emerald-800">Showing: {selectedSubject?.name ?? "All subjects (overall)"}</div><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="p-3">Student</th><th className="p-3">Grade / stream</th>{exams.map((exam) => <th key={exam.id} className="p-3 text-right">{exam.name}</th>)}<th className="p-3 text-right">Change</th></tr></thead><tbody>{progressRows.length ? progressRows.map(({ board, values, change }) => <tr key={board.learner.id} className="border-b border-line/70 last:border-0"><td className="p-3"><span className="font-semibold text-navy">{board.learner.fullName}</span><span className="block text-xs text-muted">{board.learner.admissionNumber || "No admission number"}</span></td><td className="p-3 text-xs text-muted">{sourceWs.grades.find((grade) => grade.id === board.learner.gradeId)?.name || "—"} · {sourceWs.streams.find((stream) => stream.id === board.learner.streamId)?.name || "No stream"}</td>{values.map((value, index) => <td key={exams[index]?.id || index} className="p-3 text-right font-semibold">{value == null ? "—" : value.toFixed(1)}</td>)}<td className={`p-3 text-right font-bold ${change == null ? "text-muted" : change >= 0 ? "text-good" : "text-bad"}`}>{change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}`}</td></tr>) : <tr><td colSpan={exams.length + 3} className="p-6 text-center text-sm text-muted">No students or recorded exam marks match this scope yet.</td></tr>}</tbody></table></section>
    <p className="text-xs text-muted">Downloads use the selected academic year, term, and subject. Choose a grade, stream, or both to activate the matching download. Student results remain subject to the existing marks-view permissions.</p>
  </div>;
}
