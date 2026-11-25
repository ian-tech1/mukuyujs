import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { buildSchoolBackupPayload } from "@/lib/school/api";
import { sendSchoolBackupEmail } from "@/lib/school/backup-email";
import { randomBytes } from "node:crypto";

function cadenceDue(cadence: string, date = new Date()) {
  if (cadence === "weekly") return date.getUTCDay() === 1;
  if (cadence === "monthly") return date.getUTCDate() === 1;
  return true;
}

export const Route = createFileRoute("/api/cron-backup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
        if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
        if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const sql = await getSql();
        const payload = await buildSchoolBackupPayload(sql, "vercel-cron");
        const id = `bak_${randomBytes(9).toString("hex")}`;
        await sql`insert into office_backups (id, kind, note, payload, created_by) values (${id}, 'scheduled', 'Automatic daily database snapshot; email_status=pending', ${JSON.stringify(payload)}, 'vercel-cron')`;
        await sql`delete from office_backups where kind = 'scheduled' and id not in (select id from office_backups where kind = 'scheduled' order by created_at desc limit 30)`;

        const settings = await sql<{ enabled: boolean; recipient_email: string; cadence: string }>`select enabled, recipient_email, cadence from scheduled_backup_settings where id=1`;
        const config = settings[0];
        let emailSent = false;
        let emailSkipped: string | undefined;
        let emailStatus: "sent" | "failed" | "skipped" = "skipped";
        let reason = "Email delivery is disabled in Super Admin settings.";

        if (config?.enabled) {
          if (!cadenceDue(config.cadence)) {
            reason = `Email is not due for the ${config.cadence} cadence today (UTC).`;
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.recipient_email.trim())) {
            reason = "The saved backup recipient email is missing or invalid.";
          } else {
            const result = await sendSchoolBackupEmail(config.recipient_email.trim().toLowerCase(), payload, id, "scheduled");
            emailSent = result.sent;
            if (result.sent) {
              emailStatus = "sent";
              reason = "";
            } else {
              emailStatus = "failed";
              reason = result.reason ?? "The email provider did not accept the backup.";
            }
          }
        }

        if (reason) emailSkipped = reason;
        const note = `Automatic daily database snapshot; email_status=${emailStatus}${reason ? `; reason=${reason}` : ""}`;
        await sql`update office_backups set note=${note} where id=${id}`;
        return Response.json({ ok: true, id, createdAt: payload.generatedAt, learnerCount: payload.tables.learners.length, markCount: payload.tables.marks.length, emailSent, emailSkipped });
      },
    },
  },
});
