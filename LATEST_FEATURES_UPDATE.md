# Latest Timetable Features Update

Additive only. All previous files and data preserved.

## New in this update
- Editable subject constraints UI in Timetable Operations (max per day, no afternoon, prefer morning, spread days).
- New API endpoint `saveSubjectConstraint`.
- Generator now respects subject "no afternoon" constraints (blocks later periods for subjects like Maths).
- Subject constraints table and locked-lesson column from migration 0021 remain.
- Improved distribution scoring from previous step.
- School Services error handling retained.
- Super-admin allow/deny admin timetable edits retained.
- Break periods with vertical PDF labels retained.
- All core ASC-inspired workflows: availability (including subjects), requirements, rooms, blocks, validation, publish, versions, PDF, email.

Deploy this zip. Migration 0021 applies on next deploy if not already run.


## Merit list and analysis improvements (additive)

1. Added learner search by name, admission number or roll number.
2. Added a grade-level filter for the merit table.
3. Added table sorting by performance, learner name or roll number.
4. Added an option to show or hide admission numbers on screen.
5. Added a one-click reset for analysis filters.
6. Corrected merit positions so learners with equal marks share the same rank.
7. Added a stream performance summary to the analysis page.
8. Added stream mean to the merit-list PDF even when optional analytics are switched off.
9. Added the learner count for each stream summary.
10. Added each stream's top-performing learner to the summary.
11. Added stream means, counts and top learner to the CSV export.
12. Added top-five / support-five learner views and subject mark-coverage indicators.

All additions are calculated from the selected academic year, term, grade and assessment mode. Existing learner records, marks, settings and school identity are retained.
