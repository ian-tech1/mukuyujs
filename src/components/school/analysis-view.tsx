import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Gate } from "@/components/school/gate";
import { btnGhost, errText, inputClass } from "@/components/school/gate";
import { logoDataUrl } from "@/lib/school/brand";
import { writeXlsxFromMatrix } from "@/lib/school/sheet";
import { downloadMeritListPdf, downloadSubjectLevelMeritListPdf } from "@/lib/school/pdf";
import { rankMeritRows } from "@/lib/school/analysis-merit-rows";
import { PeriodBar, useSchoolPeriod } from "@/components/school/period-bar";
import { canActorAccess } from "@/lib/school/role-access";
import { bandFor, buildBoards, decorate, fmt, meanOf, periodMarks, sortByPerformance, type Decorated, learnersForYear } from "@/lib/school/model";
import { rankSubjectsByMean } from "@/lib/school/subject-position";

export function AnalysisView({ ws, flash }: Gate) {
  const canDownload = canActorAccess(ws.roleAccess, ws.me.role, "analysis", "download");
  const subjects = [...ws.subjects].sort((a, b) => a.sort - b.sort);
  const allExams = [...ws.exams].sort((a, b) => a.sort - b.sort);
  const period = useSchoolPeriod(ws);
  const configuredAssessments = ws.termAssessments.filter((item) => item.yearId === period.yearId && item.termId === period.termId);
  const activeExamIds = configuredAssessments.length ? new Set(configuredAssessments.filter((item) => item.active).map((item) => item.examId)) : null;
  const exams = allExams.filter((exam) => !activeExamIds || activeExamIds.has(exam.id));
  const [gradeId, setGradeId] = useState(ws.grades[1]?.id ?? ws.grades[0]?.id ?? "");
  const [streamId, setStreamId] = useState("");
  const [mode, setMode] = useState(exams[0]?.id ?? "avg");
  const currentMode = mode === "avg" || exams.some((exam) => exam.id === mode) ? mode : exams[0]?.id ?? "avg";
  useEffect(() => {
    if (mode !== currentMode) setMode(currentMode);
  }, [mode, currentMode]);
  const [learnerSearch, setLearnerSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [rankSort, setRankSort] = useState<"performance" | "name" | "roll">("performance");
  const [showAdmission, setShowAdmission] = useState(true);
  const grade = ws.grades.find((item) => item.id === gradeId);
  const yearLearners = useMemo(() => learnersForYear(ws, period.yearId), [ws, period.yearId]);
  const gradeIds = useMemo(() => new Set(yearLearners.filter((learner) => learner.gradeId === gradeId).map((learner) => learner.id)), [yearLearners, gradeId]);
  const learners = useMemo(() => yearLearners.filter((learner) => learner.gradeId === gradeId && (!streamId || learner.streamId === streamId)), [yearLearners, gradeId, streamId]);
  const marksForGrade = period.marks.filter((mark) => gradeIds.has(mark.learnerId) && (!mark.gradeId || mark.gradeId === gradeId));
  const decorated = useMemo(() => sortByPerformance(decorate(buildBoards(learners, marksForGrade, subjects, exams, ws.bands), ws.streams, exams)), [learners, marksForGrade, subjects, exams, ws.bands, ws.streams]);

  function valueOf(row: Decorated) {
    if (currentMode === "avg") return row.avgMean;
    return row.means[currentMode];
  }
  const rankedAll = rankMeritRows(decorated, valueOf);
  const ranked = rankedAll.filter((row) => {
    const query = learnerSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || [row.learner.fullName, row.learner.admissionNumber ?? "", String(row.learner.roll)].some((value) => value.toLocaleLowerCase().includes(query));
    return matchesSearch && (levelFilter === "all" || (row.level ?? "Unassigned") === levelFilter);
  }).sort((a, b) => rankSort === "name" ? a.learner.fullName.localeCompare(b.learner.fullName) : rankSort === "roll" ? a.learner.roll - b.learner.roll : (valueOf(b) ?? -1) - (valueOf(a) ?? -1));
  const rankOf = (row: Decorated) => {
    const score = valueOf(row);
    return score == null ? "—" : String(rankedAll.findIndex((item) => valueOf(item) === score) + 1);
  };
  const topScoringLearner = rankedAll.find((row) => valueOf(row) != null);
  const classMean = meanOf(rankedAll.map(valueOf));
  const subjectChart = subjects.map((subject) => {
    const scores = decorated.flatMap((row) => {
      const cell = row.cells.find((item) => item.subjectId === subject.id);
      const score = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode];
      return score == null ? [] : [score];
    });
    const rawMean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { name: subject.shortName, fullName: subject.name, mean: rawMean == null ? 0 : Math.round(rawMean * 10) / 10, rawMean };
  });
  const subjectPositions = rankSubjectsByMean(subjectChart.map((subject) => ({ name: subject.fullName, mean: subject.rawMean })));
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  const streamCompare = streams.map((stream) => {
    const group = decorate(buildBoards(yearLearners.filter((learner) => learner.gradeId === gradeId && learner.streamId === stream.id), marksForGrade.filter((mark) => yearLearners.some((learner) => learner.id === mark.learnerId && learner.streamId === stream.id)), subjects, exams, ws.bands), ws.streams, exams);
    const mean = meanOf(group.map((row) => (currentMode === "avg" ? row.avgMean : row.means[currentMode])));
    const streamLeader = [...group].sort((a, b) => ((currentMode === "avg" ? b.avgMean : b.means[currentMode]) ?? -1) - ((currentMode === "avg" ? a.avgMean : a.means[currentMode]) ?? -1))[0];
    return { name: stream.name, mean: mean ?? 0, meanLabel: fmt(mean), learnerCount: group.length, topLearner: streamLeader?.learner.fullName ?? "—" };
  });
  const subjectPointChart = subjects.map((subject) => {
    const values = rankedAll.flatMap((row) => {
      const points = row.cells.find((cell) => cell.subjectId === subject.id)?.points;
      return points == null ? [] : [points];
    });
    return { name: subject.shortName, mean: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0 };
  });
  const pointsStreamCompare = streams.map((stream) => {
    const group = rankedAll.filter((row) => row.learner.streamId === stream.id);
    const scored = group.filter((row) => row.totalPoints != null);
    const mean = meanOf(group.map((row) => row.totalPoints));
    const leader = [...scored].sort((a, b) => (b.totalPoints ?? -1) - (a.totalPoints ?? -1))[0];
    return { name: stream.name, mean: mean ?? 0, meanLabel: fmt(mean, 0), learnerCount: group.length, topLearner: leader?.learner.fullName ?? "—" };
  });
  const pointsRanked = [...rankedAll].sort((a, b) => (b.totalPoints ?? -1) - (a.totalPoints ?? -1) || a.learner.fullName.localeCompare(b.learner.fullName));
  const scoredPointsRanked = pointsRanked.filter((row) => row.totalPoints != null);
  const pointsRankOf = (row: Decorated) => {
    if (row.totalPoints == null) return "—";
    return String(pointsRanked.findIndex((item) => item.totalPoints === row.totalPoints) + 1);
  };
  const classPointsMean = meanOf(pointsRanked.map((row) => row.totalPoints));
  const bestStream = [...streamCompare].sort((a, b) => b.mean - a.mean)[0];
  const girls = meanOf(rankedAll.filter((row) => row.learner.gender === "FEMALE").map(valueOf));
  const boys = meanOf(rankedAll.filter((row) => row.learner.gender === "MALE").map(valueOf));

  const meritTitle = `CLASS ANALYSIS / MERIT LIST — ${grade?.name ?? "Class"}${streamId ? ` · ${ws.streams.find((item) => item.id === streamId)?.name ?? ""}` : " · All streams"}`;
  const meritPeriod = `${ws.terms.find((item) => item.id === period.termId)?.name ?? ws.profile.termName} · ${ws.years.find((item) => item.id === period.yearId)?.name ?? ws.profile.academicYear}`;
  const [pdfWithAnalytics, setPdfWithAnalytics] = useState(true);
  const [meritOrientation, setMeritOrientation] = useState<"landscape" | "portrait">("landscape");
  const [pdfBusy, setPdfBusy] = useState(false);

  function download() {
    if (!canDownload) return;
    const header = ["Position", "Roll", "Admission Number", "Name", "Gender", "Stream", ...subjects.map((subject) => subject.shortName), "Mean", "Level"];
    const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""').replaceAll("\r", " ").replaceAll("\n", " ")}"`;
    const lines = rankedAll.map((row) => {
      const stream = ws.streams.find((item) => item.id === row.learner.streamId)?.name ?? "";
      const scores = subjects.map((subject) => {
        const cell = row.cells.find((item) => item.subjectId === subject.id);
        const score = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode];
        return score == null ? "" : score.toFixed(2);
      });
      return [rankOf(row), row.learner.roll, row.learner.admissionNumber ?? "", row.learner.fullName, row.learner.gender, stream, ...scores, valueOf(row)?.toFixed(2) ?? "", row.level ?? ""].map(csvCell).join(",");
    });
    // Keep the learner table rectangular: the header is first and each learner is one complete CSV row.
    const metadata = [["School", ws.profile.name], ["Report", meritTitle], ["Period", meritPeriod]].map((row) => row.map(csvCell).join(","));
    const streamLines = ["", ["STREAM PERFORMANCE SUMMARY", "", "", ""].map(csvCell).join(","), ["Stream", "Learners", "Mean", "Top learner"].map(csvCell).join(","), ...streamCompare.map((item) => [item.name, item.learnerCount, item.meanLabel, item.topLearner].map(csvCell).join(","))];
    const blob = new Blob(["\uFEFF" + [header.map(csvCell).join(","), ...lines, ...metadata, ...streamLines].join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${grade?.name ?? "class"}-${currentMode}-merit.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    flash(`Analysis merit list downloaded with all ${rankedAll.length} learners in the selected grade/stream, including learners without marks.`);
  }

  const termBook = ws.terms.map((term) => {
    const marks = periodMarks(ws.marks, period.yearId, term.id).filter((mark) => gradeIds.has(mark.learnerId) && (!mark.gradeId || mark.gradeId === gradeId));
    const mean = meanOf(buildBoards(learners, marks, subjects, exams, ws.bands).map((row) => row.avgMean));
    return { term, mean };
  });
  const possibleMarks = rankedAll.length * subjects.length * exams.length;
  const enteredMarks = rankedAll.reduce((sum, row) => sum + row.cells.reduce((cellSum, cell) => cellSum + exams.filter((exam) => cell.byExam[exam.id] != null).length, 0), 0);
  const coverage = possibleMarks ? Math.round((enteredMarks / possibleMarks) * 100) : 0;
  const atRisk = rankedAll.filter((row) => row.avgMean != null && row.avgMean < 50);
  const unscored = rankedAll.filter((row) => row.avgMean == null);
  const highAchievers = rankedAll.filter((row) => row.avgMean != null && row.avgMean >= 80);
  const subjectRanked = [...subjectChart].sort((a, b) => b.mean - a.mean);
  const strongestSubject = subjectRanked[0];
  const supportSubject = subjectRanked.filter((item) => item.mean > 0).at(-1);
  const scoreValues = rankedAll.map((row) => row.avgMean).filter((value): value is number => value != null);
  const scoreSpread = scoreValues.length ? Math.max(...scoreValues) - Math.min(...scoreValues) : 0;
  const sortedScores = [...scoreValues].sort((a, b) => a - b);
  const medianScore = sortedScores.length ? (sortedScores.length % 2 ? sortedScores[Math.floor(sortedScores.length / 2)] : (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2) : null;
  const passCount = scoreValues.filter((score) => score >= 50).length;
  const passRate = scoreValues.length ? Math.round((passCount / scoreValues.length) * 100) : null;
  const subjectCoverage = subjects.length && rankedAll.length ? Math.round((rankedAll.reduce((sum, row) => sum + row.cells.filter((cell) => cell.avg != null).length, 0) / (subjects.length * rankedAll.length)) * 100) : 0;
  const subjectMeansAvailable = subjectChart.filter((item) => item.mean > 0);
  const subjectMeanSpread = subjectMeansAvailable.length > 1 ? Math.max(...subjectMeansAvailable.map((item) => item.mean)) - Math.min(...subjectMeansAvailable.map((item) => item.mean)) : 0;
  const learnersBelowClassMean = classMean == null ? 0 : scoreValues.filter((score) => score < classMean).length;
  const examMeans = exams.map((exam) => ({ name: exam.name, mean: meanOf(rankedAll.map((row) => row.means[exam.id])) }));
  const bestExam = [...examMeans].filter((item) => item.mean != null).sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))[0];
  const catDelta = examMeans.length > 1 && examMeans[0].mean != null && examMeans[1].mean != null ? examMeans[1].mean - examMeans[0].mean : null;
  const streamGap = streamCompare.length > 1 ? Math.max(...streamCompare.map((row) => row.mean)) - Math.min(...streamCompare.map((row) => row.mean)) : 0;
  const scoreBands = [
    { label: "Below 40", count: rankedAll.filter((row) => row.avgMean != null && row.avgMean < 40).length },
    { label: "40–59", count: rankedAll.filter((row) => row.avgMean != null && row.avgMean >= 40 && row.avgMean < 60).length },
    { label: "60–79", count: rankedAll.filter((row) => row.avgMean != null && row.avgMean >= 60 && row.avgMean < 80).length },
    { label: "80+", count: highAchievers.length },
  ];
  const trend = termBook.map((item) => `${item.term.name}: ${fmt(item.mean)}`).join(" · ");
  const bestRows = (items: Decorated[]) => {
    const valid = items.map((row) => ({ row, score: valueOf(row) })).filter((item): item is { row: Decorated; score: number } => item.score != null);
    const topScore = valid.length ? Math.max(...valid.map((item) => item.score)) : null;
    return topScore == null ? [] : valid.filter((item) => item.score === topScore).map((item) => item.row);
  };
  const bestBoyNorth = bestRows(rankedAll.filter((row) => row.learner.gender === "MALE" && /north/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestBoySouth = bestRows(rankedAll.filter((row) => row.learner.gender === "MALE" && /south/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestGirlNorth = bestRows(rankedAll.filter((row) => row.learner.gender === "FEMALE" && /north/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestGirlSouth = bestRows(rankedAll.filter((row) => row.learner.gender === "FEMALE" && /south/i.test(ws.streams.find((stream) => stream.id === row.learner.streamId)?.name ?? "")));
  const bestBoysOverall = bestRows(rankedAll.filter((row) => row.learner.gender === "MALE"));
  const bestGirlsOverall = bestRows(rankedAll.filter((row) => row.learner.gender === "FEMALE"));
  const bestOverall = bestRows(rankedAll);
  const bestBySubject = subjects.map((subject) => {
    const candidates = rankedAll.map((row) => ({ row, score: row.cells.find((cell) => cell.subjectId === subject.id)?.avg ?? null })).filter((item): item is { row: Decorated; score: number } => item.score != null);
    const high = candidates.length ? Math.max(...candidates.map((item) => item.score)) : null;
    return { subject, rows: high == null ? [] : candidates.filter((item) => item.score === high).map((item) => item.row), score: high };
  });
  const names = (rows: Decorated[]) => rows.map((row) => row.learner.fullName).join(", ") || "—";

  async function downloadPdf() {
    if (!canDownload) return;
    setPdfBusy(true);
    try {
      const modeName = currentMode === "avg" ? "average" : exams.find((exam) => exam.id === currentMode)?.name ?? currentMode;
      await downloadMeritListPdf({
        fileName: `${grade?.name ?? "class"}-${modeName}-${meritOrientation}-merit-list.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "_"),
        profile: ws.profile,
        logo: await logoDataUrl(ws.profile.logoData),
        title: `${meritTitle} (${modeName})`,
        periodLabel: meritPeriod,
        subjects,
        orientation: meritOrientation,
        rows: rankedAll.map((row) => ({
          position: rankOf(row),
          roll: row.learner.roll,
          admission: row.learner.admissionNumber ?? "",
          name: row.learner.fullName,
          stream: ws.streams.find((item) => item.id === row.learner.streamId)?.name ?? "",
          scores: subjects.map((subject) => {
            const cell = row.cells.find((item) => item.subjectId === subject.id);
            const score = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode];
            return score == null ? "—" : currentMode === "avg" ? score.toFixed(0) : String(score);
          }),
          mean: fmt(valueOf(row)),
          level: row.level ?? "—",
        })),
        streamSummary: streamCompare.map((item) => ({ name: item.name, meanLabel: item.meanLabel, learnerCount: item.learnerCount, topLearner: item.topLearner })),
        analytics: pdfWithAnalytics
          ? {
              summary: [
                { label: "Class mean", value: fmt(classMean) },
                { label: "Top learner", value: names(bestOverall) },
                { label: "Best boy — North", value: names(bestBoyNorth) },
                { label: "Best boy — South", value: names(bestBoySouth) },
                { label: "Best boy overall", value: names(bestBoysOverall) },
                { label: "Best girl — North", value: names(bestGirlNorth) },
                { label: "Best girl — South", value: names(bestGirlSouth) },
                { label: "Best girl overall", value: names(bestGirlsOverall) },
                { label: "Best student overall", value: names(bestOverall) },
                { label: "Top stream", value: bestStream?.name ?? "—" },
                { label: "Girls / boys", value: `${fmt(girls)} / ${fmt(boys)}` },
              ],
              subjectMeans: subjectChart,
              subjectPositions,
              streamMeans: streamCompare,
              scoreBands,
              insights: [
                { label: "Marks coverage", value: `${coverage}%`, detail: `${enteredMarks} of ${possibleMarks} expected score cells entered` },
                { label: "Learners at risk", value: String(atRisk.length), detail: "Mean below 50; review support needs" },
                { label: "High achievers", value: String(highAchievers.length), detail: "Mean of 80 or above" },
                { label: "No recorded marks", value: String(unscored.length), detail: "No scored subjects in this period" },
                { label: "Strongest subject", value: strongestSubject?.name ?? "—", detail: strongestSubject ? `Mean ${fmt(strongestSubject.mean)}` : "No scores yet" },
                { label: "Priority subject", value: supportSubject?.name ?? "—", detail: supportSubject ? `Mean ${fmt(supportSubject.mean)}; consider intervention` : "No scores yet" },
                { label: "Score spread", value: fmt(scoreSpread), detail: "Difference between highest and lowest learner mean" },
                { label: "Stream performance gap", value: fmt(streamGap), detail: "Difference between highest and lowest stream means" },
                { label: "CAT improvement", value: catDelta == null ? "—" : `${catDelta > 0 ? "+" : ""}${fmt(catDelta)}`, detail: examMeans.length > 1 ? `${examMeans[0].name} compared with ${examMeans[1].name}` : "Add another CAT to compare" },
                { label: "Female / male mean", value: `${fmt(girls)} / ${fmt(boys)}`, detail: girls != null && boys != null ? `Difference ${fmt(girls - boys)}` : "Not enough gender-separated scores" },
                { label: "Best boy North", value: names(bestBoyNorth), detail: "Tied leaders are all included" },
                { label: "Best boy South", value: names(bestBoySouth), detail: "Tied leaders are all included" },
                { label: "Best boy overall", value: names(bestBoysOverall), detail: "Tied leaders are all included" },
                { label: "Best girl North", value: names(bestGirlNorth), detail: "Tied leaders are all included" },
                { label: "Best girl South", value: names(bestGirlSouth), detail: "Tied leaders are all included" },
                { label: "Best girl overall", value: names(bestGirlsOverall), detail: "Tied leaders are all included" },
                { label: "Best student overall", value: names(bestOverall), detail: "Tied leaders are all included" },
                ...bestBySubject.map((item) => ({ label: `Best ${item.subject.name}`, value: names(item.rows), detail: item.score == null ? "No recorded subject scores" : `Score ${fmt(item.score)}; all ties included` })),
                { label: "Class average", value: fmt(classMean), detail: `${rankedAll.length} learners in the selected grade/stream` },
              ],
              trend,
              review: atRisk.slice(0, 12).map((row) => `${row.learner.fullName} (${fmt(row.avgMean)})`).join(" · "),
            }
          : null,
      });
      flash(`Merit list PDF downloaded with all ${rankedAll.length} learners, including learners without marks.`);
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadPointsPdf() {
    if (!canDownload) return;
    if (!grade) return;
    setPdfBusy(true);
    try {
      const pointRows = pointsRanked.map((row) => ({
        position: pointsRankOf(row),
        roll: row.learner.roll,
        admission: row.learner.admissionNumber ?? "",
        name: row.learner.fullName,
        stream: ws.streams.find((item) => item.id === row.learner.streamId)?.name ?? "",
        scores: subjects.map((subject) => {
          const cell = row.cells.find((item) => item.subjectId === subject.id);
          const score = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode];
          if (score == null) return "—";
          return meritOrientation === "portrait"
            ? `${Number(score.toFixed(0))}·${cell?.level ?? "—"}·${cell?.points ?? "—"}`
            : `${Number(score.toFixed(0))} · ${cell?.level ?? "—"} (${cell?.points ?? "—"} pts)`;
        }),
        mean: row.totalPoints == null ? "—" : String(row.totalPoints),
        level: `${row.level ?? "—"} · ${row.levelPoints ?? "—"} pts`,
      }));
      await downloadMeritListPdf({
        fileName: `${grade.name}-${currentMode}-${meritOrientation}-points-merit-list.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "_"),
        profile: ws.profile,
        logo: await logoDataUrl(ws.profile.logoData),
        title: `POINTS-BASED MERIT LIST — ${grade.name}${streamId ? ` · ${ws.streams.find((item) => item.id === streamId)?.name ?? ""}` : " · All streams"}`,
        periodLabel: `${meritPeriod} · Rank by total subject points; level points shown`,
        subjects,
        orientation: meritOrientation,
        rows: pointRows,
        streamSummary: pointsStreamCompare,
        meanHeader: "TOTAL POINTS",
        levelHeader: "LEVEL / PTS",
        analytics: pdfWithAnalytics ? {
          summary: [
            { label: "Average total points", value: classPointsMean == null ? "—" : fmt(classPointsMean, 0) },
            { label: "Top learner", value: names(pointsRanked[0]?.totalPoints == null ? [] : [pointsRanked[0]]) },
            { label: "Highest points", value: pointsRanked[0]?.totalPoints == null ? "—" : String(pointsRanked[0].totalPoints) },
            { label: "Learners in roster", value: String(pointsRanked.length) },
            { label: "Top stream", value: [...pointsStreamCompare].sort((a, b) => b.mean - a.mean)[0]?.name ?? "—" },
            { label: "Score graph", value: "Included" },
          ],
          subjectMeans: subjectChart,
          subjectPositions,
          streamMeans: pointsStreamCompare,
          scoreBands,
          insights: [
            { label: "Average total points", value: classPointsMean == null ? "—" : fmt(classPointsMean, 0), detail: "Total of the points awarded for each recorded subject level" },
            { label: "Top learner", value: names(pointsRanked[0]?.totalPoints == null ? [] : [pointsRanked[0]]), detail: "Highest total subject points; ties remain visible in the merit table" },
            { label: "Highest level points", value: pointsRanked[0]?.levelPoints == null ? "—" : String(pointsRanked[0].levelPoints), detail: "Overall band points for the learner" },
            { label: "Learners without points", value: String(pointsRanked.filter((row) => row.totalPoints == null).length), detail: "No recorded subject levels available for points ranking" },
            { label: "Points range", value: scoredPointsRanked.length ? `${scoredPointsRanked.at(-1)?.totalPoints ?? "—"}–${scoredPointsRanked[0]?.totalPoints ?? "—"}` : "—", detail: "Lowest to highest recorded total points" },
            { label: "Marks coverage", value: `${coverage}%`, detail: `${enteredMarks} of ${possibleMarks} expected score cells entered` },
            { label: "Strongest subject", value: strongestSubject?.name ?? "—", detail: strongestSubject ? `Score mean ${fmt(strongestSubject.mean)}` : "No scores yet" },
            { label: "Top stream", value: [...pointsStreamCompare].sort((a, b) => b.mean - a.mean)[0]?.name ?? "—", detail: "Stream with the highest average total points" },
          ],
          trend,
          review: pointsRanked.filter((row) => row.totalPoints == null).slice(0, 12).map((row) => `${row.learner.fullName} (no points)`).join(" · "),
        } : null,
      });
      flash(`Points-based merit list PDF downloaded with all ${pointsRanked.length} learners, including learners without points.`);
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadExcel() {
    if (!canDownload) return;
    const quoteRows = [
      [ws.profile.name.toUpperCase()],
      [`P.O. BOX ${ws.profile.poBox} · ${ws.profile.location}`],
      [`VISION: ${ws.profile.vision}`],
      [`MISSION: ${ws.profile.mission}`],
      [`MOTTO: ${ws.profile.motto}`],
      [meritTitle],
      [meritPeriod],
      [],
      ["Position", "Roll", "Admission Number", "Name", "Gender", "Stream", ...subjects.map((subject) => subject.shortName), "Mean", "Level"],
      ...rankedAll.map((row) => {
        const stream = ws.streams.find((item) => item.id === row.learner.streamId)?.name ?? "";
        const scores = subjects.map((subject) => {
          const cell = row.cells.find((item) => item.subjectId === subject.id);
          const score = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode];
          return score == null ? "" : Number(score.toFixed(2));
        });
        return [rankOf(row), row.learner.roll, row.learner.admissionNumber ?? "", row.learner.fullName, row.learner.gender, stream, ...scores, valueOf(row) == null ? "" : Number(valueOf(row)!.toFixed(2)), row.level ?? ""];
      }),
      [],
      ["STREAM PERFORMANCE SUMMARY"],
      ["Stream", "Learners", "Mean", "Top learner"],
      ...streamCompare.map((item) => [item.name, item.learnerCount, item.meanLabel, item.topLearner]),
    ];
    const bytes = writeXlsxFromMatrix(quoteRows, { sheetName: "Merit list", headerRow: 9, orientation: meritOrientation, logo: ws.profile.logoData || "/logo.png" });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a"); link.href = url; link.download = `${grade?.name ?? "class"}-${currentMode}-${meritOrientation}-merit-list.xlsx`.replace(/[^a-zA-Z0-9._-]+/g, "_"); link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
    flash(`Merit list Excel workbook downloaded with all ${rankedAll.length} learners, including learners without marks.`);
  }
  async function downloadSubjectLevelsPdf() {
    if (!canDownload) return;
    if (!grade) return;
    setPdfBusy(true);
    try {
      const modeName = currentMode === "avg" ? "average" : exams.find((exam) => exam.id === currentMode)?.name ?? currentMode;
      await downloadSubjectLevelMeritListPdf({
        fileName: `${grade.name}-${modeName}-${meritOrientation}-subject-level-merit-list.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "_"),
        profile: ws.profile,
        logo: await logoDataUrl(ws.profile.logoData),
        title: `SUBJECT LEVEL MERIT LIST — ${grade.name}${streamId ? ` · ${ws.streams.find((item) => item.id === streamId)?.name ?? ""}` : " · All streams"}`,
        periodLabel: `${meritPeriod} · Merit positions, subject scores, and levels follow ${currentMode === "avg" ? "the average across active assessments" : modeName}`,
        orientation: meritOrientation,
        analytics: pdfWithAnalytics ? {
          summary: [
            { label: "Class mean", value: fmt(classMean) },
            { label: "Top learner", value: names(bestOverall) },
            { label: "Top stream", value: bestStream?.name ?? "—" },
            { label: "Girls / boys", value: `${fmt(girls)} / ${fmt(boys)}` },
            { label: "Pass rate", value: passRate == null ? "—" : `${passRate}%` },
            { label: "Marks coverage", value: `${coverage}%` },
          ],
          subjectMeans: subjectChart,
          subjectPositions,
          streamMeans: streamCompare,
          scoreBands,
          insights: [
            { label: "Learners at risk", value: String(atRisk.length), detail: "Mean below 50; review support needs" },
            { label: "High achievers", value: String(highAchievers.length), detail: "Mean of 80 or above" },
            { label: "Strongest subject", value: strongestSubject?.name ?? "—", detail: strongestSubject ? `Mean ${fmt(strongestSubject.mean)}` : "No scores yet" },
            { label: "Priority subject", value: supportSubject?.name ?? "—", detail: supportSubject ? `Mean ${fmt(supportSubject.mean)}` : "No scores yet" },
            { label: "Median learner score", value: fmt(medianScore), detail: "Middle score after ordering learner averages" },
            { label: "Below class mean", value: String(learnersBelowClassMean), detail: "Learners below the selected class mean" },
            ...bestBySubject.map((item) => ({ label: `Best ${item.subject.name}`, value: names(item.rows), detail: item.score == null ? "No recorded subject scores" : `Score ${fmt(item.score)}` })),
          ],
          trend,
          review: atRisk.slice(0, 12).map((row) => `${row.learner.fullName} (${fmt(row.avgMean)})`).join(" · "),
        } : null,
        subjects: subjects.map(({ id, shortName, name }) => ({ id, shortName, name })),
        rows: rankedAll.map((row) => ({
          position: rankOf(row),
          roll: row.learner.roll,
          admission: row.learner.admissionNumber ?? "",
          name: row.learner.fullName,
          stream: ws.streams.find((item) => item.id === row.learner.streamId)?.name ?? "",
          subjectScores: subjects.map((subject) => { const cell = row.cells.find((item) => item.subjectId === subject.id); const score = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode]; const level = score == null ? null : bandFor(score, ws.bands)?.code ?? null; return `${score == null ? "—" : Number.isInteger(score) ? score : Number(score.toFixed(2))} · ${level ?? "—"}`; }),
          mean: fmt(valueOf(row)),
          level: row.level ?? "—",
        })),
      });
      flash(`Subject-level merit list downloaded with all ${rankedAll.length} learners, including learners without marks.`);
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="analysis-print-area space-y-5">
      <header className="analysis-school-header hidden grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 border-b-2 border-amber-500 pb-3 text-slate-900">
        <img src={ws.profile.logoData || "/logo.png"} alt="School logo" className="h-16 w-16 object-contain" />
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase">{ws.profile.name}</h1>
          <p className="text-xs">P.O. BOX {ws.profile.poBox} · {ws.profile.location}</p>
          <p className="mt-1 text-xs"><strong>VISION:</strong> {ws.profile.vision}</p>
          <p className="text-xs"><strong>MISSION:</strong> {ws.profile.mission}</p>
          <p className="mt-1 text-sm font-semibold"><strong>MOTTO:</strong> {ws.profile.motto}</p>
          <p className="mt-1 text-sm font-bold">CLASS ANALYSIS / MERIT LIST — {grade?.name ?? "Class"}{streamId ? ` · ${ws.streams.find((item) => item.id === streamId)?.name ?? ""}` : " · All streams"}</p>
          <p className="text-xs">{ws.terms.find((item) => item.id === period.termId)?.name ?? ws.profile.termName} · {ws.years.find((item) => item.id === period.yearId)?.name ?? ws.profile.academicYear}</p>
        </div>
        <img src={ws.profile.logoData || "/logo.png"} alt="School logo" className="h-16 w-16 object-contain" />
      </header>
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-navy">Analysis</h1>
          <p className="text-sm text-muted">Merit order for one year and term. Compare CAT 1, CAT 2, or the average, and see the other terms beside it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDownload ? <>
            <label className="text-xs font-semibold text-muted">Page layout (PDF / Excel)
              <select className={inputClass + " ml-2"} value={meritOrientation} onChange={(event) => setMeritOrientation(event.target.value as typeof meritOrientation)}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pdfWithAnalytics} onChange={(event) => setPdfWithAnalytics(event.target.checked)} />Include graphs and advanced analytics in PDF</label>
            <button className={btnGhost} type="button" onClick={download}>Download merit list (CSV)</button>
            <button className={btnGhost} type="button" onClick={() => void downloadExcel()}>Download merit list (Excel)</button>
            <button className={btnGhost} type="button" disabled={pdfBusy} onClick={downloadPdf}>{pdfBusy ? "Preparing PDF…" : "Download merit list (PDF)"}</button>
            <button className={btnGhost} type="button" disabled={pdfBusy || !rankedAll.length} onClick={downloadPointsPdf}>{pdfBusy ? "Preparing PDF…" : "Download points merit list (PDF)"}</button>
            <button className={btnGhost} type="button" disabled={pdfBusy || !rankedAll.length} onClick={downloadSubjectLevelsPdf}>{pdfBusy ? "Preparing PDF…" : "Download subject levels (PDF)"}</button>
            <button className={btnGhost} type="button" onClick={() => { flash("Print dialog opened for the class analysis."); window.print(); }}>Print analysis</button>
          </> : <span className="text-sm text-muted">Downloads and printing are disabled by the Super Admin for your role.</span>}
        </div>
      </header>
      <div className="no-print"><PeriodBar ws={ws} yearId={period.yearId} termId={period.termId} onYear={period.setYearId} onTerm={period.setTermId} /></div>
      <div className="grid gap-2 sm:grid-cols-3">
        {termBook.map((item) => (
          <button key={item.term.id} type="button" className={`rounded-md border px-3 py-2 text-left ${item.term.id === period.termId ? "border-navy bg-navy text-paper" : "border-line bg-card"}`} onClick={() => period.setTermId(item.term.id)}>
            <p className="text-xs uppercase tracking-wide opacity-80">{item.term.name}</p>
            <p className="font-serif text-2xl">{fmt(item.mean)}</p>
          </button>
        ))}
      </div>
      <div className="no-print flex flex-wrap gap-2">
        <select className={inputClass} value={gradeId} onChange={(event) => { setGradeId(event.target.value); setStreamId(""); }}>
          {ws.grades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className={inputClass} value={streamId} onChange={(event) => setStreamId(event.target.value)}>
          <option value="">All streams</option>
          {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
        </select>
        <div className="flex rounded-md border border-line bg-card p-1">
          {[...exams.map((exam) => ({ id: exam.id, label: exam.name })), { id: "avg", label: "Average" }].map((item) => (
            <button key={item.id} type="button" className={`h-9 rounded-md px-3 text-sm ${currentMode === item.id ? "bg-navy text-paper" : "text-ink"}`} onClick={() => setMode(item.id)}>{item.label}</button>
          ))}
        </div>
      </div>
      <section className="no-print flex flex-wrap items-end gap-3 rounded-md border border-line bg-card p-3">
        <label className="min-w-[13rem] flex-1 text-xs font-semibold text-muted">Find learner
          <input className={inputClass + " mt-1 w-full"} value={learnerSearch} onChange={(event) => setLearnerSearch(event.target.value)} placeholder="Name, admission number or roll no." />
        </label>
        <label className="text-xs font-semibold text-muted">Filter level
          <select className={inputClass + " mt-1 block"} value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="all">All levels</option>
            {[...new Set(decorated.map((row) => row.level ?? "Unassigned"))].sort().map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">Sort learners
          <select className={inputClass + " mt-1 block"} value={rankSort} onChange={(event) => setRankSort(event.target.value as typeof rankSort)}>
            <option value="performance">Best to lowest</option><option value="name">Name A–Z</option><option value="roll">Roll number</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={showAdmission} onChange={(event) => setShowAdmission(event.target.checked)} />Show admission numbers</label>
        <button type="button" className={btnGhost} onClick={() => { setLearnerSearch(""); setLevelFilter("all"); setRankSort("performance"); setShowAdmission(true); }}>Reset filters</button>
        <p className="w-full text-xs text-muted">Showing {ranked.length} of {rankedAll.length} learners. Search and level filters affect this table only; downloads and grade-wide counts include everyone in the selected grade/stream, including learners without recorded marks.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Class mean" value={fmt(classMean)} />
        <Info label="Top learner" value={topScoringLearner?.learner.fullName ?? "—"} hint={topScoringLearner ? fmt(valueOf(topScoringLearner)) : "No recorded marks"} />
        <Info label="Top stream" value={bestStream?.name ?? "—"} hint={bestStream ? fmt(bestStream.mean) : ""} />
        <Info label="Girls / boys" value={`${fmt(girls)} / ${fmt(boys)}`} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Chart title="Subject means" data={subjectChart} />
        <Chart title="Stream means" data={streamCompare} />
      </section>
      <section className="rounded-md border border-line bg-card p-4">
        <h2 className="font-serif text-xl text-navy">Stream performance summary</h2>
        <p className="mb-3 text-xs text-muted">Mean, learner count and top performer for each stream in this grade.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-paper text-xs uppercase text-muted"><tr><th className="px-2 py-2">Stream</th><th className="px-2 py-2">Learners</th><th className="px-2 py-2">Mean</th><th className="px-2 py-2">Top learner</th></tr></thead><tbody>
          {streamCompare.map((item) => <tr key={item.name} className="border-t border-line"><td className="px-2 py-2 font-semibold">{item.name}</td><td className="px-2 py-2">{item.learnerCount}</td><td className="px-2 py-2 font-semibold">{item.meanLabel}</td><td className="px-2 py-2">{item.topLearner}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="rounded-md border border-line bg-card p-4 space-y-4">
        <div><h2 className="font-serif text-xl text-navy">Advanced learner analytics</h2><p className="text-sm text-muted">More than ten decision-support indicators calculated from the selected grade, academic year and term. Use these to plan intervention; they do not replace teacher judgement.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Insight label="Marks coverage" value={`${coverage}%`} detail={`${enteredMarks} of ${possibleMarks} expected score cells entered`} />
          <Insight label="Learners at risk" value={String(atRisk.length)} detail="Mean below 50; review support needs" />
          <Insight label="High achievers" value={String(highAchievers.length)} detail="Mean of 80 or above" />
          <Insight label="No recorded marks" value={String(unscored.length)} detail="No scored subjects in this period" />
          <Insight label="Strongest subject" value={strongestSubject?.name ?? "—"} detail={strongestSubject ? `Mean ${fmt(strongestSubject.mean)}` : "No scores yet"} />
          <Insight label="Priority subject" value={supportSubject?.name ?? "—"} detail={supportSubject ? `Mean ${fmt(supportSubject.mean)}; consider intervention` : "No scores yet"} />
          <Insight label="Score spread" value={fmt(scoreSpread)} detail="Difference between highest and lowest learner mean" />
          <Insight label="Stream performance gap" value={fmt(streamGap)} detail="Difference between highest and lowest stream means" />
          <Insight label="CAT improvement" value={catDelta == null ? "—" : `${catDelta > 0 ? "+" : ""}${fmt(catDelta)}`} detail={examMeans.length > 1 ? `${examMeans[0].name} compared with ${examMeans[1].name}` : "Add another CAT to compare"} />
          <Insight label="Female / male mean" value={`${fmt(girls)} / ${fmt(boys)}`} detail={girls != null && boys != null ? `Difference ${fmt(girls - boys)}` : "Not enough gender-separated scores"} />
          <Insight label="Class average" value={fmt(classMean)} detail={`${rankedAll.length} learners in the selected grade/stream`} />
          <Insight label="Top learner" value={topScoringLearner?.learner.fullName ?? "—"} detail={topScoringLearner ? `Mean ${fmt(valueOf(topScoringLearner))}` : "No recorded marks"} />
          <Insight label="Median learner score" value={fmt(medianScore)} detail="Middle score after ordering learner averages" />
          <Insight label="Pass rate" value={passRate == null ? "—" : `${passRate}%`} detail={`${passCount} of ${scoreValues.length} scored learners at 50 or above`} />
          <Insight label="Subject mark coverage" value={`${subjectCoverage}%`} detail="Learner-subject averages recorded in the selected class" />
          <Insight label="Subject mean spread" value={fmt(subjectMeanSpread)} detail="Difference between strongest and weakest recorded subject mean" />
          <Insight label="Below class mean" value={String(learnersBelowClassMean)} detail="Learners whose average is below the class mean" />
          <Insight label="Strongest assessment" value={bestExam?.name ?? "—"} detail={bestExam ? `Mean ${fmt(bestExam.mean)}` : "No assessment means available"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-line bg-paper p-3"><h3 className="font-semibold text-navy">Top and support learners</h3><div className="mt-2 grid gap-3 sm:grid-cols-2 text-sm"><div><strong>Top 5</strong>{rankedAll.filter((row) => valueOf(row) != null).slice(0, 5).map((row) => <p key={row.learner.id}>{rankOf(row)}. {row.learner.fullName} — {fmt(valueOf(row))}</p>)}</div><div><strong>Bottom 5</strong>{[...rankedAll].filter((row) => valueOf(row) != null).sort((a, b) => (valueOf(a) ?? 0) - (valueOf(b) ?? 0)).slice(0, 5).map((row) => <p key={row.learner.id}>{row.learner.fullName} — {fmt(valueOf(row))}</p>)}</div></div></div>
          <div className="rounded-md border border-line bg-paper p-3"><h3 className="font-semibold text-navy">Subject coverage</h3><div className="mt-2 space-y-2 text-sm">{subjects.map((subject) => { const scored = rankedAll.filter((row) => row.cells.find((cell) => cell.subjectId === subject.id)?.avg != null).length; const pct = rankedAll.length ? Math.round(scored / rankedAll.length * 100) : 0; return <div key={subject.id}><div className="flex justify-between"><span>{subject.name}</span><strong>{pct}%</strong></div><div className="h-2 rounded bg-paper"><div className="h-2 rounded bg-info" style={{ width: `${pct}%` }} /></div></div>; })}</div></div>
          <div className="rounded-md border border-line bg-paper p-3"><h3 className="font-semibold text-navy">Class awards and subject leaders</h3><div className="mt-2 space-y-1 text-sm">
            <p><strong>Best boy North:</strong> {names(bestBoyNorth)}</p><p><strong>Best boy South:</strong> {names(bestBoySouth)}</p><p><strong>Best boy overall:</strong> {names(bestBoysOverall)}</p>
            <p><strong>Best girl North:</strong> {names(bestGirlNorth)}</p><p><strong>Best girl South:</strong> {names(bestGirlSouth)}</p><p><strong>Best girl overall:</strong> {names(bestGirlsOverall)}</p><p><strong>Best student overall:</strong> {names(bestOverall)}</p>
            {bestBySubject.map((item) => <p key={item.subject.id}><strong>Best in {item.subject.name}:</strong> {names(item.rows)}{item.score == null ? "" : ` (${fmt(item.score)})`}</p>)}
          </div></div>
          <div><h3 className="font-semibold text-navy">Score distribution</h3><div className="mt-2 space-y-2">{scoreBands.map((band) => <div key={band.label} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-2 text-sm"><span>{band.label}</span><div className="h-2 rounded bg-paper"><div className="h-2 rounded bg-info" style={{ width: `${rankedAll.length ? band.count / rankedAll.length * 100 : 0}%` }} /></div><strong>{band.count}</strong></div>)}</div></div>
          <div><h3 className="font-semibold text-navy">Term trend snapshot</h3><p className="mt-2 text-sm text-muted">{trend || "No term results available."}</p><h3 className="mt-4 font-semibold text-navy">Learners needing review</h3><p className="mt-1 text-sm">{atRisk.slice(0, 8).map((row) => `${row.learner.fullName} (${fmt(row.avgMean)})`).join(" · ") || "No learners currently fall below the intervention threshold."}</p></div>
        </div>
      </section>
      <div className="overflow-x-auto rounded-md border border-line bg-card">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2">Pos</th><th className="px-2 py-2">No.</th>{showAdmission && <th className="px-2 py-2">Admission No.</th>}<th className="px-2 py-2">Learner</th><th className="px-2 py-2">Stream</th>
              {subjects.map((subject) => <th key={subject.id} className="px-2 py-2">{subject.shortName}</th>)}
              <th className="px-2 py-2">Mean</th><th className="px-2 py-2">Dev</th><th className="px-2 py-2">Level</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => {
              const score = valueOf(row);
              return (
                <tr key={row.learner.id} className="border-t border-line">
                  <td className="px-2 py-1.5 font-semibold">{rankOf(row)}</td>
                  <td className="px-2 py-1.5">{row.learner.roll}</td>
                  {showAdmission && <td className="px-2 py-1.5 font-medium">{row.learner.admissionNumber || "—"}</td>}
                  <td className="px-2 py-1.5">{row.learner.fullName}</td>
                  <td className="px-2 py-1.5">{ws.streams.find((stream) => stream.id === row.learner.streamId)?.name}</td>
                  {subjects.map((subject) => {
                    const cell = row.cells.find((item) => item.subjectId === subject.id);
                    const cellScore = currentMode === "avg" ? cell?.avg : cell?.byExam[currentMode];
                    return <td key={subject.id} className="px-2 py-1.5">{cellScore == null ? "—" : currentMode === "avg" ? cellScore.toFixed(0) : cellScore}</td>;
                  })}
                  <td className="px-2 py-1.5 font-semibold">{fmt(score)}</td>
                  <td className="px-2 py-1.5">{score == null || classMean == null ? "—" : (score - classMean).toFixed(1)}</td>
                  <td className="px-2 py-1.5">{row.level ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Insight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-lg font-semibold text-navy">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

function Info({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-md border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl text-navy">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </article>
  );
}

function Chart({ title, data }: { title: string; data: Array<{ name: string; mean: number }> }) {
  return (
    <article className="rounded-md border border-line bg-card p-4">
      <h2 className="font-serif text-xl text-navy">{title}</h2>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#e3dac8" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#6b6258", fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "#6b6258", fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="mean" fill="#0e2a4a" radius={3} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
