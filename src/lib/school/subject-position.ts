export type SubjectPositionInput = {
  name: string;
  mean: number | null;
};

export type RankedSubjectPosition = SubjectPositionInput & {
  position: string;
};

/** Rank subjects by descending mean, preserving ties and leaving unscored subjects unranked. */
export function rankSubjectsByMean(subjects: SubjectPositionInput[]): RankedSubjectPosition[] {
  const sorted = [...subjects].sort((a, b) => {
    if (a.mean == null) return b.mean == null ? a.name.localeCompare(b.name) : 1;
    if (b.mean == null) return -1;
    return b.mean - a.mean || a.name.localeCompare(b.name);
  });

  let previousMean: number | null = null;
  let previousPosition = 0;
  return sorted.map((subject, index) => {
    if (subject.mean == null) return { ...subject, position: "—" };
    if (previousMean == null || subject.mean !== previousMean) {
      previousMean = subject.mean;
      previousPosition = index + 1;
    }
    return { ...subject, position: String(previousPosition) };
  });
}
