export type NamedLearner = { id: string; fullName: string };

export function normalizeParentEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeLearnerName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Resolve only exact, unambiguous, distinct active-roll name matches. */
export function matchLearnerNames(names: string[], learners: NamedLearner[]) {
  const normalizedNames = names.map(normalizeLearnerName).filter(Boolean);
  if (normalizedNames.length < 2 || normalizedNames.length > 5) return [];
  if (new Set(normalizedNames).size !== normalizedNames.length) return [];
  const byName = new Map<string, NamedLearner[]>();
  for (const learner of learners) {
    const key = normalizeLearnerName(learner.fullName);
    const list = byName.get(key) ?? [];
    list.push(learner);
    byName.set(key, list);
  }
  const matches: NamedLearner[] = [];
  for (const name of normalizedNames) {
    const found = byName.get(name) ?? [];
    if (found.length !== 1) return [];
    matches.push(found[0]);
  }
  return matches;
}

export function isValidParentEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
