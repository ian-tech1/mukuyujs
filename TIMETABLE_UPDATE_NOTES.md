# Mukuyu timetable update

This is an additive update to the existing Mukuyu portal. Existing portal sections and records are retained.

## Added/updated
- Subject-specific unavailable slots, so a subject such as Mathematics can be blocked from selected afternoon periods.
- Subject time-off is checked when manually saving lessons, during schedule validation, and by the automatic draft generator.
- Bell periods can be edited after creation, including start/end time, label, and break/non-teaching status. Use labels such as `First break`, `Second break`, or `Lunch break` to match the supplied Mukuyu timetable sample.
- Super-admin-only switch to allow or deny timetable editing by ordinary admin accounts. When allowed, ordinary admins can manage draft timetable configuration; server-side actions check the permission as well as the UI.
- Existing timetable facilities remain available: class/stream/teacher/room filters, weekly lesson contracts, single/double/triple blocks, teacher/class/room collision checks, draft generation, validation, publication, version snapshots/restore, PDF export, and teacher timetable email.
- New database migration: `migrations/0020_timetable_admin_permissions_subject_offtime.sql`.

## Deployment notes
- Deploy to Vercel with the existing production database environment variables unchanged. The migration runner applies migration `0020` during deployment when `DATABASE_URL` is configured; PGlite applies migrations at startup in the fallback environment.
- Back up the production database before deploying any schema change.
- The uploaded aSc Timetables reference is a Windows executable, not editable source code. This portal implements comparable timetable workflows, not a claim of exact parity with every proprietary aSc feature.
- Build/typecheck could not be completed in this execution environment because installing the project's npm dependencies timed out. Test this ZIP in a staging deployment before production.

## Additional quality-control features added in this update
- Daily teacher workload warning when a teacher is assigned more than six lesson periods in a day (review threshold, not a hard rule).
- Daily class/stream workload warning when a class is assigned more than eight lesson periods in a day.
- Repeated-subject warning when the same class/stream has a subject in multiple separate lesson blocks on the same day; encourages spreading learning across the week.
- Consecutive-teaching warning when a teacher has four or more consecutive periods; encourages free periods where practical.
- Validation results now explain these schedule-quality warnings before publication. They remain warnings rather than errors because school policies and timetable exceptions vary.

These additions extend timetable validation without adding new database tables, preserving the existing Vercel database and migration model.
