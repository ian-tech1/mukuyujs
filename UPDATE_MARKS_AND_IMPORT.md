# Mukuyu portal update notes

## Spreadsheet marks and learner imports

- Multi-subject Excel/CSV pastes display in a scrollable spreadsheet-style preview before saving.
- Subject headers match portal subject names and short names case-insensitively, including normalized punctuation/accents and common score/marks labels.
- Scores entered as obtained/maximum (for example `30/40`) are converted to percentages; identifier and summary columns such as Total, Average, Position, Remarks and Teacher are not mistaken for subjects.
- Preview counts learner rows and numeric subject cells, with a 100-row display limit while the full parsed file is processed.
- Learner roster import includes a spreadsheet-like entry surface and preview, with missing-name and duplicate-name indicators.

## Welcome, login and visual treatment

- Existing welcome/login displays use multicolor animated backgrounds, ribbons, gradient motion, ambient light effects, and admin-configurable display controls.
- Additional slow hue transitions, ambient lighting, login-card/focus effects and accessible reduced-motion handling are included.
- QR family-message cards and inboxes use separate responsive layouts, clear status, and subtle gradient treatments.
- Motion is intended to remain restrained and respects reduced-motion preferences.

## Parent/student QR portal feedback

- The scanned-report portal retains the individual learner's result view and now includes an optional parent/guardian message form.
- Learner name, grade and stream are supplied from the report link; parents enter their own name, optional reply email and message.
- Where permitted by super-admin settings, families can direct a message to a teacher assigned to that learner's class.
- Super admins choose one of four message scopes: selected teacher, class teacher, admin, or super admin only. The server checks recipient scope and actual assignment stream IDs before returning or replying to messages.
- Staff can see messages in School Services and send a reply. Email replies/autoreceipts are sent only when Resend is configured and the parent supplied an email.
- Public submissions validate lengths and addresses, include a honeypot, and limit submissions to eight per learner in an hour. This is a modest abuse guard, not a substitute for an edge/WAF rate limit.

## Scheduled backup delivery

- The authenticated daily cron continues to store an internal snapshot and retain the 30 latest scheduled snapshots.
- Super admins can enable email delivery, select a recipient address and choose daily, weekly (Monday UTC) or monthly (first day UTC) delivery.
- The email contains a JSON school backup attachment. The export excludes password hashes but includes sensitive learner, guardian, attendance and school data. Keep it in a protected mailbox and store it securely.
- Deployment must set server-only `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` and `DATABASE_URL`. `EMAIL_FROM` must be a sender accepted by the configured Resend account. The Vercel cron runs daily at 02:00 UTC; weekly/monthly delivery is selected by the server on the matching UTC date.
- If provider credentials are missing or delivery fails, the cron response reports that the internal snapshot was saved and includes a delivery status. Configure database-provider backups/PITR as an independent recovery layer.

## Super-admin data safeguards

- Selected learner archival now creates a whole-school safety snapshot first, retains marks/admission information, and supports restoration from the archived list.
- The permanent class deletion path remains available only to the super admin and requires exact typed confirmation after the snapshot is saved.
- Super admins can clear marks for the selected grade/stream, academic year, term and assessment, or all assessments in that selected period. This creates a whole-school snapshot before clearing and requires a second confirmation plus exact typed scope.
- Super-admin controls for staff delegation, report viewing/editing, downloads and locking/unlocking remain in their existing settings/staff controls.

## Verification and deployment notes

Run `npm run typecheck`, focused tests, `npm run build` and the database migration in a staging environment before deployment. Build-time migration uses `DATABASE_URL` when present; back up the production database before deploying migrations. The ZIP contains source and migration files, not private credentials or `node_modules`.
