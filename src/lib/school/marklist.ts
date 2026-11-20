import { learnersForYear, type Workspace, type Learner } from "./model.ts";

type MarklistWorkspace = Pick<Workspace, "learners" | "placements" | "marks" | "years" | "grades" | "profile">;

/**
 * Build a mark-list roster without changing the shared historical cohort rules.
 * Keep learners already recorded in the selected year's cohort, then add active
 * learners currently assigned to the selected grade and stream if they have no
 * historical row. The map prevents duplicates and preserves the historical
 * placement where one exists.
 */
export function learnersForMarklist(
  ws: MarklistWorkspace,
  yearId: string,
  gradeId: string,
  streamId: string,
): Learner[] {
  const cohort = learnersForYear(ws, yearId).filter((learner) => learner.gradeId === gradeId && learner.streamId === streamId);
  const byId = new Map(cohort.map((learner) => [learner.id, learner]));
  for (const learner of ws.learners) {
    if (learner.status === "active" && learner.gradeId === gradeId && learner.streamId === streamId && !byId.has(learner.id)) {
      byId.set(learner.id, learner);
    }
  }
  return [...byId.values()].sort((a, b) => a.roll - b.roll || a.fullName.localeCompare(b.fullName));
}

/** Split a roster into non-empty pages, preserving row order and every learner. */
export function chunkMarklistRows<T>(rows: readonly T[], pageSize: number): T[][] {
  const size = Math.max(1, Math.floor(pageSize));
  const pages: T[][] = [];
  for (let index = 0; index < rows.length; index += size) pages.push(rows.slice(index, index + size));
  return pages.length ? pages : [[]];
}
