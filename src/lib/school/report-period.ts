export type ReportTermChoice = { id: string; name: string; sort: number };
export type ReportExamChoice = {
  key: string;
  yearId: string;
  termId: string;
  termName: string;
  termSort: number;
  examId: string;
  examName: string;
  examSort: number;
  examCode: string;
};

type ExamInput = { id: string; name: string; code: string; sort: number };
type AssessmentInput = { yearId: string; termId: string; examId: string; active: boolean };
type PeriodMark = { yearId: string; termId: string; examId: string };
type GradeScopedMark = { learnerId: string; gradeId?: string };

export function reportExamChoiceKey(termId: string, examId: string) {
  return JSON.stringify([termId, examId]);
}

function sourceMarkKey(yearId: string, termId: string, examId: string) {
  return JSON.stringify([yearId, termId, examId]);
}

export function buildReportExamChoices(
  yearId: string,
  terms: ReportTermChoice[],
  exams: ExamInput[],
  assessments: AssessmentInput[],
): ReportExamChoice[] {
  const orderedTerms = [...terms].sort((a, b) => a.sort - b.sort);
  const orderedExams = [...exams].sort((a, b) => a.sort - b.sort);
  return orderedTerms.flatMap((term) => {
    const configured = assessments.filter((item) => item.yearId === yearId && item.termId === term.id);
    const activeIds = new Set(configured.filter((item) => item.active).map((item) => item.examId));
    return orderedExams
      .filter((exam) => !configured.length || activeIds.has(exam.id))
      .map((exam) => ({
        key: reportExamChoiceKey(term.id, exam.id),
        yearId,
        termId: term.id,
        termName: term.name,
        termSort: term.sort,
        examId: exam.id,
        examName: exam.name,
        examSort: exam.sort,
        examCode: exam.code,
      }));
  });
}

export function chooseReportExams(choices: ReportExamChoice[], termIds: string[], examKeys: string[]): ReportExamChoice[] {
  const selectedTerms = new Set(termIds);
  const selectedExams = new Set(examKeys);
  return choices.filter((choice) => selectedTerms.has(choice.termId) && selectedExams.has(choice.key));
}

export function filterReportMarksToGrade<T extends GradeScopedMark>(marks: T[], learnerIds: Iterable<string>, gradeId: string): T[] {
  const selectedLearners = new Set(learnerIds);
  return marks.filter((mark) => selectedLearners.has(mark.learnerId) && (!mark.gradeId || mark.gradeId === gradeId));
}

export function reportExamLabel(choice: Pick<ReportExamChoice, "termName" | "examName">, showTermName: boolean) {
  return showTermName ? `${choice.termName} · ${choice.examName}` : choice.examName;
}

/** Give each term's exam a distinct key so repeated exam IDs across terms never overwrite scores. */
export function remapMarksForReport<T extends PeriodMark>(marks: T[], choices: ReportExamChoice[]): Array<Omit<T, "examId"> & { examId: string }> {
  const outputIds = new Map(choices.map((choice) => [sourceMarkKey(choice.yearId, choice.termId, choice.examId), choice.key]));
  return marks.flatMap((mark) => {
    const examId = outputIds.get(sourceMarkKey(mark.yearId, mark.termId, mark.examId));
    return examId ? [{ ...mark, examId }] : [];
  });
}
