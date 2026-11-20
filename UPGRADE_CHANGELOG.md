# Mukuyu School Portal — Upgrade changelog

This update uses the combined school portal source as the base and applies the additional changes needed for cohort history, report CAT layout, staff initials, deputy delegation, marks import, and analytics. No live credentials are included.

## Implemented in this source update

1. **Historical mark placement** — marks now store year, term, grade and stream snapshots. Learner promotion changes current placement without rewriting old marks. Existing marks are backfilled using learner move history and mark timestamps where available. Records without sufficient history use the best available current placement, so the school should review legacy history before relying on it for formal reporting.
2. **Entry cohort year** — each learner retains an entry/cohort year independent of current grade. New learners/imports use the current school academic year.
3. **Admission numbers** — existing blank numbers are backfilled, new learners/imports receive generated numbers, and manual changes check for duplicates. A case-insensitive unique index protects against duplicate admission numbers.
4. **Excel/CSV marks import** — supports admission number, learner name and subject columns; validates score range, admission/name matches, subject names, duplicate learner-subject rows and teacher assignment scope.
5. **Term-specific CAT configuration** — administrators can choose which CATs were conducted in each year/term. The configured CATs feed historical report generation and missing-mark checks.
6. **Configurable report CAT count** — super admin and deputies can set how many CAT/exam columns are shown on report cards (up to 10, constrained by the exams configured).
7. **Teacher initials** — staff initials can be recorded and optionally printed after remarks when report settings enable it. Initials are resolved from class-teacher assignments.
8. **Deputy super admins** — a maximum of three deputies is enforced by API validation and a database trigger.
9. **Delegated responsibilities** — super admin can assign settings, staff, import, and academic-calendar responsibilities to each deputy.
10. **Role-change approvals** — regular admins can request teacher/admin role changes. A super admin and a deputy must each approve; the role changes only after both approvals.
11. **Bulk learner placement** — super admin/deputies can select multiple learners and move them to a grade/stream; movement history is recorded and marks remain attached to the learner and historical placement.
12. **Admission/stream maintenance** — admins can edit admission numbers and use bulk placement to change grade/stream. Duplicate names are flagged for review without merging records automatically.
13. **Public welcome page CMS** — super admin can edit title, subtitle, announcement and contact details; the login page reads this content as plain text.
14. **Notifications** — super admin/deputies can send role-targeted portal notifications and optionally email up to 100 active recipients through Resend. Email still requires a verified sender domain.
15. **Advanced analytics panel** — includes mark coverage, at-risk learners, high achievers, no-mark learners, strongest/priority subjects, score spread, stream performance gap, CAT improvement, gender mean comparison, class average, top learner, score distribution and term trend snapshot.
16. **Backup export completeness** — manual JSON backup now includes CAT-by-term configuration, cohort year, historical grade/stream mark snapshots, teacher initials and deputy delegation fields.
17. **Backup recovery** — daily Vercel cron snapshots, pre-restore safety snapshots, and a super-admin merge-restore workflow are included; snapshots are retained in the database.

## Important remaining limitations

- A production build and full TypeScript type-check could not be completed in this environment because npm registry requests failed with DNS/network errors. TypeScript/TSX syntax parsing succeeded, but that is not a substitute for a full build.
- Daily scheduled snapshots are stored in the same database, so they do not protect against loss of the database itself. Download separate copies to your phone/secure storage and enable Neon provider backups/PITR. The restore function is a merge restore, not a destructive exact rollback, and must be tested on staging before production use.
- Password hashes and full auth-provider records are excluded from JSON backup by design. A restored records backup alone cannot recreate user passwords.
- Legacy mark placement reconstruction is best-effort based on move-history timestamps. Verify historic Grade 7/8/9 reports before official use.
- Resend production email delivery still requires a sender domain verified in Resend. Keep API keys in Vercel Environment Variables only.

## Verification performed

- Parsed all 70 `.ts` / `.tsx` files with the TypeScript transpiler: no syntax diagnostics.
- Ran the existing `scripts/**/*.test.mjs` suite: 188 passed, 9 failed. Failures are in the pre-existing Grok PWA metadata/app-name expectations and a migration-plan invariant that assumes no root SQL migrations; they were not a successful full-app test.
- `npm ci` could not complete because registry requests failed with `EAI_AGAIN`; no production build was verified.
