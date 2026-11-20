# Timetable update summary

This update is limited to the timetable editor, generator, validation, analytics, and their persistence paths.

## Included changes

**Lesson targets and blocks.** Weekly requirement cards compare covered teaching periods against the requested target separately from the number of stored blocks. Doubles count as two periods, and pinned lessons are subtracted from the remaining generation target. Lesson patterns are explicit: singles-only, one required double with an optional weekday, or a custom 1–3 period pattern. Invalid totals are rejected instead of silently falling back, and selected triple blocks are preserved.

**Balanced generation and teacher rules.** Period-column rotation is a preference rather than a hard rule, so a 5-period quota can be met even when only one usable column exists. Avoidable repetition is still penalized, as are adjacent same-subject lessons across parallel streams taught by one teacher. Teacher contracts can require free teaching periods between separate blocks; break/lunch rows do not count as free teaching periods. Generation, manual saves, validation, backups, and restores carry this rule.

**Availability and subject relations.** Different-day and non-adjacent subject rules are hard placement constraints. Stream-specific hard off-time applies to grade-wide lessons affecting that stream. The time-off map is staged and includes whole-day and all-weekday presets: `Off` is a hard restriction, while `Avoid` and `Prefer` guide placement. Saving conflicting off-time requires confirmation, snapshots the timetable, and transactionally removes affected lesson blocks, including linked multi-period lessons.

**Assignments and diagnostics.** Teacher/subject allocation coverage identifies grade, stream or all-stream scope, and teacher; missing weekly cards are reported. Diagnostics include next-step suggestions, generation can be previewed before saving, and timetable counts, double/triple indicators, advanced teacher loads, class gaps, and backup restore behavior use covered periods where appropriate.

## Migration

The application migration runner applies `migrations/0027_timetable_teacher_rest.sql`, which adds the timetable-only teacher recovery field. No other school feature was changed by this update.

## Validation

Focused timetable engine and analytics tests: **19 passed, 0 failed**. The development build completed successfully. The full `npm test` command encounters failures in unrelated workspace tests concerning Grok PWA metadata, migration-plan assumptions, and app-environment setup. `npm run typecheck` reports one error outside the timetable changes at `src/lib/school/api.ts:26`: `useSession` is not exported by the installed `@tanstack/react-start/server` type surface.
