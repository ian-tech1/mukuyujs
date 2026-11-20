export type ReportCodeLearner = { publicCode: string; roll: number };

export function normalizeReportCode(rawCode: string | null | undefined): string | null {
  const code = rawCode?.trim().toLowerCase() ?? "";
  return /^(?:[a-z0-9]{4,12}|\d{1,10})$/.test(code) ? code : null;
}

/** Resolve stable public links first, then safely support older links that used roll numbers. */
export function resolveReportCode<T extends ReportCodeLearner>(learners: T[], rawCode: string): T | null {
  const code = normalizeReportCode(rawCode);
  if (!code) return null;

  const publicCodeMatch = learners.find((learner) => learner.publicCode.trim().toLowerCase() === code);
  if (publicCodeMatch) return publicCodeMatch;

  if (!/^\d+$/.test(code)) return null;
  const roll = Number(code);
  if (!Number.isSafeInteger(roll) || roll < 1) return null;

  const matches = learners.filter((learner) => learner.roll === roll);
  return matches.length === 1 ? matches[0] : null;
}
