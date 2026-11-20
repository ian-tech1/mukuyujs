import type { Decorated, Exam, Grade, Profile, ReportExtras, Stream, Subject } from "@/lib/school/model";
import { fmt } from "@/lib/school/model";
import { remarkBody, reportFootnote } from "@/lib/school/extras";
import { chunkMarklistRows } from "@/lib/school/marklist.ts";

type DrawInput = {
  profile: Profile;
  grade: Grade;
  stream: Stream | undefined;
  subjects: Subject[];
  exams: Exam[];
  row: Decorated;
  qr: string;
  logo: string;
  closingDate?: string;
  openingDate?: string;
  title?: string;
  extras?: ReportExtras;
};

function hexRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const value = (hex || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function tone(level: string | null): [number, number, number] {
  if (!level) return [90, 90, 90];
  if (level.startsWith("EE")) return [31, 122, 77];
  if (level.startsWith("ME")) return [29, 78, 137];
  if (level.startsWith("AE")) return [180, 100, 20];
  return [150, 45, 45];
}

export async function downloadReportPdf(fileName: string, pages: DrawInput[], orientation: "landscape" | "portrait" = "landscape") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  pages.forEach((page, index) => {
    if (index) doc.addPage();
    if (orientation === "portrait") {
      const scaleX = doc.internal.pageSize.getWidth() / 297;
      const internal = doc.internal as typeof doc.internal & { write: (value: string) => void };
      internal.write("q");
      internal.write(`${scaleX} 0 0 1 0 0 cm`);
      drawReport(doc, page);
      internal.write("Q");
    } else {
      drawReport(doc, page);
    }
  });
  doc.save(fileName);
}

function paintLogo(doc: import("jspdf").jsPDF, logo: string, x: number, y: number, w: number, h: number) {
  if (!logo) return;
  try {
    doc.addImage(logo, "PNG", x, y, w, h);
  } catch {
    try {
      doc.addImage(logo, "JPEG", x, y, w, h);
    } catch {
      /* a broken upload should not stop the download */
    }
  }
}

