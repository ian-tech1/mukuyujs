export type BackupEmailPayload = {
  generatedAt: string;
  tables: Record<string, unknown[]>;
};

export type BackupEmailKind = "scheduled" | "test";

export async function sendSchoolBackupEmail(
  to: string,
  payload: BackupEmailPayload,
  snapshotId: string,
  kind: BackupEmailKind,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY is not configured." };
  if (!from) return { sent: false, reason: "EMAIL_FROM is not configured." };

  const date = payload.generatedAt.slice(0, 10);
  const attachment = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");
  const testLabel = kind === "test" ? " test" : "";
  const text = [
    `Attached is the${testLabel} Mukuyu school records backup generated on ${date}.`,
    "This file contains confidential learner, guardian, attendance, support, and school records. Store it encrypted and restrict access. Passwords and password hashes are excluded.",
    `Snapshot ID: ${snapshotId}`,
    "A successful provider response means the email was accepted for processing; check the recipient inbox and provider delivery events to confirm final delivery.",
  ].join("\n\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Mukuyu school backup${testLabel} · ${date}`,
        text,
        attachments: [{ filename: `mukuyu-school-backup-${date}.json`, content: attachment }],
      }),
    });
    if (!response.ok) return { sent: false, reason: `Email provider returned HTTP ${response.status}.` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "The email provider request failed before acceptance." };
  }
}
