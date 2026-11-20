# Timetable assignment detection and balanced generation update

This update is limited to timetable workflows. Existing learner marks, reports, music, settings, timetable permissions, locked lessons, snapshots, publishing, exports, and delivery behavior remain preserved.

## Requested behavior

- Timetable validation continues to run automatically after timetable data changes and now rechecks when teacher-subject assignments change.
- Staff can scan active subject-teacher assignments by grade, stream, subject, and teacher, see whether each has a weekly lesson card, and add only the missing cards.
- New assignment-derived cards use an adjustable weekly target from 1–15 periods. Their distribution pattern spreads lesson periods across the five weekdays as evenly as possible (for example, 5 → `1+1+1+1+1`, 6 → `2+1+1+1+1`).
- Generation can optionally detect assignments and add missing cards before building the draft. This remains opt-in; existing lesson cards are not overwritten. The standard recovery snapshot is retained when a saved draft is generated.
- The Balanced profile now penalizes concentrated daily class and teacher loads and same-day repeat subjects, while preserving hard constraints. Subject lessons are spread across the week when feasible.
- A non-destructive preview runs the same generator, lists proposed class/subject/teacher placements and unplaced blocks, and does not save or replace timetable rows.

## Ten additional timetable updates

1. Read-only coverage scan of active teacher-subject assignments by grade, stream, subject, and teacher.
2. Automatic audit warnings for assigned subjects without weekly cards and cards whose teacher does not match a subject-teacher assignment.
3. Adjustable default weekly lesson count for new assignment-derived cards, capped at 15.
4. Automatic five-day balanced distribution pattern creation for assignment-derived cards.
5. Optional assignment detection and missing-card creation in the same generation action; existing cards are left unchanged.
6. Balanced scoring to reduce uneven daily period loads within each class/stream.
7. Balanced scoring to smooth each teacher’s daily workload.
8. Same-subject/day penalties and existing distribution rules to avoid clustering a subject’s lessons.
9. Preflight diagnostics for class weekly period demand exceeding bell capacity and teacher assignment demand exceeding weekly contract limits.
10. Non-destructive generated-timetable preview, including proposed placements and unplaced-card reasons.

## Verification

- TypeScript checking passes.
- Focused timetable-engine tests pass, including weekly subject spread, assignment diagnostics, and class/teacher capacity preflight.
- Existing application files in the input archive were retained when packaging; only timetable code and this timetable-specific note were changed or added.
