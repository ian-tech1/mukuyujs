# Mukuyu School Portal — Upgrade Requirements and Acceptance Tests

## Important status
This document records the full requested scope for implementation and verification. It does not mean every item below is already implemented. Do not deploy this source as a feature-complete upgrade until each acceptance test passes in a staging deployment and a backup/restore test succeeds.

## 1. Marks import from Excel
- Add an admin/authorized-teacher screen to upload `.xlsx` and `.csv` marks files.
- Provide downloadable templates with columns: Admission Number, Learner Name (display/check only), Grade, Stream, Subject, Exam/CAT, Academic Year, Term, Maximum Score, Score.
- Support importing all subjects in a single workbook (subject column) and a single selected subject.
- Preview and validate before saving; show row-level errors for unknown admission numbers, mismatched class/stream, duplicate rows, missing marks, invalid scores, and unrecognized subject/exam/year/term.
- Do not silently create learners from a marks import. Use admission number as the matching key; require a separate learner import/create workflow.
- Save rows transactionally. Provide a clear summary of accepted/rejected rows and a downloadable error report.

Acceptance: a workbook with multiple subjects imports to the correct subject, class, year, term and exam; invalid rows are rejected without partial or duplicate writes.

## 2. Immutable academic history and promotion
- Every mark must be keyed by learner ID + subject ID + exam/CAT ID + academic year ID + term ID.
- Promotion changes the learner's current grade/stream and creates a promotion-history record; it must never update or delete historic marks.
- Academic cohorts are distinct by entry year and grade. Grade 7 learners who joined in 2024 remain distinguishable from Grade 7 learners who joined in 2027.
- Year/grade/stream/term filters must retrieve historical records, including a learner's Grade 7, Grade 8 and Grade 9 results after promotion or graduation.

Acceptance: create a Grade 7 cohort in 2026, save all three terms, promote to Grade 8 in 2027 and Grade 9 in 2028, then retrieve every prior term without changed values. Create a new Grade 7 cohort in 2027 and verify cohorts do not overlap.

## 3. Admission numbers and duplicate detection
- Add a required, unique, normalized admission number to each learner.
- Enforce uniqueness in the database, not only in the UI.
- Before creating/importing a learner, check exact admission-number duplicates and likely name duplicates (case/spacing normalized); show a warning and require an authorized decision.
- Do not automatically merge duplicate learners or their marks.
- Provide an admin duplicate review list with both records and their linked marks/history.

Acceptance: duplicate admission numbers are blocked server-side, duplicate-name candidates are flagged, and existing history remains unchanged.

## 4. Missing marks and teacher submission tracking
- Add an assessment/subject submission matrix for each academic year, term, grade and stream.
- Admins must explicitly approve/activate the assessments and subjects expected for that period.
- Dashboard lists learners missing marks and subjects/teachers whose marks are not submitted.
- Distinguish not entered, partially entered, submitted, approved and returned-for-correction states.
- Track who submitted/approved and timestamps.

Acceptance: expected subjects and assessments show missing learners and unsubmitted teacher assignments accurately; a not-yet-approved assessment is not incorrectly treated as required.

## 5. Public welcome page content
- Super admin can edit welcome-page title, text, announcements, contact details, image/logo and visibility/order of sections.
- Sanitize rich text and validate uploaded assets; do not allow executable HTML/script injection.
- Preview before publishing and keep an audit log of changes.

Acceptance: publishing a change updates the unauthenticated welcome page without exposing admin controls or private data.

## 6. Staff roles and approvals
- Permit up to three deputy super admins, with database-enforced limits and an audit trail.
- Admin role changes (teacher to admin or admin to teacher) are requests, not immediate changes.
- Require approvals from both the super admin and an authorized deputy super admin as specified by the school; block self-approval and duplicate approval by the same account.
- Define emergency recovery procedure to avoid locking out all privileged users.

Acceptance: unapproved role changes do not take effect; two distinct authorized approvals are required; a fourth deputy cannot be added.

