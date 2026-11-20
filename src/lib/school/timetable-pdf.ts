import type { Assignment, Grade, StaffMember, Stream, Subject, TimetableEntry, TimetablePeriod } from "@/lib/school/model";
import { coveredPeriodIds, subjectFace } from "@/components/school/timetable-sheet";

type TimetablePdfOptions = {
  schoolName: string;
  yearName: string;
  termName: string;
  periods: TimetablePeriod[];
  entries: TimetableEntry[];
  grades: Grade[];
  streams: Stream[];
  subjects: Subject[];
  staff: StaffMember[];
  assignments?: Assignment[];
  groupMode?: "class" | "teacher" | "summary";
  title?: string;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ABBREVIATED_DAYS = ["Mo", "Tu", "We", "Th", "Fr"];
type Sheet = { id: string; title: string; teacherName?: string; classTeacher?: string; gradeId?: string; streamId?: string | null; entries: TimetableEntry[] };

const SUBJECT_COLOURS = [[198,229,252],[204,239,216],[255,226,173],[226,211,248],[255,207,218],[191,239,232],[211,218,255],[255,220,184]] as const;
function subjectColour(subjectId: string): readonly [number, number, number] { let hash = 0; for (const char of subjectId) hash = (hash * 31 + char.charCodeAt(0)) % SUBJECT_COLOURS.length; return SUBJECT_COLOURS[hash]; }
function initials(staff: StaffMember | undefined, fallbackName: string) {
  const supplied = staff?.initials?.trim();
  if (supplied) return supplied.toUpperCase();
  return fallbackName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 4).toUpperCase();
}

