import { useEffect, useState } from "react";
import { SchoolLogo } from "@/components/school/logo";
import { liveReportLink } from "@/lib/school/brand";
import type { Decorated, Exam, Grade, Profile, ReportExtras, Stream, Subject } from "@/lib/school/model";
import { fmt } from "@/lib/school/model";
import { remarkBody, reportFootnote } from "@/lib/school/extras";

export function ReportSheet({
  profile,
  grade,
  stream,
  subjects,
  exams: allExams,
  row,
  closingDate,
  openingDate,
  title,
  extras,
}: {
  profile: Profile;
  grade: Grade;
  stream?: Stream;
  subjects: Subject[];
  exams: Exam[];
  row: Decorated;
  closingDate?: string;
  openingDate?: string;
  title?: string;
  extras?: ReportExtras;
}) {
  const exams = allExams.slice(0, Math.max(1, Math.min(profile.reportExamCount || 2, allExams.length)));
  const termColor = profile.activeTermId === "t1" ? (profile.term1Color || "#1d4e89") : profile.activeTermId === "t2" ? (profile.term2Color || "#9a7430") : (profile.term3Color || "#1f7a4d");
  const link = liveReportLink(profile.publicBaseUrl, row.learner.publicCode || "");
  const qr = useQr(profile.showQr ? link : "");
  const logo = profile.logoData || "/logo.png";
  const closing = closingDate ?? profile.closingDate;
  const opening = openingDate ?? profile.resumptionDate;
  const heading = title || grade.reportTitle || profile.reportTitle;
  const footnote = reportFootnote(profile, row, subjects, extras);
  const showRank = Boolean(profile.showSubjectRank);
  return (
    <article className="report-print-area overflow-hidden rounded-md border border-ink bg-card text-ink shadow-card">
      <header className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-2 border-b border-brass bg-card px-3 py-3 text-navy sm:grid-cols-[5.5rem_1fr_5.5rem] sm:px-5">
        <SchoolLogo src={logo} className="size-16 sm:size-20" />
        <div className="text-center">
          <h3 className="font-serif text-lg leading-tight sm:text-2xl">{profile.name}</h3>
          <p className="mt-1 text-xs">P.O. BOX {profile.poBox}</p>
          <p className="mt-1 text-[11px] leading-snug sm:text-xs">VISION: {profile.vision}</p>
          <p className="text-[11px] leading-snug sm:text-xs">MISSION: {profile.mission}</p>
          <p className="mt-1 font-serif text-sm tracking-wide text-brass">MOTTO: {profile.motto}</p>
          {profile.showSubjectTeacherInitials ? <p className="mt-1 text-[9px] font-semibold tracking-wide">SUBJECT TEACHER INITIALS: {subjects.map((subject) => extras?.initials[subject.id] ? `${subject.shortName}: ${extras.initials[subject.id]}` : "").filter(Boolean).join(" · ") || "NOT RECORDED"}</p> : null}
        </div>
        <SchoolLogo src={logo} className="size-16 sm:size-20" />
      </header>
      <div className="px-4 py-3 sm:px-6">
        <p className="mx-auto w-fit border px-4 py-1 text-center text-xs font-semibold tracking-wide text-navy sm:text-sm" style={{ borderColor: termColor, boxShadow: `inset 0 -2px 0 ${termColor}` }}>
          {heading}
        </p>
        <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
          {profile.showQr ? (
            <div className="w-28 shrink-0 border border-line bg-white p-1 text-center">
              {qr ? <img src={qr} alt="Scan to open this report" className="mx-auto block size-24 object-contain" /> : <span className="text-xs text-muted">Loading QR…</span>}
              <span className="block text-[9px] leading-tight text-muted">SCAN REPORT</span>
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="text-sm">
              <p><span className="text-muted">NAME: </span><strong>{row.learner.fullName}</strong><span className="ml-3 text-muted">ADMISSION NO: </span><strong>{row.learner.admissionNumber || "Not assigned"}</strong></p>
              <p className="mt-1"><span className="text-muted">GENDER: </span>{row.learner.gender} <span className="ml-3 text-muted">GRADE: </span>{grade.level} <span className="ml-3 text-muted">STREAM: </span>{stream?.name}</p>
              <p className="mt-1 text-xs">CLOSING DATE: {closing || "—"}</p>
              <p className="text-xs">OPENING DATE: {opening || "—"}</p>
              <p className="mt-1 text-xs italic text-muted">{profile.catNote}</p>
              {profile.showQr ? <p className="mt-1 max-w-full break-all text-[10px] leading-tight text-info">{link}</p> : null}
            </div>
          </div>
          {profile.showChart ? <MiniChart subjects={subjects} exams={exams} row={row} /> : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-info text-paper">
              <tr>
                {["SUBJECT", ...exams.map((exam) => exam.name), "AVG", "POINTS", "LEVEL", ...(showRank ? ["POS"] : []), "REMARKS", ...(profile.showSubjectTeacherInitials ? ["TEACHER INITIALS"] : [])].map((heading) => (
                  <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => {
                const cell = row.cells.find((item) => item.subjectId === subject.id);
                return (
                  <tr key={subject.id} className="border-b border-line">
                    <td className="px-2 py-1.5">{subject.name}</td>
                    {exams.map((exam) => <td key={exam.id} className="px-2 py-1.5">{show(cell?.byExam[exam.id])}</td>)}
                    <td className="px-2 py-1.5">{cell?.avg == null ? "—" : fmt(cell.avg)}</td>
                    <td className="px-2 py-1.5">{cell?.points ?? "—"}</td>
                    <td className="px-2 py-1.5 font-semibold">{cell?.level ?? "—"}</td>
                    {showRank ? <td className="px-2 py-1.5">{rankText(row.subjectRanks?.[cell?.subjectId ?? ""])}</td> : null}
                    <td className="px-2 py-1.5">{remarkBody(profile, cell?.remark, extras?.customRemarks[subject.id])}</td>
                    {profile.showSubjectTeacherInitials ? <td className="px-2 py-1.5 text-center font-semibold tracking-wide">{extras?.initials[subject.id] || "—"}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div className="text-sm">
            {profile.showPositions ? (
              <div className="space-y-0.5 text-xs text-muted">
                {exams.map((exam) => (
                  <p key={exam.id}>
                    {row.streamByExam[exam.id]?.position ?? "—"} out of {row.streamByExam[exam.id]?.outOf} {row.streamByExam[exam.id]?.label}
                    {" · "}
                    {row.genderByExam[exam.id]?.position ?? "—"} out of {row.genderByExam[exam.id]?.outOf} {row.genderByExam[exam.id]?.label} {exam.name}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              {exams.map((exam) => <Stat key={exam.id + "-total"} label={`${exam.name} total`} value={String(row.totals[exam.id] ?? "—")} />)}
              <Stat label="Average total" value={fmt(row.avgTotal)} />
              <Stat label="Mean" value={fmt(row.avgMean)} />
              {exams.map((exam) => <Stat key={exam.id + "-position"} label={`${exam.name} position`} value={String(row.byExam[exam.id]?.position ?? "—")} />)}
              <Stat label="Out of" value={String(row.overall.outOf)} />
              <Stat label="Total points" value={String(row.totalPoints ?? "—")} />
            </div>
            {profile.showRemarks ? <p className="mt-3 text-xs"><span className="font-semibold">HEADTEACHER / DEPUTY: </span>{row.headRemark}</p> : null}
            <p className="mt-1 text-xs"><span className="font-semibold">CLASS TEACHER: </span>{stream?.classTeacherLabel || "—"}</p>
            {profile.showRemarks ? <p className="mt-1 text-xs"><span className="font-semibold">CLASS TEACHER REMARKS: </span>{row.classRemark}</p> : null}
            {footnote ? <p className="mt-2 text-xs">{footnote}</p> : null}
            <p className="mt-3 text-xs">{profile.requirements}</p>
            <p className="mt-1 text-xs">{profile.greeting}</p>
            <p className="text-xs italic">{profile.homeNote}</p>
            <p className="mt-4 text-xs">PARENT'S SIGN ________________________________</p>
          </div>
          <aside className="border border-navy p-3 text-sm">
            <Row k="POSITION" v={String(row.overall.position ?? "—")} />
            <Row k="POINTS" v={String(row.levelPoints ?? "—")} />
            <Row k="LEVEL" v={row.level ?? "—"} />
            <Row k="REMARKS" v={profile.showRemarks ? row.headRemark ?? "—" : "—"} />
          </aside>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </p>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-xs font-semibold text-navy">{k}</span>
      <span className="text-right text-xs">{v}</span>
    </p>
  );
}

function show(value: number | null | undefined) {
  return value == null ? "—" : String(value);
}

function rankText(slot: { position: number | null; outOf: number } | undefined) {
  if (!slot || slot.position == null) return "—";
  return `${slot.position}/${slot.outOf}`;
}

function MiniChart({ subjects, exams, row }: { subjects: Subject[]; exams: Exam[]; row: Decorated }) {
  return (
    <div className="w-full max-w-xs">
      <div className="flex h-24 items-end gap-1 border border-line bg-paper px-1 pt-2">
        {subjects.map((subject) => {
          const cell = row.cells.find((item) => item.subjectId === subject.id);
          const bars = [cell?.byExam[exams[0]?.id ?? ""], cell?.byExam[exams[1]?.id ?? ""], cell?.avg];
          const colors = ["bg-info", "bg-brass", "bg-muted"];
          return (
            <div key={subject.id} className="flex h-full flex-1 items-end gap-px">
              {bars.map((score, index) => (
                <span key={index} className={`${colors[index]} w-full`} style={{ height: `${Math.max(2, score ?? 0)}%` }} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-1 grid text-center text-[8px] leading-tight text-muted print:!visible" style={{ gridTemplateColumns: `repeat(${subjects.length}, minmax(0, 1fr))` }}>
        {subjects.map((subject) => <span key={subject.id} title={subject.name} className="min-w-0 break-words">{subject.shortName || subject.name}</span>)}
      </div>
    </div>
  );
}

function useQr(text: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((mod) => mod.default.toDataURL(text, { margin: 0, width: 180, color: { dark: "#0e2a4a", light: "#ffffff" } }))
      .then((value) => {
        if (live) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [text]);
  return url;
}
