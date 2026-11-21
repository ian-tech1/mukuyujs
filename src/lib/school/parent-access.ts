export type NamedLearner = { id: string; fullName: string };

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
 * Match one learner conservatively. Similarity is 1 - edit distance / longest
 * name length. Unique exact names/tokens win first; fuzzy matches require 60%
 * similarity, and equally close candidates are not auto-linked.
 */
export function matchLearnerName(name: string, learners: NamedLearner[]) {
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
    if (!best || best.score < 0.6) return null;
    const second = tokenScores[1];
    if (second && second.score === best.score) return null;
    return best.learner;
  }

  const sortedKey = [...tokens].sort().join(" ");
  const compactKey = tokens.join("");
  const exactMatches = prepared.filter((entry) => entry.sortedTokens === sortedKey || entry.compact === compactKey);
  if (exactMatches.length === 1) return exactMatches[0].learner;
  if (exactMatches.length > 1) return null;

  const scored = prepared.map((entry) => {
    const orderedDistance = damerauLevenshtein(compactKey, entry.compact);
    const reorderedDistance = damerauLevenshtein(sortedKey.replace(/\s/g, ""), entry.sortedCompact);
    const edits = Math.min(orderedDistance, reorderedDistance);
    const maxLength = Math.max(compactKey.length, entry.compact.length);
    const score = maxLength ? 1 - edits / maxLength : 0;
    return { learner: entry.learner, edits, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.6) return null;
  const second = scored[1];
  if (second && second.score === best.score) return null;
  return best.learner;
}

export function isValidParentEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
