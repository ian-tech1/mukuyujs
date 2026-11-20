# Mukuyu timetable advanced studio

- [x] Preserve the existing ASC-style generator, timetable periods, breaks, rooms, availability, weekly requirements, teacher contracts, class rules, subject constraints, lesson relations, versions, publishing, filters, PDFs, and email delivery.
- [x] Add an advanced timetable studio with optimization profiles, week-cycle selection, approval state, teacher-load analysis, class-gap analysis, and progressive feature details.
- [x] Add additive migration support for 25 advanced scheduling features: drag movement foundations, live conflicts, undo/redo, optimization profiles, lesson priorities, multi-week cycles, Week A/B, blackout dates, absences, substitutions, resource requirements, co-teaching, split/combined classes, electives, events, exams, invigilation, approvals, change history, import/export jobs, subscriptions, secure share tokens, calendar links, duty rota, sync snapshots, and feature flags.
- [x] Add pure utility functions for load analysis, gap detection, timetable version comparison, cycle week calculation, optimization weights, and ICS events.
- [ ] Apply migration 0023 to staging/production and connect the advanced persistence actions to the existing server API.
- [ ] Run the project’s full dependency-backed typecheck, lint, and test suite in a network-enabled build environment.

## Music provider update

- [x] Add searchable YouTube, SoundCloud, and Jamendo catalog options alongside existing provider embeds and Radio Browser live radio; preserve license/creator attribution for Jamendo tracks.
- [x] Make the portal Play control start direct audio and live radio from the tap, while leaving protected cross-origin embeds under their provider player controls.

## User-requested timetable and staff follow-up

- [x] Add a draft-only clear action that removes scheduled lessons in the selected year/term while keeping weekday and bell-time definitions unchanged; save a recovery version first.
- [x] Add a persisted Super Admin allow/disable switch for importing Staff subject allocations into weekly timetable lesson cards, enforced by manual seeding, regular generation, and automatic repair.
- [x] Allow Super Admin to permanently remove teacher and admin accounts; transactionally clean restrictive timetable links, snapshot affected scopes, and return published schedules to draft.
- [x] Default teachers to their own published timetable, allow assigned-class timetable view, and support PDF/CSV/JSON downloads of the current filtered view.
- [x] Pass TypeScript typecheck, focused timetable tests (24), and a development-mode asset build without running database migrations.
- [ ] Full repository test/lint suite still has unrelated template/PWA app-environment and existing app-data lint failures.

## User-requested welcome display and Kenya music follow-up

- [x] Add exactly 14 persisted Super Admin welcome-page display/colour controls with a live preview, server-side validation, shared rendering, and local colour-theme override on the hero.
- [x] Remove the prior inert quick-display checkboxes and direct Super Admins to the functional welcome designer.
- [x] Reject ordinary webpage links as direct audio, preserve catalog source credits, clear stale playback indicators, and allow users to skip failed tracks.
- [x] Add four chart-checked Kenya YouTube music picks and Apple's daily Top 100 playlist to Music Studio using official in-page embeds; keep dated source notes in `MUSIC_KENYA_CHART_SOURCES.md`.
- [x] Pass the TypeScript check and 15 focused welcome-display/music tests; changed-file lint reports no errors.
- [x] Re-run the development asset build and verify the clean, extractable project archive with dependencies and generated output excluded.

## User-requested admission appearance, welcome tour and app shortcut follow-up

- [x] Let the Super Admin set how a new learner admission number appears: a validated prefix, optional year, and 4–8 digit number; show a live sample; enforce unique values; do not change any existing learner number.
- [x] Add a public welcome-page button that opens a dismissible portal-features walkthrough without requiring sign-in; do not represent it as a real-data demo or bypass authentication.
- [x] Brand the installed web-app shortcut with the configured school name rather than a generic platform title, and provide a school-initials icon with a tasteful multicolor design.
- [x] Add tasteful multicolor section/panel transitions and subtle 3D hover depth in ordinary portal screens, without animating printed reports; respect operating-system reduced motion and the portal’s motion-off setting.
- [x] Verify and explain the scheduled-backup path: daily internal snapshots; email on the configured daily, Monday-UTC weekly, or first-of-month-UTC cadence; `/api/cron-backup` invoked daily at 02:00 UTC; email delivery requires correctly configured production secrets and a verified sender. No real email was sent or delivery tested in this sandbox.
- [x] Pass TypeScript, focused admission/PWA tests, migration checks, a development-mode production asset build, and ZIP integrity checks without using a production database. The broad `npm test` suite remains red on existing PWA/site-title and app-environment assertions; individual new PWA tests pass.

## Super Admin role access, viewing and download powers

- [x] Add an explicit Super Admin control for each role group to allow or lock viewing and downloads of report cards, analysis, mark lists and linked family results; keep Super Admin access unconditional and students/parents restricted to their own linked records. Include the public QR-report audience and ensure QR access can be locked independently.
- [x] Enforce role access in navigation and section rendering; hide PDF, CSV, Excel, print and report-link actions when that group is locked, and reject public QR report reads server-side when disabled. Linked parent/student report API access is also blocked when family results are locked.
- [x] Preserve existing edit/mark-entry locks, admin/deputy delegation, backup, QR feedback, safe bulk result clearing and learner archive/removal safeguards.
- [x] Validate policy defaults and unconditional Super Admin access with 3 focused tests; TypeScript typecheck and development-mode asset build passed without database migrations or production access. ZIP integrity and required files verified. The auth-invariant script could not run to completion because it could not read a dev server's resolved `VITE_AUTH_ENABLED`; no production database was contacted.

## User-requested visual-only refresh

- [x] Deliver at least 42 distinct display improvements across welcome/login, portal shell/navigation, cards, controls, tables, status feedback, mobile layouts and motion/accessibility; keep all changes presentational and preserve responsive behavior, print readability, reduced-motion support and existing motion switches. Implemented 52 numbered refinements in `src/school-display.css` and imported them from `src/styles.css`; typecheck and development build pass.


## User-requested report branding and marks governance

- [x] Make the QR-opened report PDF use the same configured school logo, with the same default-logo fallback, as teacher-printed/downloaded reports.
- [x] Extend Super Admin mark controls so entry/view/edit permissions can be configured for admins, subject teachers, and class teachers; class-teacher all-subject access is explicit, locked-edit exceptions are role-specific, and local-time entry/edit deadlines lock automatically; no-control defaults remain open.
- [x] Enforce role/action/deadline rules on the server for manual and spreadsheet writes, preserve Super Admin/deputy override, and explain deadline/lock state and contact instructions in the marks UI.
- [x] Preserve attribution and timestamp fields on each mark; record entered, edited, manually cleared, spreadsheet, and bulk-clear events with actor, source, learner, subject and old/new score; show last-save attribution and privileged recent history.
- [ ] Add dedicated regression tests for QR logo fallback and marks role/deadline policy; typecheck and changed-file lint passed, migration 0036 applied twice successfully in isolated PGLite, report-link/spreadsheet tests passed (marklist test could not resolve the repository `@/` alias under direct Node), and development asset build is blocked by a missing platform-specific Rolldown native binding. Refresh and verify the requested ZIP after final changes.