function drawReport(doc: import("jspdf").jsPDF, input: DrawInput) {
  const { profile, grade, stream, subjects, row, qr, logo } = input;
  const exams = input.exams.slice(0, Math.max(1, Math.min(profile.reportExamCount || 2, input.exams.length)));
  const navy: [number, number, number] = [14, 42, 74];
  const info: [number, number, number] = [29, 78, 137];
  const brass: [number, number, number] = [154, 116, 48];
  const termColor = hexRgb(profile.activeTermId === "t1" ? profile.term1Color : profile.activeTermId === "t2" ? profile.term2Color : profile.term3Color, info);
  doc.setFillColor(255, 252, 247);
  doc.rect(0, 0, 297, 210, "F");
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.5);
  doc.rect(4, 4, 289, 202);
  doc.setFillColor(255, 252, 247);
  doc.rect(5, 5, 287, 36, "F");
  doc.setDrawColor(...brass);
  doc.rect(5, 5, 287, 36);
  paintLogo(doc, logo, 8, 8, 30, 22);
  paintLogo(doc, logo, 259, 8, 30, 22);
  doc.setTextColor(...navy);
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text(profile.name, 148.5, 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`P.O. BOX ${profile.poBox}`, 148.5, 17, { align: "center" });
  doc.setFontSize(6);
  const vision = doc.splitTextToSize(`VISION: ${profile.vision}`, 170);
  doc.text(vision, 148.5, 21, { align: "center" });
  const mission = doc.splitTextToSize(`MISSION: ${profile.mission}`, 170);
  doc.text(mission, 148.5, 27.2, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...brass);
  doc.text(`MOTTO: ${profile.motto}`, 148.5, 37.5, { align: "center" });

  doc.setDrawColor(...info);
  doc.setFillColor(255, 252, 247);
  doc.rect(88, 43, 121, 7);
  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(input.title || grade.reportTitle || profile.reportTitle, 148.5, 47.6, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text("NAME:", 8, 56);
  doc.setFont("helvetica", "bold");
  doc.text(`${row.learner.fullName}  |  ADMISSION NO: ${row.learner.admissionNumber || "Not assigned"}`, 22, 56, { maxWidth: 185 });
  doc.setFont("helvetica", "normal");
  doc.text(`GENDER:  ${row.learner.gender}`, 108, 62);
  doc.text(`GRADE:  ${grade.level}`, 168, 62);
  doc.text(`STREAM:  ${stream?.name ?? ""}`, 210, 62);

  if (profile.showQr && qr) doc.addImage(qr, "PNG", 8, 61, 22, 22);
  doc.setFontSize(7.5);
  doc.text(`CLOSING DATE:   ${input.closingDate || profile.closingDate}`, 34, 70);
  doc.text(`OPENING DATE:   ${input.openingDate || profile.resumptionDate}`, 34, 76);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text(profile.catNote, 34, 82);

  if (profile.showChart) drawChart(doc, subjects, exams, row, 188, 63, 96, 23);

  const tableY = 88;
  const tableWidth = 281;
  const showRank = Boolean(profile.showSubjectRank);
  const showInitials = Boolean(profile.showSubjectTeacherInitials);
  const fixedWidths = { subject: showRank ? 52 : 58, avg: 14, points: 14, level: 15, remarks: showRank ? 34 : 40, pos: showRank ? 12 : 0, initials: showInitials ? 19 : 0 };
  const catWidth = Math.min(30, Math.max(16, 14 + exams.length * 2));
  const remarksWidth = Math.max(24, tableWidth - fixedWidths.subject - fixedWidths.avg - fixedWidths.points - fixedWidths.level - fixedWidths.pos - fixedWidths.initials - catWidth * exams.length);
  const widths = [fixedWidths.subject, ...exams.map(() => catWidth), fixedWidths.avg, fixedWidths.points, fixedWidths.level, ...(showRank ? [fixedWidths.pos] : []), remarksWidth, ...(showInitials ? [fixedWidths.initials] : [])];
  const starts: number[] = [8];
  widths.forEach((width) => starts.push(starts[starts.length - 1] + width));
  const headers = ["SUBJECT", ...exams.map((exam) => exam.name), "AVG", "POINTS", "LEVEL", ...(showRank ? ["POS"] : []), "REMARKS", ...(showInitials ? ["TEACHER INITIALS"] : [])];
  doc.setFillColor(...termColor);
  doc.rect(8, tableY, tableWidth, 6, "F");
  doc.setTextColor(255, 252, 247);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  headers.forEach((label, i) => doc.text(String(label).slice(0, 18), starts[i] + 1.2, tableY + 4.1));

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  subjects.forEach((subject, index) => {
    const y = tableY + 6 + index * 6.3;
    if (index % 2 === 0) {
      doc.setFillColor(244, 247, 252);
      doc.rect(8, y, tableWidth, 6.3, "F");
    }
    const cell = row.cells.find((item) => item.subjectId === subject.id);
    const initials = profile.showSubjectTeacherInitials ? input.extras?.initials[subject.id] ?? "" : "";
    const rank = row.subjectRanks?.[subject.id];
    const values = [
      subject.name,
      ...exams.map((exam) => cell?.byExam[exam.id] == null ? "" : String(cell.byExam[exam.id])),
      cell?.avg == null ? "" : fmt(cell.avg),
      cell?.points == null ? "" : String(cell.points),
      cell?.level ?? "",
      ...(showRank ? [rank?.position == null ? "" : `${rank.position}/${rank.outOf}`] : []),
      remarkBody(profile, cell?.remark, input.extras?.customRemarks[subject.id]),
      ...(showInitials ? [initials] : []),
    ];
    doc.setFontSize(6.5);
    values.forEach((value, i) => {
      const color = headers[i] === "LEVEL" ? tone(cell?.level ?? null) : ([20, 20, 20] as [number, number, number]);
      doc.setTextColor(...color);
      if (headers[i] === "REMARKS" && initials && !showInitials) {
        doc.setFont("helvetica", "bold");
        const sig = initials.slice(0, 18);
        const sigWidth = doc.getTextWidth(sig);
        doc.text(sig, starts[i] + widths[i] - 1.2, y + 4.2, { align: "right" });
        doc.setFont("helvetica", "normal");
        const room = Math.max(8, widths[i] - 2.4 - sigWidth - 1.4);
        const text = doc.splitTextToSize(String(value), room)[0] ?? "";
        doc.text(text, starts[i] + 1.2, y + 4.2);
        return;
      }
      doc.setFont("helvetica", "normal");
      const maxWidth = widths[i] - 2.2;
      const text = doc.splitTextToSize(String(value), maxWidth)[0] ?? "";
      doc.text(text, starts[i] + 1.2, y + 4.2);
    });
  });
  const footnote = reportFootnote(profile, row, subjects, input.extras);
  const extraHeight = footnote ? 5 : 0;
  if (footnote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(20, 20, 20);
    doc.text(doc.splitTextToSize(footnote, tableWidth)[0] ?? "", 8, tableY + 6 + subjects.length * 6.3 + 3.2);
  }
  const foot = tableY + 6 + subjects.length * 6.3 + 2 + extraHeight;
  doc.setDrawColor(180, 180, 180);
  doc.line(8, foot, 289, foot);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(6.4);
  let line = foot + 4;
  if (profile.showPositions) {
    exams.forEach((exam) => {
      const slot = row.streamByExam[exam.id];
      const gender = row.genderByExam[exam.id];
      if (slot) doc.text(`${slot.position ?? "—"} out of ${slot.outOf} ${slot.label}`, 8, line);
      line += 3.4;
      if (gender) doc.text(`${gender.position ?? "—"} out of ${gender.outOf} ${gender.label} ${exam.name}`, 8, line);
      line += 3.4;
    });
  }

  doc.setFontSize(5.8);
  doc.text(doc.splitTextToSize(`CAT TOTALS: ${exams.map((exam) => `${exam.name} ${row.totals[exam.id] ?? 0}`).join(" | ")}`, 130), 78, foot + 5);
  doc.setFontSize(7.5);
  doc.text(`AVERAGE TOTAL: ${fmt(row.avgTotal)}   MEAN: ${fmt(row.avgMean)}`, 78, foot + 11);
  doc.text(`OVERALL POSITION: ${row.overall.position ?? "—"} / ${row.overall.outOf}   TOTAL POINTS: ${row.totalPoints ?? "—"}`, 78, foot + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("HEADTEACHER /", 78, foot + 22);
  doc.text("DEPUTY HEADTEACHER", 78, foot + 26);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.text(row.headRemark ?? "", 120, foot + 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("CLASS TEACHER'S NAME", 78, foot + 32);
  doc.setFont("helvetica", "normal");
  doc.text(stream?.classTeacherLabel || "—", 120, foot + 32);
  doc.setFont("helvetica", "bold");
  doc.text("REMARKS", 78, foot + 37);
  doc.setFont("helvetica", "italic");
  doc.text(row.classRemark ?? "", 120, foot + 37);
  if (profile.showTeacherInitials) {
    doc.setFont("helvetica", "bold");
    doc.text("TEACHER INITIALS", 78, foot + 42);
    doc.setFont("helvetica", "normal");
    doc.text(stream?.classTeacherInitials || "Not recorded", 120, foot + 42);
  }
  doc.setFont("helvetica", "normal");
  doc.text("PARENT'S SIGN  ______________________________", 8, 200);

  doc.setDrawColor(...navy);
  doc.rect(214, foot + 2, 74, 32);
  const summary = [
    ["POSITION", row.overall.position == null ? "—" : String(row.overall.position)],
    ["POINTS", row.levelPoints == null ? "—" : String(row.levelPoints)],
    ["LEVEL", row.level ?? "—"],
    ["REMARKS", row.headRemark ?? "—"],
  ];
  summary.forEach((pair, index) => {
    const y = foot + 8 + index * 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...navy);
    doc.text(pair[0], 217, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(pair[0] === "LEVEL" ? tone(row.level) : ([20, 20, 20] as [number, number, number])));
    const remark = doc.splitTextToSize(pair[1], 40);
    doc.text(remark, 240, y);
  });
}

function drawChart(
  doc: import("jspdf").jsPDF,
  subjects: Subject[],
  exams: Exam[],
  row: Decorated,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, w, h, "FD");
  const gap = w / subjects.length;
  const colors: Array<[number, number, number]> = [
    [29, 78, 137],
    [196, 122, 44],
    [120, 130, 140],
  ];
  subjects.forEach((subject, index) => {
    const cell = row.cells.find((item) => item.subjectId === subject.id);
    const scores = [
      exams[0] ? cell?.byExam[exams[0].id] : null,
      exams[1] ? cell?.byExam[exams[1].id] : null,
      cell?.avg ?? null,
    ];
    scores.forEach((score, series) => {
      const height = Math.max(0, Math.min(100, score ?? 0)) / 100 * (h - 8);
      doc.setFillColor(...colors[series]);
      const bx = x + index * gap + 1.2 + series * 2.3;
      doc.rect(bx, y + h - 5 - height, 2.1, height, "F");
    });
    doc.setFillColor(255, 255, 255);
    doc.rect(x + index * gap, y + h - 5.2, gap, 5.2, "F");
    doc.setFontSize(subjects.length > 7 ? 3.8 : 4.5);
    doc.setTextColor(40, 40, 40);
    doc.text(subject.shortName || subject.name, x + index * gap + gap / 2, y + h - 1.5, { align: "center", maxWidth: Math.max(4, gap - 0.5) });
  });
}

