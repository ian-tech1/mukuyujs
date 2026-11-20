# Mukuyu School Portal — release notes

The latest feature list is maintained in `UPGRADE_CHANGELOG.md`.

Key additions in this source revision:
- marks include a grade/stream snapshot as well as year and term, so promotions do not relabel saved historical marks;
- learners have admission numbers and an entry cohort year;
- Excel/CSV mark imports, missing-mark checks and duplicate-name warnings;
- term-specific CAT selection, report CAT count settings and optional teacher initials;
- bulk learner placement and archive operations that retain historical marks;
- up to three deputy super admins with delegated responsibilities;
- teacher/admin role changes require separate super-admin and deputy approvals;
- editable public welcome page and in-system notifications, optionally emailed through Resend;
- expanded analytics panel.

The ZIP excludes real credentials and private learner spreadsheets/report PDFs. Daily Vercel cron snapshots, in-database pre-restore safety snapshots, and a super-admin merge-restore workflow are included. These snapshots remain in the same database, so enable Neon backups/PITR and download copies to separate storage. The full production build is not verified because dependency downloads failed with DNS/network errors.
