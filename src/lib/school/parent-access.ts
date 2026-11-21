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
 * Return one high-confidence full-name match. Accept small spelling mistakes,
 * accents, punctuation and spacing changes; reject ties and short-name guesses.
 */
export function matchLearnerName(name: string, learners: NamedLearner[]) {
  const normalized = normalizeLearnerName(name);
  const compact = normalized.replace(/\s/g, "");
  if (compact.length < 4) return null;
  const scored = learners.map((learner) => {
    const candidate = normalizeLearnerName(learner.fullName);
    const candidateCompact = candidate.replace(/\s/g, "");
    const edits = damerauLevenshtein(compact, candidateCompact);
    const maxLength = Math.max(compact.length, candidateCompact.length);
    const maxEdits = maxLength < 6 ? 1 : maxLength < 13 ? 1 : Math.min(3, Math.floor(maxLength * 0.12));
    const score = maxLength ? 1 - edits / maxLength : 0;
    return { learner, edits, score, maxEdits };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.edits > best.maxEdits || best.score < 0.74) return null;
  const second = scored[1];
  if (second && (second.edits === best.edits || best.score - second.score < 0.08)) return null;
  return best.learner;
}

export function isValidParentEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
