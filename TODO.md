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

## User-requested parent sign-in and Super Admin access record

- [x] Replace the two-name parent form with one learner full-name field; tolerate common small spelling errors, case/spacing/diacritic differences and adjacent transpositions, but reject uncertain/ambiguous matches and automatically show a clear mismatch message.
- [x] Verify the parent's own entered email with one short-lived, single-use emailed login password; do not use learner email fields or send a reusable password. Capture parent-supplied name and optional phone, allow the same verified parent email to add another learner through a later sign-in, and explain that email ownership alone does not prove guardianship.
- [x] Record each successful verified parent login with parent name, verified email, supplied phone, linked learner and timestamp; expose total/distinct counts and recent records only in Super Admin Settings, protected by a server-side Super Admin check.
- [x] Add migration-safe schema changes and focused fuzzy matcher tests (5 passing); TypeScript passes; focused ESLint has 0 errors and 2 existing unrelated API warnings; the migration applies twice in isolated PGlite. Review the diff and push the verified changes to `origin/main` (commit `7a66fbfa`). End-to-end Resend email delivery and Vercel deployment status were not verifiable from this sandbox.


## User-requested parent name matching, contact entry and password reset

- [x] “as long as 60 percent of the letters match the learners name, the system should verify”: accept normalized learner-name similarity of at least 60%, prioritize a unique exact match, permit uniquely identifying first/surname tokens or exact first-and-surname tokens when a middle name is omitted, and reject equally close or duplicate candidates rather than linking the wrong learner.
- [x] “the phone number should only be entered, not not to verify”: collect and save the parent-entered contact number as supplied (required at parent sign-in), without SMS or phone-possession verification and without labeling it verified.
- [x] “parents can reset their own password after after email verification is done”: provide parent self-service password reset through a short-lived email code, permit reset only after successful code verification for an active parent account, and store only a strong password hash.
- [x] Add an idempotent migration for reset challenges; update parent sign-in/reset copy and audit labeling; add focused matcher tests plus isolated migration/rate-limit checks; inspect changes and prepare a verified ZIP after validation.
- [x] Parent lookup distinguishes missing/unavailable production database, empty active learner register, rate limiting, account conflict, and genuine name mismatch; parent feedback no longer labels all failures as a spelling error.
- Validation: 9 focused parent matcher tests pass; `pnpm typecheck` passes; changed-file ESLint has 0 errors and 2 pre-existing warnings; migration 0038 applied twice in isolated PGLite; seven concurrent per-email limiter upserts returned distinct atomic counts.
- Environment limitations: full `pnpm test` remains blocked by unrelated existing Grok/PWA and app-environment assertions; `build:dev` cannot load the sandbox's missing ARM64 Rolldown native binding; live Resend delivery was not tested.
- Source ZIP `mukuyujs-parent-access-updated.zip` passed `zip -T` and excludes environment files, dependencies, build output and Git metadata.

## User-requested spreadsheet, report-date and visual branding fixes

- [x] “update under enter marks by pasting or uploading excel file some subjects marks are not being recorded eg English, intergrate science, agriculture,pretech”: recognize official subject names, short names, and safe common heading aliases for pasted/uploaded spreadsheets; show every detected header and reject truly unknown or ambiguous subjects explicitly; confirm successful saved-mark counts. Added conservative matching for English, Integrated Science (including the common misspelling), Agriculture, and Pretech; clear unknown/ambiguous errors remain. Focused parser and header tests pass (8).
- [x] “under report cards fix the issue in that all the report cards for different terms have same opening dates and same closing dates”: read and render dates from the selected academic year+term only across staff reports, parent portal/QR reports, printed report sheets, and PDF downloads; never substitute current/global profile dates when the selected period has no configured date. All report paths now pass an explicit blank rather than falling back to global profile dates.
- [x] “place under settings place to set open dates and closing dates for each term by selecting specific year too”: in Settings, select a specific academic year and term, then save that period's own opening and closing dates and report fields. The selector/labels now state the year-term scope and blank-date behavior.
- [x] “use the rainbow like live moving colours when loading as used in this link https://kiwanjandege.vercel.app/ add more live moving colours in the website as background colours”: use smooth multicolour loading animation and restrained moving spectrum backgrounds; preserve readability and honor `prefers-reduced-motion` and print behavior. Added a branded spectrum progress state for portal and QR-report loading, alongside existing layered background motion; respects user/OS motion reduction and print rules.
- [x] “when install app shortcut for the website it should have its nice app photo display for icon, even when pasting the link, it should appear with that icon pic”: use square, school-branded install icons and keep a school-branded Open Graph image declared for URL previews. Generated 180/192/512 square icons from the existing school crest, used them in app head and manifest; existing `public/og.jpg` resolves as `https://mukuyujs.lovie.me/og.jpg` in share metadata.
- [x] TypeScript passes; focused subject/sheet tests pass (8) and school-manifest/PWA regression tests pass (2); changed-file ESLint has no errors (2 existing unused-state warnings in `reports-view.tsx`). `git diff --check` passes. Full `build:dev` remains blocked by the sandbox’s missing Rolldown `@rolldown/binding-linux-arm64-gnu` optional binary; the broader PWA test file has existing unrelated OG-title expectation failures. Commit `2edea33d` is local and the final ZIP is included below. Pushing to `origin/main` was rejected with HTTP 403 despite the GitHub account showing repository admin access; the repository has not yet been updated.

## Current follow-up: Excel-style mark grid and CAT/year bulk clear

- [x] “let the marks pasted place in website be like a real Excel and arrange marks and names in cells just like excel, make it easier for super admin to delete marks for specific cat for a year selected”: replaced the paste-only textarea/static preview with editable admission, learner-name, and per-subject cells; Excel/TSV/CSV clipboard ranges populate the grid; headings and cells are editable and rows can be added or removed; invalid scores are blocked before save. Super Admin now has independent explicit year, term, and CAT selectors for clearing; the exact scope is displayed and typed confirmation remains required. The API still enforces Super Admin, full safety snapshot before deletion, and mark audit history.
- [x] “science and creative indicates needs review does not match unique subject”: generic Science maps to Integrated Science only if uniquely configured; Creative / Creative Arts / Creative Arts & Sports and C/A resolve to Creative Arts only when unique. Unknown/ambiguous headings remain unresolved. Regression coverage added.
- [x] Typecheck succeeds; focused sheet/subject tests pass (8); ESLint passes on changed TypeScript. `git diff --check` passes. Build was attempted but is blocked by the sandbox's missing `@rolldown/binding-linux-arm64-gnu` optional dependency. Reduced-motion and print-safe animated backgrounds remain in place. Final archive and repository push status are recorded in delivery notes.
