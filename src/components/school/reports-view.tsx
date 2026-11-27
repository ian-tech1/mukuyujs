import { useMemo, useState } from "react";
import { ReportSheet } from "@/components/school/report-sheet";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { btnDownload } from "@/components/school/download-button";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import { buildBoards, canEditLearner, decorate, sortByPerformance, sortByRoll, learnersForYear } from "@/lib/school/model";
import { liveReportLink, logoDataUrl } from "@/lib/school/brand";
import { extrasFor } from "@/lib/school/extras";
import { downloadReportPdf, qrFor } from "@/lib/school/pdf";
import { buildReportExamChoices, chooseReportExams, filterReportMarksToGrade, remapMarksForReport, reportExamLabel } from "@/lib/school/report-period";
import { saveTermNote } from "@/lib/school/api";
import { canActorAccess } from "@/lib/school/role-access";

export function ReportsView({ ws, flash, refresh, beginActivity }: Gate) {
  const canDownload = canActorAccess(ws.roleAccess, ws.me.role, "reports", "download");
  const subjects = [...ws.subjects].sort((a, b) => a.sort - b.sort);
  const allExams = [...ws.exams].sort((a, b) => a.sort - b.sort);
  const period = useSchoolPeriod(ws);
  const reportExamChoices = useMemo(() => buildReportExamChoices(period.yearId, ws.terms, allExams, ws.termAssessments), [period.yearId, ws.terms, allExams, ws.termAssessments]);
  const profileForPeriod = { ...ws.profile, activeYearId: period.yearId, activeTermId: period.termId, academicYear: ws.years.find((year) => year.id === period.yearId)?.name ?? ws.profile.academicYear, termName: ws.terms.find((term) => term.id === period.termId)?.name ?? ws.profile.termName, reportTitle: period.calendar?.reportTitle || ws.profile.reportTitle };
  const configuredAssessments = ws.termAssessments.filter((item) => item.yearId === period.yearId && item.termId === period.termId);
  const activeExamIds = configuredAssessments.length ? new Set(configuredAssessments.filter((item) => item.active).map((item) => item.examId)) : null;
  const exams = allExams.filter((exam) => !activeExamIds || activeExamIds.has(exam.id));
  const displayExams = exams.slice(0, Math.max(1, ws.profile.reportExamCount || 2));
  const yearTerms = [...ws.terms].sort((a, b) => a.sort - b.sort);
  const [gradeId, setGradeId] = useState(ws.grades.find((grade) => ws.learners.some((learner) => learner.gradeId === grade.id))?.id ?? ws.grades[0]?.id ?? "");
  const [streamId, setStreamId] = useState("");
  const [order, setOrder] = useState<"merit" | "roll">("merit");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<"portrait" | "landscape">("landscape");
  const [downloadScope, setDownloadScope] = useState<"current" | "year" | "custom">("current");
  const [showTermNames, setShowTermNames] = useState(true);
  const [selectedExportTerms, setSelectedExportTerms] = useState<string[]>([period.termId]);
  const [selectedExportExamKeys, setSelectedExportExamKeys] = useState<string[]>(() => reportExamChoices.filter((choice) => choice.termId === period.termId).map((choice) => choice.key));
  const grade = ws.grades.find((item) => item.id === gradeId);
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  const yearLearners = useMemo(() => learnersForYear(ws, period.yearId), [ws, period.yearId]);
  const gradeIds = useMemo(() => new Set(yearLearners.filter((learner) => learner.gradeId === gradeId).map((learner) => learner.id)), [yearLearners, gradeId]);
  const learners = useMemo(() => yearLearners.filter((learner) => learner.gradeId === gradeId && (!streamId || learner.streamId === streamId)), [yearLearners, gradeId, streamId]);
  const marksForGrade = period.marks.filter((mark) => gradeIds.has(mark.learnerId) && (!mark.gradeId || mark.gradeId === gradeId));
  const rows = useMemo(() => {
    const decorated = decorate(buildBoards(learners, marksForGrade, subjects, exams, ws.bands), ws.streams, exams);
    return order === "merit" ? sortByPerformance(decorated) : sortByRoll(decorated);
  }, [learners, marksForGrade, subjects, exams, ws.bands, ws.streams, order]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.learner.fullName.toLowerCase().includes(q) || (row.learner.admissionNumber ?? "").toLowerCase().includes(q));
  }, [rows, query]);
  const [selected, setSelected] = useState(rows[0]?.learner.id ?? "");
  const current = shown.find((row) => row.learner.id === selected) ?? shown[0];
  const currentExtras = current ? extrasFor(ws, current.learner, period.yearId, period.termId, subjects, exams) : undefined;
  const exportTermIds = downloadScope === "current" ? [period.termId] : downloadScope === "year" ? yearTerms.map((term) => term.id) : selectedExportTerms;
  const availableExportChoices = reportExamChoices.filter((choice) => exportTermIds.includes(choice.termId));
  const selectedReportChoices = downloadScope === "custom"
    ? chooseReportExams(availableExportChoices, exportTermIds, selectedExportExamKeys)
    : availableExportChoices;
  const exportRows = useMemo(() => {
    if (downloadScope === "current") return rows;
    if (!selectedReportChoices.length) return [];
    const exportExams = selectedReportChoices.flatMap((choice, index) => {
      const source = allExams.find((exam) => exam.id === choice.examId);
      return source ? [{ ...source, id: choice.key, name: reportExamLabel(choice, showTermNames), sort: index + 1 }] : [];
    });
    const exportLearnerIds = new Set(learners.map((learner) => learner.id));
    const exportMarks = filterReportMarksToGrade(remapMarksForReport(ws.marks, selectedReportChoices), exportLearnerIds, gradeId);
    const decorated = decorate(buildBoards(learners, exportMarks, subjects, exportExams, ws.bands), ws.streams, exportExams);
    return sortByPerformance(decorated);
  }, [downloadScope, rows, selectedReportChoices, allExams, showTermNames, learners, ws.marks, subjects, ws.bands, ws.streams, gradeId]);

  async function download(which: "one" | "all") {
    if (!grade) return;
    const isCurrentTerm = downloadScope === "current";
    const exportExams = isCurrentTerm
      ? displayExams
      : selectedReportChoices.flatMap((choice, index) => {
          const source = allExams.find((exam) => exam.id === choice.examId);
          return source ? [{ ...source, id: choice.key, name: reportExamLabel(choice, showTermNames), sort: index + 1 }] : [];
        });
    if (!exportExams.length) {
      flash("Choose at least one term and exam for the report.", true);
      return;
    }
    const sourceRows = isCurrentTerm ? rows : exportRows;
    const selectedRow = current ? sourceRows.find((row) => row.learner.id === current.learner.id) : undefined;
    const pack = which === "one" ? (selectedRow ? [selectedRow] : []) : sortByPerformance(sourceRows);
    if (!pack.length) return;
    const selectedTerms = yearTerms.filter((term) => exportTermIds.includes(term.id));
    const yearName = ws.years.find((year) => year.id === period.yearId)?.name ?? ws.profile.academicYear;
    const selectedTermName = selectedTerms.map((term) => term.name).join(", ");
    const periodLabel = showTermNames ? `${yearName} · ${selectedTermName}` : `ACADEMIC YEAR ${yearName}`;
    const exportProfile = {
      ...profileForPeriod,
      academicYear: yearName,
      termName: selectedTermName || profileForPeriod.termName,
      activeTermId: selectedTerms.at(-1)?.id ?? period.termId,
    };
    setBusy(true);
    try {
      const logo = await logoDataUrl(ws.profile.logoData);
      const pages = [];
      for (const row of pack) {
        const stream = ws.streams.find((item) => item.id === row.learner.streamId);
        const link = liveReportLink(ws.profile.publicBaseUrl, row.learner.publicCode);
        const qr = ws.profile.showQr ? await qrFor(link) : "";
        pages.push({
          profile: exportProfile,
          grade,
          stream,
          subjects,
          exams: exportExams,
          row,
          qr,
          logo,
          closingDate: isCurrentTerm ? period.calendar?.closingDate ?? "" : "",
          openingDate: isCurrentTerm ? period.calendar?.openingDate ?? "" : "",
          title: isCurrentTerm ? period.calendar?.reportTitle : downloadScope === "year" ? "WHOLE YEAR REPORT" : "SELECTED TERMS REPORT",
          periodLabel,
          showDates: isCurrentTerm,
          includeAllExams: !isCurrentTerm,
          extras: isCurrentTerm
            ? extrasFor(ws, row.learner, period.yearId, period.termId, subjects, exams)
            : (() => {
                const latestTermId = selectedTerms.at(-1)?.id ?? period.termId;
                const extras = extrasFor(ws, row.learner, period.yearId, latestTermId, subjects, allExams);
                return { ...extras, previousMean: null, termNote: null, customRemarks: {} };
              })(),
        });
      }
      const name = which === "one"
        ? `${selectedRow?.learner.fullName ?? "report"}.pdf`
        : `${grade.name}-${streamId || "all"}-${downloadScope}-${yearName}-best-to-lowest.pdf`;
      await downloadReportPdf(name.replace(/\s+/g, "_"), pages, pdfOrientation);
      flash(which === "one" ? "Report downloaded." : "All report cards downloaded, best to lowest.");
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setBusy(false);
    }
  }

  function toggleExportTerm(termId: string, checked: boolean) {
    const termExamKeys = reportExamChoices.filter((choice) => choice.termId === termId).map((choice) => choice.key);
    setSelectedExportTerms((currentTerms) => checked
      ? [...new Set([...currentTerms, termId])]
      : currentTerms.filter((id) => id !== termId));
    setSelectedExportExamKeys((currentKeys) => checked
      ? [...new Set([...currentKeys, ...termExamKeys])]
      : currentKeys.filter((key) => !termExamKeys.includes(key)));
  }

  function selectAllExportTerms() {
    setSelectedExportTerms(yearTerms.map((term) => term.id));
    setSelectedExportExamKeys(reportExamChoices.map((choice) => choice.key));
  }

  function clearExportTerms() {
    setSelectedExportTerms([]);
    setSelectedExportExamKeys([]);
  }

  function toggleExportExam(key: string, checked: boolean) {
    setSelectedExportExamKeys((currentKeys) => checked
      ? [...new Set([...currentKeys, key])]
      : currentKeys.filter((item) => item !== key));
  }

  const reportCardRows = downloadScope === "current" ? rows : exportRows;
  const selectionSummary = downloadScope === "current"
    ? `Current term · ${ws.terms.find((term) => term.id === period.termId)?.name ?? "Selected term"} · ${displayExams.length} exam${displayExams.length === 1 ? "" : "s"}`
    : downloadScope === "year"
      ? `Whole academic year · ${yearTerms.length} terms · ${selectedReportChoices.length} exam${selectedReportChoices.length === 1 ? "" : "s"}`
      : `Custom selection · ${selectedExportTerms.length} term${selectedExportTerms.length === 1 ? "" : "s"} · ${selectedReportChoices.length} exam${selectedReportChoices.length === 1 ? "" : "s"}`;
  const exportYearName = ws.years.find((year) => year.id === period.yearId)?.name ?? ws.profile.academicYear;
  const selectedTermNames = yearTerms.filter((term) => exportTermIds.includes(term.id)).map((term) => term.name);
  const exportSelectedLearnerExists = current ? reportCardRows.some((row) => row.learner.id === current.learner.id) : false;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-navy">Report cards</h1>
          <p className="text-sm text-muted">Print the year and term you choose. Each card carries the school logo and a QR code that opens that learner's report.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDownload ? <button className={btnGhost} type="button" disabled={!current} onClick={async () => {
            if (!current) return;
            const link = liveReportLink(ws.profile.publicBaseUrl, current.learner.publicCode);
            try { await navigator.clipboard.writeText(link); flash("Report link copied."); }
            catch { flash(link); }
          }}>Copy report link</button> : null}
          {canDownload ? <button className={btnGhost} type="button" disabled={!current} onClick={() => window.print()}>Print this card</button> : null}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-card p-3">
        <label className="text-sm font-medium" htmlFor="report-pdf-orientation">PDF page orientation</label>
        <select id="report-pdf-orientation" className={inputClass + " max-w-48"} value={pdfOrientation} onChange={(event) => setPdfOrientation(event.target.value as "portrait" | "landscape")}>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
        <span className="text-xs text-muted">Applies to downloaded report-card PDFs.</span>
      </div>
      <PeriodBar ws={ws} yearId={period.yearId} termId={period.termId} onYear={period.setYearId} onTerm={period.setTermId} />
      <section className="space-y-3 rounded-md border border-line bg-card p-4" aria-labelledby="report-download-options-title">
        <div>
          <h2 id="report-download-options-title" className="font-serif text-xl text-navy">Report-card download options</h2>
          <p className="text-sm text-muted">The academic year follows the selector above. Your current single-term report remains the default.</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-56 text-sm font-medium" htmlFor="report-download-scope">Download range
            <select id="report-download-scope" className={inputClass + " mt-1"} value={downloadScope} onChange={(event) => setDownloadScope(event.target.value as "current" | "year" | "custom")}>
              <option value="current">Current selected term</option>
              <option value="year">Whole academic year</option>
              <option value="custom">Choose terms and exams</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={showTermNames} onChange={(event) => setShowTermNames(event.target.checked)} />Show term names on downloaded reports</label>
        </div>
        {downloadScope === "custom" ? (
          <div className="grid gap-4 rounded-md border border-line bg-paper/50 p-3 md:grid-cols-2">
            <fieldset className="min-w-0 space-y-2">
              <legend className="font-semibold text-navy">Terms to include</legend>
              <div className="flex flex-wrap gap-2">
                <button className={btnGhost + " px-2 py-1 text-xs"} type="button" onClick={selectAllExportTerms}>Select all terms</button>
                <button className={btnGhost + " px-2 py-1 text-xs"} type="button" onClick={clearExportTerms}>Clear terms</button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {yearTerms.map((term) => <label key={term.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedExportTerms.includes(term.id)} onChange={(event) => toggleExportTerm(term.id, event.target.checked)} />{term.name}</label>)}
              </div>
            </fieldset>
            <fieldset className="min-w-0 space-y-2">
              <legend className="font-semibold text-navy">Exams to include</legend>
              {selectedExportTerms.length ? (
                <div className="max-h-56 space-y-3 overflow-y-auto">
                  {yearTerms.filter((term) => selectedExportTerms.includes(term.id)).map((term) => {
                    const termChoices = reportExamChoices.filter((choice) => choice.termId === term.id);
                    return (
                      <div key={term.id}>
                        <h3 className="text-sm font-medium text-muted">{term.name}</h3>
                        {termChoices.length ? <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                          {termChoices.map((choice) => <label key={choice.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedExportExamKeys.includes(choice.key)} onChange={(event) => toggleExportExam(choice.key, event.target.checked)} />{choice.examName}</label>)}
                        </div> : <p className="mt-1 text-xs text-muted">No active exams are configured for this term.</p>}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-muted">Select one or more terms to choose their exams.</p>}
            </fieldset>
          </div>
        ) : null}
        <div className="space-y-1 border-t border-line pt-3">
          <p aria-live="polite" className="text-sm font-semibold text-navy">Export selection: {selectionSummary} · {exportYearName} · Term names {showTermNames ? "will be shown" : "will be hidden"}</p>
          {downloadScope === "custom" ? <p className="text-xs text-muted">Selected terms: {selectedTermNames.join(", ") || "none"}. Selected exams: {selectedReportChoices.length}.</p> : null}
          <p className="text-xs text-muted">Combined reports average scores across the chosen exam columns. Attendance, previous-term comparisons, closing/opening dates, and term-specific comments are omitted from combined reports because they belong to a single term.</p>
        </div>
        {canDownload ? <div className="flex flex-wrap gap-2">
          <button className={btnDownload.blue} type="button" disabled={busy || !exportSelectedLearnerExists} onClick={() => download("one")}>{downloadScope === "current" ? "Download this PDF" : "Download selected report card"}</button>
          <button className={btnDownload.rose} type="button" disabled={busy || !reportCardRows.length} onClick={() => download("all")}>{busy ? "Preparing…" : downloadScope === "current" ? "Download all, best to lowest" : "Download all selected cards, best to lowest"}</button>
        </div> : null}
      </section>
      <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a learner by name or admission number" />
      <div className="grid gap-2 sm:grid-cols-4">
        <select className={inputClass} value={gradeId} onChange={(event) => { setGradeId(event.target.value); setStreamId(""); setSelected(""); }}>
          {ws.grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className={inputClass} value={streamId} onChange={(event) => { setStreamId(event.target.value); setSelected(""); }}>
          <option value="">All streams</option>
          {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
        </select>
        <select className={inputClass} value={order} onChange={(event) => setOrder(event.target.value as "merit" | "roll")}>
          <option value="merit">Best to lowest</option>
          <option value="roll">Roll number</option>
        </select>
        <select className={inputClass} value={current?.learner.id ?? ""} onChange={(event) => setSelected(event.target.value)}>
          {shown.map((row) => <option key={row.learner.id} value={row.learner.id}>{order === "merit" ? `${row.overall.position ?? "—"}. ` : `${row.learner.roll}. `}{row.learner.fullName}</option>)}
        </select>
      </div>
      {current && grade ? (
        <>
          <ReportSheet profile={profileForPeriod} grade={grade} stream={ws.streams.find((stream) => stream.id === current.learner.streamId)} subjects={subjects} exams={displayExams} row={current} closingDate={period.calendar?.closingDate ?? ""} openingDate={period.calendar?.openingDate ?? ""} title={period.calendar?.reportTitle} extras={currentExtras} />
          {canEditLearner(ws.me, ws.assignments, current.learner.streamId) ? <AttendanceEditor key={`${current.learner.id}-${period.yearId}-${period.termId}`} ws={ws} flash={flash} refresh={refresh} beginActivity={beginActivity} learnerId={current.learner.id} learnerName={current.learner.fullName} yearId={period.yearId} termId={period.termId} note={currentExtras?.termNote ?? null} /> : null}
        </>
      ) : <p className="text-sm text-muted">{query.trim() ? "No learner matches that name or admission number." : "No learners in this class yet."}</p>}
    </div>
  );
}

function AttendanceEditor({
  ws, flash, refresh, beginActivity, learnerId, learnerName, yearId, termId, note,
}: {
  ws: Gate["ws"];
  flash: Gate["flash"];
  refresh: Gate["refresh"];
  beginActivity: Gate["beginActivity"];
  learnerId: string;
  learnerName: string;
  yearId: string;
  termId: string;
  note: { daysPresent: number | null; daysExpected: number | null; conduct: string; comment: string } | null;
}) {
  const [present, setPresent] = useState(note?.daysPresent == null ? "" : String(note.daysPresent));
  const [expected, setExpected] = useState(note?.daysExpected == null ? "" : String(note.daysExpected));
  const [conduct, setConduct] = useState(note?.conduct ?? "");
  const [comment, setComment] = useState(note?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<"portrait" | "landscape">("landscape");
  return (
    <form className="no-print space-y-3 rounded-md border border-line bg-card p-4" onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true);
      const finishActivity = beginActivity?.("Report attendance and conduct are being saved…");
      try {
        await saveTermNote({ data: {
          learnerId, yearId, termId,
          daysPresent: present.trim() === "" ? null : Number(present),
          daysExpected: expected.trim() === "" ? null : Number(expected),
          conduct, comment,
        } });
        finishActivity?.("Report attendance and conduct saved.");
        await refresh();
        flash(ws.profile.showAttendance ? "Attendance and conduct saved. They show on this report card." : "Attendance and conduct saved. Turn on “Show attendance” in report layout to print them.");
      } catch (error) { finishActivity?.(); flash(errText(error), true); }
      finally { setBusy(false); }
    }}>
      <h2 className="font-serif text-xl text-navy">Attendance and conduct · {learnerName}</h2>
      <p className="text-sm text-muted">Saved for this year and term. Leave the boxes blank and save to remove them from the report. This is separate from the class-teacher initials already used after the remarks section.</p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-sm">Days present<input className={inputClass + " mt-1"} inputMode="numeric" value={present} onChange={(event) => setPresent(event.target.value)} /></label>
        <label className="text-sm">Days expected<input className={inputClass + " mt-1"} inputMode="numeric" value={expected} onChange={(event) => setExpected(event.target.value)} /></label>
        <label className="text-sm">Conduct
          <select className={inputClass + " mt-1"} value={conduct} onChange={(event) => setConduct(event.target.value)}>
            <option value="">—</option>
            {["Excellent", "Very good", "Good", "Fair", "Needs support"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm">Class teacher comment<input className={inputClass + " mt-1"} maxLength={180} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      </div>
      <button className={btnClass} type="submit" disabled={busy}>{busy ? "Saving…" : "Save attendance"}</button>
    </form>
  );
}
