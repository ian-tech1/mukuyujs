# Mukuyu Chrome and error-monitor follow-up

Research and code review performed on 25–26 November 2026.

## Chrome delay investigation

The user-provided [Kiwanja Ndege Portal](https://kiwanjandege.vercel.app/) opened to a branded welcome/splash page with a “Continue to login” action; its sign-in form appeared after the welcome content in page order. The public page had no `<video>` elements. A single cloud-browser snapshot recorded 18 same-origin resources totalling about 499 KB, including a 245 KB logo, and four repeated server-function calls around 0.79–1.01 seconds. This is a one-session observation, not a controlled device or production-load comparison.[1]

A same-session snapshot of Mukuyu's public opening/sign-in route recorded no `<video>` elements and about 235 KB across 23 same-origin resources. The largest JavaScript bundle was about 105 KB and CSS about 36 KB. Its observed server-function requests were mostly under 0.21 seconds. These measurements are indicative only; browser cache, response compression, region, and server load were not controlled. No physical Redmi 14C or mobile Chrome test was performed, so this does not establish a Chrome-specific database, IndexedDB, shortcut-app, or backup-file cause.

The opening/sign-in route uses animated CSS gradients and orbital elements, not video. The 15 short MP4 scenes are optional portal-only background themes; each is under 400 KB and only one is loaded at a time when the “Mukuyu Nature Motion” theme is active. The scheduled backup route is a bearer-protected cron endpoint, separate from opening the public page. The installed-app prompt, including its no-cache version check every five minutes, mounts in the authenticated portal rather than the public opening route.

The responsive mobile grid order was restored so the welcome content appears before the sign-in section, reversing only the order introduced in commit `b19b4e48`. The CSS change is code-reviewed but was not visually checked on the Redmi 14C. A repository inventory found one tracked file above 2 MiB: `assets/branding/mukuyu-app-master.png` (4,611,685 bytes, 2048×2048). It is outside `public/` and no source reference was found during the scan; it is not a background video or opening-page asset. It was left unchanged to preserve the existing file. All 15 optional nature videos are below 400 KB.

## Security and dependency review

No ClamAV, YARA, or other local antivirus/signature scanner was available. The repository was not uploaded to a third-party scanner. A bounded static search found no `eval`, `new Function`, or `child_process.exec/spawn` patterns in tracked source. Static inspection is not equivalent to an antivirus scan or a complete source audit.

`better-auth` and its Kysely/Drizzle adapters were upgraded from 1.6.34 to 1.7.28. `pnpm audit --prod` reports no known vulnerabilities after the update. The update also changed the app's Grok broker sign-in calls to Better Auth 1.7's documented social sign-in API while preserving the configured Grok provider IDs, broker URLs, popup flow, bearer-token behavior, and callback handling. Better Auth 1.7 does not require a login-client account-schema change for this project's 1.6-to-1.7 upgrade; the account schema remains compatible.[6]

## Super Admin error reporting

The app now captures route-boundary failures, browser `error` events, unhandled promise rejections, and server-function failures. Reports contain only an allow-listed source, broad page category, and normalized error type. They deliberately exclude error messages, stack traces, full URLs, learner/account identifiers, IP addresses, and browser identifiers. The server deduplicates each category for 15 minutes and increments an aggregate reporting-window count. Captures are best-effort and do not replace or suppress the original error.

Settings now includes a Super Admin error-report panel. Its server endpoint re-checks the authenticated actor and requires the exact `super_admin` role before returning sanitized rows. The additive migration `0044_school_error_reports.sql` creates the constrained report table and index. It has not been applied to the live database; no production database was accessed and the migration-running production build was intentionally not run.

## Verification status

TypeScript typecheck passed. The migration syntax, allow-list constraints, and 15-minute deduplication/count behavior passed against an isolated in-memory PGLite database. All four error-policy tests passed. `npm run build:dev` completed successfully without running migrations. `pnpm audit --prod` found no known vulnerabilities. ESLint passed on the changed application files.

The repository-wide `npm test` command did not pass: existing script checks expect `.grok/app-env.json` and test-specific Open Graph identity values that are absent or differ in this checkout; the command stopped before its later application-test group. The repository-wide lint command also reports a pre-existing empty catch block in unchanged `src/lib/app-data/client.server.ts:281`, plus warnings in unrelated files. No unrelated fixes were made.

## References

[1]: https://kiwanjandege.vercel.app/ "Kiwanja Ndege Portal"
[2]: https://github.com/advisories/GHSA-965c-763c-88jm "Better Auth OAuth state sign-in advisory"
[3]: https://github.com/advisories/GHSA-r4xp-prcw-77qf "Better Auth OAuth proxy sign-in advisory"
[4]: https://github.com/advisories/GHSA-q84f-53jg-9ppm "Better Auth device login approval advisory"
[5]: https://github.com/advisories/GHSA-44jh-23m7-hpcf "Better Auth PostgreSQL rate-limit advisory"
[6]: https://better-auth.com/docs/guides/1-7-upgrade-guide "Better Auth 1.7 upgrade guide"
