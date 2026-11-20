# Mukuyu School Portal — environment configuration

The requested values are included in `.env.production` for reference/local production builds.

IMPORTANT: Vercel deployments do not reliably configure project Environment Variables merely because an env file is present in a ZIP. Add each variable privately in Vercel > Project > Settings > Environment Variables and redeploy. Do not commit or share `.env.production`.

`EMAIL_FROM` uses Resend's onboarding sender for initial testing. Resend may restrict recipients; verify a domain in Resend for normal school email delivery.


## Additional production settings for this project
- `BETTER_AUTH_SECRET`: a second random secret, separate from `SESSION_SECRET`.
- `BETTER_AUTH_URL`: `https://mukuyujs.lovie.me` only after the domain opens this deployed portal.
- `VITE_AUTH_ENABLED`: must be `true` for the deployed auth configuration. `vercel.json` now sets this non-secret flag for the build.
- `EMAIL_FROM`: keep `Mukuyu School <onboarding@resend.dev>` only for limited testing; use `Mukuyu School <no-reply@mukuyujs.lovie.me>` only after Resend confirms that sender/domain is verified and under your DNS control.

- `CRON_SECRET`: a separate random secret used to protect the daily `/api/cron-backup` Vercel cron endpoint. Vercel cron must send `Authorization: Bearer <CRON_SECRET>`.
