import { useEffect, useState } from "react";
import { submitQrParentFeedback } from "@/lib/school/api";
import { btnClass, errText, inputClass } from "@/components/school/gate";

type FeedbackProps = { code: string; learnerName: string; gradeName: string; streamName: string; settings?: { recipientScope: "teacher" | "class_teacher" | "admin" | "super_admin"; allowTeacherSelection: boolean; autoreplyEnabled: boolean }; teachers?: Array<{ id: string; fullName: string; subjectName: string }> };
const welcomeLines = ["We value your voice in every learner’s journey.", "A thoughtful conversation helps us support each learner.", "Thank you for partnering with our teachers.", "Your message will reach the school team selected for this report."];

export function QrParentFeedback({ code, learnerName, gradeName, streamName, settings, teachers = [] }: FeedbackProps) {
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [teacherUserIds, setTeacherUserIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [welcomeIndex, setWelcomeIndex] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setWelcomeIndex((n) => (n + 1) % welcomeLines.length), 5500); return () => window.clearInterval(timer); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await submitQrParentFeedback({ data: { code, parentName, parentEmail, teacherUserIds, message, website } });
      setDeliveryNote(result.teacherCount ? `${result.teacherCount} selected teacher${result.teacherCount === 1 ? "" : "s"} can view this message in their portal. Email notifications sent: ${result.teacherEmailsSent}.` : "Your message is saved for the school team. The Super Admin can view it in the staff inbox.");
      setComplete(true); setParentName(""); setParentEmail(""); setMessage(""); setTeacherUserIds([]);
    } catch (reason) { setError(errText(reason)); }
    finally { setBusy(false); }
  }
  return <section className="qr-feedback-card mt-5 rounded-3xl border border-teal-200 p-5 shadow-card sm:p-7" aria-labelledby="qr-feedback-title">
    <div className="qr-feedback-glow" aria-hidden="true" />
    <div className="relative z-10">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-teal-800">Family voice · private school message</p>
      <h2 id="qr-feedback-title" className="mt-1 font-serif text-2xl font-bold text-navy">Write to your child’s teachers</h2>
      <p className="qr-feedback-welcome mt-2 min-h-6 text-sm text-teal-950" aria-live="polite">{welcomeLines[welcomeIndex]}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/80 px-3 py-1.5 font-semibold text-navy">Learner: {learnerName}</span><span className="rounded-full bg-white/80 px-3 py-1.5 text-navy">{gradeName} · {streamName}</span></div>
      {complete ? <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4" role="status"><strong className="text-emerald-900">Thank you — your message has been received.</strong><p className="mt-1 text-sm text-emerald-900">The learner and class details were attached automatically. {deliveryNote} {settings?.autoreplyEnabled ? "If you provided an email and school email delivery is configured, a receipt will be sent." : "The school team will review it."}</p><button type="button" className="mt-3 text-sm font-bold text-teal-900 underline" onClick={() => { setComplete(false); setDeliveryNote(""); }}>Send another message</button></div> : <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-sm font-semibold text-navy">Your name<input className={inputClass + " mt-1 block w-full bg-white/90"} required minLength={2} maxLength={120} value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Parent or guardian name" /></label>
        <label className="text-sm font-semibold text-navy">Email for a reply <span className="font-normal text-muted">(optional)</span><input className={inputClass + " mt-1 block w-full bg-white/90"} type="email" maxLength={200} value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="you@example.com" /></label>
        {settings?.allowTeacherSelection && ["teacher", "class_teacher"].includes(settings.recipientScope) && <fieldset className="rounded-xl border border-teal-100 bg-white/60 p-3 text-sm sm:col-span-2"><legend className="px-1 font-semibold text-navy">Choose one or more teachers <span className="font-normal text-muted">(optional · up to 12)</span></legend><p className="mb-2 text-xs text-muted">Select specific teachers; each selected teacher receives the message in their portal and by email where an address is on file. Leave all unchecked for the school’s default routing.</p><div className="grid gap-2 sm:grid-cols-2">{teachers.map((teacher) => <label key={teacher.id} className="flex items-start gap-2 rounded-lg border border-teal-100 bg-white p-2"><input type="checkbox" checked={teacherUserIds.includes(teacher.id)} disabled={!teacherUserIds.includes(teacher.id) && teacherUserIds.length >= 12} onChange={(event) => setTeacherUserIds((current) => event.target.checked ? [...current, teacher.id] : current.filter((id) => id !== teacher.id))} /><span><strong>{teacher.fullName}</strong><span className="block text-xs font-normal text-muted">{teacher.subjectName}</span></span></label>)}</div><p className="mt-2 text-xs text-teal-900">{teacherUserIds.length ? `${teacherUserIds.length} teacher${teacherUserIds.length === 1 ? "" : "s"} selected` : "No individual teacher selected"}</p></fieldset>}
        <label className="text-sm font-semibold text-navy sm:col-span-2">Your message<textarea className={inputClass + " mt-1 block min-h-32 w-full bg-white/90 py-2"} required minLength={4} maxLength={1500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share a question, observation, or note for the school team…" /><span className="mt-1 block text-right text-xs font-normal text-muted">{message.length}/1,500 · {Math.max(0, 1500 - message.length)} remaining</span></label>
        <label className="sr-only" aria-hidden="true">Leave this field empty<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        {error && <p className="text-sm font-semibold text-bad sm:col-span-2" role="alert">{error}</p>}
        <div className="sm:col-span-2"><button className={btnClass} type="submit" disabled={busy}>{busy ? "Sending securely…" : "Send message to school"}</button><p className="mt-2 text-xs text-muted">Messages are linked to this learner and visible to the Super Admin. Selected teachers also see them in their portal; email delivery depends on a valid staff email and school email setup. Do not include urgent or sensitive medical information.</p></div>
      </form>}
    </div>
  </section>;
}
