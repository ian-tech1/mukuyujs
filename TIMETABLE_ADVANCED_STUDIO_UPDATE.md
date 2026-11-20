# Mukuyu timetable advanced studio update

This release upgrades only the timetable section. Existing timetable generation, hard conflict checks, rooms, availability, requirements, subject constraints, teacher contracts, class rules, lesson relations, locked lessons, publishing, version snapshots, PDF export, and email delivery remain intact.

The new visible studio provides optimization profile selection (`Balanced school day`, `Morning priority`, and `Compact lessons`), cycle-week selection, approval-state tracking, teacher-load indicators, class-gap indicators, and progressive disclosure for 25 ASC-style and beyond-ASC capabilities.

Migration `0023_timetable_advanced_studio.sql` adds additive persistence for multi-week cycles, Week A/B schedules, blackout dates, staff absences, substitutions, room/resource requirements, combined/split/co-taught lesson groups, elective bands, school events, exam sessions, invigilation, approvals, change history, import/export jobs, subscriptions, share tokens, optimization profiles/runs, undo history, conflict records, calendar links, duty rota, sync snapshots, and feature flags.

The pure utility module `src/lib/school/timetable-advanced.ts` adds optimization weights, teacher-load analysis, class-gap detection, version comparison, cycle-week calculation, and ICS event formatting.

Validation completed in the review copy:

- `npm run typecheck` passed.
- `npm run build` passed, including Vercel/Nitro output generation.
- Existing timetable engine tests passed: 5/5.
- Advanced utility smoke checks passed.
- Migration feature-marker validation passed.
- The existing project has unrelated baseline lint errors in older files; no new timetable type errors remain.

Before production use, apply migration `0023_timetable_advanced_studio.sql` through the project migration process. The visible studio is intentionally additive; server actions for persisting every advanced control can be connected in a follow-up without changing current timetable records.
