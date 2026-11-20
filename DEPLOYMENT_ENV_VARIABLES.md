# Deployment environment variables

Add these variable names in your hosting provider (for example, Vercel → Project → Settings → Environment Variables). Set them for **Production** and redeploy after changes.

- `DATABASE_URL` — your Neon PostgreSQL connection string. Keep it private.
- `SESSION_SECRET` — a private random secret, at least 32 bytes. Do not reuse a secret shown in a chat.
- `BETTER_AUTH_SECRET` — a separate private random secret, at least 32 bytes.
- `BETTER_AUTH_URL` — the public HTTPS URL of this deployed portal, for example `https://YOUR-PROJECT.vercel.app`.
- `RESEND_API_KEY` — your Resend API key, if email sending is enabled.
- `EMAIL_FROM` — a sender address/domain verified in Resend, if email sending is enabled.

The `.env.example` file contains placeholders only; it does not contain working credentials. Do not replace placeholders with real credentials and upload the file publicly. Add real values only in the hosting provider's encrypted environment-variable settings. If a database password or API key was shared publicly, rotate it and update the hosting variable.

- `VITE_AUTH_ENABLED` — set to `true` in Vercel for the deployed sign-in flow. The checked-in `.grok/app-env.json` is a local development flag and should not determine production auth.

- `CRON_SECRET`: a separate random secret for the daily `/api/cron-backup` Vercel cron endpoint.