export async function downloadMarklist(options: {
  fileName: string;
  profile: Profile;
  grade: Grade;
  streamName: string;
  examName: string;
  subjects: Subject[];
  learners: Array<{ roll: number; fullName: string; gender: string; admissionNumber?: string | null; scores: Record<string, number | null> }>;
  blankRows: number;
  subjectOnly: Subject | null;
  logo: string;
  periodLabel: string;
  orientation?: "portrait" | "landscape";
}) {
  const { jsPDF } = await import("jspdf");
  const orientation = options.orientation ?? (options.subjectOnly ? "portrait" : "landscape");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const headY = 38;
  const rows = [
    ...options.learners.map((learner) => learner),
    ...Array.from({ length: options.blankRows }, (_, index) => ({
      roll: options.learners.length + index + 1,
      fullName: "",
      gender: "",
      admissionNumber: "",
      scores: {} as Record<string, number | null>,
    })),
  ];
  const rowHeight = options.subjectOnly ? 7 : 6.2;
  const firstRowY = headY + 6;
  const pageCapacity = Math.max(1, Math.floor((pageH - 18 - firstRowY) / rowHeight) + 1);
  const pages = chunkMarklistRows(rows, pageCapacity);

  function drawHeading(pageNumber: number) {
    doc.setFillColor(255, 252, 247);
    doc.rect(0, 0, pageW, 33, "F");
    doc.setDrawColor(154, 116, 48);
    doc.rect(4, 2, pageW - 8, 29);
    paintLogo(doc, options.logo, 6, 4, 22, 21);
    paintLogo(doc, options.logo, pageW - 28, 4, 22, 21);
    doc.setTextColor(14, 42, 74);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text(options.profile.name, pageW / 2, 9, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`VISION: ${options.profile.vision}`, pageW / 2, 13, { align: "center", maxWidth: pageW - 70 });
    doc.text(`MISSION: ${options.profile.mission}`, pageW / 2, 17, { align: "center", maxWidth: pageW - 70 });
    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.text(`MOTTO: ${options.profile.motto}`, pageW / 2, 21, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${options.periodLabel}  ·  ${options.grade.name}  ·  ${options.streamName}  ·  ${options.examName}  ·  ${options.subjectOnly ? options.subjectOnly.name : "ALL SUBJECTS"}`, pageW / 2, 28, { align: "center" });
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Subject teacher ______________________     Class teacher ______________________     Date ______________", 12, pageH - 10, { maxWidth: pageW * 0.72 });
    doc.setFontSize(7);
    doc.text(`Page ${pageNumber} of ${pages.length}`, pageW - 10, pageH - 10, { align: "right" });
  }

  pages.forEach((pageRows, pageIndex) => {
    if (pageIndex > 0) doc.addPage("a4", orientation);
    drawHeading(pageIndex + 1);
    const tableBottom = Math.min(pageH - 18, firstRowY + pageRows.length * rowHeight);
    doc.setFillColor(29, 78, 77);
    doc.rect(5, headY - 5, pageW - 10, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    if (options.subjectOnly) {
      const headers = ["#", "ADMISSION NO.", "LEARNER", "SCORE / 100", "LEVEL", "COMMENT"];
      const xs = [8, 20, 53, 5 + (pageW - 10) * 0.625, 5 + (pageW - 10) * 0.74, 5 + (pageW - 10) * 0.845];
      const bounds = [6, 18, 50, xs[3] - 3, xs[4] - 3, xs[5] - 3, pageW - 6];
      headers.forEach((header, index) => doc.text(header, xs[index], headY, { maxWidth: index < 3 ? undefined : xs[index + 1] ? xs[index + 1] - xs[index] - 3 : pageW - xs[index] - 8 }));
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      pageRows.forEach((learner, index) => {
        const y = firstRowY + index * rowHeight;
        doc.text(String(learner.roll), xs[0], y);
        doc.text((learner.admissionNumber || "—").slice(0, 18), xs[1], y);
        doc.text(learner.fullName.slice(0, 34), xs[2], y);
        const score = learner.scores[options.subjectOnly!.id];
        doc.text(score == null ? "" : String(score), xs[3], y);
        doc.setDrawColor(180, 190, 200);
        doc.line(5, y + 2, pageW - 5, y + 2);
      });
      doc.setDrawColor(150, 160, 170);
      bounds.forEach((x) => doc.line(x, headY - 5, x, tableBottom));
    } else {
      const subjects = options.subjects;
      const x0 = 8;
      const subjectStart = 92;
      const subjectGap = Math.max(2, Math.min(19, (pageW - subjectStart - 5) / Math.max(subjects.length, 1)));
      const tableRight = pageW - 5;
      doc.setFontSize(Math.max(4, Math.min(7, subjectGap * 0.65)));
      doc.text("#", x0, headY);
      doc.text("ADMISSION NO.", x0 + 8, headY);
      doc.text("LEARNER", x0 + 38, headY);
      subjects.forEach((subject, index) => doc.text(subject.shortName.slice(0, 12), subjectStart + index * subjectGap, headY, { maxWidth: Math.max(2, subjectGap - 0.5) }));
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      pageRows.forEach((learner, index) => {
        const y = firstRowY + index * rowHeight;
        doc.text(String(learner.roll), x0, y);
        doc.text((learner.admissionNumber || "—").slice(0, 15), x0 + 8, y);
        doc.text(learner.fullName.slice(0, 25), x0 + 38, y);
        subjects.forEach((subject, subjectIndex) => {
          const score = learner.scores[subject.id];
          doc.text(score == null ? "" : String(score), subjectStart + subjectIndex * subjectGap, y);
        });
        doc.setDrawColor(225, 220, 208);
        doc.line(5, y + 1.4, tableRight, y + 1.4);
      });
      doc.setDrawColor(150, 160, 170);
      [5, 14, 45, 89, ...subjects.map((_, index) => subjectStart - 3 + index * subjectGap), tableRight].forEach((x) => doc.line(x, headY - 5, x, tableBottom));
    }
  });
  doc.save(options.fileName);
}

export async function qrFor(text: string) {
  const QR = (await import("qrcode")).default;
  return QR.toDataURL(text, { margin: 0, width: 220, color: { dark: "#0e2a4a", light: "#ffffff" } });
}

export type MeritPdfAnalytics = {
  summary: Array<{ label: string; value: string }>;
  subjectMeans: Array<{ name: string; mean: number }>;
  streamMeans: Array<{ name: string; mean: number }>;
  scoreBands: Array<{ label: string; count: number }>;
  insights: Array<{ label: string; value: string; detail: string }>;
  trend: string;
  review: string;
};

/** Merit list as a PDF: school letterhead on every page, the ranked table, and (optionally) graphs and advanced analytics. */
export async function downloadMeritListPdf(options: {
  fileName: string;
  profile: Profile;
  logo: string;
  title: string;
  periodLabel: string;
  subjects: Array<{ shortName: string }>;
  rows: Array<{ position: string; roll: number; admission: string; name: string; stream: string; scores: string[]; mean: string; level: string }>;
  streamSummary: Array<{ name: string; meanLabel: string; learnerCount: number; topLearner: string }>;
  analytics: MeritPdfAnalytics | null;
  meanHeader?: string;
  levelHeader?: string;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const letterhead = () => {
    doc.setFillColor(255, 252, 247);
    doc.rect(0, 0, pageW, 36, "F");
    doc.setDrawColor(154, 116, 48);
    doc.rect(4, 2, pageW - 8, 32);
    paintLogo(doc, options.logo, 6, 4, 22, 21);
    paintLogo(doc, options.logo, pageW - 28, 4, 22, 21);
    doc.setTextColor(14, 42, 74);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text(options.profile.name, pageW / 2, 9, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`P.O. BOX ${options.profile.poBox} · ${options.profile.location}`, pageW / 2, 13, { align: "center" });
    doc.text(`VISION: ${options.profile.vision}`, pageW / 2, 17, { align: "center", maxWidth: pageW - 70 });
    doc.text(`MISSION: ${options.profile.mission}`, pageW / 2, 21, { align: "center", maxWidth: pageW - 70 });
    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.text(`MOTTO: ${options.profile.motto}`, pageW / 2, 25, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(options.title, pageW / 2, 29.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(options.periodLabel, pageW / 2, 33, { align: "center" });
    doc.setTextColor(20, 20, 20);
  };

  // ---- ranked table ----
  letterhead();
  const subjects = options.subjects;
  const left = 5;
  const fixed = { pos: 10, roll: 9, adm: 20, name: 46, stream: 16, mean: 13, level: 11 };
  const subjectW = Math.max(8, Math.min(16, (pageW - 10 - Object.values(fixed).reduce((a, b) => a + b, 0)) / Math.max(subjects.length, 1)));
  const xs: number[] = [];
  let cursor = left;
  for (const width of [fixed.pos, fixed.roll, fixed.adm, fixed.name, fixed.stream, ...subjects.map(() => subjectW), fixed.mean, fixed.level]) {
    xs.push(cursor);
    cursor += width;
  }
  const tableRight = cursor;
  const heads = ["POS", "NO.", "ADM NO.", "LEARNER", "STREAM", ...subjects.map((subject) => subject.shortName.slice(0, 7)), options.meanHeader ?? "MEAN", options.levelHeader ?? "LEVEL"];
  const drawHead = (y: number) => {
    doc.setFillColor(29, 78, 77);
    doc.rect(left, y - 4.5, tableRight - left, 6.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    heads.forEach((head, i) => doc.text(String(head).slice(0, 12), xs[i] + 1, y));
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
  };
  let y = 43;
  drawHead(y);
  y += 6;
  const rowH = 5.4;
  options.rows.forEach((row, index) => {
    if (y > pageH - 14) {
      doc.addPage();
      letterhead();
      y = 43;
      drawHead(y);
      y += 6;
    }
    if (index % 2 === 1) {
      doc.setFillColor(246, 244, 238);
      doc.rect(left, y - 3.8, tableRight - left, rowH, "F");
    }
    doc.setFontSize(6.5);
    const cells = [row.position, String(row.roll), row.admission || "—", row.name, row.stream, ...row.scores, row.mean, row.level];
    cells.forEach((cell, i) => {
      const limit = i === 3 ? 30 : i === 2 ? 14 : 12;
      doc.text(String(cell).slice(0, limit), xs[i] + 1, y);
    });
    y += rowH;
  });
  if (!options.rows.length) doc.text("No learners in this class for the selected year and term.", left + 2, y);

  // Stream means are always included in the merit-list PDF, even when optional analytics are disabled.
  y += 2;
  if (y > pageH - 28) { doc.addPage(); letterhead(); y = 43; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(14, 42, 74);
  doc.text("STREAM MEAN SUMMARY", left, y + 2);
  y += 6;
  doc.setFillColor(29, 78, 77);
  doc.rect(left, y - 3.5, pageW - 10, 5.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.text("STREAM", left + 2, y);
  doc.text("LEARNERS", left + 62, y);
  doc.text("MEAN", left + 91, y);
  doc.text("TOP LEARNER", left + 119, y);
  y += 6;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  options.streamSummary.forEach((item, index) => {
    if (y > pageH - 10) { doc.addPage(); letterhead(); y = 43; }
    if (index % 2 === 1) { doc.setFillColor(246, 244, 238); doc.rect(left, y - 3.5, pageW - 10, 5.5, "F"); }
    doc.setFontSize(7);
    doc.text(item.name.slice(0, 28), left + 2, y);
    doc.text(String(item.learnerCount), left + 62, y);
    doc.text(item.meanLabel, left + 91, y);
    doc.text(item.topLearner.slice(0, 48), left + 119, y);
    y += 5.5;
  });
  if (!options.streamSummary.length) { doc.setFontSize(7); doc.text("No stream results available for this grade.", left + 2, y); y += 5; }

  // ---- graphs and advanced analytics (optional) ----
  const a = options.analytics;
  if (a) {
    doc.addPage();
    letterhead();
    y = 43;
    const heading = (text: string) => {
      if (y > pageH - 24) { doc.addPage(); letterhead(); y = 43; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(14, 42, 74);
      doc.text(text, left, y);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      y += 5;
    };
    heading("Class summary");
    doc.setFontSize(8);
    const colW = (pageW - 10) / 4;
    a.summary.forEach((item, i) => {
      const cx = left + (i % 4) * colW;
      const cy = y + Math.floor(i / 4) * 12;
      doc.setDrawColor(200, 195, 180);
      doc.rect(cx, cy - 4, colW - 3, 10);
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 110);
      doc.text(item.label.toUpperCase(), cx + 2, cy);
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(item.value.slice(0, 28), cx + 2, cy + 4.5);
      doc.setFont("helvetica", "normal");
    });
    y += Math.ceil(a.summary.length / 4) * 12 + 4;

    const bars = (title: string, data: Array<{ label: string; value: number; text: string }>, max: number, color: [number, number, number]) => {
      heading(title);
      const labelW = 36;
      const barMax = pageW - 10 - labelW - 22;
      doc.setFontSize(7);
      data.forEach((item) => {
        if (y > pageH - 12) { doc.addPage(); letterhead(); y = 43; }
        doc.text(item.label.slice(0, 22), left, y);
        doc.setDrawColor(225, 220, 208);
        doc.rect(left + labelW, y - 3.2, barMax, 3.8);
        doc.setFillColor(...color);
        doc.rect(left + labelW, y - 3.2, Math.max(0.3, (Math.min(item.value, max) / max) * barMax), 3.8, "F");
        doc.text(item.text, left + labelW + barMax + 2, y);
        y += 5.2;
      });
      y += 3;
    };
    bars("Subject means", a.subjectMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), 100, [29, 78, 137]);
    bars("Stream means", a.streamMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), 100, [31, 122, 77]);
    const total = Math.max(1, a.scoreBands.reduce((sum, band) => sum + band.count, 0));
    bars("Score distribution (learners per mean-score band)", a.scoreBands.map((band) => ({ label: band.label, value: band.count, text: `${band.count} (${Math.round((band.count / total) * 100)}%)` })), total, [180, 100, 20]);

    heading("Advanced learner analytics");
    doc.setFontSize(7.5);
    a.insights.forEach((item) => {
      const detail = doc.splitTextToSize(item.detail, pageW - 10 - 85) as string[];
      const needed = Math.max(5, detail.length * 3.8 + 1.5);
      if (y + needed > pageH - 10) { doc.addPage(); letterhead(); y = 43; }
      doc.setFont("helvetica", "bold");
      doc.text(item.label, left, y);
      doc.text(item.value.slice(0, 30), left + 52, y);
      doc.setFont("helvetica", "normal");
      doc.text(detail, left + 85, y);
      doc.setDrawColor(230, 226, 214);
      doc.line(left, y + needed - 3.2, pageW - 5, y + needed - 3.2);
      y += needed;
    });
    y += 3;
    heading("Term trend");
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(a.trend || "No term results available.", pageW - 10) as string[], left, y);
    y += 8;
    heading("Learners needing review");
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(a.review || "No learners currently fall below the intervention threshold.", pageW - 10) as string[], left, y);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(`${options.profile.name} · ${options.title} · Page ${page} of ${pages}`, pageW / 2, pageH - 5, { align: "center" });
  }
  doc.save(options.fileName);
}

/** Landscape class merit list showing a mark and performance level for every subject and learner. */
export async function downloadSubjectLevelMeritListPdf(options: {
  fileName: string;
  profile: Profile;
  logo: string;
  title: string;
  periodLabel: string;
  subjects: Array<{ id: string; shortName: string; name: string }>;
  rows: Array<{ position: string; roll: number; admission: string; name: string; stream: string; subjectScores: string[]; mean: string; level: string }>;
  analytics?: MeritPdfAnalytics | null;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 5;
  const tableW = pageW - left * 2;
  const subjectsPerSection = 12;
  const subjectSections = options.subjects.length
    ? Array.from({ length: Math.ceil(options.subjects.length / subjectsPerSection) }, (_, index) => options.subjects.slice(index * subjectsPerSection, (index + 1) * subjectsPerSection))
    : [[]];
  // Balance chunks so the final page does not contain a single learner.
  // For example, 79 rows become 27 + 27 + 25 instead of 26 + 26 + 26 + 1.
  const dataPageCount = Math.max(1, Math.ceil(options.rows.length / 27));
  const rowsPerPage = Math.max(1, Math.ceil(options.rows.length / dataPageCount));

  function letterhead(sectionNumber: number, sectionCount: number) {
    doc.setFillColor(255, 252, 247);
    doc.rect(0, 0, pageW, 37, "F");
    doc.setDrawColor(154, 116, 48);
    doc.rect(4, 2, pageW - 8, 33);
    paintLogo(doc, options.logo, 6, 4, 22, 21);
    paintLogo(doc, options.logo, pageW - 28, 4, 22, 21);
    doc.setTextColor(14, 42, 74);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text(options.profile.name, pageW / 2, 9, { align: "center", maxWidth: pageW - 65 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`P.O. BOX ${options.profile.poBox} · ${options.profile.location}`, pageW / 2, 13, { align: "center" });
    doc.text(`VISION: ${options.profile.vision}`, pageW / 2, 17, { align: "center", maxWidth: pageW - 70 });
    doc.text(`MISSION: ${options.profile.mission}`, pageW / 2, 21, { align: "center", maxWidth: pageW - 70 });
    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.text(`MOTTO: ${options.profile.motto}`, pageW / 2, 25, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(options.title, pageW / 2, 29.5, { align: "center", maxWidth: pageW - 70 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`${options.periodLabel} · Subject group ${sectionNumber}/${sectionCount}`, pageW / 2, 33, { align: "center" });
  }

  let firstPage = true;
  subjectSections.forEach((section, sectionIndex) => {
    const identityWidths = [10, 9, 21, 49, 18, 14, 14];
    const subjectWidth = Math.max(8, (tableW - identityWidths.reduce((sum, width) => sum + width, 0)) / Math.max(section.length, 1));
    const widths = [...identityWidths.slice(0, 5), ...section.map(() => subjectWidth), ...identityWidths.slice(5)];
    const heads = ["POS", "NO.", "ADM NO.", "LEARNER", "STREAM", ...section.map((subject) => (subject.shortName || subject.name).slice(0, 12)), "MEAN", "OVERALL"];
    const xPositions = widths.reduce<number[]>((positions, width, index) => [...positions, index === 0 ? left : positions[index - 1] + widths[index - 1]], []);
    const pageChunks = options.rows.length ? Array.from({ length: Math.ceil(options.rows.length / rowsPerPage) }, (_, index) => options.rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage)) : [[]];
    pageChunks.forEach((pageRows, pageIndex) => {
      if (!firstPage) doc.addPage();
      firstPage = false;
      letterhead(sectionIndex + 1, subjectSections.length);
      const tableTop = 43;
      const rowHeight = 5.6;
      doc.setFillColor(14, 42, 74);
      doc.rect(left, tableTop - 4.2, tableW, 6.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      doc.setTextColor(255, 255, 255);
      heads.forEach((head, index) => {
        const centered = index >= 5;
        doc.text(head, centered ? xPositions[index] + widths[index] / 2 : xPositions[index] + 1, tableTop, { align: centered ? "center" : "left", maxWidth: Math.max(4, widths[index] - 1.5) });
      });
      pageRows.forEach((row, rowIndex) => {
        const y = tableTop + 5.8 + rowIndex * rowHeight;
        if (rowIndex % 2 === 1) {
          doc.setFillColor(246, 244, 238);
          doc.rect(left, y - 3.9, tableW, rowHeight, "F");
        }
        const cells = [row.position, String(row.roll), row.admission || "—", row.name, row.stream, ...section.map((subject) => row.subjectScores[options.subjects.findIndex((item) => item.id === subject.id)] || "—"), row.mean, row.level || "—"];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.1);
        // The column header is white; explicitly restore dark body text so
        // learner names and identity fields are visible on every page.
        doc.setTextColor(20, 20, 20);
        cells.forEach((cell, index) => {
          if (index >= 5 && index < 5 + section.length) {
            doc.setTextColor(...tone(cell === "—" ? null : String(cell)));
            doc.setFont("helvetica", "bold");
            doc.text(String(cell).slice(0, 12), xPositions[index] + widths[index] / 2, y, { align: "center", maxWidth: widths[index] - 1 });
            doc.setFont("helvetica", "normal");
            doc.setTextColor(20, 20, 20);
          } else {
            const value = String(cell || (index === 3 ? "—" : "")).slice(0, index === 3 ? 35 : 15);
            if (index === 3) doc.setFont("helvetica", "bold");
            doc.text(value, xPositions[index] + 1, y, { maxWidth: widths[index] - 2 });
            if (index === 3) doc.setFont("helvetica", "normal");
          }
        });
      });
      if (!pageRows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text("No learners are available for the selected class and period.", left + 2, tableTop + 12);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      doc.text(`Rows ${pageIndex * rowsPerPage + 1}–${Math.min((pageIndex + 1) * rowsPerPage, options.rows.length)} of ${options.rows.length} · Subject level values follow the configured assessment-band scale.`, left, pageH - 8);
    });
  });

  if (options.analytics) drawMeritAnalyticsPages(doc, options.analytics, letterhead, pageW, pageH, left);
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${page} of ${pageCount}`, pageW - left, pageH - 4, { align: "right" });
  }
  doc.save(options.fileName);
}

