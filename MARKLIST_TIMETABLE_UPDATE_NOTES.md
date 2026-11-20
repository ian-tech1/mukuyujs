# Mark-list and timetable update

This update is additive and limited to mark-list exports and timetable workflows. Existing schedule records, permissions, publishing, and recovery snapshots are retained.

## Mark lists

- Stream rosters retain selected-year placements and add active learners currently assigned to that grade and stream, without duplicates.
- PDF mark lists now paginate instead of silently omitting rows after the first page. The heading is repeated on each page, and portrait/landscape orientation is selectable.
- The Excel download is a real `.xlsx` workbook (not a renamed CSV), with stream/period metadata, a frozen header row, printable orientation, and spreadsheet-safe text cells.
- Extra blank rows follow the learner roster and continue across PDF pages.

## Ten timetable enhancements

1. Debounced automatic timetable checks rerun after bell, lesson, requirement, availability, rule, room, or active-cohort changes.
2. Bell-time validation flags invalid 24-hour times and periods whose end is not after their start.
3. Bell-order validation flags duplicate period sequence numbers and overlapping clock intervals.
4. Placement validation flags weekday values outside Monday–Friday and references to periods missing from the selected bell.
5. Block integrity checks flag incomplete, mismatched, or non-contiguous linked periods.
6. Weekly requirement integrity checks flag duplicate class/stream/subject/teacher cards and invalid lesson/block counts.
7. Distribution validation flags malformed or mismatched weekly patterns.
8. Room-register checks flag unregistered rooms and inactive rooms that remain scheduled.
9. Room-capacity checks warn when a registered room is smaller than the active learner cohort.
10. Three selectable generator profiles—Balanced, Morning priority, and Compact day—now change the solver’s scoring rather than only changing a label.

Generated schedules also show the total placed/pinned/unplaced blocks and a coverage percentage, list every unplaced requirement, and support CSV export of audit findings. The timetable view can export its current filtered rows to CSV.

## Verification

- `npm run typecheck` passes.
- Focused mark-list, workbook, and timetable-engine tests pass.
- `npm run build:dev` completes successfully.
- The repository-wide `npm test` command includes existing environment/template tests that fail in this archive because expected `.grok`/app-template assets and environment fixtures are absent. These are unrelated to the changed mark-list and timetable tests.