function buildSheets(options: TimetablePdfOptions): Sheet[] {
  const mode = options.groupMode ?? "class";
  const sheets = new Map<string, Sheet>();
  if (mode === "teacher") {
    for (const entry of options.entries) {
      const teacher = options.staff.find((member) => member.id === entry.teacherUserId);
      const name = teacher?.fullName || entry.teacherName;
      const key = `teacher:${entry.teacherUserId}`;
      const sheet = sheets.get(key) ?? { id: key, title: `TEACHER TIMETABLE · ${name}`, teacherName: name, entries: [] };
      sheet.entries.push(entry);
      sheets.set(key, sheet);
    }
    return [...sheets.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  const gradeIds = [...new Set(options.entries.map((entry) => entry.gradeId))];
  for (const gradeId of gradeIds) {
    const gradeEntries = options.entries.filter((entry) => entry.gradeId === gradeId);
    const streamIds = [...new Set([
      ...gradeEntries.map((entry) => entry.streamId).filter((streamId): streamId is string => Boolean(streamId)),
      ...options.streams.filter((stream) => stream.gradeId === gradeId).map((stream) => stream.id),
    ])];
    const grade = options.grades.find((item) => item.id === gradeId)?.name || gradeId;
    const sheetStreams: Array<string | null> = streamIds.length ? streamIds : [null];
    for (const streamId of sheetStreams) {
      const stream = streamId ? options.streams.find((item) => item.id === streamId)?.name || streamId : "Whole grade";
      const sheetEntries = gradeEntries.filter((entry) => entry.streamId === streamId || (streamId !== null && entry.streamId === null));
      const sheet: Sheet = { id: `class:${gradeId}:${streamId ?? "all"}`, title: `${options.grades.find((item) => item.id === gradeId)?.level ?? ""}${String(stream).replace(/\s+/g, "")}`.toUpperCase() || `${grade} ${stream}`, gradeId, streamId, entries: sheetEntries };
      const assignment = options.assignments?.find((item) => item.kind === "class_teacher" && item.gradeId === gradeId && item.streamId === streamId);
      const streamRow = streamId ? options.streams.find((item) => item.id === streamId) : undefined;
      sheet.classTeacher = options.staff.find((member) => member.id === assignment?.userId)?.fullName || streamRow?.classTeacherLabel || "";
      sheets.set(sheet.id, sheet);
    }
  }
  return [...sheets.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function drawSheet(doc: import("jspdf").jsPDF, options: TimetablePdfOptions, sheet: Sheet, pageNo: number, pageCount: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 8;
  const right = pageWidth - 8;
  const tableWidth = right - left;
  const dayWidth = 15;
  const periods = [...options.periods].sort((a, b) => a.sort - b.sort);
  const lessonWidth = periods.length ? (tableWidth - dayWidth) / periods.length : 0;
  const headerTop = 29;
  const periodHeight = 9;
  const timeHeight = 7;
  const bodyTop = headerTop + periodHeight + timeHeight;
  const rowHeight = 25.6;
  const bodyHeight = rowHeight * DAYS.length;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(options.schoolName.toUpperCase(), pageWidth / 2, 9, { align: "center" });
  doc.setFontSize(15);
  doc.text(`${options.termName} ${options.yearName} ${sheet.title}`.replace(/\s+/g, " ").toUpperCase(), pageWidth / 2, 19, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const rightHeader = sheet.classTeacher ? `Class teacher: ${sheet.classTeacher}` : sheet.teacherName ? `Teacher: ${sheet.teacherName}` : "";
  if (rightHeader) doc.text(rightHeader, right - 1, 24.5, { align: "right" });
  doc.setTextColor(110, 110, 110);
  doc.text(options.yearName, left, 24.5);

  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.2);
  doc.setFillColor(244, 245, 247);
  doc.rect(left, headerTop, dayWidth, periodHeight + timeHeight, "FD");
  periods.forEach((period, index) => {
    const x = left + dayWidth + index * lessonWidth;
    doc.setFillColor(period.isBreak ? 184 : 24, period.isBreak ? 139 : 67, period.isBreak ? 54 : 99);
    doc.rect(x, headerTop, lessonWidth, periodHeight + timeHeight, "FD");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(period.isBreak ? 5.6 : 7.2);
    const periodLabel = period.isBreak ? period.label.toUpperCase() : period.label;
    const labelLines = doc.splitTextToSize(periodLabel, Math.max(lessonWidth - 2, 8)).slice(0, 2);
    doc.text(labelLines, x + lessonWidth / 2, headerTop + 4.1, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(235, 242, 248);
    doc.text(`${period.startTime}–${period.endTime}`, x + lessonWidth / 2, headerTop + periodHeight + 4.7, { align: "center" });
  });

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
    const y = bodyTop + dayIndex * rowHeight;
    doc.setFillColor(249, 249, 249);
    doc.rect(left, y, dayWidth, rowHeight, "FD");
    doc.setTextColor(33, 38, 44);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text(ABBREVIATED_DAYS[dayIndex], left + dayWidth / 2, y + rowHeight / 2 + 1.5, { align: "center" });
  }

  periods.forEach((period, periodIndex) => {
    const x = left + dayWidth + periodIndex * lessonWidth;
    if (period.isBreak) {
      doc.setFillColor(255, 238, 190);
      doc.rect(x, bodyTop, lessonWidth, bodyHeight, "FD");
      doc.setDrawColor(184, 139, 54);
      doc.setLineWidth(0.45);
      doc.line(x + 0.8, bodyTop, x + 0.8, bodyTop + bodyHeight);
      doc.line(x + lessonWidth - 0.8, bodyTop, x + lessonWidth - 0.8, bodyTop + bodyHeight);
      doc.setTextColor(126, 83, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(Math.min(7.2, Math.max(5.4, lessonWidth * 0.28)));
      const breakLines = doc.splitTextToSize(period.label.toUpperCase(), Math.max(8, lessonWidth - 3)).slice(0, 2);
      doc.text(breakLines, x + lessonWidth / 2, bodyTop + bodyHeight / 2 - (breakLines.length - 1) * 2, { align: "center", lineHeightFactor: 1.1 });
      return;
    }
    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
      const y = bodyTop + dayIndex * rowHeight;
      const cellEntries = sheet.entries.filter((entry) => entry.dayOfWeek === dayIndex + 1 && coveredPeriodIds(entry, periods).includes(period.id)).slice(0, 2);
      const cellColour = cellEntries.length ? subjectColour(cellEntries[0].subjectId) : [255, 255, 255] as const;
      doc.setFillColor(cellColour[0], cellColour[1], cellColour[2]);
      doc.rect(x, y, lessonWidth, rowHeight, "FD");
      cellEntries.forEach((entry, cellIndex) => {
        const subject = options.subjects.find((item) => item.id === entry.subjectId);
        const subjectName = subjectFace(subject);
        const teacher = options.staff.find((member) => member.id === entry.teacherUserId);
        const cellY = y + (cellEntries.length === 1 ? 3 : cellIndex * 12.1 + 1.5);
        doc.setTextColor(37, 43, 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(lessonWidth < 18 ? 7.3 : 9.2);
        const titleLines = doc.splitTextToSize(subjectName, Math.max(lessonWidth - 2, 8)).slice(0, 2);
        doc.text(titleLines, x + lessonWidth / 2, cellY + 6, { align: "center" });
        const subline = options.groupMode === "teacher" || sheet.teacherName
          ? `${options.grades.find((item) => item.id === entry.gradeId)?.name ?? ""} ${entry.streamId ? options.streams.find((item) => item.id === entry.streamId)?.name ?? "" : ""}`.trim()
          : (entry.teacherInitials?.trim() || initials(teacher, entry.teacherName));
        if (subline) {
          doc.setFontSize(5.7);
          doc.setTextColor(90, 90, 90);
          doc.text(subline, x + lessonWidth / 2, y + rowHeight - 3, { align: "center" });
        }
        if (options.groupMode === "teacher" && entry.room) {
          doc.setFontSize(5.1);
          doc.text(`Room ${entry.room}`, x + lessonWidth / 2, y + rowHeight - 7, { align: "center" });
        }
      });
    }
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(96, 96, 96);
  doc.text(`Generated by Mukuyu School Portal · ${pageNo} / ${pageCount}`, left, pageHeight - 5);
  if (!periods.length) {
    doc.setFontSize(10);
    doc.text("No periods have been configured for this year and term.", pageWidth / 2, bodyTop + 25, { align: "center" });
  }
}

function drawSummaryDay(doc: import("jspdf").jsPDF, options: TimetablePdfOptions, day: number, pageNo: number, pageCount: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const periods = [...options.periods].sort((a, b) => a.sort - b.sort);
  const classes = buildSheets({ ...options, groupMode: "class" });
  const left = 8;
  const top = 30;
  const rowLabelWidth = 23;
  const usableWidth = pageWidth - left * 2;
  const classWidth = classes.length ? (usableWidth - rowLabelWidth) / classes.length : usableWidth - rowLabelWidth;
  const headerHeight = 16;
  const rowHeight = Math.min(21, (pageHeight - top - headerHeight - 12) / Math.max(periods.length, 1));
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(options.schoolName.toUpperCase(), pageWidth / 2, 9, { align: "center" });
  doc.setFontSize(15);
  doc.text(`${options.termName.toUpperCase()} · WHOLE-SCHOOL SUMMARY · ${DAYS[day - 1].toUpperCase()}`, pageWidth / 2, 19, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(options.yearName, left, 25);
  doc.text("One row per class/stream; subject and teacher initials shown", pageWidth - left, 25, { align: "right" });

  doc.setLineWidth(0.2);
  doc.setDrawColor(70, 70, 70);
  doc.setFillColor(235, 239, 244);
  doc.rect(left, top, rowLabelWidth, headerHeight, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("PERIOD / TIME", left + rowLabelWidth / 2, top + 9, { align: "center" });
  classes.forEach((classSheet, classIndex) => {
    const x = left + rowLabelWidth + classIndex * classWidth;
    doc.setFillColor(235, 239, 244);
    doc.rect(x, top, classWidth, headerHeight, "FD");
    doc.setFontSize(Math.min(7, Math.max(4.5, classWidth * 0.25)));
    doc.text(doc.splitTextToSize(classSheet.title, classWidth - 2).slice(0, 2), x + classWidth / 2, top + 7, { align: "center" });
    if (classSheet.classTeacher) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.4);
      doc.text(doc.splitTextToSize(`CT: ${classSheet.classTeacher}`, classWidth - 2).slice(0, 1), x + classWidth / 2, top + 13, { align: "center" });
      doc.setFont("helvetica", "bold");
    }
  });

  periods.forEach((period, periodIndex) => {
    const y = top + headerHeight + periodIndex * rowHeight;
    doc.setFillColor(period.isBreak ? 246 : 249, period.isBreak ? 239 : 249, period.isBreak ? 224 : 249);
    doc.rect(left, y, rowLabelWidth, rowHeight, "FD");
    doc.setTextColor(35, 40, 48);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(period.isBreak ? period.label.toUpperCase() : period.label, left + rowLabelWidth / 2, y + rowHeight * 0.42, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.4);
    doc.text(`${period.startTime}–${period.endTime}`, left + rowLabelWidth / 2, y + rowHeight * 0.72, { align: "center" });
    classes.forEach((classSheet, classIndex) => {
      const x = left + rowLabelWidth + classIndex * classWidth;
      doc.setFillColor(period.isBreak ? 246 : 255, period.isBreak ? 239 : 255, period.isBreak ? 224 : 255);
      doc.rect(x, y, classWidth, rowHeight, "FD");
      if (period.isBreak) return;
      const lessons = classSheet.entries.filter((entry) => entry.dayOfWeek === day && entry.periodId === period.id);
      if (!lessons.length) return;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(37, 43, 50);
      const fontSize = Math.min(6.3, Math.max(4.5, classWidth * 0.22));
      doc.setFontSize(fontSize);
      const lines = lessons.slice(0, 3).map((entry) => {
        const subject = options.subjects.find((item) => item.id === entry.subjectId);
        const teacher = options.staff.find((item) => item.id === entry.teacherUserId);
        const label = `${subjectFace(subject)} · ${entry.teacherInitials?.trim() || initials(teacher, entry.teacherName)}`;
        return doc.splitTextToSize(label, classWidth - 2).slice(0, 1)[0];
      });
      doc.text(lines, x + classWidth / 2, y + Math.max(3, rowHeight / 2 - (lines.length - 1) * 1.5), { align: "center", lineHeightFactor: 1.1 });
    });
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(96, 96, 96);
  doc.text(`Generated by Mukuyu School Portal · ${pageNo} / ${pageCount}`, left, pageHeight - 5);
}

export async function createTimetablePdf(options: TimetablePdfOptions) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  if (options.groupMode === "summary") {
    DAYS.forEach((_, index) => {
      if (index) doc.addPage("a4", "landscape");
      drawSummaryDay(doc, options, index + 1, index + 1, DAYS.length);
    });
    return doc;
  }
  const sheets = buildSheets(options);
  if (!sheets.length) sheets.push({ id: "empty", title: options.groupMode === "teacher" ? "TEACHER TIMETABLE" : "CLASS TIMETABLE", entries: [] });
  sheets.forEach((sheet, index) => {
    if (index) doc.addPage("a4", "landscape");
    drawSheet(doc, options, sheet, index + 1, sheets.length);
  });
  return doc;
}

export async function downloadTimetablePdf(fileName: string, options: TimetablePdfOptions) {
  const doc = await createTimetablePdf(options);
  doc.save(fileName);
}

export async function timetablePdfBase64(options: TimetablePdfOptions) {
  const doc = await createTimetablePdf(options);
  const dataUri = doc.output("datauristring");
  return dataUri.split(",", 2)[1] || "";
}
