# Mukuyu website update

This is an additive update based on the supplied `mukuyu.zip` project. Existing pages, school records, settings, credentials, and migrations have not been intentionally removed or reset.

## 12 website improvements
1. Search merit-list learners by name, admission number, or roll number.
2. Filter the merit list by learner level.
3. Sort the table by performance, learner name, or roll number.
4. Show or hide admission numbers in the on-screen table.
5. Reset all merit-list filters in one action.
6. Share the same merit position between learners tied on the same score.
7. Show a stream performance summary on the Analysis page.
8. Include stream means in merit-list PDFs even when optional analytics are disabled.
9. Show each stream's learner count.
10. Show the top learner in each stream.
11. Include stream mean summaries in CSV downloads.
12. Add top-five and bottom-five learner lists plus subject mark-coverage indicators.

## PDF stream means
The PDF merit list now includes a `STREAM MEAN SUMMARY` section with stream name, learner count, mean, and top learner. A stream with no recorded mean displays `—` rather than a misleading zero.

## Verification
- ZIP archive structure preserved from the uploaded project.
- Modified TypeScript/TSX files passed TypeScript transpile syntax checks.
- Full dependency-backed build and type-check were not run in this environment; install dependencies and run `npm run typecheck` and `npm run build` before production deployment.
- No live website deployment was performed.
