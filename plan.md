# Mukuyu timetable advanced studio

## Scope

Upgrade only the timetable section of the supplied Mukuyu school portal. Preserve authentication, learners, marks, reports, school services, existing timetable data, existing PDF output, and deployment structure.

## Implementation approach

The current aSc-inspired generator, conflict checks, availability rules, teacher contracts, class rules, relations, versions, publishing, filters, and PDF export remain the foundation. The update is additive:

- `migrations/0023_timetable_advanced_studio.sql` stores 25 new scheduling capabilities without altering existing rows.
- `src/lib/school/timetable-advanced.ts` provides pure utilities for optimization profiles, teacher load analysis, class-gap detection, version comparison, week cycles, and ICS event generation.
- `src/components/school/timetable-advanced-studio.tsx` adds a visible timetable command center for profile selection, cycle/approval state, load and gap indicators, and the 25 feature groups.
- `timetable-view.tsx` mounts the advanced studio beside the existing operations and export flows.

## Design

**Design movement:** editorial academic command center. The existing Mukuyu paper-and-navy language is retained, with an indigo/sky operations surface for advanced controls.

**Core principles:** preserve the current workflow, make constraints visible, separate hard conflicts from optimization preferences, and keep every advanced feature reversible and auditable.

**Interaction philosophy:** existing forms and generation remain familiar; advanced planning is exposed as a focused studio with clear profiles, workflow state, indicators, and progressive disclosure.

## 25 feature outcomes

Drag movement, live clash highlighting, undo/redo foundations, visual conflict records, weighted optimization profiles, essential lesson priorities, multi-week cycles, Week A/B schedules, blackout dates, absences, substitute suggestions, capacity/equipment matching, co-teaching, split/combined classes, synchronized electives, school events, exam sessions/invigilation, workload analytics, version comparison, approval workflow, change history, CSV/XLSX/JSON import jobs, PDF/CSV/XLSX/ICS exports, subscriptions/share links, calendar links, duty rota, sync snapshots, and feature flags are represented by the advanced studio and additive timetable tables.

## Project structure

- `src/components/school/timetable-view.tsx`: existing timetable page and integration point.
- `src/components/school/timetable-operations.tsx`: existing ASC-style configuration and validation controls.
- `src/components/school/timetable-advanced-studio.tsx`: new advanced command center.
- `src/lib/school/timetable-engine.ts`: existing pure generator and audit engine.
- `src/lib/school/timetable-advanced.ts`: new analysis/export helper functions.
- `migrations/0023_timetable_advanced_studio.sql`: additive persistence model.

## Follow-up: timetable clearing and staff workflows

- Clear scheduled lesson entries for one selected year/term only, with a recovery snapshot; preserve the weekday grid, bell periods, labels, and start/end times, and leave weekly requirements and Staff assignments intact.
- Add a persisted Super Admin switch controlling whether Staff subject-teacher allocations may create missing timetable lesson cards; enforce it in both manual seeding and automatic/repair generation.
- Make Super Admin teacher/admin hard deletion transactional and clean all restrictive timetable references; snapshot affected schedules and return affected published scopes to draft for review.
- Let teachers open their own published timetable by default, switch to published timetables for assigned classes, and download/export either view without receiving unrelated classes' schedules.

## Follow-up: welcome display and Kenya music

- Add exactly 14 safe, school-wide welcome display controls, persist them in an additive JSON column, and render them on the public landing page with an editable live preview.
- Make the on-device colour switch visibly change the welcome hero while preserving the school-wide background settings.
- Replace inert display checkboxes in the portal quick menu with a link to the functional designer.
- Reject non-media web pages as playable direct audio, retain attribution/source links for catalog additions, and improve failure/skip feedback in the portal player.
- Add four source-checked, trending Kenya YouTube tracks and the official Apple Music Top 100: Kenya daily playlist as one-click in-page embed options; document the chart snapshot and sources.

