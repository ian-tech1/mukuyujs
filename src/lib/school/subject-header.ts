export type ImportSubject = { id: string; name: string; shortName: string };

const SUBJECT_FAMILIES: Record<string, string[]> = {
  english: ["english", "eng", "english language", "english language arts"],
  integratedScience: [
    "integrated science", "integrated sci", "int science", "int sci", "integr sci", "sci", "science",
    "intergrated science", "intergrate science", "intergrated sci", "intergrate sci",
    "integration science", "integrated sciences", "general science", "science and technology",
    "integrated science and technology", "science technology", "science and tech",
  ],
  agriculture: [
    "agriculture", "agri", "agric", "agr", "agriculture and nutrition", "agricultural studies",
    "agriculture nutrition", "agriculture & nutrition",
  ],
  pretechnical: [
    "pretech", "pre tech", "pre tech studies", "pretechnical", "pre technical",
    "pretechnical studies", "pre technical studies", "pretechnical studies and skills", "pre tech studies and skills",
  ],
  creativeArts: [
    "creative arts and sports", "creative arts", "creative arts sports", "creative", "creative art",
    "creative and sports", "creative sports", "creative arts and physical education", "sports and creative arts",
    "c a", "ca", "c a s", "cas",
  ],
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+(?:score|marks?|result)$/, "")
    .replace(/\s+(?:out of|maximum)\s+\d+(?:\.\d+)?$/, "")
    .trim();
}

function familyOf(value: string) {
  const normalized = normalizeHeader(value);
  for (const [family, aliases] of Object.entries(SUBJECT_FAMILIES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return family;
  }
  return "";
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

/** Resolve an uploaded column header to exactly one configured school subject. */
export function resolveSubjectHeader(header: string, subjects: ImportSubject[]): ImportSubject | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  const exact = subjects.filter((subject) =>
    [subject.name, subject.shortName].some((name) => normalizeHeader(name) === normalized),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const family = familyOf(header);
  if (family) {
    const matches = subjects.filter((subject) => familyOf(subject.name) === family || familyOf(subject.shortName) === family);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }

  // Catch an obvious typo, but only when one full subject name clearly wins.
  // Short codes are deliberately excluded from fuzzy matching.
  if (normalized.length < 7) return null;
  const ranked = subjects.map((subject) => {
    const names = [subject.name, ...Object.values(SUBJECT_FAMILIES).flat().filter((alias) => familyOf(alias) && familyOf(alias) === familyOf(subject.name))]
      .map(normalizeHeader)
      .filter((name) => name.length >= 7);
    const score = Math.max(0, ...names.map((name) => 1 - levenshtein(normalized, name) / Math.max(normalized.length, name.length)));
    return { subject, score };
  }).sort((left, right) => right.score - left.score);
  if (ranked[0]?.score >= 0.84 && ranked[0].score - (ranked[1]?.score ?? 0) >= 0.08) return ranked[0].subject;
  return null;
}