function drawMeritAnalyticsPages(doc: import("jspdf").jsPDF, analytics: MeritPdfAnalytics, letterhead: (sectionNumber: number, sectionCount: number) => void, pageW: number, pageH: number, left: number) {
  doc.addPage();
  letterhead(1, 1);
  let y = 43;
  const heading = (text: string) => { if (y > pageH - 22) { doc.addPage(); letterhead(1, 1); y = 43; } doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(14, 42, 74); doc.text(text, left, y); y += 5; };
  const bars = (title: string, data: Array<{ label: string; value: number; text: string }>, max: number, color: [number, number, number]) => { heading(title); const labelW = 42; const barMax = pageW - left - 10 - labelW - 22; doc.setFont("helvetica", "normal"); doc.setFontSize(7); for (const item of data) { if (y > pageH - 12) { doc.addPage(); letterhead(1, 1); y = 43; } doc.text(item.label.slice(0, 24), left, y); doc.setDrawColor(225, 220, 208); doc.rect(left + labelW, y - 3.2, barMax, 3.8); doc.setFillColor(...color); doc.rect(left + labelW, y - 3.2, Math.max(0.3, Math.min(1, item.value / Math.max(max, 1)) * barMax), 3.8, "F"); doc.text(item.text, left + labelW + barMax + 2, y); y += 5.2; } y += 3; };
  heading("Class summary"); doc.setFontSize(8); analytics.summary.forEach((item, index) => { const x = left + (index % 4) * ((pageW - left - 5) / 4); const yy = y + Math.floor(index / 4) * 12; doc.setDrawColor(200, 195, 180); doc.rect(x, yy - 4, (pageW - left - 5) / 4 - 3, 10); doc.setFontSize(6.5); doc.setTextColor(110, 110, 110); doc.text(item.label.toUpperCase(), x + 2, yy); doc.setTextColor(20, 20, 20); doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.text(item.value.slice(0, 25), x + 2, yy + 4.5); doc.setFont("helvetica", "normal"); }); y += Math.ceil(analytics.summary.length / 4) * 12 + 4;
  bars("Subject means", analytics.subjectMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), 100, [29, 78, 137]);
  bars("Stream means", analytics.streamMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), 100, [31, 122, 77]);
  const total = Math.max(1, analytics.scoreBands.reduce((sum, item) => sum + item.count, 0)); bars("Score distribution", analytics.scoreBands.map((item) => ({ label: item.label, value: item.count, text: `${item.count} (${Math.round(item.count / total * 100)}%)` })), total, [180, 100, 20]);
  heading("Advanced learner analytics"); doc.setFontSize(7.5); for (const item of analytics.insights) { const detail = doc.splitTextToSize(item.detail, pageW - left - 90) as string[]; const needed = Math.max(5, detail.length * 3.8 + 1.5); if (y + needed > pageH - 10) { doc.addPage(); letterhead(1, 1); y = 43; } doc.setFont("helvetica", "bold"); doc.text(item.label, left, y); doc.text(item.value.slice(0, 30), left + 52, y); doc.setFont("helvetica", "normal"); doc.text(detail, left + 85, y); doc.setDrawColor(230, 226, 214); doc.line(left, y + needed - 3.2, pageW - 5, y + needed - 3.2); y += needed; }
  heading("Term trend"); doc.setFontSize(8); doc.text(doc.splitTextToSize(analytics.trend || "No term results available.", pageW - left - 5) as string[], left, y); y += 8; heading("Learners needing review"); doc.text(doc.splitTextToSize(analytics.review || "No learners currently fall below the intervention threshold.", pageW - left - 5) as string[], left, y);
}