## Follow-up: admission-number appearance, public tour and school app branding

- Add a Super Admin-only admission-number settings card with an uppercase prefix, optional calendar year, and 4–8 digit random identifier. The default remains `MKS-{YEAR}-{NUMBER}`; settings apply only to newly generated identifiers, never retroactively renumber existing learners. Keep server-side uniqueness checks and provide a live example.
- Add a public, pre-login “Explore portal features” walkthrough to the existing welcome screen. Use an accessible, dismissible overlay with brief school-office, marks, learner import, reports, QR family feedback and backup capabilities; it is a walkthrough, not a login bypass or fake demo data.
- Add a dynamic PWA manifest name from the configured school profile and a small SVG initials mark with a multicolor school palette. Preserve a safe Mukuyu fallback when the database is unavailable, and update browser/Apple title metadata after public school settings load.
- Add restrained spectrum drift and 3D hover depth to ordinary portal panels, excluding printed reports; preserve the current welcome motion controls and honor both OS reduced-motion and the portal's per-device motion switch.
- Keep scheduled backup behavior unchanged unless tests reveal a defect: Vercel calls `/api/cron-backup` daily at 02:00 UTC, which saves an internal daily snapshot. Optional email attachments follow daily/weekly/monthly UTC cadence. Email needs `DATABASE_URL`, matching `CRON_SECRET`, `RESEND_API_KEY`, and an `EMAIL_FROM` sender on a verified domain; configuration cannot be considered live-verified from the ZIP build.

### Project structure additions

- `migrations/0033_admission_number_settings.sql`: additive defaults for the next admission-number format.
- `src/lib/school/admission-number.ts` and its focused test: safe defaults, validation/normalization and preview formatting.
- `src/lib/school/api.ts` / `src/components/school/settings-view.tsx`: protected Super Admin read/save controls and generation integration.
- `src/routes/index.tsx`: public features walkthrough and runtime school-name metadata.
- `scripts/grok-pwa-shared.mjs`, `server/middleware/grok-pwa.ts`, and `scripts/grok-pwa-plugin.mjs`: school-name manifest and generated initials icon, with dev/fallback behavior.
- `src/styles.css` and `src/routes/portal.tsx`: subtle motion and depth for non-print portal panels.

## Follow-up: Super Admin role access and download controls

- Add a Super Admin-only, database-backed access matrix by audience group (`admin`, `teacher`, `parent`, `student`, and public QR link) for viewing and downloading report cards, analysis, mark lists and own/family results. Super Admin access remains unconditional; parent/student result scope remains their linked records only.
- Enforce view decisions in role navigation and route rendering, enforce download decisions on PDF/CSV/Excel/print actions, and check public QR access on the server. Do not describe UI download controls as a barrier to screenshots or records that a user still needs for another allowed task.
- Preserve existing mark-edit locks, staff privileges and deputy delegation. Save access-policy changes through Super Admin-only server functions in an additive migration; retain safe defaults matching current access.
- Keep existing marks-grid/import, learner upload, scheduled backup, QR feedback, bulk clear/archive and presentation updates intact; focus this extension on Super Admin governance.

## Follow-up: visual atmosphere and motion polish

- Keep this update strictly presentational: layered, multicolour backgrounds; polished welcome/login surfaces; portal navigation, cards, forms, tables and feedback states; no school-data or permission behavior changes.
- Extend the existing Mukuyu editorial academic command-center style with a calm aurora palette, soft glass surfaces and jewel-tone accents. Use slow, low-amplitude motion, depth and staggered entry rather than rapid flashing.
- Respect the welcome animation switch, the user's portal motion setting, and `prefers-reduced-motion`; preserve print clarity, responsive layouts, keyboard focus visibility and readable contrast.
- Place the reusable visual treatments in `src/school-display.css`, imported by the existing `src/styles.css` entrypoint, so portal, welcome, login and public QR surfaces share a consistent finish.
