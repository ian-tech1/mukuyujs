# ASC-style Timetable Features Added (Update)

Additive changes only. All previous functionality preserved.

## Newly added / strengthened features (beyond previous base)
1. Subject-specific constraints table (max per day, min days/week, no-afternoon flag, preferred morning, avoid consecutive days).
2. Auto-seeded defaults for core subjects (e.g. Maths marked no-afternoon / prefer morning).
3. Locked lessons column on entries (ready for future UI lock/unlock).
4. Subject constraints visible in Timetable Operations UI.
5. Generator scoring already improved for even subject distribution across days.
6. Subject off-times (unavailable periods) fully supported and respected.
7. Teacher / class / stream / room / subject availability.
8. Break periods with vertical labels in PDF matching sample style.
9. Super-admin toggle to allow/deny ordinary admin timetable edits.
10. Weekly requirements with preferred room and block length (1-3).
11. Automatic draft generation with collision avoidance.
12. Validation with workload and distribution warnings.
13. Publish / unpublish workflow.
14. Version snapshots and restore.
15. Class / teacher / summary PDF export with short names and initials.
16. Teacher timetable email.
17. Manual lesson create / edit / move / delete.
18. Period editor including isBreak flag and custom labels.
19. Room management with capacity and features.
20. Filter views by grade, stream, teacher, room.
21. Multi-entity availability notes.
22. Block length enforcement in generator.
23. Preferred room checking.
24. Clear error messages on School Services.
25. Migration 0021 for the new tables/columns.

The implementation remains ASC-inspired for a web/Vercel deployment and is not a full clone of the proprietary desktop optimizer.

