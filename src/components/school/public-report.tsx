import { useEffect, useMemo, useState } from "react";
import { btnDownload } from "@/components/school/download-button";
import { ReportRangeOptions } from "@/components/school/report-range-options";
import { Link } from "@tanstack/react-router";
import { ReportSheet } from "@/components/school/report-sheet";
import { SchoolLogo } from "@/components/school/logo";
import { getPublicReport } from "@/lib/school/api";
import { QrParentFeedback } from "@/components/school/qr-parent-feedback";
import { downloadReportPdf, qrFor } from "@/lib/school/pdf";
import { logoDataUrl } from "@/lib/school/brand";
import { buildReportExamChoices, reportChoicesForDownload, reportTermIds, type ReportDownloadScope } from "@/lib/school/report-period";

type PublicReportData = Extract<Awaited<ReturnType<typeof getPublicReport>>, { profile: unknown }>;

export function PublicReport({ code }: { code: string }) {
  const [state, setState] = useState<"loading" | "missing" | "blocked" | "ready">("loading");
  const [yearId, setYearId] = useState("");
  const [defaultYearId, setDefaultYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [options, setOptions] = useState<{
    years: Array<{ id: string; name: string; sort: number }>;
    terms: Array<{ id: string; name: string; sort: number }>;
    exams: Array<{ id: string; name: string; code: string; sort: number }>;
    termAssessments: Array<{ yearId: string; termId: string; examId: string; active: boolean }>;
  } | null>(null);
  const [data, setData] = useState<PublicReportData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadScope, setDownloadScope] = useState<ReportDownloadScope>("current");
  const [selectedExportTerms, setSelectedExportTerms] = useState<string[]>([]);
  const [selectedExportExamKeys, setSelectedExportExamKeys] = useState<string[]>([]);
  const [showTermNames, setShowTermNames] = useState(true);
  const [pdfOrientation, setPdfOrientation] = useState<"portrait" | "landscape">("landscape");
  const effectiveYearId = yearId || defaultYearId;
  const reportChoices = useMemo(() => options && effectiveYearId ? buildReportExamChoices(effectiveYearId, options.terms, options.exams, options.termAssessments) : [], [options, effectiveYearId]);
  const exportTermIds = useMemo(() => reportTermIds(downloadScope, termId, options?.terms ?? [], selectedExportTerms), [downloadScope, termId, options, selectedExportTerms]);
  const exportChoices = useMemo(() => reportChoicesForDownload(reportChoices, downloadScope, exportTermIds, selectedExportExamKeys), [reportChoices, downloadScope, exportTermIds, selectedExportExamKeys]);

  useEffect(() => {
    let live = true;
    const combined = downloadScope !== "current";
    if (combined && (!effectiveYearId || !exportTermIds.length || !exportChoices.length)) return () => { live = false; };
    setState("loading");
    setData(null);
    getPublicReport({ data: {
      code,
      yearId: effectiveYearId || undefined,
      termId: termId || undefined,
      ...(combined ? { termIds: exportTermIds, examKeys: exportChoices.map((choice) => choice.key), showTermNames } : {}),
    } })
      .then((result) => {
        if (!live) return;
        if (result && "status" in result && result.status === "disabled") {
          setData(null);
          setState("blocked");
          return;
        }
        setData(result);
        if (result) {
          setOptions((current) => current ?? {
            years: result.reportPeriods?.years || [],
            terms: result.reportPeriods?.terms || [],
            exams: result.reportPeriods?.exams || [],
            termAssessments: result.reportPeriods?.termAssessments || [],
          });
          setDefaultYearId((current) => current || result.profile.activeYearId);
          setYearId((current) => current || result.profile.activeYearId);
          setTermId((current) => current || result.profile.activeTermId);
        }
        setState(result ? "ready" : "missing");
      })
      .catch(() => {
        if (live) { setData(null); setState("missing"); }
      });
    return () => {
      live = false;
    };
  }, [code, effectiveYearId, termId, downloadScope, exportTermIds, exportChoices, showTermNames]);

  if (state === "loading") {
    return (
      <main className="portal-loading grid min-h-screen place-items-center bg-paper px-6">
        <div className="portal-loading-aurora" aria-hidden="true" />
        <div className="portal-loading-ribbon-field" aria-hidden="true">
          <span className="portal-loading-ribbon portal-loading-ribbon-one" />
          <span className="portal-loading-ribbon portal-loading-ribbon-two" />
          <span className="portal-loading-ribbon portal-loading-ribbon-three" />
          <span className="portal-loading-ribbon portal-loading-ribbon-four" />
          <span className="portal-loading-ribbon-orb portal-loading-ribbon-orb-one" />
          <span className="portal-loading-ribbon-orb portal-loading-ribbon-orb-two" />
        </div>
        <div className="portal-loading-rays" aria-hidden="true" />
        <div className="portal-loading-atom" aria-hidden="true" />
        <div className="portal-loading-orbit-glints" aria-hidden="true" />
        <div className="portal-loading-stars" aria-hidden="true" />
        <div className="portal-loading-dust" aria-hidden="true" />
        <div className="portal-loading-card text-center" role="status" aria-live="polite">
          <p className="portal-loading-kicker">MUKUYU JUNIOR SCHOOL · LEARNER REPORTS</p>
          <span className="portal-loading-orbit" aria-hidden="true"><SchoolLogo className="size-20" /></span>
          <h1 className="portal-loading-title mt-5">A learner’s progress, at a glance</h1>
          <p className="portal-loading-tagline mt-2">Learning today. Shining tomorrow.</p>
          <p className="portal-loading-message mt-4 text-sm">Loading the selected report card securely…</p>
          <div className="portal-loading-track mt-6" aria-hidden="true"><span /></div>
          <div className="portal-loading-footnote mt-3"><span>Gathering the selected term’s results</span><span className="portal-loading-live"><i aria-hidden="true" /> IN MOTION</span></div>
        </div>
      </main>
    );
  }
  if (state === "missing" || state === "blocked" || !data) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6 text-center">
        <div>
          <SchoolLogo className="mx-auto size-20" />
          <h1 className="mt-4 font-serif text-3xl text-navy">{state === "blocked" ? "Report access is unavailable" : "Report not found"}</h1>
          <p className="mt-2 text-sm text-muted">{state === "blocked" ? "Public report viewing has been turned off by the school. Please contact the school office for help." : "That code is not on the Mukuyu Junior School roll."}</p>
          <Link to="/" search={{ c: undefined }} className="mt-4 inline-block text-sm font-semibold text-info">Back to sign in</Link>
        </div>
      </main>
    );
  }

  async function downloadReport() {
    if (!data || downloading) return;
    const combined = downloadScope !== "current";
    const yearName = options?.years.find((year) => year.id === effectiveYearId)?.name ?? data.profile.academicYear;
    const selectedTermNames = options?.terms.filter((term) => exportTermIds.includes(term.id)).map((term) => term.name) ?? [];
    const reportTitle = combined ? downloadScope === "year" ? "WHOLE YEAR REPORT" : "SELECTED TERMS REPORT" : data.calendar?.reportTitle;
    const periodLabel = combined
      ? showTermNames ? `${yearName} · ${selectedTermNames.join(", ")}` : `ACADEMIC YEAR ${yearName}`
      : `${data.profile.academicYear} · ${data.profile.termName}`;
    setDownloading(true);
    try {
      const url = new URL(`/?c=${encodeURIComponent(code)}`, window.location.origin).toString();
      const qr = data.profile.showQr ? await qrFor(url) : "";
      const safeName = data.row.learner.fullName.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "learner";
      const logo = await logoDataUrl(data.profile.logoData || "");
      await downloadReportPdf(`${safeName}-${data.profile.academicYear}-${data.profile.termName}-report.pdf`.replace(/[^a-z0-9._-]+/gi, "-"), [{ profile: data.profile, grade: data.grade, stream: data.stream, subjects: data.subjects, exams: data.exams, row: data.row, extras: data.extras, closingDate: combined ? "" : data.calendar?.closingDate ?? "", openingDate: combined ? "" : data.calendar?.openingDate ?? "", title: reportTitle, periodLabel, showDates: !combined, includeAllExams: combined, qr, logo }], pdfOrientation);
    } catch { window.print(); }
    finally { setDownloading(false); }
  }

  const isCombined = downloadScope !== "current";
  const reportTitle = isCombined ? downloadScope === "year" ? "WHOLE YEAR REPORT" : "SELECTED TERMS REPORT" : data.calendar?.reportTitle;

  return (
    <main className="min-h-screen bg-paper px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-sm text-muted">Official result slip · {data.profile.termName} {data.profile.academicYear} · code {code}. This page is open. It does not list other learners.</p>
        <section className="mb-4 rounded-xl border-2 border-info/30 bg-card p-4 shadow-sm print:hidden" aria-labelledby="previous-reports-heading">
          <h2 id="previous-reports-heading" className="font-serif text-xl font-bold text-navy">Previous report cards</h2>
          <p className="mt-1 text-sm text-muted">Select an academic year and term to view this learner’s earlier report card. The report updates automatically after each selection.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-navy">Academic year<select aria-label="Select academic year for previous report card" className="mt-1 w-full rounded-md border-2 border-info/40 bg-white px-3 py-2 text-sm" value={yearId} onChange={(event) => { setYearId(event.target.value); setSelectedExportTerms([]); setSelectedExportExamKeys([]); }}><option value="">Current year</option>{options?.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-navy">Term<select aria-label="Select term for previous report card" className="mt-1 w-full rounded-md border-2 border-info/40 bg-white px-3 py-2 text-sm" value={termId} onChange={(event) => setTermId(event.target.value)}><option value="">Current term</option>{options?.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
          </div>
          {options?.years.length ? <p className="mt-2 text-xs font-semibold text-info">{options.years.length} academic year option(s) and {options.terms.length} term option(s) available.</p> : <p className="mt-2 text-xs text-muted">No archived report periods are available for this learner yet.</p>}
        </section>
        {options && reportChoices.length ? <div className="mb-4 print:hidden"><ReportRangeOptions
          idPrefix="public-report-range"
          yearName={options.years.find((year) => year.id === effectiveYearId)?.name ?? data.profile.academicYear}
          currentTermId={termId || data.profile.activeTermId}
          terms={options.terms}
          choices={reportChoices}
          scope={downloadScope}
          onScope={setDownloadScope}
          selectedTermIds={selectedExportTerms}
          onSelectedTerms={setSelectedExportTerms}
          selectedExamKeys={selectedExportExamKeys}
          onSelectedExams={setSelectedExportExamKeys}
          showTermNames={showTermNames}
          onShowTermNames={setShowTermNames}
          orientation={pdfOrientation}
          onOrientation={setPdfOrientation}
        /></div> : null}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/20 bg-white p-3 shadow-sm print:hidden"><p className="text-sm text-muted">Keep a copy for your family records. Your report is generated for this learner only.</p><div className="flex gap-2"><button type="button" onClick={downloadReport} disabled={downloading || (isCombined && !exportChoices.length)} className={btnDownload.blue}>{downloading ? "Preparing PDF…" : "Download report card (PDF)"}</button><button type="button" onClick={() => window.print()} className="rounded-lg border border-navy/20 px-4 py-2 text-sm font-bold text-navy">Print / Save as PDF</button></div></div>
        {data.profile.whatsappGroupEnabled && data.profile.whatsappGroupUrl ? <a className="mb-4 block rounded-xl border-2 border-[#128C7E] bg-[#25D366] px-4 py-4 text-center text-base font-extrabold text-white shadow-lg ring-2 ring-[#25D366]/30 transition hover:brightness-95" aria-label={data.profile.whatsappGroupLabel || `Tap to join ${data.profile.name} WhatsApp group`} href={data.profile.whatsappGroupUrl} target="_blank" rel="noreferrer"><span className="block text-xs uppercase tracking-widest text-white/90">School community</span><span className="mt-1 block">{data.profile.whatsappGroupLabel || `Tap to join ${data.profile.name} WhatsApp group`}</span></a> : null}
        {isCombined && !exportChoices.length ? <p className="mb-4 rounded-lg border border-line bg-white p-4 text-sm text-muted">Choose at least one term and exam to build this combined report card.</p> : null}
        {!isCombined || exportChoices.length ? <ReportSheet
          profile={data.profile}
          grade={data.grade}
          stream={data.stream}
          subjects={data.subjects}
          exams={data.exams}
          row={data.row}
          closingDate={isCombined ? "" : data.calendar?.closingDate ?? ""}
          openingDate={isCombined ? "" : data.calendar?.openingDate ?? ""}
          title={reportTitle}
          extras={data.extras}
          includeAllExams={isCombined}
          showDates={!isCombined}
        /> : null}
        {(!isCombined || exportChoices.length) ? <QrParentFeedback code={code} learnerName={data.row.learner.fullName} gradeName={data.grade.name} streamName={data.stream?.name ?? "Stream not listed"} settings={data.feedbackSettings} teachers={data.feedbackTeachers} /> : null}
      </div>
    </main>
  );
}
