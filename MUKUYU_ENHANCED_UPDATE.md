# Mukuyu additive update

This copy was created from `mukuyu1-asc-timetable-update(4).zip` in a separate working folder. The uploaded ZIP remains unchanged. Existing migrations and flows were retained; schema changes are supplied as new migrations.

## Timetable PDF additions

- A whole-school summary PDF is available in the timetable PDF selector. It contains one landscape page per weekday, with lesson periods down the page and class/stream schedules across the page.
- Each selected teacher can receive their own individual weekly timetable plus full class/stream sheets for every class where that teacher has scheduled lessons. Email is individually addressed to the teacher through the configured Resend sender.
- The existing class-sheet and teacher-sheet formats remain available.

## Ten non-timetable additions

1. **Daily learner attendance:** dated class rolls with present, absent, late, and excused statuses, kept separate from term attendance notes.
2. **Homework tracker:** teachers can assign work by subject and class with due dates; linked learners/families can see work and mark completion (self-reported).
3. **Longitudinal progress transcript:** download a learner’s recorded marks across years/terms as CSV, distinguishing missing results from zero.
4. **School events calendar:** publish dated events to selected audiences without automatically sending messages.
5. **Guardian contacts and communication log:** staff-only contact details and short contact outcomes, separate from parent portal accounts and mail logs.
6. **Parent–teacher meeting requests:** parents can request a conversation for a linked learner; authorized school staff respond without booking timetable slots.
7. **Staff absence requests:** submit, withdraw, approve, or decline date-range requests. This does not auto-change timetable availability or arrange cover.
8. **Restricted learner support follow-up log:** dated case/follow-up records visible only to super admins/deputy super admins; separate from report-card conduct notes.
9. **Privileged admin activity history:** read-only log of key new-service updates for super admins/deputies; sensitive content and credentials are excluded.
10. **Emergency contact and critical health note:** optional short record visible to admins and assigned class teachers; not included in learner reports or family views.

These additions are in a separate **School Services** portal tab. Server endpoints enforce access by role, teacher assignment, and linked-child identity; hiding a control in the UI is not treated as authorization. Sensitive records are kept out of general learner and family workspace responses.

## ASC-inspired timetable capability set

The existing 12 additions remain: room catalogue; teacher/class/stream/room unavailability; weekly lesson requirements; single/double/triple blocks; breaks; automatic draft generation; conflict/contract validation; manual edit/move; master/class/teacher/room views; publish/unpublish; and recoverable versions. The implementation remains ASC-inspired and is not an exact clone or certified aSc integration.

## Vercel deployment

1. Deploy this updated project folder/ZIP as your source. Do not replace or modify the uploaded archive you asked to preserve.
2. Retain `DATABASE_URL` and all existing Vercel configuration. The migration runner applies `0019_school_services.sql` additively; deploy the complete `migrations/` directory, including prior migrations.
3. Keep `RESEND_API_KEY` and `EMAIL_FROM` configured for teacher timetable email. Downloads do not require email configuration.
4. Use direct HTTPS audio-stream URLs for music playback (station webpages are not direct audio streams).
5. Backups now contain private guardian, emergency, support, attendance and staff-request information. Store backup files securely. Restore merges these records but does not replace the live admin audit trail or existing accounts/passwords.
6. After deployment, test sign-in and School Services with one account per role (super admin, deputy, assigned teacher, parent, and learner) before using it with live records.

## Known product boundaries

The timetable generator is a bounded constraint-search tool rather than a reproduction of aSc’s proprietary optimizer. Staff absence approval does not schedule substitute teachers. Homework completion is not proof of submission. The support and health/contact tools are deliberately restricted and should be used only under the school’s data-protection and retention policies.

## Verification of this revision

- TypeScript check: passed.
- Production Vercel build: passed (the build ran without `DATABASE_URL`, so the deploy migration was skipped locally as intended).
- Isolated PGLite schema check: all migrations through `0019_school_services.sql` applied; all 11 new service tables were present.
- Focused ESLint on the added/updated UI and PDF files: passed. Linting the full API file still reports two existing unrelated findings near its original session helper/historical-learner code.
- Repository test suite: 186 passed, 11 failed out of 197. Failures are in the repository's existing grok PWA and migration-plan expectations; no changes were made to those unrelated systems.
- Auth invariant probe: inconclusive because the local environment did not expose the expected resolved `VITE_AUTH_ENABLED` value.
