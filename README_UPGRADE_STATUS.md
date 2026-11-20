# Mukuyu School Portal — current upgrade status

See `UPGRADE_CHANGELOG.md` for the implementation summary and limitations. The project now includes the CAT/report layout, historical grade/stream snapshots for marks, cohort year, admission number protection, bulk placement, teacher initials, role-change approvals, welcome-page editing, notifications and expanded analytics.

This is an updated **source** package, not a prebuilt deployment artifact. A full production build could not be verified in this environment because npm registry requests failed with DNS/network errors. Before deploying to production, run `npm ci`, `npm run typecheck`, and `npm run build` in an environment with network access, and test against a staging database first.

Daily scheduled snapshots and a super-admin merge-restore workflow are included, but scheduled snapshots are stored in the same database and therefore are not off-site protection. Download manual backups separately and enable Neon provider backups/PITR. The full production build remains unverified; test on staging first.
