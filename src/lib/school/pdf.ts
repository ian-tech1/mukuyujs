import type { Decorated, Exam, Grade, Profile, ReportExtras, Stream, Subject } from "@/lib/school/model";
import { fmt } from "@/lib/school/model";
import { remarkBody, reportFootnote } from "@/lib/school/extras";
import { chunkMarklistRows } from "@/lib/school/marklist.ts";
import { meritPdfLetterheadLayout, paginateMeritAnalyticsItems, paginateMeritTextLines, paginateSubjectLevelRows, subjectLevelBandCode, subjectLevelSubjectColumnWidth, subjectLevelSubjectSections, SUBJECT_LEVEL_ROW_HEIGHT_MM, type MeritPdfLetterheadLineCounts } from "@/lib/school/merit-pdf-layout.ts";

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
  periodLabel?: string;
  showDates?: boolean;
  includeAllExams?: boolean;
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

type MeritPdfLetterheadBlock = {
  key: keyof MeritPdfLetterheadLineCounts;
  lines: string[];
  font: "times" | "helvetica";
  style: "normal" | "bold";
  fontSize: number;
  color: [number, number, number];
};

type PreparedMeritPdfLetterhead = {
  blocks: MeritPdfLetterheadBlock[];
  layout: ReturnType<typeof meritPdfLetterheadLayout>;
};

function prepareMeritPdfLetterhead(
  doc: import("jspdf").jsPDF,
  profile: Profile,
  title: string,
  periodLabel: string,
  pageW: number,
): PreparedMeritPdfLetterhead {
  const centerWidth = Math.max(40, pageW - 76);
  const specs: Array<{
    key: keyof MeritPdfLetterheadLineCounts;
    text: string;
    font: "times" | "helvetica";
    style: "normal" | "bold";
    fontSize: number;
    color: [number, number, number];
  }> = [
    { key: "school", text: profile.name, font: "times", style: "bold", fontSize: 11.2, color: [14, 42, 74] },
    { key: "address", text: `P.O. BOX ${profile.poBox} · ${profile.location}`, font: "helvetica", style: "normal", fontSize: 6.4, color: [14, 42, 74] },
    { key: "vision", text: `VISION: ${profile.vision}`, font: "helvetica", style: "normal", fontSize: 5.6, color: [14, 42, 74] },
    { key: "mission", text: `MISSION: ${profile.mission}`, font: "helvetica", style: "normal", fontSize: 5.6, color: [14, 42, 74] },
    { key: "motto", text: `MOTTO: ${profile.motto}`, font: "times", style: "bold", fontSize: 7.2, color: [14, 42, 74] },
    { key: "title", text: title, font: "helvetica", style: "bold", fontSize: 8.1, color: [14, 42, 74] },
    { key: "period", text: periodLabel, font: "helvetica", style: "normal", fontSize: 6.2, color: [14, 42, 74] },
  ];
  const lineCounts = {} as MeritPdfLetterheadLineCounts;
  const blocks: MeritPdfLetterheadBlock[] = specs.map((spec) => {
    doc.setFont(spec.font, spec.style);
    doc.setFontSize(spec.fontSize);
    const lines = doc.splitTextToSize(spec.text, centerWidth) as string[];
    lineCounts[spec.key] = lines.length;
    return { ...spec, lines };
  });
  return { blocks, layout: meritPdfLetterheadLayout(lineCounts) };
}

function drawMeritPdfLetterhead(
  doc: import("jspdf").jsPDF,
  letterhead: PreparedMeritPdfLetterhead,
  logo: string,
  pageW: number,
): number {
  doc.setFillColor(255, 252, 247);
  doc.rect(0, 0, pageW, letterhead.layout.headerBottom + 3, "F");
  doc.setDrawColor(154, 116, 48);
  doc.rect(4, 2, pageW - 8, letterhead.layout.headerBottom);
  paintLogo(doc, logo, 6, 4, 22, 21);
  paintLogo(doc, logo, pageW - 28, 4, 22, 21);
  for (const block of letterhead.blocks) {
    doc.setTextColor(...block.color);
    doc.setFont(block.font, block.style);
    doc.setFontSize(block.fontSize);
    doc.text(block.lines, pageW / 2, letterhead.layout[block.key], { align: "center" });
  }
  doc.setTextColor(20, 20, 20);
  return letterhead.layout.tableTop;
}

