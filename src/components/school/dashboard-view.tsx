import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SchoolIntelligenceCenter } from "@/components/school/school-intelligence-center";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import type { Gate } from "@/components/school/gate";
import { inputClass } from "@/components/school/gate";
import { btnDownload } from "@/components/school/download-button";
import { buildBoards, decorate, fmt, isAdmin, learnersForYear, meanOf, periodMarks } from "@/lib/school/model";

export function DashboardView({ ws: sourceWs, refresh, flash, beginActivity }: Gate) {
  const period = useSchoolPeriod(sourceWs);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [streamFilter, setStreamFilter] = useState("all");
  const selectedYear = sourceWs.years.find((year) => year.id === period.yearId);
  const selectedTerm = sourceWs.terms.find((term) => term.id === period.termId);
  const yearLearners = useMemo(() => learnersForYear(sourceWs, period.yearId), [sourceWs, period.yearId]);
  const selectedLearners = useMemo(() => yearLearners.filter((learner) =>
    (gradeFilter === "all" || learner.gradeId === gradeFilter) &&
    (streamFilter === "all" || learner.streamId === streamFilter),
  ), [yearLearners, gradeFilter, streamFilter]);
  const selectedLearnerIds = useMemo(() => new Set(selectedLearners.map((learner) => learner.id)), [selectedLearners]);
  const selectedMarks = useMemo(() => period.marks.filter((mark) => selectedLearnerIds.has(mark.learnerId)), [period.marks, selectedLearnerIds]);
  const selectedGrade = sourceWs.grades.find((grade) => grade.id === gradeFilter);
  const selectedStream = sourceWs.streams.find((stream) => stream.id === streamFilter);
  const scopeLabel = `${selectedGrade?.name ?? "All grades"} · ${selectedStream?.name ?? "All streams"}`;
  const scopedStreams = sourceWs.streams.filter((stream) => gradeFilter === "all" || stream.gradeId === gradeFilter);
  const ws = useMemo(() => ({
    ...sourceWs,
    learners: selectedLearners,
    marks: selectedMarks,
    profile: {
      ...sourceWs.profile,
      activeYearId: period.yearId,
      activeTermId: period.termId,
      academicYear: selectedYear?.name ?? sourceWs.profile.academicYear,
      termName: selectedTerm?.name ?? sourceWs.profile.termName,
    },
  }), [sourceWs, selectedLearners, selectedMarks, period.yearId, period.termId, selectedYear?.name, selectedTerm?.name]);
  const [selectedDashboardSection, setSelectedDashboardSection] = useState<"overview" | "performance" | "quality" | "interventions">("overview");
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState("");
  const [focusGradeFilter, setFocusGradeFilter] = useState("all");
  const [focusStream, setFocusStream] = useState("all");
  const [focusSort, setFocusSort] = useState<"performance" | "name" | "support">("performance");
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [focusDensity, setFocusDensity] = useState<"comfortable" | "compact">("comfortable");
  const [maxFocusRows, setMaxFocusRows] = useState("40");
  const [pinnedLearners, setPinnedLearners] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const subjects = [...ws.subjects].sort((a, b) => a.sort - b.sort);
  const exams = [...ws.exams].sort((a, b) => a.sort - b.sort);
  const marks = periodMarks(ws.marks, ws.profile.activeYearId, ws.profile.activeTermId);
  const boards = buildBoards(ws.learners, marks, subjects, exams, ws.bands);
  const schoolMean = meanOf(boards.map((board) => board.avgMean));
  const catMeans = exams.map((exam) => ({ exam, mean: meanOf(boards.map((board) => board.means[exam.id])) }));

  const byGrade = ws.grades.map((grade) => {
    const learners = ws.learners.filter((learner) => learner.gradeId === grade.id);
    const gradeBoards = buildBoards(learners, marks, subjects, exams, ws.bands);
    return { grade, learners, mean: meanOf(gradeBoards.map((board) => board.avgMean)), boards: decorate(gradeBoards, ws.streams, exams) };
  });
  const topClass = [...byGrade].sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))[0];

  const streamRows = ws.streams.map((stream) => {
    const learners = ws.learners.filter((learner) => learner.streamId === stream.id);
    const mean = meanOf(buildBoards(learners, marks, subjects, exams, ws.bands).map((board) => board.avgMean));
    const grade = ws.grades.find((item) => item.id === stream.gradeId);
    return { stream, grade, count: learners.length, mean };
  }).filter((row) => row.count > 0);
  const topStream = [...streamRows].sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))[0];

  const ranked = decorate(boards, ws.streams, exams).filter((row) => row.avgMean != null).sort((a, b) => (b.avgMean ?? 0) - (a.avgMean ?? 0));
  const top = ranked[0];
  const topRows = (items: typeof ranked) => { const valid = items.filter((row) => row.avgMean != null); const best = valid.length ? Math.max(...valid.map((row) => row.avgMean ?? -1)) : null; return best == null ? [] : valid.filter((row) => row.avgMean === best); };
  const displayNames = (items: typeof ranked) => items.map((row) => row.learner.fullName).join(", ") || "—";
  const bestBoyNorth = topRows(ranked.filter((row) => row.learner.gender === "MALE" && /north/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestBoySouth = topRows(ranked.filter((row) => row.learner.gender === "MALE" && /south/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestGirlNorth = topRows(ranked.filter((row) => row.learner.gender === "FEMALE" && /north/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestGirlSouth = topRows(ranked.filter((row) => row.learner.gender === "FEMALE" && /south/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestBoys = topRows(ranked.filter((row) => row.learner.gender === "MALE"));
  const bestGirls = topRows(ranked.filter((row) => row.learner.gender === "FEMALE"));
  const bestOverall = topRows(ranked);
  const bestSubjectLeaders = subjects.map((subject) => { const scored = boards.map((board) => ({ board, score: board.cells.find((cell) => cell.subjectId === subject.id)?.avg ?? null })).filter((item): item is { board: typeof boards[number]; score: number } => item.score != null); const max = scored.length ? Math.max(...scored.map((item) => item.score)) : null; return { subject, score: max, names: max == null ? "—" : scored.filter((item) => item.score === max).map((item) => item.board.learner.fullName).join(", ") }; });
  const concern = ranked.filter((row) => (row.avgMean ?? 100) < 41).slice(-5).reverse();

  const improved = boards
    .map((board) => ({
      name: board.learner.fullName,
      delta: board.means[exams[1]?.id ?? ""] != null && board.means[exams[0]?.id ?? ""] != null
        ? (board.means[exams[1].id] ?? 0) - (board.means[exams[0].id] ?? 0)
        : null,
    }))
    .filter((row): row is { name: string; delta: number } => row.delta != null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  const focusGrade = gradeFilter === "all"
    ? byGrade.find((row) => row.grade.id === "g8") ?? byGrade[0]
    : byGrade.find((row) => row.grade.id === gradeFilter);

  // Additional live dashboard insights derived from the currently selected year and term.
  const subjectInsights = subjects.map((subject) => {
    const values = boards.flatMap((board) => {
      const cell = board.cells.find((item) => item.subjectId === subject.id);
      return cell?.avg == null ? [] : [cell.avg];
    });
    return { subject, mean: meanOf(values), recorded: values.length };
  }).sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
  const markKeys = new Set(marks.map((mark) => `${mark.learnerId}|${mark.subjectId}|${mark.examId}`));
  const expectedExams = exams.filter((exam) => {
    const assessment = ws.termAssessments.find((item) => item.yearId === ws.profile.activeYearId && item.termId === ws.profile.activeTermId && item.examId === exam.id);
    return !assessment || assessment.active;
  });
  const missingMarkRows = ws.learners.flatMap((learner) => subjects.flatMap((subject) => expectedExams.filter((exam) => !markKeys.has(`${learner.id}|${subject.id}|${exam.id}`)).map((exam) => ({ learner, subject, exam }))));
  const learnersWithMarks = new Set(marks.map((mark) => mark.learnerId));
  const learnersWithoutMarks = ws.learners.filter((learner) => !learnersWithMarks.has(learner.id));
  const gradeRanking = [...byGrade].filter((row) => row.learners.length).sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
  const gradeDistribution = [
    { label: "80–100", count: ranked.filter((row) => (row.avgMean ?? -1) >= 80).length },
    { label: "60–79", count: ranked.filter((row) => (row.avgMean ?? -1) >= 60 && (row.avgMean ?? -1) < 80).length },
    { label: "41–59", count: ranked.filter((row) => (row.avgMean ?? -1) >= 41 && (row.avgMean ?? -1) < 60).length },
    { label: "0–40", count: ranked.filter((row) => (row.avgMean ?? -1) >= 0 && (row.avgMean ?? -1) < 41).length },
  ];
  const subjectCoverage = subjects.map((subject) => {
    const expected = ws.learners.length * expectedExams.length;
    const entered = marks.filter((mark) => mark.subjectId === subject.id && expectedExams.some((exam) => exam.id === mark.examId)).length;
    return { subject, entered, expected, percent: expected ? Math.min(100, Math.round(entered / expected * 100)) : 0 };
  });
  const averageCompletion = subjectCoverage.length ? Math.round(subjectCoverage.reduce((sum, row) => sum + row.percent, 0) / subjectCoverage.length) : 0;
  const chart = subjects.map((subject) => {
    const values = focusGrade?.boards.flatMap((board) => {
      const cell = board.cells.find((item) => item.subjectId === subject.id);
      return cell?.avg == null ? [] : [cell.avg];
    }) ?? [];
    return { name: subject.shortName, mean: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0 };
  });
  // Additional dashboard insights: distinct indicators based on the current year and term.
  const scoredAverages = ranked.map((row) => row.avgMean as number).sort((a, b) => a - b);
  const medianMean = scoredAverages.length
    ? scoredAverages.length % 2
      ? scoredAverages[Math.floor(scoredAverages.length / 2)]
      : (scoredAverages[scoredAverages.length / 2 - 1] + scoredAverages[scoredAverages.length / 2]) / 2
    : null;
  const passCount = ranked.filter((row) => (row.avgMean ?? -1) >= 41).length;
  const passRate = ranked.length ? Math.round(passCount / ranked.length * 100) : 0;
  const genderStats = [
    { label: "Girls", match: (value: string) => /female|girl|^f$|^g$/i.test(value) },
    { label: "Boys", match: (value: string) => /^male$|^boy$|^m$/i.test(value) },
  ].map((group) => {
    const rows = ranked.filter((row) => group.match(row.learner.gender ?? ""));
    return { label: group.label, count: rows.length, mean: meanOf(rows.map((row) => row.avgMean)) };
  });
  const gradeMeans = gradeRanking.filter((row) => row.mean != null).map((row) => row.mean as number);
  const gradeGap = gradeMeans.length > 1 ? Math.max(...gradeMeans) - Math.min(...gradeMeans) : null;
  const examStats = exams.map((exam) => ({ exam, mean: meanOf(boards.map((board) => board.means[exam.id])) }));
  const examMeans = examStats.filter((row) => row.mean != null).map((row) => row.mean as number);
  const examGap = examMeans.length > 1 ? Math.max(...examMeans) - Math.min(...examMeans) : null;
  const learnerCoverage = ws.learners.map((learner) => {
    const entered = new Set(marks.filter((mark) => mark.learnerId === learner.id && expectedExams.some((exam) => exam.id === mark.examId)).map((mark) => `${mark.subjectId}|${mark.examId}`)).size;
    const expected = subjects.length * expectedExams.length;
    return { learner, entered, expected, percent: expected ? Math.round(entered / expected * 100) : 0 };
  });
  const partialCoverage = learnerCoverage.filter((row) => row.entered > 0 && row.entered < row.expected).sort((a, b) => a.percent - b.percent);
  const streamEnrolment = streamRows.slice().sort((a, b) => b.count - a.count).slice(0, 6);
  const statusSummary = [...new Set(ws.learners.map((learner) => learner.status || "Unknown"))].map((status) => ({ status, count: ws.learners.filter((learner) => (learner.status || "Unknown") === status).length }));
  const cohortSummary = [...new Set(ws.learners.map((learner) => learner.cohortYear || "Unspecified"))]
    .map((cohort) => ({ cohort, count: ws.learners.filter((learner) => (learner.cohortYear || "Unspecified") === cohort).length }))
    .sort((a, b) => b.count - a.count).slice(0, 6);
  const topFive = ranked.slice(0, 5);
  const needsMostAttention = ranked.filter((row) => row.avgMean != null && row.avgMean < 41).sort((a, b) => (a.avgMean ?? 0) - (b.avgMean ?? 0)).slice(0, 5);

  // Additional advanced indicators built only from existing portal data.
  const completeLearnerCount = learnerCoverage.filter((row) => row.expected > 0 && row.entered === row.expected).length;
  const noMarksSubjectRows = subjects.map((subject) => ({
    subject,
    count: ws.learners.filter((learner) => !marks.some((mark) => mark.learnerId === learner.id && mark.subjectId === subject.id)).length,
  })).sort((a, b) => b.count - a.count);
  const subjectPassRates = subjects.map((subject) => {
    const values = boards.flatMap((board) => {
      const cell = board.cells.find((item) => item.subjectId === subject.id);
      return cell?.avg == null ? [] : [cell.avg];
    });
    const passed = values.filter((value) => value >= 41).length;
    return { subject, count: values.length, passed, rate: values.length ? Math.round(passed / values.length * 100) : 0, high: values.filter((value) => value >= 80).length };
  }).sort((a, b) => b.rate - a.rate);
  const learnerSpread = boards.map((board) => {
    const values = board.cells.flatMap((cell) => cell.avg == null ? [] : [cell.avg]);
    const range = values.length > 1 ? Math.max(...values) - Math.min(...values) : null;
    return { learner: board.learner, range, values: values.length };
  }).filter((row) => row.range != null).sort((a, b) => (b.range ?? 0) - (a.range ?? 0));
  const learnerSubjectStrengths = boards.flatMap((board) => {
    const available = board.cells.filter((cell) => cell.avg != null).map((cell) => ({ cell, subject: subjects.find((subject) => subject.id === cell.subjectId) })).filter((row) => row.subject);
    if (available.length < 2) return [];
    const strongest = [...available].sort((a, b) => (b.cell.avg ?? -1) - (a.cell.avg ?? -1))[0];
    const weakest = [...available].sort((a, b) => (a.cell.avg ?? 101) - (b.cell.avg ?? 101))[0];
    return [{ learner: board.learner, strongest: strongest.subject!, strongestAvg: strongest.cell.avg!, weakest: weakest.subject!, weakestAvg: weakest.cell.avg! }];
  });
  const gradeCoverage = byGrade.map((row) => {
    const ids = new Set(row.learners.map((learner) => learner.id));
    const expected = row.learners.length * subjects.length * expectedExams.length;
    const entered = marks.filter((mark) => ids.has(mark.learnerId) && subjects.some((subject) => subject.id === mark.subjectId) && expectedExams.some((exam) => exam.id === mark.examId)).length;
    return { grade: row.grade, learners: row.learners.length, percent: expected ? Math.min(100, Math.round(entered / expected * 100)) : 0 };
  }).filter((row) => row.learners > 0).sort((a, b) => a.percent - b.percent);
  const activeAssessmentCount = expectedExams.length;
  const recordedMarkCount = marks.filter((mark) => subjects.some((subject) => subject.id === mark.subjectId) && exams.some((exam) => exam.id === mark.examId)).length;
  const averageClassSize = byGrade.length ? Math.round(ws.learners.length / byGrade.length) : 0;
  const highAchievers = ranked.filter((row) => (row.avgMean ?? -1) >= 80).length;
  const learnersBelowThreshold = ranked.filter((row) => (row.avgMean ?? 101) < 41).length;
  const strongestSubjectPass = subjectPassRates.find((row) => row.count > 0);
  const weakestSubjectPass = [...subjectPassRates].filter((row) => row.count > 0).sort((a, b) => a.rate - b.rate)[0];
  const topSubjectHighCount = [...subjectPassRates].sort((a, b) => b.high - a.high)[0];
  const gradePassRates = byGrade.map((row) => {
    const rows = row.boards.filter((board) => board.avgMean != null);
    const passed = rows.filter((board) => (board.avgMean ?? 0) >= 41).length;
    return { grade: row.grade, rate: rows.length ? Math.round(passed / rows.length * 100) : 0, count: rows.length };
  }).filter((row) => row.count > 0).sort((a, b) => b.rate - a.rate);
  const mostConsistent = [...learnerSpread].filter((row) => row.values >= 3).sort((a, b) => (a.range ?? 0) - (b.range ?? 0)).slice(0, 5);
  const biggestSubjectGaps = learnerSubjectStrengths.slice().sort((a, b) => (b.strongestAvg - b.weakestAvg) - (a.strongestAvg - a.weakestAvg)).slice(0, 5);
  const learnersWithoutAnyScores = ws.learners.filter((learner) => !marks.some((mark) => mark.learnerId === learner.id)).length;

  // Ten additional governance, data-quality and intervention insights.
  const riskWatchlist = ranked.filter((row) => row.avgMean != null && row.avgMean < 41)
    .map((row) => ({ ...row, risk: (row.avgMean ?? 0) < 25 ? "Urgent" : (row.avgMean ?? 0) < 35 ? "High" : "Watch" }))
    .sort((a, b) => (a.avgMean ?? 0) - (b.avgMean ?? 0)).slice(0, 8);
  const examVolatility = subjects.map((subject) => {
    const means = exams.map((exam) => meanOf(boards.flatMap((board) => {
      const value = board.cells.find((cell) => cell.subjectId === subject.id)?.byExam[exam.id];
      return value == null ? [] : [value];
    }))).filter((value): value is number => value != null);
    return { subject, gap: means.length > 1 ? Math.max(...means) - Math.min(...means) : null, means };
  }).filter((row) => row.gap != null).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 5);
  const genderGap = genderStats.length > 1 && genderStats.every((row) => row.mean != null)
    ? Math.abs((genderStats[0].mean ?? 0) - (genderStats[1].mean ?? 0)) : null;
  const streamEquity = streamRows.filter((row) => row.mean != null).slice().sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));
  const assignedClassStreams = new Set(ws.assignments.filter((assignment) => assignment.kind === "class_teacher" && assignment.streamId).map((assignment) => assignment.streamId));
  const streamsWithoutClassTeacher = ws.streams.filter((stream) => ws.learners.some((learner) => learner.streamId === stream.id) && !assignedClassStreams.has(stream.id));
  const assignedSubjectIds = new Set(ws.assignments.filter((assignment) => ["subject_teacher", "hod"].includes(assignment.kind) && assignment.subjectId).map((assignment) => assignment.subjectId));
  const subjectsWithoutLeadership = subjects.filter((subject) => !assignedSubjectIds.has(subject.id));
  const assignedDosStreams = new Set(ws.assignments.filter((assignment) => assignment.kind === "dos" && assignment.streamId).map((assignment) => assignment.streamId));
  const streamsWithoutDos = ws.streams.filter((stream) => ws.learners.some((learner) => learner.streamId === stream.id) && !assignedDosStreams.has(stream.id));
  const incompleteLearnerProfiles = ws.learners.filter((learner) => !learner.admissionNumber?.trim() || !learner.cohortYear?.trim() || !learner.streamId || !learner.gradeId);
  const admissionGroups = new Map<string, typeof ws.learners>();
  ws.learners.forEach((learner) => {
    const key = (learner.admissionNumber ?? "").trim().toUpperCase();
    if (key) admissionGroups.set(key, [...(admissionGroups.get(key) ?? []), learner]);
  });
  const duplicateAdmissions = [...admissionGroups.entries()].filter(([, group]) => group.length > 1);
  const weakSubjectLearners = subjects.map((subject) => {
    const below = boards.filter((board) => {
      const score = board.cells.find((cell) => cell.subjectId === subject.id)?.avg;
      return score != null && score < 41;
    });
    return { subject, count: below.length, names: below.slice(0, 5).map((board) => board.learner.fullName) };
  }).sort((a, b) => b.count - a.count).slice(0, 5);
  const highPotentialLearners = ranked.filter((row) => (row.avgMean ?? 0) >= 75 && row.cells.some((cell) => cell.avg != null && cell.avg < 41)).slice(0, 8);
  const unassignedSubjectsCount = subjectsWithoutLeadership.length;
  const roleCoverage = [
    { label: "Class teacher coverage", missing: streamsWithoutClassTeacher.length, total: ws.streams.filter((stream) => ws.learners.some((learner) => learner.streamId === stream.id)).length },
    { label: "Subject teacher / HOD coverage", missing: unassignedSubjectsCount, total: subjects.length },
    { label: "DOS stream coverage", missing: streamsWithoutDos.length, total: ws.streams.filter((stream) => ws.learners.some((learner) => learner.streamId === stream.id)).length },
  ];

  const focusRows = useMemo(() => {
    const query = focusSearch.trim().toLowerCase();
    const rows = ranked.filter((row) => {
      const matchesSearch = !query || [row.learner.fullName, row.learner.admissionNumber, row.learner.cohortYear].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
      const matchesGrade = focusGradeFilter === "all" || row.learner.gradeId === focusGradeFilter;
      const matchesStream = focusStream === "all" || row.learner.streamId === focusStream;
      const matchesStatus = statusFilter === "all" || (row.learner.status || "Unknown") === statusFilter;
      const matchesGender = genderFilter === "all" || row.learner.gender === genderFilter;
      const matchesCohort = cohortFilter === "all" || (row.learner.cohortYear || "Unspecified") === cohortFilter;
      const matchesIncomplete = !incompleteOnly || (learnerCoverage.find((coverage) => coverage.learner.id === row.learner.id)?.percent ?? 0) < 100;
      return matchesSearch && matchesGrade && matchesStream && matchesStatus && matchesGender && matchesCohort && matchesIncomplete;
    });
    return rows.sort((a, b) => {
      if (focusSort === "name") return a.learner.fullName.localeCompare(b.learner.fullName);
      if (focusSort === "support") return (a.avgMean ?? 101) - (b.avgMean ?? 101);
      return (b.avgMean ?? -1) - (a.avgMean ?? -1);
    });
  }, [cohortFilter, focusGradeFilter, focusSearch, focusSort, focusStream, genderFilter, incompleteOnly, learnerCoverage, ranked, statusFilter]);
  const selectedFocusRow = focusRows.find((row) => row.learner.id === selectedLearnerId) ?? focusRows[0];
  const selectedCoverage = selectedFocusRow ? learnerCoverage.find((row) => row.learner.id === selectedFocusRow.learner.id) : undefined;
  const selectedStrength = selectedFocusRow ? learnerSubjectStrengths.find((row) => row.learner.id === selectedFocusRow.learner.id) : undefined;
  const focusGradeOptions = ws.grades.filter((grade) => ws.learners.some((learner) => learner.gradeId === grade.id));
  const focusStreamOptions = ws.streams.filter((stream) =>
    ws.learners.some((learner) => learner.streamId === stream.id) &&
    (focusGradeFilter === "all" || stream.gradeId === focusGradeFilter),
  );
  const compareRows = compareIds.map((id) => ranked.find((row) => row.learner.id === id)).filter((row): row is typeof ranked[number] => Boolean(row));
  const displayedFocusRows = maxFocusRows === "all" ? focusRows : focusRows.slice(0, Number(maxFocusRows));
  const focusStatusOptions = [...new Set(ws.learners.map((learner) => learner.status || "Unknown"))].sort();
  const focusCohortOptions = [...new Set(ws.learners.map((learner) => learner.cohortYear || "Unspecified"))].sort();
  const refreshDashboard = useCallback(async () => {
    await refresh();
    setRefreshedAt(new Date());
    flash("Dashboard data refreshed.");
  }, [flash, refresh]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("mukuyu-dashboard-pins-v1") || "[]");
      if (Array.isArray(stored)) setPinnedLearners(stored.filter((id): id is string => typeof id === "string"));
    } catch { /* Keep the dashboard usable when storage is unavailable. */ }
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key === "/" && event.target instanceof HTMLElement && !["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-dashboard-focus-search]")?.focus();
      }
      if (event.key.toLowerCase() === "r" && event.target instanceof HTMLElement && !["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) void refreshDashboard();
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [refreshDashboard]);

  function togglePin(id: string) {
    setPinnedLearners((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-12);
      try { window.localStorage.setItem("mukuyu-dashboard-pins-v1", JSON.stringify(next)); } catch { /* Local-only convenience; live state still works. */ }
      return next;
    });
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  }

  function exportFocusCsv() {
    const rows = focusRows.map((row) => [row.learner.fullName, row.learner.admissionNumber || "", ws.grades.find((grade) => grade.id === row.learner.gradeId)?.name || "", ws.streams.find((stream) => stream.id === row.learner.streamId)?.name || "", row.avgMean == null ? "" : row.avgMean.toFixed(1)]);
    const csv = [["Learner", "Admission number", "Grade", "Stream", "Mean"], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const periodFileLabel = `${selectedYear?.name ?? period.yearId}-${selectedTerm?.name ?? period.termId}-${selectedGrade?.name ?? "all-grades"}-${selectedStream?.name ?? "all-streams"}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    link.download = `mukuyu-dashboard-learners-${periodFileLabel}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    flash("Filtered learner list exported.");
  }

  async function copySelectedSummary() {
    if (!selectedFocusRow) return;
    const gradeName = ws.grades.find((grade) => grade.id === selectedFocusRow.learner.gradeId)?.name ?? "Grade";
    const streamName = ws.streams.find((stream) => stream.id === selectedFocusRow.learner.streamId)?.name ?? "No stream";
    const text = `${selectedFocusRow.learner.fullName} · ${gradeName} · ${streamName} · ${selectedTerm?.name ?? "Term"} ${selectedYear?.name ?? ""} · mean ${fmt(selectedFocusRow.avgMean)} · position ${selectedFocusRow.overall.position}/${selectedFocusRow.overall.outOf} · coverage ${selectedCoverage?.percent ?? 0}%`;
    try { await navigator.clipboard.writeText(text); flash("Learner summary copied."); } catch { flash("Copy is unavailable in this browser.", true); }
  }

  function saveSnapshot() {
    const snapshot = { savedAt: new Date().toISOString(), filters: { yearId: period.yearId, termId: period.termId, gradeId: gradeFilter, streamId: streamFilter, focusSearch, focusGradeFilter, focusStream, focusSort, statusFilter, genderFilter, cohortFilter, incompleteOnly }, matchingLearners: focusRows.length, selectedLearnerId };
    try { window.localStorage.setItem("mukuyu-dashboard-snapshot-v1", JSON.stringify(snapshot)); } catch { /* Keep the confirmation useful even if storage is blocked. */ }
    setSnapshotSavedAt(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    flash("Dashboard snapshot saved on this device.");
  }

  function selectDashboardSection(section: "overview" | "performance" | "quality" | "interventions", targetId: string) {
    setSelectedDashboardSection(section);
    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "auto", block: "start" }));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.18em] text-brass">Viewing {selectedTerm?.name ?? ws.profile.termName} · {selectedYear?.name ?? ws.profile.academicYear} · {scopeLabel}</p>
        <h1 className="mt-1 font-serif text-3xl text-navy">{(() => {
          const hour = new Date().getHours();
          const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";
          return `${greeting}, ${ws.me.fullName}`;
        })()}</h1>
        <p className="mt-1 text-sm text-muted">{(() => {
          const now = new Date();
          const dateStr = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
          const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          return `${dateStr} · ${timeStr} · ${roleLine(ws.me.role)} · ${ws.profile.name}`;
        })()}</p>
      </header>
      {(ws.me.role === "teacher" || (ws.me.role === "admin" && !ws.me.isDeputy)) ? <p role="status" className="rounded-xl border border-info/25 bg-info/5 px-4 py-3 text-sm text-muted">Dashboard result summaries use only marks your account is allowed to view. Teacher results follow your class/subject assignments and the Super Admin’s marks-view controls. If expected results are missing, ask the Super Admin to check your assignment and the selected year, term and CAT permissions.</p> : null}
      <nav className="dashboard-section-tabs sticky top-0 z-20 -mx-1 flex min-w-0 gap-2 overflow-x-auto rounded-xl border border-line bg-paper p-2 shadow-sm" aria-label="Dashboard sections">
        <button type="button" className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedDashboardSection === "overview" ? "bg-navy text-paper shadow-sm" : "bg-paper text-navy hover:bg-info/10"}`} aria-current={selectedDashboardSection === "overview" ? "location" : undefined} onClick={() => selectDashboardSection("overview", "dashboard-summary")}>Overview</button>
        <button type="button" className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedDashboardSection === "performance" ? "bg-navy text-paper shadow-sm" : "bg-paper text-navy hover:bg-info/10"}`} aria-current={selectedDashboardSection === "performance" ? "location" : undefined} onClick={() => selectDashboardSection("performance", "dashboard-performance")}>Performance</button>
        <button type="button" className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedDashboardSection === "quality" ? "bg-navy text-paper shadow-sm" : "bg-paper text-navy hover:bg-info/10"}`} aria-current={selectedDashboardSection === "quality" ? "location" : undefined} onClick={() => selectDashboardSection("quality", "dashboard-quality")}>Data quality</button>
        <button type="button" className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${selectedDashboardSection === "interventions" ? "bg-navy text-paper shadow-sm" : "bg-paper text-navy hover:bg-info/10"}`} aria-current={selectedDashboardSection === "interventions" ? "location" : undefined} onClick={() => selectDashboardSection("interventions", "dashboard-interventions")}>Interventions</button>
      </nav>
      <section className="dashboard-command-center rounded-2xl border border-line bg-card p-4 shadow-card" aria-labelledby="dashboard-command-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Dashboard command center</p><h2 id="dashboard-command-title" className="font-serif text-2xl text-navy">Work faster with your school data</h2><p className="mt-1 text-sm text-muted">Last refreshed {refreshedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · Press <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs">/</kbd> to search or <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs">R</kbd> to refresh.</p></div>
          <button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}>{toolsOpen ? "Hide tools" : "Show tools"}</button>
        </div>
        {toolsOpen ? <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-paper" onClick={() => void refreshDashboard()}>Refresh data</button>
            <button type="button" className={btnDownload.emerald} onClick={exportFocusCsv}>Export filtered CSV</button>
            <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => window.print()}>Print dashboard</button>
            <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={saveSnapshot}>{snapshotSavedAt ? `Snapshot saved ${snapshotSavedAt}` : "Save snapshot"}</button>
            <button type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${focusDensity === "compact" ? "border-info bg-info/10 text-info" : "border-line text-navy"}`} onClick={() => setFocusDensity((value) => value === "compact" ? "comfortable" : "compact")} aria-pressed={focusDensity === "compact"}>{focusDensity === "compact" ? "Compact rows ✓" : "Comfortable rows"}</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-navy">Record status<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{focusStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy">Gender<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}><option value="all">All genders</option><option value="MALE">Boys</option><option value="FEMALE">Girls</option></select></label>
            <label className="text-xs font-semibold text-navy">Cohort<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={cohortFilter} onChange={(event) => setCohortFilter(event.target.value)}><option value="all">All cohorts</option>{focusCohortOptions.map((cohort) => <option key={cohort} value={cohort}>{cohort}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy">Rows to show<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={maxFocusRows} onChange={(event) => setMaxFocusRows(event.target.value)}><option value="10">10 rows</option><option value="20">20 rows</option><option value="40">40 rows</option><option value="all">All rows</option></select></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs"><button type="button" className={`rounded-full border px-3 py-2 font-semibold ${incompleteOnly ? "border-warn bg-warn/10 text-warn" : "border-line text-navy"}`} aria-pressed={incompleteOnly} onClick={() => setIncompleteOnly((value) => !value)}>Incomplete marks only {incompleteOnly ? "✓" : ""}</button><span className="rounded-full bg-paper px-3 py-2 text-muted">Pinned learners: {pinnedLearners.length}</span><button type="button" className="rounded-full border border-line px-3 py-2 font-semibold text-navy" onClick={() => setPinnedLearners([])}>Clear pins</button><span className="ml-auto text-muted">{focusRows.length} records match all filters</span></div>
        </div> : null}
      </section>
      <section id="dashboard-overview" role="region" aria-label="Overview dashboard" className="scroll-mt-24 space-y-6">
      <section id="dashboard-summary" className="scroll-mt-24 rounded-2xl border border-info/20 bg-gradient-to-br from-card via-card to-info/5 p-4 shadow-card" aria-labelledby="dashboard-period-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-info">Academic period and class scope</p><h2 id="dashboard-period-title" className="mt-1 font-serif text-2xl text-navy">Choose year, term, grade and stream</h2><p className="mt-1 max-w-2xl text-sm text-muted">Results, rankings, learner lists and mark completion update to this selection. Past-year learners are shown in the class and stream they had in that year.</p></div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[auto_minmax(20rem,1fr)] lg:items-end">
          <PeriodBar ws={sourceWs} yearId={period.yearId} termId={period.termId} onYear={period.setYearId} onTerm={period.setTermId} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-navy">Grade<select className={`${inputClass} mt-1`} value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setStreamFilter("all"); setFocusGradeFilter("all"); setFocusStream("all"); setSelectedLearnerId(null); }}><option value="all">All grades</option>{sourceWs.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy">Stream<select className={`${inputClass} mt-1`} value={streamFilter} onChange={(event) => { setStreamFilter(event.target.value); setFocusGradeFilter("all"); setFocusStream("all"); setSelectedLearnerId(null); }}><option value="all">All streams</option>{scopedStreams.map((stream) => <option key={stream.id} value={stream.id}>{gradeFilter === "all" ? `${sourceWs.grades.find((grade) => grade.id === stream.gradeId)?.name ?? "Grade"} · ${stream.name}` : stream.name}</option>)}</select></label>
          </div>
        </div>
      </section>
      <section className="space-y-3" aria-label={`Mean comparison for ${selectedTerm?.name ?? "selected term"}, ${scopeLabel}`}>
        <div><h2 className="font-serif text-xl text-navy">School mean by year · {selectedTerm?.name ?? "selected term"}</h2><p className="mt-1 text-sm text-muted">Compare the same term and grade/stream scope across years. Select a year above to open its detailed dashboard results.</p></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {sourceWs.years.map((year) => {
          const learners = learnersForYear(sourceWs, year.id).filter((learner) =>
            (gradeFilter === "all" || learner.gradeId === gradeFilter) &&
            (streamFilter === "all" || learner.streamId === streamFilter),
          );
          const learnerIds = new Set(learners.map((learner) => learner.id));
          const yearMarks = periodMarks(sourceWs.marks, year.id, period.termId).filter((mark) => learnerIds.has(mark.learnerId));
          const mean = meanOf(buildBoards(learners, yearMarks, subjects, exams, ws.bands).map((board) => board.avgMean));
          const open = year.id === period.yearId;
          return (
            <div key={year.id} aria-current={open ? "true" : undefined} className={`rounded-xl border px-3 py-3 ${open ? "border-navy bg-navy text-paper shadow-sm" : "border-line bg-card dashboard-panel-color-cycle"}`}>
              <p className="text-xs uppercase tracking-wide opacity-70">{year.name} · {selectedTerm?.name ?? "Term"}{open ? " · selected" : ""}</p>
              <p className="font-serif text-2xl">{fmt(mean)}</p>
            </div>
          );
        })}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Learners in selected scope" value={String(ws.learners.length)} hint={`${ws.grades.map((grade) => `${grade.level}: ${ws.learners.filter((learner) => learner.gradeId === grade.id).length}`).filter((label) => !label.endsWith(": 0")).join(" · ") || "No learners in this selection"}`} />
        <Tile label="School mean" value={fmt(schoolMean)} hint={`Average across recorded marks · ${selectedTerm?.name ?? "selected term"}`} />
        <Tile label="Top class" value={topClass?.grade.name ?? "—"} hint={topClass?.mean == null ? "No marks yet" : `Mean ${fmt(topClass.mean)}`} />
        <Tile label="Top stream" value={topStream ? `${topStream.grade?.name ?? ""} ${topStream.stream.name}` : "—"} hint={topStream?.mean == null ? "" : `Mean ${fmt(topStream.mean)}`} />
      </section>
      <section className="rounded-md border border-line bg-card p-4"><h2 className="font-serif text-xl text-navy">Class and school awards · {selectedTerm?.name ?? ws.profile.termName} {selectedYear?.name ?? ws.profile.academicYear}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <p><strong>Best boy North:</strong> {displayNames(bestBoyNorth)}</p><p><strong>Best boy South:</strong> {displayNames(bestBoySouth)}</p><p><strong>Best boy overall:</strong> {displayNames(bestBoys)}</p>
        <p><strong>Best girl North:</strong> {displayNames(bestGirlNorth)}</p><p><strong>Best girl South:</strong> {displayNames(bestGirlSouth)}</p><p><strong>Best girl overall:</strong> {displayNames(bestGirls)}</p><p><strong>Best student overall:</strong> {displayNames(bestOverall)}</p>
        {bestSubjectLeaders.map((item) => <p key={item.subject.id}><strong>Best in {item.subject.name}:</strong> {item.names}{item.score == null ? "" : ` (${fmt(item.score)})`}</p>)}
      </div><p className="mt-2 text-xs text-muted">All ties are included. North/South awards are based on stream names containing “North” or “South”.</p></section>
      <MarkProgress ws={ws} marks={marks} subjects={subjects} exams={expectedExams} />
      </section>
      <section id="dashboard-performance-panel" role="region" aria-label="Performance dashboard" className="scroll-mt-24 space-y-6">
      <section id="dashboard-performance" className="scroll-mt-24 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">{focusGrade?.grade.name ?? "Grade"} subject means</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid stroke="#e3dac8" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#6b6258", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#6b6258", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="mean" fill="#1d4e89" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Leading learner</h2>
          {top ? (
            <div className="mt-4">
              <p className="font-serif text-2xl text-navy">{top.learner.fullName}</p>
              <p className="mt-1 text-sm text-muted">{ws.grades.find((grade) => grade.id === top.learner.gradeId)?.name} · {ws.streams.find((stream) => stream.id === top.learner.streamId)?.name}</p>
              <p className="mt-4 text-3xl font-semibold text-info">{fmt(top.avgMean)}</p>
              <p className="text-sm">{top.level} · school position {top.overall.position} of {top.overall.outOf}</p>
            </div>
          ) : <p className="mt-4 text-sm text-muted">No marks yet.</p>}
          <h3 className="mt-6 text-sm font-semibold">Exam means</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {catMeans.map((item) => <li key={item.exam.id} className="flex justify-between"><span>{item.exam.name}</span><span>{fmt(item.mean)}</span></li>)}
          </ul>
        </article>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <List
          title={improved[0] && improved[0].delta < 0 ? "Smallest drop, CAT 1 to CAT 2" : "Most improved, CAT 1 to CAT 2"}
          rows={improved.map((row) => `${row.name}  ·  ${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)}`)}
          empty="Need both exams."
        />
        <List title="Needs support (mean under 41)" rows={concern.map((row) => `${row.learner.fullName}  ·  ${fmt(row.avgMean)} ${row.level ?? ""}`)} empty="Nobody is under 41." />
      </section>
      <section className="dashboard-focus-board rounded-2xl border border-info/20 bg-gradient-to-br from-card via-card to-info/5 p-4 shadow-card" aria-labelledby="dashboard-focus-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-info">Live dashboard tool</p><h2 id="dashboard-focus-title" className="font-serif text-2xl text-navy">Learner focus board</h2><p className="mt-1 max-w-2xl text-sm text-muted">Search, filter and select a learner to inspect their current performance without leaving Performance.</p></div>
          <button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy" aria-expanded={focusOpen} onClick={() => setFocusOpen((value) => !value)}>{focusOpen ? "Hide focus board" : "Show focus board"}</button>
        </div>
        {focusOpen ? <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.6fr)_repeat(3,minmax(9rem,1fr))_auto]">
            <label className="text-xs font-semibold text-navy">Find learner<input data-dashboard-focus-search className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={focusSearch} onChange={(event) => setFocusSearch(event.target.value)} placeholder="Name, admission no. or cohort" /></label>
            <label className="text-xs font-semibold text-navy">Grade<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={focusGradeFilter} onChange={(event) => { setFocusGradeFilter(event.target.value); setFocusStream("all"); }}><option value="all">All grades</option>{focusGradeOptions.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy">Stream<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={focusStream} onChange={(event) => setFocusStream(event.target.value)}><option value="all">All streams</option>{focusStreamOptions.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy">Sort by<select className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-normal" value={focusSort} onChange={(event) => setFocusSort(event.target.value as typeof focusSort)}><option value="performance">Highest mean</option><option value="support">Needs support first</option><option value="name">Name A–Z</option></select></label>
            <button type="button" className="self-end rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => { setFocusSearch(""); setFocusGradeFilter("all"); setFocusStream("all"); setFocusSort("performance"); setStatusFilter("all"); setGenderFilter("all"); setCohortFilter("all"); setIncompleteOnly(false); setMaxFocusRows("40"); setSelectedLearnerId(null); }}>Clear</button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,.85fr)]">
            <div className="min-w-0"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{focusRows.length} matching learner{focusRows.length === 1 ? "" : "s"}</p><p className="text-xs text-muted">Tap a row to inspect</p></div><div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {displayedFocusRows.map((row, index) => <div key={row.learner.id} className={`flex items-center gap-2 rounded-xl border ${focusDensity === "compact" ? "p-2" : "p-3"} ${selectedFocusRow?.learner.id === row.learner.id ? "border-info bg-info/10 shadow-sm" : "border-line bg-card"}`}><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedLearnerId(row.learner.id)}><span className="block truncate text-sm font-semibold text-navy">{focusSort === "name" ? row.learner.fullName : `${index + 1}. ${row.learner.fullName}`}</span><span className="block truncate text-xs text-muted">{ws.grades.find((grade) => grade.id === row.learner.gradeId)?.name ?? "Grade"} · {ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "No stream"}</span></button><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${(row.avgMean ?? 0) < 41 ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>{fmt(row.avgMean)}</span><button type="button" className="rounded-full px-2 py-1 text-xs" title={pinnedLearners.includes(row.learner.id) ? "Unpin learner" : "Pin learner"} aria-label={pinnedLearners.includes(row.learner.id) ? `Unpin ${row.learner.fullName}` : `Pin ${row.learner.fullName}`} onClick={() => togglePin(row.learner.id)}>{pinnedLearners.includes(row.learner.id) ? "★" : "☆"}</button><button type="button" className={`rounded-full px-2 py-1 text-xs ${compareIds.includes(row.learner.id) ? "bg-info/15 text-info" : "text-muted"}`} title="Add to comparison" aria-label={`Compare ${row.learner.fullName}`} aria-pressed={compareIds.includes(row.learner.id)} onClick={() => toggleCompare(row.learner.id)}>⇄</button></div>)}
              {!focusRows.length ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No learners match these filters.</p> : null}
              {displayedFocusRows.length < focusRows.length ? <p className="pt-2 text-xs text-muted">Showing {displayedFocusRows.length} of {focusRows.length} matches. Increase rows or narrow the search.</p> : null}
            </div></div>
            <div className="rounded-xl border border-line bg-card p-4">{selectedFocusRow ? <><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-info">Selected learner</p><h3 className="mt-1 font-serif text-xl text-navy">{selectedFocusRow.learner.fullName}</h3><p className="text-xs text-muted">{selectedFocusRow.learner.admissionNumber || "No admission number"} · {selectedFocusRow.level || "Result level pending"}</p></div><span className="rounded-full bg-info/10 px-3 py-1 text-sm font-bold text-info">{fmt(selectedFocusRow.avgMean)}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg border border-line p-2"><p className="text-xs text-muted">Position</p><p className="font-semibold text-navy">{selectedFocusRow.overall.position} / {selectedFocusRow.overall.outOf}</p></div><div className="rounded-lg border border-line p-2"><p className="text-xs text-muted">Mark coverage</p><p className="font-semibold text-navy">{selectedCoverage?.percent ?? 0}%</p></div></div><div className="mt-4 space-y-2 text-sm"><p><span className="text-muted">Strongest:</span> <strong>{selectedStrength?.strongest?.name ?? "Not enough marks"}</strong>{selectedStrength ? ` · ${fmt(selectedStrength.strongestAvg)}` : ""}</p><p><span className="text-muted">Focus next:</span> <strong>{selectedStrength?.weakest?.name ?? "Complete more marks"}</strong>{selectedStrength ? ` · ${fmt(selectedStrength.weakestAvg)}` : ""}</p></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => void copySelectedSummary()}>Copy summary</button><a className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy" href="#dashboard-performance">View performance</a><a className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy" href="#dashboard-quality">View data quality</a></div></> : <p className="text-sm text-muted">Select a learner to see their focus summary.</p>}</div>
          </div>
          {compareRows.length ? <div className="mt-4 rounded-xl border border-info/20 bg-info/5 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-info">Side-by-side comparison</p><p className="text-sm text-muted">Select up to two learner rows using ⇄.</p></div><button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => setCompareIds([])}>Clear comparison</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{compareRows.map((row) => <div key={row.learner.id} className="rounded-lg border border-line bg-card p-3"><p className="font-semibold text-navy">{row.learner.fullName}</p><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><span><strong className="block text-lg text-info">{fmt(row.avgMean)}</strong>Mean</span><span><strong className="block text-lg text-navy">{row.overall.position}</strong>Position</span><span><strong className="block text-lg text-navy">{learnerCoverage.find((item) => item.learner.id === row.learner.id)?.percent ?? 0}%</strong>Coverage</span></div></div>)}</div></div> : null}
        </> : null}
      </section>
      </section>
      <section id="dashboard-quality-panel" role="region" aria-label="Data quality dashboard" className="scroll-mt-24 space-y-6">
      <section id="dashboard-quality" className="scroll-mt-24 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Learners with marks" value={`${learnersWithMarks.size}/${ws.learners.length}`} hint="Learners with at least one recorded score" />
        <Tile label="Learners awaiting marks" value={String(learnersWithoutMarks.length)} hint="No recorded score in the selected period" />
        <Tile label="Mark completion" value={`${averageCompletion}%`} hint="Average completion across subjects" />
        <Tile label="Missing score cells" value={String(missingMarkRows.length)} hint="Expected learner, subject and assessment entries" />
        <Tile label="Strongest subject" value={subjectInsights[0]?.subject.shortName ?? "—"} hint={subjectInsights[0]?.mean == null ? "No marks yet" : `Mean ${fmt(subjectInsights[0].mean)}`} />
        <Tile label="Subject needing support" value={subjectInsights.filter((row) => row.mean != null).at(-1)?.subject.shortName ?? "—"} hint={subjectInsights.filter((row) => row.mean != null).at(-1)?.mean == null ? "No marks yet" : `Mean ${fmt(subjectInsights.filter((row) => row.mean != null).at(-1)?.mean)}`} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Grade performance ranking</h2>
          <div className="mt-3 space-y-3">
            {gradeRanking.map((row, index) => <div key={row.grade.id}>
              <div className="flex justify-between gap-3 text-sm"><span>{index + 1}. {row.grade.name}</span><span className="font-semibold">{fmt(row.mean)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${Math.max(0, Math.min(100, row.mean ?? 0))}%` }} /></div>
            </div>)}
            {!gradeRanking.length ? <p className="text-sm text-muted">No grade data available.</p> : null}
          </div>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Subject performance</h2>
          <div className="mt-3 space-y-2 text-sm">
            {subjectInsights.map((row) => <div key={row.subject.id} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2"><span>{row.subject.name}</span><span className="font-semibold">{fmt(row.mean)} <span className="text-xs font-normal text-muted">({row.recorded} learners)</span></span></div>)}
          </div>
        </article>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Performance distribution</h2>
          <p className="mt-1 text-sm text-muted">Learners grouped by average percentage.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {gradeDistribution.map((row) => <div key={row.label} className="rounded-md border border-line p-3"><p className="text-xs text-muted">{row.label}%</p><p className="mt-1 font-serif text-2xl text-navy">{row.count}</p><p className="text-xs text-muted">learners</p></div>)}
          </div>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Subject mark completion</h2>
          <div className="mt-3 space-y-3">
            {subjectCoverage.map((row) => <div key={row.subject.id}><div className="flex justify-between gap-3 text-sm"><span>{row.subject.shortName}</span><span>{row.percent}% · {row.entered}/{row.expected}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${row.percent}%` }} /></div></div>)}
          </div>
        </article>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <List title="Learners with no recorded marks" rows={learnersWithoutMarks.slice(0, 8).map((learner) => `${learner.fullName} · ${ws.grades.find((grade) => grade.id === learner.gradeId)?.name ?? "—"} ${ws.streams.find((stream) => stream.id === learner.streamId)?.name ?? ""}`)} empty="Every learner has at least one recorded mark." />
        <List title="Mark-entry priorities" rows={missingMarkRows.slice(0, 8).map(({ learner, subject, exam }) => `${learner.fullName} · ${subject.shortName} · ${exam.name}`)} empty="No missing marks detected for the selected period." />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Pass rate" value={`${passRate}%`} hint={`${passCount} of ${ranked.length} learners with results at 41% or above`} />
        <Tile label="Median learner mean" value={fmt(medianMean)} hint="Middle score; less affected by extreme scores" />
        <Tile label="Grade performance gap" value={gradeGap == null ? "—" : `${gradeGap.toFixed(1)} pts`} hint="Difference between highest and lowest grade mean" />
        <Tile label="Assessment mean gap" value={examGap == null ? "—" : `${examGap.toFixed(1)} pts`} hint="Difference between highest and lowest assessment mean" />
        <Tile label="Learners needing support" value={String(needsMostAttention.length ? ranked.filter((row) => row.avgMean != null && row.avgMean < 41).length : 0)} hint="Learners averaging below 41%" />
        <Tile label="Partial mark records" value={String(partialCoverage.length)} hint="Learners with some, but not all, expected marks" />
        <Tile label="Streams with learners" value={String(streamRows.length)} hint="Streams represented in current learner list" />
        <Tile label="Learner cohorts" value={String(new Set(ws.learners.map((learner) => learner.cohortYear || "Unspecified")).size)} hint="Different cohort years represented" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Top five learners</h2>
          {topFive.length ? <ol className="mt-3 space-y-2 text-sm">{topFive.map((row, index) => <li key={row.learner.id} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2"><span>{index + 1}. {row.learner.fullName}<span className="ml-2 text-xs text-muted">{row.learner.admissionNumber || "No admission number"}</span></span><strong>{fmt(row.avgMean)}</strong></li>)}</ol> : <p className="mt-3 text-sm text-muted">No scored learners yet.</p>}
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Performance by gender</h2>
          <div className="mt-3 space-y-3">{genderStats.map((row) => <div key={row.label} className="flex items-center justify-between rounded-md border border-line p-3"><div><p className="font-medium">{row.label}</p><p className="text-xs text-muted">{row.count} learners with recorded results</p></div><p className="font-serif text-2xl text-navy">{fmt(row.mean)}</p></div>)}</div>
          <p className="mt-2 text-xs text-muted">Gender values not recognised as boys or girls are excluded from this comparison.</p>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Stream enrolment</h2>
          <div className="mt-3 space-y-3">{streamEnrolment.map((row) => <div key={row.stream.id}><div className="flex justify-between gap-3 text-sm"><span>{row.grade?.name ?? "Grade"} {row.stream.name}</span><strong>{row.count}</strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${ws.learners.length ? row.count / ws.learners.length * 100 : 0}%` }} /></div></div>)}{!streamEnrolment.length ? <p className="text-sm text-muted">No stream enrolment data.</p> : null}</div>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Learner record status</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">{statusSummary.map((row) => <div key={row.status} className="rounded-md border border-line p-3"><p className="text-xs text-muted">{row.status}</p><p className="mt-1 font-serif text-2xl text-navy">{row.count}</p></div>)}</div>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Learners with incomplete marks</h2>
          {partialCoverage.length ? <ul className="mt-3 space-y-2 text-sm">{partialCoverage.slice(0, 8).map((row) => <li key={row.learner.id} className="flex items-center justify-between gap-3"><span>{row.learner.fullName}</span><span className="font-semibold">{row.percent}%</span></li>)}</ul> : <p className="mt-3 text-sm text-muted">No partially completed learner mark records detected.</p>}
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Cohort overview</h2>
          <div className="mt-3 space-y-2">{cohortSummary.map((row) => <div key={row.cohort} className="flex items-center justify-between border-b border-line/70 pb-2 text-sm"><span>{row.cohort}</span><strong>{row.count} learners</strong></div>)}{!cohortSummary.length ? <p className="text-sm text-muted">No cohort data available.</p> : null}</div>
        </article>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Fully marked learners" value={String(completeLearnerCount)} hint="All expected subject and assessment cells entered" />
        <Tile label="High achievers" value={String(highAchievers)} hint="Learner averages of 80% or higher" />
        <Tile label="Below target" value={String(learnersBelowThreshold)} hint="Learner averages below 41%" />
        <Tile label="Recorded mark entries" value={String(recordedMarkCount)} hint="Valid subject and assessment records in this period" />
        <Tile label="Active assessments" value={String(activeAssessmentCount)} hint="Assessments expected this term" />
        <Tile label="Average grade size" value={String(averageClassSize)} hint="Learners per configured grade, rounded" />
        <Tile label="Subject with most high scores" value={topSubjectHighCount?.subject.shortName ?? "—"} hint={topSubjectHighCount ? `${topSubjectHighCount.high} learner subject averages at 80%+` : "No marks yet"} />
        <Tile label="Learners with no scores" value={String(learnersWithoutAnyScores)} hint="No marks recorded in the selected period" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Subject pass-rate comparison</h2>
          <p className="mt-1 text-xs text-muted">Pass threshold: 41% of recorded subject averages.</p>
          <div className="mt-3 space-y-3">{subjectPassRates.map((row) => <div key={row.subject.id}><div className="flex justify-between gap-3 text-sm"><span>{row.subject.shortName}</span><strong>{row.count ? `${row.rate}%` : "—"} <span className="font-normal text-muted">({row.passed}/{row.count})</span></strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${row.rate}%` }} /></div></div>)}</div>
          <p className="mt-3 text-xs text-muted">Highest recorded pass rate: {strongestSubjectPass?.subject.name ?? "No data"} · Lowest: {weakestSubjectPass?.subject.name ?? "No data"}.</p>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Marks coverage by grade</h2>
          <div className="mt-3 space-y-3">{gradeCoverage.map((row) => <div key={row.grade.id}><div className="flex justify-between gap-3 text-sm"><span>{row.grade.name} <span className="text-muted">({row.learners})</span></span><strong>{row.percent}%</strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${row.percent}%` }} /></div></div>)}{!gradeCoverage.length ? <p className="text-sm text-muted">No grade data available.</p> : null}</div>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Subjects with most missing marks</h2>
          <ul className="mt-3 space-y-2 text-sm">{noMarksSubjectRows.slice(0, 6).map((row) => <li key={row.subject.id} className="flex justify-between gap-3 border-b border-line/70 pb-2"><span>{row.subject.name}</span><strong>{row.count} learners missing</strong></li>)}</ul>
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Best grade pass rate</h2>
          {gradePassRates.length ? <div className="mt-3 space-y-2">{gradePassRates.slice(0, 5).map((row) => <div key={row.grade.id} className="flex justify-between gap-3 rounded-md border border-line p-3"><span>{row.grade.name}</span><strong>{row.rate}% <span className="text-xs font-normal text-muted">({row.count} learners)</span></strong></div>)}</div> : <p className="mt-3 text-sm text-muted">No graded results yet.</p>}
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Learner subject strengths and next steps</h2>
          <p className="mt-1 text-xs text-muted">Shows the strongest and weakest recorded subject average for each learner.</p>
          {learnerSubjectStrengths.length ? <ul className="mt-3 space-y-2 text-sm">{learnerSubjectStrengths.slice(0, 8).map((row) => <li key={row.learner.id} className="border-b border-line/70 pb-2"><p className="font-medium">{row.learner.fullName}</p><p className="text-xs text-muted">Strength: {row.strongest.name} ({fmt(row.strongestAvg)}) · Focus: {row.weakest.name} ({fmt(row.weakestAvg)})</p></li>)}</ul> : <p className="mt-3 text-sm text-muted">At least two subjects with marks are needed.</p>}
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Most consistent learners</h2>
          <p className="mt-1 text-xs text-muted">Smallest difference between their highest and lowest subject averages, with at least three subjects recorded.</p>
          {mostConsistent.length ? <ul className="mt-3 space-y-2 text-sm">{mostConsistent.map((row) => <li key={row.learner.id} className="flex justify-between gap-3 border-b border-line/70 pb-2"><span>{row.learner.fullName}</span><strong>{(row.range ?? 0).toFixed(1)} pt range</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted">Not enough multi-subject results yet.</p>}
        </article>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-xl text-navy">Largest subject performance gaps</h2>
          <p className="mt-1 text-xs text-muted">Learners who may benefit from targeted support in their weakest subject.</p>
          {biggestSubjectGaps.length ? <ul className="mt-3 space-y-2 text-sm">{biggestSubjectGaps.map((row) => <li key={row.learner.id} className="border-b border-line/70 pb-2"><p className="font-medium">{row.learner.fullName} · {(row.strongestAvg - row.weakestAvg).toFixed(1)} pts</p><p className="text-xs text-muted">{row.strongest.name}: {fmt(row.strongestAvg)} · {row.weakest.name}: {fmt(row.weakestAvg)}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted">Not enough subject results yet.</p>}
        </article>
      </section>
      </section>
      <section id="dashboard-interventions-panel" role="region" aria-label="Interventions dashboard" className="scroll-mt-24 space-y-6">
      <SchoolIntelligenceCenter ws={ws} refresh={refresh} flash={flash} />
      <section id="dashboard-interventions" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="font-serif text-2xl text-navy">Advanced school intelligence & governance</h2>
          <p className="mt-1 text-sm text-muted">Ten additional insights based on the active academic year and term. These are advisory alerts; they do not change marks or learner records.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">1. Learner risk watchlist</h3>
            <p className="mt-1 text-xs text-muted">Prioritises learners below 41% for intervention.</p>
            {riskWatchlist.length ? <ul className="mt-3 space-y-2 text-sm">{riskWatchlist.map((row) => <li key={row.learner.id} className="flex justify-between gap-3 border-b border-line/70 pb-2"><span>{row.learner.fullName} <span className="text-xs text-muted">· {row.risk}</span></span><strong>{fmt(row.avgMean)}</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted">No at-risk learners identified from recorded marks.</p>}
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">2. Subject performance volatility</h3>
            <p className="mt-1 text-xs text-muted">Largest difference between assessment means by subject.</p>
            {examVolatility.length ? <ul className="mt-3 space-y-2 text-sm">{examVolatility.map((row) => <li key={row.subject.id} className="flex justify-between gap-3 border-b border-line/70 pb-2"><span>{row.subject.name}</span><strong>{(row.gap ?? 0).toFixed(1)} pts</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted">Record more than one assessment to compare volatility.</p>}
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">3. Gender performance gap</h3>
            <p className="mt-2 text-3xl font-semibold text-navy">{genderGap == null ? "—" : `${genderGap.toFixed(1)} pts`}</p>
            <p className="mt-1 text-sm text-muted">{genderStats.map((row) => `${row.label}: ${fmt(row.mean)} mean (${row.count} learners)`).join(" · ")}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">4. Stream performance equity</h3>
            <p className="mt-1 text-xs text-muted">Compare means across streams to spot where support may be needed.</p>
            {streamEquity.length ? <ul className="mt-3 space-y-2 text-sm">{streamEquity.slice(0, 6).map((row) => <li key={row.stream.id} className="flex justify-between gap-3"><span>{row.grade?.name} {row.stream.name}</span><strong>{fmt(row.mean)}</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted">No stream results yet.</p>}
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">5. Class-teacher assignment audit</h3>
            <p className="mt-2 text-3xl font-semibold text-navy">{streamsWithoutClassTeacher.length}</p>
            <p className="text-sm text-muted">Populated stream(s) without a class-teacher assignment.</p>
            <p className="mt-2 text-xs text-muted">{streamsWithoutClassTeacher.slice(0, 6).map((row) => `${ws.grades.find((grade) => grade.id === row.gradeId)?.name ?? ""} ${row.name}`).join(", ") || "All populated streams have an assignment."}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">6. Subject leadership audit</h3>
            <p className="mt-2 text-3xl font-semibold text-navy">{subjectsWithoutLeadership.length}</p>
            <p className="text-sm text-muted">Subject(s) without a subject teacher or HOD assignment.</p>
            <p className="mt-2 text-xs text-muted">{subjectsWithoutLeadership.slice(0, 8).map((row) => row.name).join(", ") || "Every subject has a subject teacher or HOD assignment."}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">7. Director of studies coverage</h3>
            <p className="mt-2 text-3xl font-semibold text-navy">{streamsWithoutDos.length}</p>
            <p className="text-sm text-muted">Populated stream(s) without a DOS assignment.</p>
            <p className="mt-2 text-xs text-muted">{streamsWithoutDos.slice(0, 6).map((row) => `${ws.grades.find((grade) => grade.id === row.gradeId)?.name ?? ""} ${row.name}`).join(", ") || "All populated streams have a DOS assignment."}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">8. Learner profile completeness</h3>
            <p className="mt-2 text-3xl font-semibold text-navy">{incompleteLearnerProfiles.length}</p>
            <p className="text-sm text-muted">Learner profiles missing admission number, cohort year, grade, or stream.</p>
            <p className="mt-2 text-xs text-muted">{incompleteLearnerProfiles.slice(0, 6).map((row) => row.fullName).join(", ") || "All learner profiles have the key fields."}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">9. Duplicate admission-number alert</h3>
            <p className="mt-2 text-3xl font-semibold text-navy">{duplicateAdmissions.length}</p>
            <p className="text-sm text-muted">Admission number(s) assigned to more than one learner.</p>
            <p className="mt-2 text-xs text-muted">{duplicateAdmissions.slice(0, 5).map(([admission, group]) => `${admission}: ${group.map((row) => row.fullName).join(", ")}`).join(" · ") || "No duplicate admission numbers found."}</p>
          </article>
          <article className="rounded-md border border-line bg-card p-4 shadow-card">
            <h3 className="font-serif text-lg text-navy">10. Targeted subject intervention & high potential</h3>
            <p className="mt-1 text-xs text-muted">Subjects with most learners below 41%, plus high-performing learners who have a subject needing support.</p>
            <ul className="mt-3 space-y-2 text-sm">{weakSubjectLearners.map((row) => <li key={row.subject.id} className="flex justify-between gap-3"><span>{row.subject.name}</span><strong>{row.count} below 41%</strong></li>)}</ul>
            <p className="mt-3 text-sm font-semibold">High potential needing support</p>
            <p className="mt-1 text-xs text-muted">{highPotentialLearners.slice(0, 6).map((row) => `${row.learner.fullName} (${fmt(row.avgMean)})`).join(", ") || "No matching learners in current results."}</p>
          </article>
        </div>
        <article className="rounded-md border border-line bg-card p-4 shadow-card">
          <h3 className="font-serif text-lg text-navy">Role coverage summary</h3>
          <p className="mt-1 text-sm text-muted">Use Staff and roles to assign the existing class-teacher, subject-teacher, HOD and DOS responsibilities. This audit does not grant or change permissions.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{roleCoverage.map((row) => <div key={row.label} className="rounded-md border border-line p-3"><p className="text-xs text-muted">{row.label}</p><p className="mt-1 font-serif text-2xl text-navy">{Math.max(0, row.total - row.missing)}/{row.total}</p><p className="text-xs text-muted">{row.missing} missing</p></div>)}</div>
        </article>
      </section>
      </section>
    </div>
  );
}

function roleLine(role: string) {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Teacher";
  if (role === "parent") return "Parent";
  return "Learner";
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-md border border-line bg-card p-4 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl text-navy">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </article>
  );
}

function List({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <article className="rounded-md border border-line bg-card p-4 shadow-card">
      <h2 className="font-serif text-xl text-navy">{title}</h2>
      {rows.length ? <ul className="mt-3 space-y-2 text-sm">{rows.map((row) => <li key={row}>{row}</li>)}</ul> : <p className="mt-3 text-sm text-muted">{empty}</p>}
    </article>
  );
}

function MarkProgress({ ws, marks, subjects, exams }: { ws: Gate["ws"]; marks: Gate["ws"]["marks"]; subjects: Gate["ws"]["subjects"]; exams: Gate["ws"]["exams"] }) {
  const expected = exams;
  const have = new Set(marks.map((mark) => `${mark.learnerId}|${mark.subjectId}|${mark.examId}`));
  let total = 0;
  let filled = 0;
  for (const learner of ws.learners) {
    for (const subject of subjects) {
      for (const exam of expected) {
        total += 1;
        if (have.has(`${learner.id}|${subject.id}|${exam.id}`)) filled += 1;
      }
    }
  }
  const progress = total ? Math.round((filled / total) * 100) : 0;
  const openSubjects = isAdmin(ws.me.role)
    ? subjects.filter((subject) => !ws.assignments.some((assignment) => assignment.subjectId === subject.id && (assignment.kind === "subject_teacher" || assignment.kind === "hod")))
    : [];
  return (
    <section className="rounded-md border border-line bg-card p-4 shadow-card">
      <h2 className="font-serif text-xl text-navy">Mark entry this term</h2>
      <p className="mt-1 text-sm text-muted">{filled} of {total} expected scores are in ({progress}%).</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-info" style={{ width: `${progress}%` }} /></div>
      {isAdmin(ws.me.role) ? <p className="mt-3 text-sm">{openSubjects.length ? `Subjects with no subject teacher yet: ${openSubjects.map((subject) => subject.name).join(", ")}.` : "Every subject has a subject teacher or head of department."}</p> : null}
    </section>
  );
}
