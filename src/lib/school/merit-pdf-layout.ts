export const SUBJECT_LEVEL_ROW_HEIGHT_MM = 5.6;

export type MeritPdfLetterheadLineCounts = {
  school: number;
  address: number;
  vision: number;
  mission: number;
  motto: number;
  title: number;
  period: number;
};

/** Calculate non-overlapping baselines and reserve only the height needed by wrapped letterhead text. */
export function meritPdfLetterheadLayout(lines: MeritPdfLetterheadLineCounts) {
  const blocks = [
    { key: "school", lineHeight: 4.7, gap: 0.2 },
    { key: "address", lineHeight: 2.8, gap: 0.2 },
    { key: "vision", lineHeight: 2.3, gap: 0.3 },
    { key: "mission", lineHeight: 2.3, gap: 0.3 },
    { key: "motto", lineHeight: 3, gap: 0.2 },
    { key: "title", lineHeight: 3.4, gap: 0.2 },
    { key: "period", lineHeight: 2.7, gap: 0.4 },
  ] as const;
  const baselines: Record<keyof MeritPdfLetterheadLineCounts, number> = {} as Record<keyof MeritPdfLetterheadLineCounts, number>;
  let cursor = 9;

  for (const block of blocks) {
    const count = Math.max(1, Math.floor(lines[block.key]));
    baselines[block.key] = cursor;
    cursor += count * block.lineHeight + block.gap;
  }

  const headerBottom = Math.max(35, cursor + 1);
  return { ...baselines, headerBottom, tableTop: Math.max(43, headerBottom + 4) };
}

/** Pack wrapped analytics text onto the current page first, then use full continuation pages. */
export function paginateMeritTextLines<T>(lines: readonly T[], firstPageCapacity: number, continuationPageCapacity: number): T[][] {
  const pages: T[][] = [];
  let offset = 0;
  const firstCapacity = Math.max(0, Math.floor(firstPageCapacity));
  const continuationCapacity = Math.max(1, Math.floor(continuationPageCapacity));

  if (firstCapacity > 0 && lines.length) {
    const firstPage = lines.slice(0, firstCapacity);
    pages.push(firstPage);
    offset = firstPage.length;
  }

  while (offset < lines.length) {
    const page = lines.slice(offset, offset + continuationCapacity);
    pages.push(page);
    offset += page.length;
  }

  return pages.length ? pages : [[]];
}

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

/** Split variable-height analytics rows into page-sized groups without dropping or reordering items. */
export function paginateMeritAnalyticsItems<T>(
  items: readonly T[],
  maxPageHeight: number,
  itemHeight: (item: T) => number,
  continuationPageHeight = maxPageHeight,
): T[][] {
  let pageLimit = Math.max(1, maxPageHeight);
  const continuationLimit = Math.max(1, continuationPageHeight);
  const pages: T[][] = [];
  let page: T[] = [];
  let usedHeight = 0;

  for (const item of items) {
    const height = Math.max(1, itemHeight(item));
    if (page.length && usedHeight + height > pageLimit) {
      pages.push(page);
      page = [];
      usedHeight = 0;
      pageLimit = continuationLimit;
    }
    page.push(item);
    usedHeight += height;
  }

  if (page.length) pages.push(page);
  return pages;
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
  tableTop = 43,
): T[][] {
  const capacity = subjectLevelRowsPerPage(pageHeight, rowHeight, tableTop);
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
