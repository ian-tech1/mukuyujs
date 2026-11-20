# Mukuyu School Portal — Updated source package

This is an updated source project for Vercel deployment, not a pre-built deployment artifact. Before deploying over the live portal, back up the Neon database and test the upgrade against a separate staging database.

## Major changes in this update

- Historical marks retain academic year, term, grade and stream snapshots; entry cohort year is separate from current grade.
- Excel/CSV marks import with admission-number and subject validation.
- Admission-number generation and duplicate checks; duplicate learner names are flagged for human review.
- Bulk learner movement between grades/streams with movement history.
- Term-specific CAT configuration and report-card CAT count setting.
- Optional teacher initials after remarks.
- Maximum of three deputy super admins and responsibility delegation.
- Teacher/admin role changes require one super-admin and one deputy approval.
- Editable public welcome page and in-system notifications.
- Advanced analytics for score coverage, at-risk learners, subject strengths, score distribution, stream/gender comparisons and term trends.
- Manual JSON backup export, in-database pre-restore snapshots, merge restore, and daily Vercel cron snapshots (latest 30 retained) are included. Configure `CRON_SECRET` in Vercel for the scheduled route.

## Deployment requirements

1. Use Node.js compatible with the `engines`/Vercel project settings and install from `package-lock.json`.
2. Add the required environment variables in Vercel; never add actual secrets to this ZIP.
3. Set `VITE_AUTH_ENABLED=true` in Vercel so the deployed build does not inherit the local `.grok/app-env.json` development flag.
4. Use the production website URL as `BETTER_AUTH_URL`. The configured public domain in this package template is `https://mukuyujs.lovie.me`; verify it opens the deployed portal before relying on it.
5. Apply migrations only after a fresh database backup and preferably after a staging test. Migrations `0008`–`0011` add report/deputy settings, historical mark placement, entry cohort year, restore snapshots and term colours.
6. Deploy a staging copy first and test login, marks entry/import, CAT configuration, report downloads, role approvals and historical Grade 7/8/9 results.

## Build status

The source passed a syntax parse for all 70 TypeScript/TSX files. A full `npm ci`, TypeScript type-check and Vite production build could not be completed here because npm registry downloads failed with DNS/network errors. Do not treat this as a verified production build until `npm ci` and `npm run build` pass in your environment.

## Data protection warning

Manual JSON export, daily Vercel cron snapshots, and a super-admin merge-restore workflow are included. Scheduled snapshots are stored in the same database, so they do not protect against loss of that database. Download separate copies, enable Neon backups/PITR, and test restore on staging. Large restore uploads may hit serverless request-size limits; use a database-level restore for large datasets.
