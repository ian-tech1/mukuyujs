export type NamedLearner = { id: string; fullName: string };
export type LearnerNameMatchOptions = { minimumSimilarity?: number; ambiguityMargin?: number };

export function normalizeParentEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeLearnerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function damerauLevenshtein(left: string, right: string) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distance = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let i = 0; i < rows; i += 1) distance[i][0] = i;
  for (let j = 0; j < columns; j += 1) distance[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        distance[i][j] = Math.min(distance[i][j], distance[i - 2][j - 2] + cost);
      }
    }
  }
  return distance[left.length][right.length];
}

/**
 * Match one learner conservatively. Exact names/tokens win first; fuzzy input
 * tokens are compared with distinct roster tokens and weighted by entered
 * letters, so an omitted middle name does not count as a spelling error.
 * Fuzzy matches use the configured similarity threshold (60% by default), and
 * close candidates inside the configured margin are not auto-linked.
 */
export function matchLearnerName(name: string, learners: NamedLearner[], options: LearnerNameMatchOptions = {}) {
  const minimumSimilarity = Math.max(0, Math.min(1, options.minimumSimilarity ?? 0.6));
  const ambiguityMargin = Math.max(0, Math.min(1, options.ambiguityMargin ?? 0));
  const normalized = normalizeLearnerName(name);
  const tokens = normalized.split(" ").filter(Boolean);
  const compact = tokens.join("");
  if (compact.length < 2) return null;

  const prepared = learners.map((learner) => {
    const learnerTokens = normalizeLearnerName(learner.fullName).split(" ").filter(Boolean);
    return {
      learner,
      tokens: learnerTokens,
      compact: learnerTokens.join(""),
      sortedTokens: [...learnerTokens].sort().join(" "),
      sortedCompact: [...learnerTokens].sort().join(""),
    };
  });

  if (tokens.length === 1) {
    const exactTokenMatches = prepared.filter((entry) => entry.tokens.includes(tokens[0]) || entry.compact === tokens[0]);
    if (exactTokenMatches.length === 1) return exactTokenMatches[0].learner;
    if (exactTokenMatches.length > 1) return null;

    const tokenScores = prepared.map((entry) => {
      const candidates = entry.tokens.map((token) => {
        const length = Math.max(tokens[0].length, token.length);
        const edits = damerauLevenshtein(tokens[0], token);
        return { edits, score: length ? 1 - edits / length : 0 };
      }).sort((a, b) => b.score - a.score);
      return candidates[0] ? { learner: entry.learner, ...candidates[0] } : null;
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).sort((a, b) => b.score - a.score);
    const best = tokenScores[0];
    if (!best || best.score < minimumSimilarity) return null;
    const second = tokenScores[1];
    if (second && best.score - second.score <= ambiguityMargin) return null;
    return best.learner;
  }

  const sortedKey = [...tokens].sort().join(" ");
  const compactKey = tokens.join("");
  const exactMatches = prepared.filter((entry) => entry.sortedTokens === sortedKey || entry.compact === compactKey);
  if (exactMatches.length === 1) return exactMatches[0].learner;
  if (exactMatches.length > 1) return null;

  // Parents may enter the exact first and last names while omitting a middle
  // name or initial. Accept that only when the supplied tokens identify one
  // learner in the active roster; duplicates remain ambiguous.
  const exactTokenSubsets = prepared.filter((entry) => tokens.every((token) => entry.tokens.includes(token)));
  if (exactTokenSubsets.length === 1) return exactTokenSubsets[0].learner;
  if (exactTokenSubsets.length > 1) return null;

  const scored = prepared.map((entry) => {
    const pairs = tokens.flatMap((token, inputIndex) => entry.tokens.map((candidate, candidateIndex) => {
      const maxLength = Math.max(token.length, candidate.length);
      const edits = damerauLevenshtein(token, candidate);
      return { inputIndex, candidateIndex, score: maxLength ? 1 - edits / maxLength : 0 };
    })).sort((left, right) => right.score - left.score);
    const usedInputs = new Set<number>();
    const usedCandidates = new Set<number>();
    let weightedSimilarity = 0;
    for (const pair of pairs) {
      if (usedInputs.has(pair.inputIndex) || usedCandidates.has(pair.candidateIndex)) continue;
      usedInputs.add(pair.inputIndex);
      usedCandidates.add(pair.candidateIndex);
      weightedSimilarity += pair.score * tokens[pair.inputIndex].length;
    }
    const score = compactKey.length ? weightedSimilarity / compactKey.length : 0;
    return { learner: entry.learner, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < minimumSimilarity) return null;
  const second = scored[1];
  if (second && best.score - second.score <= ambiguityMargin) return null;
  return best.learner;
}

export function isValidParentEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
