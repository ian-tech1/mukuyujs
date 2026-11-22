import { useEffect, useState } from "react";
import { ReportSheet } from "@/components/school/report-sheet";
import type { Gate } from "@/components/school/gate";
import { btnClass, errText, inputClass } from "@/components/school/gate";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import { buildBoards, calendarFor, decorate, learnersForYear, type Decorated } from "@/lib/school/model";
import { liveReportLink, logoDataUrl } from "@/lib/school/brand";
import { extrasFor } from "@/lib/school/extras";
import { childReport, getParentReportOptions } from "@/lib/school/api";
import { downloadReportPdf, qrFor } from "@/lib/school/pdf";
import { canActorAccess } from "@/lib/school/role-access";
import { QrParentFeedback } from "@/components/school/qr-parent-feedback";

export function ResultsView({ ws, flash }: Gate) {
  const canDownload = canActorAccess(ws.roleAccess, ws.me.role, "familyResults", "download");
  const subjects = [...ws.subjects].sort((a, b) => a.sort - b.sort);
  const allExams = [...ws.exams].sort((a, b) => a.sort - b.sort);
  const period = useSchoolPeriod(ws);
  const profileForPeriod = { ...ws.profile, activeYearId: period.yearId, activeTermId: period.termId, academicYear: ws.years.find((year) => year.id === period.yearId)?.name ?? ws.profile.academicYear, termName: ws.terms.find((term) => term.id === period.termId)?.name ?? ws.profile.termName, reportTitle: period.calendar?.reportTitle || ws.profile.reportTitle };
  const configuredAssessments = ws.termAssessments.filter((item) => item.yearId === period.yearId && item.termId === period.termId);
  const activeExamIds = configuredAssessments.length ? new Set(configuredAssessments.filter((item) => item.active).map((item) => item.examId)) : null;
  const exams = allExams.filter((exam) => !activeExamIds || activeExamIds.has(exam.id));
  const displayExams = exams.slice(0, Math.max(1, ws.profile.reportExamCount || 2));
  const [learnerId, setLearnerId] = useState(ws.learners[0]?.id ?? "");
  const [extra, setExtra] = useState<Decorated[] | null>(null);
  const [parentOptions, setParentOptions] = useState<Awaited<ReturnType<typeof getParentReportOptions>> | null>(null);
  const learner = ws.learners.find((item) => item.id === learnerId) ?? ws.learners[0];
  const currentPeriod = period.current;
  const selectedLearnerId = learner?.id;
  useEffect(() => {
    if (currentPeriod) {
      setExtra(null);
      return;
    }
    childReport({ data: { yearId: period.yearId, termId: period.termId } }).then((result) => setExtra(result.rows)).catch(() => setExtra([]));
  }, [currentPeriod, period.yearId, period.termId]);
  useEffect(() => {
    if (ws.me.role !== "parent" || !selectedLearnerId) { setParentOptions(null); return; }
    let live = true;
    setParentOptions(null);
    getParentReportOptions({ data: { learnerId: selectedLearnerId, yearId: period.yearId, termId: period.termId } })
      .then((options) => { if (live) setParentOptions(options); })
      .catch(() => { if (live) setParentOptions(null); });
    return () => { live = false; };
  }, [ws.me.role, selectedLearnerId, period.yearId, period.termId]);
  if (!learner) return <p className="text-sm text-muted">No learner is linked to this login yet. Ask the school office.</p>;
  const decorated = (currentPeriod ? ws.familyReports : extra) ?? decorate(buildBoards(ws.learners.filter((item) => item.gradeId === learner.gradeId), period.marks, subjects, exams, ws.bands), ws.streams, exams);
  const row = decorated.find((item) => item.learner.id === learner.id);
  const historicalPlacement = ws.marks.find((mark) => mark.learnerId === learner.id && mark.yearId === period.yearId && mark.termId === period.termId);
  const placedLearner = learnersForYear(ws, period.yearId).find((item) => item.id === learner.id);
  const displayGradeId = placedLearner?.gradeId ?? historicalPlacement?.gradeId ?? learner.gradeId;
  const displayStreamId = placedLearner?.streamId ?? historicalPlacement?.streamId ?? learner.streamId;
  const grade = ws.grades.find((item) => item.id === displayGradeId);
  const stream = ws.streams.find((item) => item.id === displayStreamId);
  const calendar = calendarFor(ws.calendars, period.yearId, period.termId);
  const extras = learner ? extrasFor(ws, { ...learner, gradeId: displayGradeId, streamId: displayStreamId }, period.yearId, period.termId, subjects, exams) : undefined;
  if (!grade) return null;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Official result slip · {profileForPeriod.termName} {profileForPeriod.academicYear}{learner.publicCode ? ` · code ${learner.publicCode}` : ""}</p>
          <h1 className="font-serif text-3xl text-navy">{ws.me.role === "parent" ? "Your children" : "My results"}</h1>
          <p className="text-sm text-muted">{row ? `Position ${row.overall.position ?? "—"} of ${row.overall.outOf} · mean ${row.avgMean?.toFixed(2) ?? "—"} · ${row.level ?? "—"}` : "No marks for this term yet."}</p>
        </div>
        <PeriodBar ws={ws} yearId={period.yearId} termId={period.termId} onYear={period.setYearId} onTerm={period.setTermId} />
        {ws.learners.length > 1 ? (
          <select className={inputClass} value={learner.id} onChange={(event) => setLearnerId(event.target.value)}>
            {ws.learners.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
          </select>
        ) : null}
        {row && canDownload ? <button className={btnClass} type="button" onClick={async () => {
          try {
            const link = liveReportLink(ws.profile.publicBaseUrl, row.learner.publicCode);
            const qr = ws.profile.showQr ? await qrFor(link) : "";
            const logo = await logoDataUrl(ws.profile.logoData);
            await downloadReportPdf(`${row.learner.fullName}.pdf`.replace(/\s+/g, "_"), [{
              profile: profileForPeriod, grade, stream, subjects, exams: displayExams, row, qr, logo,
              closingDate: calendar?.closingDate ?? "", openingDate: calendar?.openingDate ?? "", title: calendar?.reportTitle,
              extras,
            }]);
          } catch (error) { flash(errText(error), true); }
        }}>Download report card (PDF)</button> : null}
        {row ? <button className={`${btnClass} border border-line bg-card text-navy`} type="button" onClick={() => window.print()}>Print / Save as PDF</button> : null}
      </header>
      {ws.profile.whatsappGroupEnabled && ws.profile.whatsappGroupUrl ? <a className="block rounded-xl border-2 border-[#128C7E] bg-[#25D366] px-4 py-4 text-center text-base font-extrabold text-white shadow-lg ring-2 ring-[#25D366]/30 transition hover:brightness-95" aria-label={ws.profile.whatsappGroupLabel || `Tap to join ${ws.profile.name} WhatsApp group`} href={ws.profile.whatsappGroupUrl} target="_blank" rel="noreferrer"><span className="block text-xs uppercase tracking-widest text-white/90">School community</span><span className="mt-1 block">{ws.profile.whatsappGroupLabel || `Tap to join ${ws.profile.name} WhatsApp group`}</span></a> : null}
      {row ? <ReportSheet profile={profileForPeriod} grade={grade} stream={stream} subjects={subjects} exams={displayExams} row={row} closingDate={calendar?.closingDate ?? ""} openingDate={calendar?.openingDate ?? ""} title={calendar?.reportTitle} extras={extras} /> : <p className="text-sm text-muted">Marks for this term have not been entered.</p>}
      {ws.me.role === "parent" && row && learner.publicCode && parentOptions ? <QrParentFeedback code={learner.publicCode} learnerName={learner.fullName} gradeName={grade.name} streamName={stream?.name ?? "Stream not listed"} settings={parentOptions.feedbackSettings} teachers={parentOptions.feedbackTeachers} /> : null}
    </div>
  );
}
