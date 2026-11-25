export type LevelDistributionEntry = {
  level: string;
  students: number;
  boys: number;
  girls: number;
  other: number;
};

export type LearnerLevelRecord = {
  level: string | null | undefined;
  gender: string | null | undefined;
};

const NO_LEVEL = "No recorded level";

/** Count every learner once, retaining unscored learners in an explicit no-level group. */
export function summarizeLearnersByLevel(rows: readonly LearnerLevelRecord[]): LevelDistributionEntry[] {
  const groups = new Map<string, LevelDistributionEntry>();

  for (const row of rows) {
    const level = row.level?.trim().toLocaleUpperCase() || NO_LEVEL;
    const group = groups.get(level) ?? { level, students: 0, boys: 0, girls: 0, other: 0 };
    group.students += 1;
    const gender = row.gender?.trim().toLocaleUpperCase();
    if (gender === "MALE") group.boys += 1;
    else if (gender === "FEMALE") group.girls += 1;
    else group.other += 1;
    groups.set(level, group);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.level === NO_LEVEL) return b.level === NO_LEVEL ? 0 : 1;
    if (b.level === NO_LEVEL) return -1;
    return a.level.localeCompare(b.level, undefined, { numeric: true, sensitivity: "base" });
  });
}
