# ASC Timetables reference notes

The requested comparison is based on official ASC Timetables and EduPage help material.

## User-provided visual sample

- Source: `/home/ubuntu/upload/CLASSTIMETABLETT2.pdf` (6-page PDF, supplied on 2026-10-28).
- The example uses one landscape sheet per class/stream; school and term/class title at the top; class-teacher name at the upper right; lesson periods and start/end times as columns; weekdays as rows; break and lunch columns vertically merged and labeled; and subject cells with teacher initials near the bottom.
- The user also states that a separate timetable exists for each teacher. The updated PDF supports one-page-per-class/stream and one-page-per-teacher exports, and individual teacher email attachments use the teacher-specific page.
- The sample is a visual output reference, not proof of exact feature or scheduling-engine parity with ASC.

- The product page describes an automatic generator, scheduling criteria, published/shareable schedules, teacher/student/parent mobile schedules, substitutions, school calendar events, room/event booking, multi-user online collaboration, and timetable changes. https://www.asctimetables.com/
- The official aSc/EduPage help index groups workflows into data input, working with the timetable, constraints, testing, generation, verification, printing, student-based timetables, sharing, online administration, cloud generation, and mobile application. https://help.edupage.org/?p=u1/u3&lang_id=13
- The official aSc TimeTables help PDF describes teachers’ contracts and time-off, classroom free-time, classes/subjects/rooms, manually moving lessons while checking class/teacher/room collisions, validation/test and automatic generation, timetable printing, and timetable sharing. http://help.asctimetables.com/pdf/asc_timetables_en_P1.pdf

Important product boundary: implementing 12 ASC-inspired features in this Mukuyu web app does not reproduce the proprietary ASC automatic optimizer or every ASC workflow. The user’s request is interpreted as adding 12 practical schedule-management features that closely follow the public ASC workflow while retaining this app’s existing roles, academic-year/term model, database, Vercel hosting, PDF, and Resend integration.
