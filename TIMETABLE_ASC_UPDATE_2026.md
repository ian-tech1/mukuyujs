# Mukuyu Timetable ASC-style Update (Oct 2026)

Additive updates only. Existing data and other modules retained.

## Timetable features added/improved (ASC-inspired)
- Subject-specific off-times / unavailable periods (e.g. Maths cannot be taught in afternoons or evenings). Set via Timetable Operations → Availability → Subject.
- Improved automatic generator distribution: prefers spreading the same subject across different days for a class, avoids consecutive days when possible, and balances teacher/class load.
- Breaks and lunch breaks: periods marked as breaks appear with vertical labels in the PDF (matching the sample “FIRST BREAK”, “SECOND BREAK”, “LUNCH BREAK” style). Edit period labels and isBreak flag freely.
- Super-admin control: toggle to allow or deny ordinary admins from editing the timetable (visible in Timetable Operations when logged in as super admin). Deputies retain access.
- Existing: rooms, teacher/class/room/subject availability, weekly requirements with block lengths (singles/doubles/triples), validation, publish/unpublish, versions/restore, PDF export (class/teacher/summary), teacher email.
- Workload and distribution warnings remain in validation.

## School Services fixes
- getSchoolServices now wrapped in try/catch with clearer error messages so failures surface usefully instead of generic crashes.
- All service tables remain defined in migration 0019; ensure migrations run on deploy.

## Deployment
- Include the full migrations/ folder. Migration 0020 (and prior) will apply.
- Test School Services and Timetable generation on staging after deploy.
- PDF export aims to match the supplied Mukuyu class timetable sample (abbreviated days, short subjects, teacher initials, vertical breaks).