## 7. Backups and restoration
- Add scheduled database backups to storage independent of Vercel's deployment filesystem. Never rely on the ephemeral app filesystem as the only backup.
- Retain timestamped backups and record success/failure; alert designated admins on failure.
- Keep manual export for phone downloads and offer restore/import from an authenticated admin-only workflow.
- Use versioned backup format, checksum, schema version, preview/dry-run, validation and explicit confirmation before restore.
- Never restore directly over production without a pre-restore backup. Prefer restoring into a new database first.
- A browser cannot silently write arbitrary files to phone storage in the background. Manual phone downloads are user initiated; automatic backups must be server-side/off-site.
- Include records for learners, staff metadata, marks, years, terms, subjects, streams, assignments, settings and audit logs. Auth secrets/password hashes must be handled separately and securely; do not export plaintext passwords or API keys.

Acceptance: create a backup, restore it into a separate test database, compare row counts and sample marks/history, then document rollback. Simulate deployment failure and verify the database remains independent of the deployment.

## 8. Teacher names and initials on reports
- Store teacher display name and initials as staff metadata.
- Add an administrator-controlled report setting to display the relevant teacher's name/initials after remarks.
- Validate which teacher/assignment is associated with each report; avoid showing an unrelated staff member.

Acceptance: when enabled, the correct teacher's approved name/initials appear after remarks; when disabled they are omitted.

## 9. Admin bulk actions, theme and messaging
- Add reviewed bulk learner deletion by explicit selected IDs, with count, confirmation, audit log and soft-delete/recovery window where feasible.
- Never allow bulk deletion by an unvalidated name-only match.
- Add configurable term/theme colors with accessible contrast and safe defaults.
- Add internal notifications to selected teachers/admins and optional email delivery using configured sender.
- Store delivery status and avoid exposing recipients to unauthorized users.

Acceptance: bulk action affects only selected records; theme persists; internal messages appear to recipients; email failure is visible and does not silently lose the internal notification.

## 10. Password reset and first-time account setup
- Password reset email includes the configured portal URL and a single-use, expiring reset link.
- New-account setup sends a single-use, expiring invitation/set-password link. Do not email permanent plaintext passwords.
- Recipient must be the actual account email, never a hardcoded administrator email.
- Production sending requires a verified sender domain with the email provider. Keep provider API keys only in host environment variables.

Acceptance: reset and invitation emails reach the target account, include the correct website URL, expire after use/time limit, and do not reveal secrets in logs.

## 11. Fine-grained permissions
- Super admin can configure whether teachers may view marks for other subjects/classes, edit assigned subjects, view reports, export data, and access settings.
- Enforce permissions on server/API endpoints as well as UI controls.
- Default to least privilege. Record sensitive permission changes in audit logs.

Acceptance: direct API requests from an unauthorized teacher are rejected even if UI controls are bypassed.

## 12. CAT/assessment configuration, learner and stream management
- Admins can configure number/name/weight/max score of CATs and exams per subject, class, year and term.
- Add learners with admission number, grade, stream and entry/cohort year.
- Allow authorized admins to change grade and stream while recording a dated movement history and preserving all marks.

Acceptance: changing a learner's current stream/grade does not alter historic marks or past cohort identity; assessment totals and maximum scores validate correctly.

## 13. Results and report cards by period
- Admins can select academic year, grade, stream and term to download marks sheets and report cards.
- Learners/guardians can view only their own authorized reports for available historic years/terms.
- Exports must include the selected period clearly and never mix records from different years/terms.

Acceptance: old reports remain retrievable after promotion; a learner cannot access another learner's reports by changing an ID or URL.

## 14. Data-loss resilience
- Keep production database separate from application deployment lifecycle.
- Use independent automated backups, periodic restore drills, audit logs, migration backups and documented recovery steps.
- Migrations must be backward-compatible where practical and tested against a copy of production data.
- Do not treat Vercel redeployment as a database backup strategy.

## Implementation order (recommended)
1. Staging environment and verified backup/restore drill.
2. Admission number schema + uniqueness + duplicate review.
3. Cohort/promotion history and historical marks validation.
4. Excel marks template/import/preview/transactional save.
5. Missing-mark matrix and submission approval workflow.
6. Role approval workflow and deputy limit.
7. Permission enforcement, audit logs and bulk operations.
8. Account invitations/reset-email improvements.
9. Welcome-page editor, teacher initials, theme and notifications.
10. Historical exports, automated backups, monitoring and full regression tests.

## Release gate
Do not call the ZIP production-ready until install/build/typecheck/tests pass, database migrations pass on a staging copy, the restore drill passes, and every acceptance test above has evidence recorded. Preserve the current production database until the new release passes these gates.
