/** Order a complete merit roster by score without dropping learners whose score is not recorded. */
export function rankMeritRows<T>(rows: readonly T[], scoreOf: (row: T) => number | null | undefined): T[] {
  return [...rows].sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1));
}

/** Select an export roster without changing screen-wide learner counts. */
export function selectMeritExportRows<T extends { avgMean: number | null }>(rows: readonly T[], includeUnmarked = true): T[] {
  return rows.filter((row) => includeUnmarked || row.avgMean != null);
}
