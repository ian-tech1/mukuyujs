export const SUBJECT_LEVEL_ROW_HEIGHT_MM = 5.6;

/** Keep every portrait subject together; landscape retains its existing 12-subject sections. */
export function subjectLevelSubjectSections<T>(subjects: readonly T[], orientation: "portrait" | "landscape"): T[][] {
  if (!subjects.length) return [[]];
  const subjectsPerSection = orientation === "portrait" ? subjects.length : 12;
  const sections: T[][] = [];
  for (let index = 0; index < subjects.length; index += subjectsPerSection) {
    sections.push(subjects.slice(index, index + subjectsPerSection));
  }
  return sections;
}

/** Divide the space left after learner identity columns evenly among subject columns. */
export function subjectLevelSubjectColumnWidth(tableWidth: number, identityWidths: readonly number[], subjectCount: number): number {
  const availableWidth = tableWidth - identityWidths.reduce((total, width) => total + width, 0);
  return Math.max(1, availableWidth / Math.max(subjectCount, 1));
}

/**
 * Calculate the number of subject-level learner rows that fit without moving the
 * existing text baseline or crowding the fixed footer.
 */
export function subjectLevelRowsPerPage(
  pageHeight: number,
  rowHeight = SUBJECT_LEVEL_ROW_HEIGHT_MM,
  tableTop = 43,
  firstRowOffset = 5.8,
  footerReserve = 14,
): number {
  const firstRowY = tableTop + firstRowOffset;
  return Math.max(1, Math.floor((pageHeight - footerReserve - firstRowY) / rowHeight) + 1);
}

/** Balance the last page while respecting the usable height of the chosen page orientation. */
export function paginateSubjectLevelRows<T>(
  rows: readonly T[],
  pageHeight: number,
  rowHeight = SUBJECT_LEVEL_ROW_HEIGHT_MM,
): T[][] {
  const capacity = subjectLevelRowsPerPage(pageHeight, rowHeight);
  const pageCount = Math.max(1, Math.ceil(rows.length / capacity));
  const rowsPerPage = Math.max(1, Math.ceil(rows.length / pageCount));
  const pages: T[][] = [];
  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  return pages.length ? pages : [[]];
}

/** Read the band code from a displayed subject value such as "92 · EE1". */
export function subjectLevelBandCode(value: string): string {
  const separator = value.lastIndexOf("·");
  return (separator < 0 ? value : value.slice(separator + 1)).trim();
}
