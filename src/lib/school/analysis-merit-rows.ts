/** Order a complete merit roster by score without dropping learners whose score is not recorded. */
export function rankMeritRows<T>(rows: readonly T[], scoreOf: (row: T) => number | null | undefined): T[] {
  return [...rows].sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1));
}
