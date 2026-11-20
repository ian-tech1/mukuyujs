import { useEffect, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, errText, inputClass } from "@/components/school/gate";
import { getQrFeedbackSettings, getScheduledBackupSettings, saveQrFeedbackSettings, saveScheduledBackupSettings } from "@/lib/school/api";

type FeedbackSettings = { recipientScope: "teacher" | "class_teacher" | "admin" | "super_admin"; allowTeacherSelection: boolean; autoreplyEnabled: boolean };
type BackupSettings = { enabled: boolean; recipientEmail: string; cadence: "daily" | "weekly" | "monthly" };

export function AdminAutomationCards({ flash }: Pick<Gate, "flash">) {
  const [feedback, setFeedback] = useState<FeedbackSettings>({ recipientScope: "class_teacher", allowTeacherSelection: true, autoreplyEnabled: false });
  const [backup, setBackup] = useState<BackupSettings>({ enabled: false, recipientEmail: "", cadence: "daily" });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { Promise.all([getQrFeedbackSettings(), getScheduledBackupSettings()]).then(([f,b]) => { setFeedback(f as FeedbackSettings); setBackup(b as BackupSettings); setLoaded(true); }).catch((e) => flash(errText(e), true)); }, [flash]);
  return <div className="space-y-5">
    <form className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-violet-50 p-5 shadow-card" onSubmit={async (e) => { e.preventDefault(); try { await saveQrFeedbackSettings({ data: feedback }); flash("QR parent-message routing saved."); } catch (error) { flash(errText(error), true); } }}>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-800">Super admin · family contact</p><h2 className="mt-1 font-serif text-2xl text-navy">Scanned-report parent messages</h2>
      <p className="mt-1 text-sm text-muted">Messages are linked to the learner shown on the QR report. The learner and class identity are filled by the system; parents provide their own name and message.</p>
      <label className="mt-4 block text-sm font-semibold">Default message visibility<select className={inputClass+" mt-1"} value={feedback.recipientScope} onChange={(e)=>setFeedback({...feedback,recipientScope:e.target.value as FeedbackSettings["recipientScope"]})}><option value="teacher">Selected assigned teacher (and super admin oversight)</option><option value="class_teacher">Assigned class teacher (and admin oversight)</option><option value="admin">Administrators and super admin only</option><option value="super_admin">Super admin only</option></select></label>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={feedback.allowTeacherSelection} onChange={(e)=>setFeedback({...feedback,allowTeacherSelection:e.target.checked})}/><span>Let families choose an assigned teacher when teacher/class-teacher routing is active.</span></label>
      <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={feedback.autoreplyEnabled} onChange={(e)=>setFeedback({...feedback,autoreplyEnabled:e.target.checked})}/><span>Send an automatic receipt to parents who provide an email (requires configured email provider).</span></label>
      <button className={btnClass+" mt-4"} type="submit" disabled={!loaded}>Save QR message rules</button>
    </form>
    <form className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-card" onSubmit={async(e)=>{e.preventDefault();try{await saveScheduledBackupSettings({data:backup});flash("Automatic backup delivery settings saved.");}catch(error){flash(errText(error),true);}}}>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">Super admin · recovery readiness</p><h2 className="mt-1 font-serif text-2xl text-navy">Automatic backup delivery</h2>
      <p className="mt-1 text-sm text-muted">Vercel calls the backup endpoint daily at 02:00 UTC. Each successful run saves an internal daily snapshot; when enabled, it emails a JSON export on your selected cadence. Backups contain confidential learner and guardian data: use a protected mailbox and store attachments securely.</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={backup.enabled} onChange={(e)=>setBackup({...backup,enabled:e.target.checked})}/>Email scheduled backup files</label>
      <label className="mt-3 block text-sm font-semibold">Super-admin backup email<input className={inputClass+" mt-1"} type="email" required={backup.enabled} maxLength={200} value={backup.recipientEmail} onChange={(e)=>setBackup({...backup,recipientEmail:e.target.value})} placeholder="admin@example.com"/></label>
      <label className="mt-3 block text-sm font-semibold">Email cadence<select className={inputClass+" mt-1"} value={backup.cadence} onChange={(e)=>setBackup({...backup,cadence:e.target.value as BackupSettings["cadence"]})}><option value="daily">Daily</option><option value="weekly">Weekly (Monday UTC)</option><option value="monthly">Monthly (1st day UTC)</option></select></label>
      <p className="mt-2 text-xs text-muted">Email is not activated by this switch alone. Production needs server-only <code>DATABASE_URL</code>, matching <code>CRON_SECRET</code> for the scheduled Authorization header, <code>RESEND_API_KEY</code>, and <code>EMAIL_FROM</code> on a domain verified with Resend (for example a verified <code>no-reply@…</code> sender). No test email is sent from this settings screen.</p>
      <button className={btnClass+" mt-4"} type="submit" disabled={!loaded}>Save backup schedule</button>
    </form>
  </div>;
}