function drawReport(doc: import("jspdf").jsPDF, input: DrawInput) {
  const { profile, grade, stream, subjects, row, qr, logo } = input;
  const exams = input.includeAllExams ? input.exams : input.exams.slice(0, Math.max(1, Math.min(profile.reportExamCount || 2, input.exams.length)));
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
  if (input.periodLabel) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(input.periodLabel, 148.5, 52.2, { align: "center" });
  }

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
  if (input.showDates !== false) {
    const closingDate = input.closingDate ?? profile.closingDate;
    const openingDate = input.openingDate ?? profile.resumptionDate;
    doc.text(`CLOSING DATE:   ${closingDate || "—"}`, 34, 70);
    doc.text(`OPENING DATE:   ${openingDate || "—"}`, 34, 76);
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text(profile.catNote, 34, 82);

  if (profile.showChart) drawChart(doc, subjects, exams, row, 188, 63, 96, 23);

  const tableY = 88;
  const tableWidth = 281;
  const showRank = Boolean(profile.showSubjectRank);
  const showInitials = Boolean(profile.showSubjectTeacherInitials);
  const fixedWidths = { subject: showRank ? 52 : 58, avg: 14, points: 14, level: 15, remarks: showRank ? 34 : 40, pos: showRank ? 12 : 0, initials: showInitials ? 19 : 0 };
  const fixedColumnWidth = fixedWidths.subject + fixedWidths.avg + fixedWidths.points + fixedWidths.level + fixedWidths.pos + fixedWidths.initials;
  const catWidth = Math.min(30, Math.max(4, (tableWidth - fixedColumnWidth - 14) / Math.max(1, exams.length)));
  const remarksWidth = Math.max(14, tableWidth - fixedColumnWidth - catWidth * exams.length);
  const widths = [fixedWidths.subject, ...exams.map(() => catWidth), fixedWidths.avg, fixedWidths.points, fixedWidths.level, ...(showRank ? [fixedWidths.pos] : []), remarksWidth, ...(showInitials ? [fixedWidths.initials] : [])];
  const starts: number[] = [8];
  widths.forEach((width) => starts.push(starts[starts.length - 1] + width));
  const headers = ["SUBJECT", ...exams.map((exam) => exam.name), "AVG", "POINTS", "LEVEL", ...(showRank ? ["POS"] : []), "REMARKS", ...(showInitials ? ["TEACHER INITIALS"] : [])];
  doc.setFillColor(...termColor);
  doc.rect(8, tableY, tableWidth, 6, "F");
  doc.setTextColor(255, 252, 247);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(exams.length > 8 ? 4.8 : exams.length > 4 ? 5.6 : 6.5);
  headers.forEach((label, i) => {
    const maxWidth = widths[i] - 2.2;
    let text = String(label).slice(0, 24);
    while (text.length > 3 && doc.getTextWidth(text) > maxWidth) text = text.slice(0, -1);
    doc.text(text, starts[i] + 1.2, tableY + 4.1);
  });

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
  subjectMeanMax?: number;
  subjectPositions?: Array<{ position: string; name: string; mean: number | null }>;
  levelDistribution?: Array<{ level: string; students: number; boys: number; girls: number; other: number }>;
  streamMeans: Array<{ name: string; mean: number }>;
  streamMeanMax?: number;
  scoreBands: Array<{ label: string; count: number }>;
  insights: Array<{ label: string; value: string; detail: string }>;
  trend: string;
  review: string;
};

