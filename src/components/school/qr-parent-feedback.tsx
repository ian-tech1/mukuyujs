import { useEffect, useState } from "react";
import { submitQrParentFeedback } from "@/lib/school/api";
import { btnClass, errText, inputClass } from "@/components/school/gate";

type FeedbackProps = { code: string; learnerName: string; gradeName: string; streamName: string; settings?: { recipientScope: "teacher" | "class_teacher" | "admin" | "super_admin"; allowTeacherSelection: boolean; autoreplyEnabled: boolean }; teachers?: Array<{ id: string; fullName: string; subjectName: string }> };
const welcomeLines = ["We value your voice in every learner’s journey.", "A thoughtful conversation helps us support each learner.", "Thank you for partnering with our teachers.", "Your message will reach the school team selected for this report."];

export function QrParentFeedback({ code, learnerName, gradeName, streamName, settings, teachers = [] }: FeedbackProps) {
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [welcomeIndex, setWelcomeIndex] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setWelcomeIndex((n) => (n + 1) % welcomeLines.length), 5500); return () => window.clearInterval(timer); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await submitQrParentFeedback({ data: { code, parentName, parentEmail, teacherUserId: teacherUserId || undefined, message, website } });
      setComplete(true); setParentName(""); setParentEmail(""); setMessage(""); setTeacherUserId("");
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
      {complete ? <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4" role="status"><strong className="text-emerald-900">Thank you — your message has been received.</strong><p className="mt-1 text-sm text-emerald-900">The learner and class details were attached automatically. {settings?.autoreplyEnabled ? "If you provided an email and school email delivery is configured, a receipt will be sent." : "The school team will review it."}</p><button type="button" className="mt-3 text-sm font-bold text-teal-900 underline" onClick={() => setComplete(false)}>Send another message</button></div> : <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-sm font-semibold text-navy">Your name<input className={inputClass + " mt-1 block w-full bg-white/90"} required minLength={2} maxLength={120} value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Parent or guardian name" /></label>
        <label className="text-sm font-semibold text-navy">Email for a reply <span className="font-normal text-muted">(optional)</span><input className={inputClass + " mt-1 block w-full bg-white/90"} type="email" maxLength={200} value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="you@example.com" /></label>
        {settings?.allowTeacherSelection && ["teacher", "class_teacher"].includes(settings.recipientScope) && <label className="text-sm font-semibold text-navy sm:col-span-2">Send to<select className={inputClass + " mt-1 block w-full bg-white/90"} value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)}><option value="">Class teacher / school team</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName} · {teacher.subjectName}</option>)}</select></label>}
        <label className="text-sm font-semibold text-navy sm:col-span-2">Your message<textarea className={inputClass + " mt-1 block min-h-32 w-full bg-white/90 py-2"} required minLength={4} maxLength={1500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share a question, observation, or note for the school team…" /><span className="mt-1 block text-right text-xs font-normal text-muted">{message.length}/1,500 characters</span></label>
        <label className="sr-only" aria-hidden="true">Leave this field empty<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        {error && <p className="text-sm font-semibold text-bad sm:col-span-2" role="alert">{error}</p>}
        <div className="sm:col-span-2"><button className={btnClass} type="submit" disabled={busy}>{busy ? "Sending securely…" : "Send message to school"}</button><p className="mt-2 text-xs text-muted">This message is linked only to this learner’s report. Do not include urgent or sensitive medical information.</p></div>
      </form>}
    </div>
  </section>;
}
