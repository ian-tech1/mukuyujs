import { useMemo, useState } from "react";
import { ReportSheet } from "@/components/school/report-sheet";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import { buildBoards, canEditLearner, decorate, sortByPerformance, sortByRoll, learnersForYear } from "@/lib/school/model";
import { liveReportLink, logoDataUrl } from "@/lib/school/brand";
import { extrasFor } from "@/lib/school/extras";
import { downloadReportPdf, qrFor } from "@/lib/school/pdf";
import { saveTermNote } from "@/lib/school/api";
import { canActorAccess } from "@/lib/school/role-access";

export function ReportsView({ ws, flash, refresh }: Gate) {
  const canDownload = canActorAccess(ws.roleAccess, ws.me.role, "reports", "download");
  const subjects = [...ws.subjects].sort((a, b) => a.sort - b.sort);
  const allExams = [...ws.exams].sort((a, b) => a.sort - b.sort);
  const period = useSchoolPeriod(ws);
  const profileForPeriod = { ...ws.profile, activeYearId: period.yearId, activeTermId: period.termId, academicYear: ws.years.find((year) => year.id === period.yearId)?.name ?? ws.profile.academicYear, termName: ws.terms.find((term) => term.id === period.termId)?.name ?? ws.profile.termName, reportTitle: period.calendar?.reportTitle || ws.profile.reportTitle };
  const configuredAssessments = ws.termAssessments.filter((item) => item.yearId === period.yearId && item.termId === period.termId);
  const activeExamIds = configuredAssessments.length ? new Set(configuredAssessments.filter((item) => item.active).map((item) => item.examId)) : null;
  const exams = allExams.filter((exam) => !activeExamIds || activeExamIds.has(exam.id));
  const displayExams = exams.slice(0, Math.max(1, ws.profile.reportExamCount || 2));
  const [gradeId, setGradeId] = useState(ws.grades.find((grade) => ws.learners.some((learner) => learner.gradeId === grade.id))?.id ?? ws.grades[0]?.id ?? "");
  const [streamId, setStreamId] = useState("");
  const [order, setOrder] = useState<"merit" | "roll">("merit");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<"portrait" | "landscape">("landscape");
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

  async function download(which: "one" | "all") {
    if (!grade) return;
    const pack = which === "one" && current ? [current] : sortByPerformance(rows);
    if (!pack.length) return;
    setBusy(true);
    try {
      const logo = await logoDataUrl(ws.profile.logoData);
      const pages = [];
      for (const row of pack) {
        const stream = ws.streams.find((item) => item.id === row.learner.streamId);
        const link = liveReportLink(ws.profile.publicBaseUrl, row.learner.publicCode);
        const qr = ws.profile.showQr ? await qrFor(link) : "";
        pages.push({
          profile: profileForPeriod,
          grade,
          stream,
          subjects,
          exams: displayExams,
          row,
          qr,
          logo,
          closingDate: period.calendar?.closingDate ?? "",
          openingDate: period.calendar?.openingDate ?? "",
          title: period.calendar?.reportTitle,
          extras: extrasFor(ws, row.learner, period.yearId, period.termId, subjects, exams),
        });
      }
      const name = which === "one" ? `${current?.learner.fullName ?? "report"}.pdf` : `${grade.name}-${streamId || "all"}-best-to-lowest.pdf`;
      await downloadReportPdf(name.replace(/\s+/g, "_"), pages, pdfOrientation);
      flash(which === "one" ? "Report downloaded." : "All report cards downloaded, best to lowest.");
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-navy">Report cards</h1>
          <p className="text-sm text-muted">Print the year and term you choose. Each card carries the school logo and a QR code that opens that learner's report.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDownload ? <button className={btnGhost} type="button" disabled={busy || !current} onClick={() => download("one")}>Download this PDF</button> : null}
          {canDownload ? <button className={btnClass} type="button" disabled={busy || !rows.length} onClick={() => download("all")}>{busy ? "Preparing…" : "Download all, best to lowest"}</button> : null}
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
          {canEditLearner(ws.me, ws.assignments, current.learner.streamId) ? <AttendanceEditor key={`${current.learner.id}-${period.yearId}-${period.termId}`} ws={ws} flash={flash} refresh={refresh} learnerId={current.learner.id} learnerName={current.learner.fullName} yearId={period.yearId} termId={period.termId} note={currentExtras?.termNote ?? null} /> : null}
        </>
      ) : <p className="text-sm text-muted">{query.trim() ? "No learner matches that name or admission number." : "No learners in this class yet."}</p>}
    </div>
  );
}

function AttendanceEditor({
  ws, flash, refresh, learnerId, learnerName, yearId, termId, note,
}: {
  ws: Gate["ws"];
  flash: Gate["flash"];
  refresh: Gate["refresh"];
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
      try {
        await saveTermNote({ data: {
          learnerId, yearId, termId,
          daysPresent: present.trim() === "" ? null : Number(present),
          daysExpected: expected.trim() === "" ? null : Number(expected),
          conduct, comment,
        } });
        await refresh();
        flash(ws.profile.showAttendance ? "Attendance and conduct saved. They show on this report card." : "Attendance and conduct saved. Turn on “Show attendance” in report layout to print them.");
      } catch (error) { flash(errText(error), true); }
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