function drawSubjectPositionColumn(
  doc: import("jspdf").jsPDF,
  subjects: NonNullable<MeritPdfAnalytics["subjectPositions"]>,
  levels: NonNullable<MeritPdfAnalytics["levelDistribution"]>,
  x: number,
  topY: number,
  pageH: number,
  title = "SUBJECT POSITIONS",
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(14, 42, 74);
  doc.text(title, x, topY);
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text("POS", x + 2, topY + 5);
  doc.text("SUBJECT", x + 14, topY + 5);
  doc.text("MEAN", x + 79, topY + 5, { align: "right" });
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");

  const contentY = topY + 9;
  const availableHeight = Math.max(0, pageH - 10 - contentY);
  const levelRowCount = levels.length ? levels.length + 1 : 1;
  const levelRowHeight = Math.min(4.8, Math.max(3.5, (availableHeight * 0.36) / levelRowCount));
  const levelBlockHeight = 13 + levelRowHeight * levelRowCount;
  const subjectAvailableHeight = Math.max(0, availableHeight - levelBlockHeight - 3);
  const subjectRowHeight = subjects.length ? Math.min(4.8, subjectAvailableHeight / subjects.length) : 0;
  let y = contentY;
  if (!subjects.length) {
    doc.setFontSize(7);
    doc.text("No subjects available.", x + 2, y);
    y += 4;
  } else {
    subjects.forEach((subject, index) => {
      if (index % 2 === 1) {
        doc.setFillColor(246, 244, 238);
        doc.rect(x, y - 3.2, 83, subjectRowHeight, "F");
      }
      doc.setFontSize(Math.max(4.5, Math.min(7, subjectRowHeight * 1.35)));
      doc.text(subject.position, x + 2, y);
      doc.text(subject.name, x + 14, y, { maxWidth: 62 });
      doc.text(subject.mean == null ? "—" : subject.mean.toFixed(2), x + 79, y, { align: "right" });
      y += subjectRowHeight;
    });
  }
  doc.setDrawColor(215, 210, 198);
  doc.line(x, topY + 6.5, x + 83, topY + 6.5);
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(14, 42, 74);
  doc.text(title === "SUBJECT POSITIONS" ? "LEARNERS BY LEVEL" : "LEVEL COUNTS (continued)", x, y);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.4);
  doc.setTextColor(100, 100, 100);
  doc.text("LEVEL", x + 2, y);
  doc.text("STUDENTS", x + 49, y, { align: "right" });
  doc.text("BOYS", x + 60, y, { align: "right" });
  doc.text("GIRLS", x + 71, y, { align: "right" });
  doc.text("OTHER", x + 81, y, { align: "right" });
  doc.setDrawColor(215, 210, 198);
  doc.line(x, y + 1.5, x + 83, y + 1.5);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);

  if (!levels.length) {
    doc.setFontSize(6.2);
    doc.text("No learners in the selected roster.", x + 2, y);
    return y + levelRowHeight;
  }

  const totals = levels.reduce((total, item) => ({
    students: total.students + item.students,
    boys: total.boys + item.boys,
    girls: total.girls + item.girls,
    other: total.other + item.other,
  }), { students: 0, boys: 0, girls: 0, other: 0 });
  const rows = [...levels, { level: "TOTAL", ...totals }];
  rows.forEach((item, index) => {
    if (index === rows.length - 1) {
      doc.setFillColor(235, 231, 220);
      doc.rect(x, y - 3.2, 83, levelRowHeight, "F");
      doc.setFont("helvetica", "bold");
    } else if (index % 2 === 1) {
      doc.setFillColor(246, 244, 238);
      doc.rect(x, y - 3.2, 83, levelRowHeight, "F");
    }
    doc.setFontSize(Math.max(4.5, Math.min(6.3, levelRowHeight * 1.25)));
    const levelLabel = item.level === "No recorded level" ? "NO LEVEL" : item.level;
    doc.text(levelLabel, x + 2, y, { maxWidth: 38 });
    doc.text(String(item.students), x + 49, y, { align: "right" });
    doc.text(String(item.boys), x + 60, y, { align: "right" });
    doc.text(String(item.girls), x + 71, y, { align: "right" });
    doc.text(String(item.other), x + 81, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += levelRowHeight;
  });
  return y;
}

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
  orientation?: "landscape" | "portrait";
}) {
  const { jsPDF } = await import("jspdf");
  const orientation = options.orientation ?? "landscape";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const preparedLetterhead = prepareMeritPdfLetterhead(doc, options.profile, options.title, options.periodLabel, pageW);
  const letterhead = () => drawMeritPdfLetterhead(doc, preparedLetterhead, options.logo, pageW);

  // ---- ranked table ----
  let y = letterhead();
  const subjects = options.subjects;
  const left = 5;
  const fixed = orientation === "portrait"
    ? { pos: 7, roll: 7, adm: 17, name: 34, stream: 12, mean: 12, level: 11 }
    : { pos: 10, roll: 9, adm: 20, name: 46, stream: 16, mean: 13, level: 11 };
  const subjectW = Math.max(1, Math.min(16, (pageW - 10 - Object.values(fixed).reduce((a, b) => a + b, 0)) / Math.max(subjects.length, 1)));
  const widths = [fixed.pos, fixed.roll, fixed.adm, fixed.name, fixed.stream, ...subjects.map(() => subjectW), fixed.mean, fixed.level];
  const xs: number[] = [];
  let cursor = left;
  for (const width of widths) {
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
    doc.setFontSize(orientation === "portrait" ? 5 : 6.5);
    heads.forEach((head, i) => doc.text(String(head).slice(0, orientation === "portrait" ? 6 : 12), xs[i] + 0.5, y, { maxWidth: Math.max(1, widths[i] - 1) }));
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
  };
  drawHead(y);
  y += 6;
  const rowH = 5.4;
  options.rows.forEach((row, index) => {
    if (y > pageH - 14) {
      doc.addPage();
      y = letterhead();
      drawHead(y);
      y += 6;
    }
    if (index % 2 === 1) {
      doc.setFillColor(246, 244, 238);
      doc.rect(left, y - 3.8, tableRight - left, rowH, "F");
    }
    doc.setFontSize(orientation === "portrait" ? 5 : 6.5);
    const cells = [row.position, String(row.roll), row.admission || "—", row.name, row.stream, ...row.scores, row.mean, row.level];
    cells.forEach((cell, i) => {
      doc.text(String(cell), xs[i] + 0.5, y, { maxWidth: Math.max(1, widths[i] - 1) });
    });
    y += rowH;
  });
  if (!options.rows.length) doc.text("No learners in this class for the selected year and term.", left + 2, y);

  // Stream means are always included in the merit-list PDF, even when optional analytics are disabled.
  y += 2;
  if (y > pageH - 28) { doc.addPage(); y = letterhead(); }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(14, 42, 74);
  doc.text("STREAM MEAN SUMMARY", left, y + 2);
  y += 6;
  const streamSummaryColumns = orientation === "portrait"
    ? { learners: left + 45, mean: left + 70, topLearner: left + 96 }
    : { learners: left + 62, mean: left + 91, topLearner: left + 119 };
  doc.setFillColor(29, 78, 77);
  doc.rect(left, y - 3.5, pageW - 10, 5.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.text("STREAM", left + 2, y);
  doc.text("LEARNERS", streamSummaryColumns.learners, y);
  doc.text("MEAN", streamSummaryColumns.mean, y);
  doc.text("TOP LEARNER", streamSummaryColumns.topLearner, y);
  y += 6;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  options.streamSummary.forEach((item, index) => {
    if (y > pageH - 10) { doc.addPage(); y = letterhead(); }
    if (index % 2 === 1) { doc.setFillColor(246, 244, 238); doc.rect(left, y - 3.5, pageW - 10, 5.5, "F"); }
    doc.setFontSize(7);
    doc.text(item.name, left + 2, y, { maxWidth: streamSummaryColumns.learners - left - 4 });
    doc.text(String(item.learnerCount), streamSummaryColumns.learners, y);
    doc.text(item.meanLabel, streamSummaryColumns.mean, y);
    doc.text(item.topLearner, streamSummaryColumns.topLearner, y, { maxWidth: pageW - streamSummaryColumns.topLearner - 8 });
    y += 5.5;
  });
  if (!options.streamSummary.length) { doc.setFontSize(7); doc.text("No stream results available for this grade.", left + 2, y); y += 5; }

  // ---- graphs and advanced analytics (optional) ----
  const a = options.analytics;
  if (a) {
    doc.addPage();
    y = letterhead();
    const heading = (text: string) => {
      if (y > pageH - 24) { doc.addPage(); y = letterhead(); }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(14, 42, 74);
      doc.text(text, left, y);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      y += 5;
    };
    const addAnalyticsContinuation = (text: string) => {
      doc.addPage();
      y = letterhead();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(14, 42, 74);
      doc.text(`${text} (continued)`, left, y);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      y += 5;
    };
    heading("Class summary");
    const colW = (pageW - 10) / 4;
    const summarySegmentLines = 36;
    for (let start = 0; start < a.summary.length; start += 4) {
      const items = a.summary.slice(start, start + 4).map((item) => ({
        ...item,
        labelLines: doc.splitTextToSize(item.label.toUpperCase(), colW - 7) as string[],
        valueLines: doc.splitTextToSize(item.value, colW - 7) as string[],
      }));
      const longest = Math.max(1, ...items.map((item) => item.valueLines.length));
      for (let offset = 0; offset < longest; offset += summarySegmentLines) {
        const prepared = items.map((item) => {
          const valueLines = item.valueLines.slice(offset, offset + summarySegmentLines);
          const labelLines = offset === 0 ? item.labelLines : valueLines.length ? ["(continued)"] : [];
          return { ...item, labelLines, valueLines };
        });
        const rowHeight = Math.max(10, ...prepared.map((item) => 4 + item.labelLines.length * 2.5 + item.valueLines.length * 3.3));
        if (y + rowHeight > pageH - 12) addAnalyticsContinuation("Class summary");
        prepared.forEach((item, index) => {
          const cx = left + index * colW;
          doc.setDrawColor(200, 195, 180);
          doc.rect(cx, y, colW - 3, rowHeight);
          doc.setFontSize(6.5);
          doc.setTextColor(110, 110, 110);
          if (item.labelLines.length) doc.text(item.labelLines, cx + 2, y + 2.8);
          doc.setTextColor(20, 20, 20);
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          if (item.valueLines.length) doc.text(item.valueLines, cx + 2, y + 3 + item.labelLines.length * 2.6);
          doc.setFont("helvetica", "normal");
        });
        y += rowHeight + 2;
      }
    }
    y += 2;

    const bars = (title: string, data: Array<{ label: string; value: number; text: string }>, max: number, color: [number, number, number]) => {
      heading(title);
      const labelW = 36;
      const barMax = pageW - 10 - labelW - 22;
      doc.setFontSize(7);
      data.forEach((item) => {
        if (y > pageH - 12) { doc.addPage(); y = letterhead(); }
        doc.text(item.label, left, y, { maxWidth: labelW - 2 });
        doc.setDrawColor(225, 220, 208);
        doc.rect(left + labelW, y - 3.2, barMax, 3.8);
        doc.setFillColor(...color);
        doc.rect(left + labelW, y - 3.2, Math.max(0.3, (Math.min(item.value, max) / max) * barMax), 3.8, "F");
        doc.text(item.text, left + labelW + barMax + 2, y);
        y += 5.2;
      });
      y += 3;
    };
    bars("Subject means", a.subjectMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), a.subjectMeanMax ?? 100, [29, 78, 137]);
    bars("Stream means", a.streamMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), a.streamMeanMax ?? 100, [31, 122, 77]);
    const total = Math.max(1, a.scoreBands.reduce((sum, band) => sum + band.count, 0));
    bars("Score distribution (learners per mean-score band)", a.scoreBands.map((band) => ({ label: band.label, value: band.count, text: `${band.count} (${Math.round((band.count / total) * 100)}%)` })), total, [180, 100, 20]);

    heading("Advanced learner analytics");
    const subjectColumnX = pageW - 88;
    let subjectColumnBottom = drawSubjectPositionColumn(doc, a.subjectPositions ?? [], a.levelDistribution ?? [], subjectColumnX, y - 5, pageH);
    doc.setFontSize(7.5);
    const detailWidth = Math.max(10, subjectColumnX - left - 89);
    const insightLineHeight = 3.5;
    for (const item of a.insights) {
      const labelLines = doc.splitTextToSize(item.label, 48) as string[];
      const valueLines = doc.splitTextToSize(item.value, 28) as string[];
      const detailLines = doc.splitTextToSize(item.detail, detailWidth) as string[];
      const totalLines = Math.max(labelLines.length, valueLines.length, detailLines.length, 1);
      let offset = 0;
      while (offset < totalLines) {
        const availableLines = Math.floor((pageH - 10 - y - 2) / insightLineHeight);
        if (availableLines < 1) {
          addAnalyticsContinuation("Advanced learner analytics");
          subjectColumnBottom = drawSubjectPositionColumn(doc, a.subjectPositions ?? [], a.levelDistribution ?? [], subjectColumnX, y - 5, pageH, "SUBJECT POSITIONS (continued)");
          continue;
        }
        const lineCount = Math.min(availableLines, totalLines - offset);
        const labelChunk = labelLines.slice(offset, offset + lineCount);
        const valueChunk = valueLines.slice(offset, offset + lineCount);
        const detailChunk = detailLines.slice(offset, offset + lineCount);
        const renderedLines = Math.max(labelChunk.length, valueChunk.length, detailChunk.length, 1);
        const needed = Math.max(5, renderedLines * insightLineHeight + 1.5);
        doc.setFont("helvetica", "bold");
        if (labelChunk.length) doc.text(labelChunk, left, y);
        if (valueChunk.length) doc.text(valueChunk, left + 52, y);
        doc.setFont("helvetica", "normal");
        if (detailChunk.length) doc.text(detailChunk, left + 85, y);
        doc.setDrawColor(230, 226, 214);
        doc.line(left, y + needed - 3.2, subjectColumnX - 4, y + needed - 3.2);
        y += needed;
        offset += lineCount;
      }
    }
    y = Math.max(y + 3, subjectColumnBottom + 3);
    heading("Term trend");
    const drawFullWidthText = (text: string, continuationTitle: string) => {
      const lines = doc.splitTextToSize(text, pageW - 10) as string[];
      let offset = 0;
      while (offset < lines.length) {
        let availableLines = Math.floor((pageH - 12 - y - 2) / 3.5);
        if (availableLines < 1) {
          addAnalyticsContinuation(continuationTitle);
          availableLines = Math.floor((pageH - 12 - y - 2) / 3.5);
        }
        const chunk = lines.slice(offset, offset + Math.max(1, availableLines));
        doc.setFontSize(8);
        doc.text(chunk, left, y);
        y += chunk.length * 3.5 + 2;
        offset += chunk.length;
      }
    };
    drawFullWidthText(a.trend || "No term results available.", "Term trend");
    heading("Learners needing review");
    drawFullWidthText(a.review || "No learners currently fall below the intervention threshold.", "Learners needing review");
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

/** Subject-level class merit list showing a mark and performance level for every subject and learner. */
export async function downloadSubjectLevelMeritListPdf(options: {
  fileName: string;
  profile: Profile;
  logo: string;
  title: string;
  periodLabel: string;
  subjects: Array<{ id: string; shortName: string; name: string }>;
  rows: Array<{ position: string; roll: number; admission: string; name: string; stream: string; subjectScores: string[]; mean: string; level: string }>;
  analytics?: MeritPdfAnalytics | null;
  orientation?: "landscape" | "portrait";
}) {
  const { jsPDF } = await import("jspdf");
  const orientation = options.orientation ?? "landscape";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 5;
  const tableW = pageW - left * 2;
  const rowHeight = SUBJECT_LEVEL_ROW_HEIGHT_MM;
  const subjectSections = subjectLevelSubjectSections(options.subjects, orientation);
  const preparedHeaders = subjectSections.map((_, sectionIndex) => prepareMeritPdfLetterhead(
    doc,
    options.profile,
    options.title,
    `${options.periodLabel} · Subject group ${sectionIndex + 1}/${subjectSections.length}`,
    pageW,
  ));
  const maximumTableTop = Math.max(43, ...preparedHeaders.map((header) => header.layout.tableTop));
  const pageChunks = paginateSubjectLevelRows(options.rows, pageH, rowHeight, maximumTableTop);

  function letterhead(sectionNumber: number, sectionCount: number) {
    const header = sectionCount === subjectSections.length
      ? preparedHeaders[sectionNumber - 1]
      : prepareMeritPdfLetterhead(doc, options.profile, options.title, `${options.periodLabel} · Subject group ${sectionNumber}/${sectionCount}`, pageW);
    return drawMeritPdfLetterhead(doc, header, options.logo, pageW);
  }

  let firstPage = true;
  subjectSections.forEach((section, sectionIndex) => {
    const identityWidths = orientation === "portrait" ? [6, 5, 14, 32, 11, 9, 9] : [10, 9, 21, 49, 18, 14, 14];
    const subjectWidth = subjectLevelSubjectColumnWidth(tableW, identityWidths, section.length);
    const widths = [...identityWidths.slice(0, 5), ...section.map(() => subjectWidth), ...identityWidths.slice(5)];
    const subjectHeaderLimit = orientation === "portrait" ? Math.max(3, Math.floor(subjectWidth * 0.72)) : 12;
    const subjectFontSize = orientation === "portrait" ? Math.max(4.5, Math.min(6.1, subjectWidth * 0.72)) : 6.1;
    const identityHeads = orientation === "portrait" ? ["POS", "NO.", "ADM", "LEARNER", "STR"] : ["POS", "NO.", "ADM NO.", "LEARNER", "STREAM"];
    const endingHeads = orientation === "portrait" ? ["MEAN", "OVR"] : ["MEAN", "OVERALL"];
    const heads = [...identityHeads, ...section.map((subject) => (subject.shortName || subject.name).slice(0, subjectHeaderLimit)), ...endingHeads];
    const xPositions = widths.reduce<number[]>((positions, width, index) => [...positions, index === 0 ? left : positions[index - 1] + widths[index - 1]], []);
    pageChunks.forEach((pageRows, pageIndex) => {
      if (!firstPage) doc.addPage();
      firstPage = false;
      const tableTop = letterhead(sectionIndex + 1, subjectSections.length);
      doc.setFillColor(14, 42, 74);
      doc.rect(left, tableTop - 4.2, tableW, 6.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(orientation === "portrait" ? Math.min(5.8, subjectFontSize) : 5.8);
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
        doc.setFontSize(orientation === "portrait" ? subjectFontSize : 6.1);
        // The column header is white; explicitly restore dark body text so
        // learner names and identity fields are visible on every page.
        doc.setTextColor(20, 20, 20);
        cells.forEach((cell, index) => {
          if (index >= 5 && index < 5 + section.length) {
            const bandCode = subjectLevelBandCode(String(cell));
            doc.setTextColor(...tone(bandCode === "—" ? null : bandCode));
            doc.setFont("helvetica", "bold");
            const compactValue = String(cell).replace(/\s*·\s*/g, "·");
            doc.text(compactValue, xPositions[index] + widths[index] / 2, y, { align: "center", maxWidth: widths[index] - 1 });
            doc.setFont("helvetica", "normal");
            doc.setTextColor(20, 20, 20);
          } else {
            const value = String(cell || (index === 3 ? "—" : ""));
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
      const rowsBeforePage = pageChunks.slice(0, pageIndex).reduce((count, chunk) => count + chunk.length, 0);
      const rowRange = pageRows.length ? `Rows ${rowsBeforePage + 1}–${rowsBeforePage + pageRows.length} of ${options.rows.length}` : "No learner rows";
      doc.text(`${rowRange} · Subject level values follow the configured assessment-band scale.`, left, pageH - 8);
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

function drawMeritAnalyticsPages(doc: import("jspdf").jsPDF, analytics: MeritPdfAnalytics, letterhead: (sectionNumber: number, sectionCount: number) => number, pageW: number, pageH: number, left: number) {
  const bottom = pageH - 10;
  let y = 0;
  let analyticsHeaderTop = 43;
  const addPage = () => {
    doc.addPage();
    analyticsHeaderTop = letterhead(1, 1);
    y = analyticsHeaderTop;
  };
  const heading = (text: string) => {
    if (y + 8 > bottom) addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(14, 42, 74);
    doc.text(text, left, y);
    doc.setTextColor(20, 20, 20);
    y += 5;
  };
  const wrap = (text: string, width: number, fontSize: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(String(text || "—"), Math.max(2, width)) as string[];
  };
  const bars = (title: string, data: Array<{ label: string; value: number; text: string }>, max: number, color: [number, number, number]) => {
    heading(title);
    const labelW = Math.min(48, Math.max(34, pageW * 0.2));
    const barMax = Math.max(20, pageW - left - 10 - labelW - 24);
    if (!data.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("No results available.", left, y + 1);
      y += 8;
      return;
    }
    for (let index = 0; index < data.length; index += 1) {
      const item = data[index];
      const labelLines = wrap(item.label, labelW - 2, 6.8);
      const rowHeight = Math.max(6, labelLines.length * 3.4 + 1);
      if (y + rowHeight > bottom) {
        addPage();
        heading(`${title} (continued)`);
      }
      if (index % 2) {
        doc.setFillColor(249, 247, 241);
        doc.rect(left, y - 3.6, pageW - left - 5, rowHeight, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(35, 35, 35);
      doc.text(labelLines, left, y);
      doc.setDrawColor(225, 220, 208);
      doc.rect(left + labelW, y - 3.2, barMax, 3.8);
      doc.setFillColor(...color);
      doc.rect(left + labelW, y - 3.2, Math.max(0.3, (Math.min(item.value, Math.max(max, 1)) / Math.max(max, 1)) * barMax), 3.8, "F");
      doc.setFontSize(6.8);
      doc.text(item.text, left + labelW + barMax + 2, y, { maxWidth: pageW - left - (left + labelW + barMax + 2) - 4 });
      y += rowHeight + 1;
    }
    y += 2;
  };

  addPage();
  heading("Class summary");
  const cardWidth = (pageW - left - 5) / 4;
  const summarySegmentLines = 42;
  for (let start = 0; start < analytics.summary.length; start += 4) {
    const items = analytics.summary.slice(start, start + 4).map((item) => ({
      item,
      labelLines: wrap(item.label.toUpperCase(), cardWidth - 4, 6.2, true),
      valueLines: wrap(item.value, cardWidth - 4, 7.1, true),
    }));
    const longest = Math.max(1, ...items.map((card) => card.valueLines.length));
    for (let offset = 0; offset < longest; offset += summarySegmentLines) {
      const cards = items.map((card) => {
        const valueLines = card.valueLines.slice(offset, offset + summarySegmentLines);
        const labelLines = offset === 0 ? card.labelLines : valueLines.length ? ["(continued)"] : [];
        const height = Math.max(10, 3 + labelLines.length * 2.6 + valueLines.length * 2.8);
        return { ...card, labelLines, valueLines, height };
      });
      const rowHeight = Math.max(...cards.map((card) => card.height));
      if (y + rowHeight > bottom) {
        addPage();
        heading("Class summary (continued)");
      }
      cards.forEach((card, index) => {
        const x = left + index * cardWidth;
        doc.setFillColor(255, 253, 248);
        doc.setDrawColor(200, 195, 180);
        doc.roundedRect(x, y - 3.5, cardWidth - 3, rowHeight, 1.2, 1.2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.2);
        doc.setTextColor(110, 110, 110);
        if (card.labelLines.length) doc.text(card.labelLines, x + 2, y);
        doc.setFontSize(7.1);
        doc.setTextColor(20, 20, 20);
        if (card.valueLines.length) doc.text(card.valueLines, x + 2, y + card.labelLines.length * 2.6 + 1.5);
      });
      y += rowHeight + 2;
    }
  }

  bars("Subject means", analytics.subjectMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), analytics.subjectMeanMax ?? 100, [29, 78, 137]);
  bars("Stream means", analytics.streamMeans.map((item) => ({ label: item.name, value: item.mean, text: item.mean ? item.mean.toFixed(1) : "—" })), analytics.streamMeanMax ?? 100, [31, 122, 77]);
  const total = Math.max(1, analytics.scoreBands.reduce((sum, item) => sum + item.count, 0));
  bars("Score distribution (learners per mean-score band)", analytics.scoreBands.map((item) => ({ label: item.label, value: item.count, text: `${item.count} (${Math.round(item.count / total * 100)}%)` })), total, [180, 100, 20]);

  const subjectColumnX = pageW - 88;
  const labelWidth = pageW < 250 ? 32 : 46;
  const valueWidth = pageW < 250 ? 27 : 30;
  const valueX = left + labelWidth + 2;
  const detailX = valueX + valueWidth + 2;
  const detailWidth = Math.max(10, subjectColumnX - detailX - 5);
  const continuationInsightHeight = Math.max(1, bottom - analyticsHeaderTop - 5 - 3);
  const preparedInsights = analytics.insights.map((item) => {
    const labelLines = wrap(item.label, labelWidth, 6.3, true);
    const valueLines = wrap(item.value, valueWidth, 6.3, true);
    const detailLines = wrap(item.detail, detailWidth, 6.3);
    const longest = Math.max(labelLines.length, valueLines.length, detailLines.length, 1);
    const maxLinesPerSegment = Math.max(1, Math.floor((continuationInsightHeight - 1.6) / 3.2));
    return Array.from({ length: Math.ceil(longest / maxLinesPerSegment) }, (_, segmentIndex) => {
      const offset = segmentIndex * maxLinesPerSegment;
      const next = offset + maxLinesPerSegment;
      const labelChunk = labelLines.slice(offset, next);
      const valueChunk = valueLines.slice(offset, next);
      const detailChunk = detailLines.slice(offset, next);
      const visibleLabel = labelChunk.length ? labelChunk : offset > 0 ? ["(continued)"] : [];
      const lineCount = Math.max(visibleLabel.length, valueChunk.length, detailChunk.length, 1);
      return { item, labelLines: visibleLabel, valueLines: valueChunk, detailLines: detailChunk, height: Math.max(5.6, lineCount * 3.2 + 1.6) };
    });
  });
  const insightItems = preparedInsights.flat();
  if (insightItems.length && y + 5 + insightItems[0].height + 3 > bottom) addPage();
  const firstInsightHeight = Math.max(1, bottom - y - 5 - 3);
  const insightPages = paginateMeritAnalyticsItems(
    insightItems,
    firstInsightHeight,
    (item) => item.height,
    continuationInsightHeight,
  );
  const pages = insightPages.length ? insightPages : [[]];
  pages.forEach((pageItems, pageIndex) => {
    if (pageIndex > 0) addPage();
    heading(pageIndex ? "Advanced learner analytics (continued)" : "Advanced learner analytics");
    const subjectColumnBottom = drawSubjectPositionColumn(
      doc,
      analytics.subjectPositions ?? [],
      analytics.levelDistribution ?? [],
      subjectColumnX,
      y - 5,
      pageH,
      pageIndex ? "SUBJECT POSITIONS (continued)" : "SUBJECT POSITIONS",
    );
    if (!pageItems.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("No advanced insights are available for this roster.", left, y + 2);
      y = Math.max(y + 8, subjectColumnBottom + 3);
      return;
    }
    for (const entry of pageItems) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.3);
      doc.setTextColor(25, 35, 48);
      doc.text(entry.labelLines, left, y);
      doc.text(entry.valueLines, valueX, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(entry.detailLines, detailX, y);
      doc.setDrawColor(230, 226, 214);
      doc.line(left, y + entry.height - 2.5, subjectColumnX - 4, y + entry.height - 2.5);
      y += entry.height;
    }
    y = Math.max(y + 3, subjectColumnBottom + 3);
  });

  const drawWideSection = (title: string, content: string, fallback: string) => {
    const lines = wrap(content || fallback, pageW - left - 10, 8);
    const lineHeight = 4.1;
    if (y + 5 + lineHeight > bottom) addPage();
    heading(title);
    const firstPageCapacity = Math.max(1, Math.floor((bottom - y - 2) / lineHeight));
    const continuationPageCapacity = Math.max(1, Math.floor((bottom - analyticsHeaderTop - 5 - 2) / lineHeight));
    const pages = paginateMeritTextLines(lines, firstPageCapacity, continuationPageCapacity);
    pages.forEach((pageLines, pageIndex) => {
      if (pageIndex > 0) {
        addPage();
        heading(`${title} (continued)`);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      doc.text(pageLines, left, y);
      y += pageLines.length * lineHeight + 2;
    });
  };
  drawWideSection("Term trend", analytics.trend, "No term results available.");
  drawWideSection("Learners needing review", analytics.review, "No learners currently fall below the intervention threshold.");
}
