import { useEffect, useState } from "react";
import type { MailItem } from "@/lib/school/model";
import type { Gate } from "@/components/school/gate";
import { btnClass, inputClass } from "@/components/school/gate";
import { listMail, listNotifications, listNotificationRecipients, sendNotification } from "@/lib/school/api";
import { errText } from "@/components/school/gate";

export function MailView({ ws, flash }: Gate) {
  const [rows, setRows] = useState<MailItem[] | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; createdAt: string }> | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeRole, setNoticeRole] = useState("teacher");
  const [noticeUser, setNoticeUser] = useState("");
  const [recipients, setRecipients] = useState<Array<{ id: string; fullName: string; email: string; role: string }> | null>(null);
  useEffect(() => {
    listMail().then(setRows).catch((error) => flash(errText(error), true));
    listNotifications().then(setNotifications).catch(() => setNotifications([]));
    if (ws.me.role === "super_admin" || ws.me.isDeputy) listNotificationRecipients().then(setRecipients).catch(() => setRecipients([]));
  }, [flash, ws.me.role, ws.me.isDeputy]);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-3xl text-navy">Mail log</h1>
        <p className="max-w-2xl text-sm text-muted">Password email events are logged here for accountability. For security, temporary passwords are never saved in the mail log; Resend delivery status is shown when an admin issues a reset.</p>
      </header>
      {(ws.me.role === "super_admin" || ws.me.isDeputy) ? <form className="rounded-md border border-line bg-card p-4 space-y-3" onSubmit={async (event) => { event.preventDefault(); try { const result = await sendNotification({ data: { title: noticeTitle, body: noticeBody, toRole: noticeUser ? undefined : (noticeRole === "all" ? undefined : noticeRole), toUser: noticeUser || undefined } }); setNoticeTitle(""); setNoticeBody(""); setNoticeUser(""); flash(`Portal notification saved; ${result.emailSent} email(s) sent, ${result.emailFailed} failed. Check the sender domain and Resend delivery status.`); listNotifications().then(setNotifications); } catch (error) { flash(errText(error), true); } }}>
        <h2 className="font-serif text-xl text-navy">Send in-system notification</h2><p className="text-sm text-muted">Messages appear in the recipients' portal notification list. Email delivery is separate and still requires configured sender verification.</p>
        <input className={inputClass} value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="Message title" required maxLength={120} />
        <textarea className={inputClass + " h-24 py-2"} value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} placeholder="Write the message" required maxLength={4000} />
        <label className="block text-sm">Send to group
          <select className={inputClass + " mt-1"} value={noticeRole} onChange={(event) => { setNoticeRole(event.target.value); setNoticeUser(""); }}>
            <option value="all">All active members</option><option value="teacher">All teachers</option><option value="admin">All admins</option><option value="super_admin">Super admins</option><option value="student">All learners</option><option value="parent">All parents</option>
          </select>
        </label>
        <label className="block text-sm">Or send to one specific member
          <select className={inputClass + " mt-1"} value={noticeUser} onChange={(event) => setNoticeUser(event.target.value)}>
            <option value="">Use selected group above</option>{(recipients ?? []).map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.role} · {person.email}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted">The portal notification is saved and email is attempted automatically for every selected recipient. Email requires a valid RESEND_API_KEY and verified EMAIL_FROM domain.</p>
        <button className={btnClass} type="submit">Send notification</button>
      </form> : null}
      <section className="rounded-md border border-line bg-card p-4"><h2 className="font-serif text-xl text-navy">Portal notifications</h2>{notifications?.length ? <ul className="mt-2 space-y-3">{notifications.map((item) => <li key={item.id} className="border-t border-line pt-2"><p className="font-semibold">{item.title}</p><p className="whitespace-pre-wrap text-sm">{item.body}</p><p className="text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted">No notifications yet.</p>}</section>
      {!rows ? <p className="text-sm text-muted">Loading messages…</p> : null}
      {rows?.length === 0 ? <p className="text-sm text-muted">No messages yet. Reset a password from Staff.</p> : null}
      <ul className="space-y-3">
        {rows?.map((item) => (
          <li key={item.id} className="rounded-md border border-line bg-card p-4">
            <p className="text-sm font-semibold">{item.subject}</p>
            <p className="text-xs text-muted">To {item.toEmail}</p>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">{item.body}</pre>
            <a className="mt-3 inline-flex text-sm font-semibold text-info" href={`mailto:${encodeURIComponent(item.toEmail)}?subject=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.body)}`}>Open in email</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
