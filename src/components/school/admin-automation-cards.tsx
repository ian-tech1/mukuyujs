import { useEffect, useState, type FormEvent } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, errText, inputClass } from "@/components/school/gate";
import { btnDownload } from "@/components/school/download-button";
import { getQrFeedbackSettings, getScheduledBackupSettings, saveQrFeedbackSettings, saveScheduledBackupSettings, sendBackupEmailNow } from "@/lib/school/api";

type FeedbackSettings = { recipientScope: "teacher" | "class_teacher" | "admin" | "super_admin"; allowTeacherSelection: boolean; autoreplyEnabled: boolean };
type BackupSettings = { enabled: boolean; recipientEmail: string; cadence: "daily" | "weekly" | "monthly" };
type BackupRun = { id: string; createdAt: string; source: string; status: "sent" | "failed" | "skipped" | "pending" | "unknown"; detail: string };

export function AdminAutomationCards({ flash }: Pick<Gate, "flash">) {
  const [feedback, setFeedback] = useState<FeedbackSettings>({ recipientScope: "class_teacher", allowTeacherSelection: true, autoreplyEnabled: false });
  const [backup, setBackup] = useState<BackupSettings>({ enabled: false, recipientEmail: "", cadence: "daily" });
  const [savedBackup, setSavedBackup] = useState<BackupSettings | null>(null);
  const [backupRuns, setBackupRuns] = useState<BackupRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  useEffect(() => {
    Promise.all([getQrFeedbackSettings(), getScheduledBackupSettings()])
      .then(([feedbackSettings, backupResponse]) => {
        setFeedback(feedbackSettings as FeedbackSettings);
        const { recentRuns, ...settings } = backupResponse as BackupSettings & { recentRuns: BackupRun[] };
        setBackup(settings);
        setSavedBackup(settings);
        setBackupRuns(recentRuns);
        setLoaded(true);
      })
      .catch((error) => flash(errText(error), true));
  }, [flash]);

  const backupUnchanged = Boolean(savedBackup)
    && backup.enabled === savedBackup?.enabled
    && backup.recipientEmail.trim().toLowerCase() === savedBackup?.recipientEmail.trim().toLowerCase()
    && backup.cadence === savedBackup?.cadence;
  const canSendNow = loaded && backupUnchanged && Boolean(savedBackup?.recipientEmail.trim()) && !sendingNow && !savingBackup;

  async function saveBackupSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBackup(true);
    try {
      await saveScheduledBackupSettings({ data: backup });
      setSavedBackup(backup);
      flash("Automatic backup delivery settings saved.");
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setSavingBackup(false);
    }
  }

  async function sendBackupNow() {
    if (!savedBackup?.recipientEmail.trim() || !backupUnchanged || sendingNow) return;
    const recipient = savedBackup.recipientEmail.trim();
    const confirmed = window.confirm(`Send a full backup containing confidential learner, guardian, attendance, support, and school records to ${recipient} now? This sends one email immediately and saves an internal snapshot. Continue only if this is a protected mailbox.`);
    if (!confirmed) return;

    setSendingNow(true);
    try {
      const result = await sendBackupEmailNow();
      if (result.emailSent) {
        flash(`A ${result.learnerCount}-learner backup snapshot was saved and the email provider accepted it for ${recipient}. Check the inbox and spam folder; provider acceptance is not final delivery confirmation.`);
      } else {
        flash(`The backup snapshot was saved, but the email provider did not accept it: ${result.reason ?? "check the email settings and provider logs"}`, true);
      }
      const refreshed = await getScheduledBackupSettings();
      setBackupRuns((refreshed as BackupSettings & { recentRuns: BackupRun[] }).recentRuns);
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setSendingNow(false);
    }
  }

  return <div className="space-y-5">
    <form className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-5 shadow-card" onSubmit={async (event) => { event.preventDefault(); try { await saveQrFeedbackSettings({ data: feedback }); flash("QR parent-message routing saved."); } catch (error) { flash(errText(error), true); } }}>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-800">Super admin · family contact</p><h2 className="mt-1 font-serif text-2xl text-navy">Scanned-report parent messages</h2>
      <p className="mt-1 text-sm text-muted">Messages are linked to the learner shown on the QR report. The learner and class identity are filled by the system; parents provide their own name and message.</p>
      <label className="mt-4 block text-sm font-semibold">Default message visibility<select className={inputClass + " mt-1"} value={feedback.recipientScope} onChange={(event) => setFeedback({ ...feedback, recipientScope: event.target.value as FeedbackSettings["recipientScope"] })}><option value="teacher">Selected assigned teacher (and super admin oversight)</option><option value="class_teacher">Assigned class teacher (and admin oversight)</option><option value="admin">Administrators and super admin only</option><option value="super_admin">Super admin only</option></select></label>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={feedback.allowTeacherSelection} onChange={(event) => setFeedback({ ...feedback, allowTeacherSelection: event.target.checked })} /><span>Let families choose an assigned teacher when teacher/class-teacher routing is active.</span></label>
      <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={feedback.autoreplyEnabled} onChange={(event) => setFeedback({ ...feedback, autoreplyEnabled: event.target.checked })} /><span>Send an automatic receipt to parents who provide an email (requires configured email provider).</span></label>
      <button className={btnClass + " mt-4"} type="submit" disabled={!loaded}>Save QR message rules</button>
    </form>

    <form className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-card" onSubmit={saveBackupSettings}>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">Super admin · recovery readiness</p><h2 className="mt-1 font-serif text-2xl text-navy">Automatic backup delivery</h2>
      <p className="mt-1 text-sm text-muted">Vercel calls the backup endpoint daily at 02:00 UTC. Every successful run saves an internal daily snapshot; when enabled, it emails a JSON export on your selected cadence. Backups contain confidential learner and guardian data: use a protected mailbox and store attachments securely.</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={backup.enabled} onChange={(event) => setBackup({ ...backup, enabled: event.target.checked })} />Email scheduled backup files</label>
      <label className="mt-3 block text-sm font-semibold">Super-admin backup email<input className={inputClass + " mt-1"} type="email" required={backup.enabled} maxLength={200} value={backup.recipientEmail} onChange={(event) => setBackup({ ...backup, recipientEmail: event.target.value })} placeholder="admin@example.com" /></label>
      <label className="mt-3 block text-sm font-semibold">Email cadence<select className={inputClass + " mt-1"} value={backup.cadence} onChange={(event) => setBackup({ ...backup, cadence: event.target.value as BackupSettings["cadence"] })}><option value="daily">Daily</option><option value="weekly">Weekly (Monday UTC)</option><option value="monthly">Monthly (1st day UTC)</option></select></label>
      <p className="mt-2 text-xs text-muted">Production needs server-only <code>DATABASE_URL</code>, matching <code>CRON_SECRET</code> for the scheduled Authorization header, <code>RESEND_API_KEY</code>, and <code>EMAIL_FROM</code> on a domain verified with Resend. Save the schedule before testing. “Send backup now” emails one full backup to the saved address immediately, even if automatic email is disabled or its cadence is not due.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={btnClass} type="submit" disabled={!loaded || savingBackup || sendingNow}>{savingBackup ? "Saving…" : "Save backup schedule"}</button>
        <button className={btnDownload.emerald} type="button" disabled={!canSendNow} onClick={() => void sendBackupNow()}>{sendingNow ? "Preparing and sending…" : "Send backup now (test)"}</button>
      </div>
      <section className="mt-5 border-t border-emerald-200 pt-4" aria-labelledby="backup-run-history-title">
        <h3 id="backup-run-history-title" className="font-semibold text-navy">Recent backup activity</h3>
        {backupRuns.length ? <ul className="mt-2 space-y-2">{backupRuns.map((run) => {
          const statusClass = run.status === "sent" ? "text-emerald-800" : run.status === "failed" ? "text-rose-800" : run.status === "skipped" ? "text-amber-800" : run.status === "pending" ? "text-blue-800" : "text-muted";
          const statusLabel = run.status === "sent" ? "Provider accepted" : run.status === "failed" ? "Email failed" : run.status === "skipped" ? "Email skipped" : run.status === "pending" ? "Result pending" : "Delivery status unknown";
          return <li key={run.id} className="rounded-lg border border-emerald-100 bg-white/80 p-3 text-sm"><p className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-navy">{run.source} · {new Date(run.createdAt).toLocaleString()}</strong><span className={`font-bold ${statusClass}`}>{statusLabel}</span></p><p className="mt-1 text-xs text-muted">{run.detail}</p></li>;
        })}</ul> : <p className="mt-2 text-sm text-muted">No scheduled or manual email-backup activity is recorded yet.</p>}
        <p className="mt-2 text-xs text-muted">Older snapshot records may not contain delivery results. “Provider accepted” does not confirm delivery to the inbox.</p>
      </section>
    </form>
  </div>;
}
