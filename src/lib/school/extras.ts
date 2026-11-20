import type { Band, Exam, Learner, LearnerBoard, Mark, Profile, ReportExtras, Subject, SubjectCell, SubjectTeacherSlot, Term, TermNote, Workspace, Year } from "@/lib/school/model";
import { buildBoards, fmt } from "@/lib/school/model";

/** Initials of the teachers actually assigned to this subject and class. A stream assignment wins over a grade-wide one. */
export function initialsForSubject(
  slots: SubjectTeacherSlot[],
  learner: { gradeId: string; streamId: string },
  subjectId: string,
) {
  const matches = slots.filter((slot) => {
    if (slot.subjectId !== subjectId || !slot.initials.trim()) return false;
    if (slot.gradeId && slot.gradeId !== learner.gradeId) return false;
    if (slot.streamId && slot.streamId !== learner.streamId) return false;
    return true;
  });
  const streamHits = matches.filter((slot) => slot.streamId === learner.streamId);
  const gradeHits = matches.filter((slot) => slot.gradeId === learner.gradeId && !slot.streamId);
  const schoolHits = matches.filter((slot) => !slot.gradeId && !slot.streamId);
  const pool = streamHits.length ? streamHits : gradeHits.length ? gradeHits : schoolHits;
  return [...new Set(pool.map((slot) => slot.initials.trim().toUpperCase()).filter(Boolean))].sort().join(" / ");
}

export function previousPeriod(years: Year[], terms: Term[], yearId: string, termId: string) {
  const year = years.find((item) => item.id === yearId);
  const term = terms.find((item) => item.id === termId);
  if (!year || !term) return null;
  const earlier = terms.filter((item) => item.sort < term.sort).sort((a, b) => b.sort - a.sort)[0];
  if (earlier) return { yearId, termId: earlier.id };
  const prevYear = years.filter((item) => item.sort < year.sort).sort((a, b) => b.sort - a.sort)[0];
  const lastTerm = [...terms].sort((a, b) => b.sort - a.sort)[0];
  if (!prevYear || !lastTerm) return null;
  return { yearId: prevYear.id, termId: lastTerm.id };
}

export function meanForPeriod(
  learner: Learner,
  marks: Mark[],
  yearId: string,
  termId: string,
  subjects: Subject[],
  exams: Exam[],
  bands: Band[],
) {
  const slice = marks.filter((mark) => mark.learnerId === learner.id && mark.yearId === yearId && mark.termId === termId);
  if (!slice.length) return null;
  return buildBoards([learner], slice, subjects, exams, bands)[0]?.avgMean ?? null;
}

export function extrasFor(
  ws: Pick<Workspace, "subjectTeacherSlots" | "termNotes" | "subjectRemarks" | "marks" | "years" | "terms" | "bands">,
  learner: Learner,
  yearId: string,
  termId: string,
  subjects: Subject[],
  exams: Exam[],
): ReportExtras {
  const initials: Record<string, string> = {};
  for (const subject of subjects) {
    const value = initialsForSubject(ws.subjectTeacherSlots, learner, subject.id);
    if (value) initials[subject.id] = value;
  }
  const customRemarks: Record<string, string> = {};
  for (const row of ws.subjectRemarks) {
    if (row.learnerId === learner.id && row.yearId === yearId && row.termId === termId && row.remark.trim()) {
      customRemarks[row.subjectId] = row.remark.trim();
    }
  }
  const prev = previousPeriod(ws.years, ws.terms, yearId, termId);
  return {
    initials,
    previousMean: prev ? meanForPeriod(learner, ws.marks, prev.yearId, prev.termId, subjects, exams, ws.bands) : null,
    termNote: ws.termNotes.find((note) => note.learnerId === learner.id && note.yearId === yearId && note.termId === termId) ?? null,
    customRemarks,
  };
}

/** Automatic band remark, unless a teacher wrote one and that switch is on. */
export function remarkBody(profile: Profile, auto: string | null | undefined, custom: string | undefined) {
  if (profile.showCustomRemarks && custom?.trim()) return custom.trim();
  if (profile.showRemarks) return auto ?? "";
  return "";
}

export function spotlightLine(cells: SubjectCell[], subjects: Subject[]) {
  const scored = cells
    .filter((cell) => cell.avg != null)
    .map((cell) => ({ name: subjects.find((subject) => subject.id === cell.subjectId)?.name ?? "Subject", avg: cell.avg as number }));
  if (!scored.length) return "";
  const best = [...scored].sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name))[0];
  const weak = [...scored].sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name))[0];
  if (!best || !weak || best.name === weak.name) return best ? `Best subject: ${best.name} (${best.avg.toFixed(0)})` : "";
  return `Best subject: ${best.name} (${best.avg.toFixed(0)}) · Needs attention: ${weak.name} (${weak.avg.toFixed(0)})`;
}

export function reportFootnote(profile: Profile, row: LearnerBoard, subjects: Subject[], extras: ReportExtras | undefined) {
  if (!extras) return "";
  const bits: string[] = [];
  if (profile.showSubjectSpotlight) {
    const line = spotlightLine(row.cells, subjects);
    if (line) bits.push(line);
  }
  if (profile.showPreviousTerm && extras.previousMean != null && row.avgMean != null) {
    const delta = row.avgMean - extras.previousMean;
    bits.push(`Previous term mean ${fmt(extras.previousMean)} (${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`);
  }
  if (profile.showAttendance && extras.termNote && noteHasContent(extras.termNote)) {
    const note = extras.termNote;
    const parts = [`Attendance ${note.daysPresent ?? "—"}/${note.daysExpected ?? "—"}`];
    if (note.conduct.trim()) parts.push(`Conduct ${note.conduct.trim()}`);
    if (note.comment.trim()) parts.push(note.comment.trim());
    bits.push(parts.join(", "));
  }
  return bits.join(" · ");
}

export function noteHasContent(note: TermNote) {
  return note.daysPresent != null || note.daysExpected != null || Boolean(note.conduct.trim()) || Boolean(note.comment.trim());
}
