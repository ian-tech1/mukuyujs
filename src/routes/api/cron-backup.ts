import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { buildSchoolBackupPayload } from "@/lib/school/api";
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
        await sql`insert into office_backups (id, kind, note, payload, created_by) values (${id}, 'scheduled', 'Automatic daily database snapshot', ${JSON.stringify(payload)}, 'vercel-cron')`;
        await sql`delete from office_backups where kind = 'scheduled' and id not in (select id from office_backups where kind = 'scheduled' order by created_at desc limit 30)`;

        const settings = await sql<{ enabled: boolean; recipient_email: string; cadence: string }>`select enabled, recipient_email, cadence from scheduled_backup_settings where id=1`;
        const config = settings[0];
        let emailSent = false;
        let emailSkipped: string | undefined;
        if (config?.enabled && cadenceDue(config.cadence)) {
          const apiKey = process.env.RESEND_API_KEY;
          const from = process.env.EMAIL_FROM;
          if (!apiKey || !from) emailSkipped = "Set RESEND_API_KEY and EMAIL_FROM to enable email delivery.";
          else {
            const attachment = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: [config.recipient_email],
                subject: `Mukuyu school backup · ${new Date(payload.generatedAt).toISOString().slice(0, 10)}`,
                text: `Attached is the scheduled ${config.cadence} Mukuyu school records backup. It contains confidential learner, guardian, attendance, and school records. Store it encrypted and restrict access. Passwords and password hashes are excluded. Snapshot ID: ${id}`,
                attachments: [{ filename: `mukuyu-school-backup-${new Date(payload.generatedAt).toISOString().slice(0, 10)}.json`, content: attachment }],
              }),
            });
            emailSent = response.ok;
            if (!response.ok) emailSkipped = `Email provider returned ${response.status}. The internal snapshot was saved.`;
          }
        } else if (config?.enabled) emailSkipped = `Email delivery runs ${config.cadence}; today's internal snapshot was saved.`;
        return Response.json({ ok: true, id, createdAt: payload.generatedAt, learnerCount: payload.tables.learners.length, markCount: payload.tables.marks.length, emailSent, emailSkipped });
      },
    },
  },
});
