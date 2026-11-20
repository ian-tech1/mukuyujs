# Mukuyu School Portal — security and deployment notes

## Before deploying

1. Rotate the Neon database password because a previous project archive contained a database connection string.
2. Revoke the exposed Resend API key and create a new one.
3. Set DATABASE_URL, SESSION_SECRET, BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY and EMAIL_FROM in Vercel Project Settings → Environment Variables. Use different random values for SESSION_SECRET and BETTER_AUTH_SECRET.
4. Do not put real credentials in `.env.example`, ZIP archives, source control, or public files.
5. Redeploy after changing Vercel environment variables.

## Backups

The Settings page has a manual JSON backup export. Download it regularly and store a copy somewhere separate from the live deployment. This export intentionally excludes password hashes and credentials; it is not a full database image and does not, by itself, restore user passwords or every auth-provider record. Test any restore procedure on a separate database before using it with production data.

## Email sender

`onboarding@resend.dev` is for Resend testing and does not permit general delivery to arbitrary recipients. For production password-reset and account-setup messages, configure a sender on a domain verified in Resend. Keep the Resend API key only in Vercel Environment Variables.
