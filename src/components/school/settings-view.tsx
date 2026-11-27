import { useCallback, useEffect, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { btnDownload } from "@/components/school/download-button";
import type { AppearancePalette, Band, MarkControl, PortalBackdropThemeId, Profile } from "@/lib/school/model";
import { ACCESS_AREAS, ACCESS_GROUPS, canActorAccess, type AccessArea, type AccessGroup, type RoleAccessPolicy } from "@/lib/school/role-access";
import { DEFAULT_APPEARANCE, can, isAdmin } from "@/lib/school/model";
import { DEFAULT_WELCOME_DISPLAY, hexToRgba, normalizeWelcomeDisplay, type WelcomeDisplayOptions } from "@/lib/school/welcome-display";
import { applyPortalBackdropColors, DISPLAY_PALETTES, NATURE_BACKDROP_SCENE_LABELS, PORTAL_BACKDROP_THEMES } from "@/lib/school/display";
import { addExam, addSubject, deleteSubject, addYear, changePassword, deleteStream, deleteExam, deleteYear, exportParentContacts, exportSchoolBackup, getWelcomePage, getSuperAdminAppIcon, listBackupSnapshots, restoreSchoolBackup, saveAppearance, saveBands, saveExams, saveProfile, saveReportOptions, saveStream, saveSubjects, saveTermAssessments, saveTermDate, saveWelcomePage, saveSuperAdminAppIcon, setActivePeriod, getMarkAuditHistory, saveMarkControl, saveRoleAccessPolicy, getParentLoginAudit, getPortalColorTypes, savePortalColorType } from "@/lib/school/api";
import { DEFAULT_MUSIC_OPTIONS, formatPlaylistText, normalizeMusicOptions, parseMusicSetting, parsePlaylistText, type MusicOptions } from "@/lib/school/music";
import { MusicStudioCard } from "@/components/school/music-studio";
import { AdminAutomationCards } from "@/components/school/admin-automation-cards";
import { DEFAULT_ADMISSION_NUMBER_SETTINGS, formatAdmissionNumberExample, type AdmissionNumberSettings } from "@/lib/school/admission-number";
import { getAdmissionNumberSettings, saveAdmissionNumberSettings } from "@/lib/school/api";
import { MAX_GZIPPED_BACKUP_BYTES, MAX_WEB_BACKUP_JSON_BYTES } from "@/lib/school/backup-format";
import { isValidSchoolAppIconDataUrl, MAX_SCHOOL_APP_ICON_BYTES } from "@/lib/school/app-icon";

export function SettingsView({ ws, refresh, flash, beginActivity, onWelcomeChange }: Gate) {
  const canDownloadParentDetails = canActorAccess(ws.roleAccess, ws.me.role, "parentDetails", "download");
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-navy">Settings</h1>
        <p className="text-sm text-muted">Marks and learner records are stored by academic year and term and are not automatically deleted by this app. For protection against hosting or database failure, download and securely store periodic backups as well.</p>
        <p className="text-sm text-muted">{can(ws.me, "settings") ? "School identity, the printed report, streams, subjects, exams and the grading scale." : "Change the password for this account."}</p>
      </header>
      <PasswordCard flash={flash} />
      {isAdmin(ws.me.role) ? <section className="rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4">
        <h2 className="font-serif text-xl text-navy">School records backup</h2>
        <p className="mt-1 text-sm text-muted">This export includes private school and learner records, parent and guardian contact details, and support information. Passwords and password hashes are excluded. Downloads are available only when the Super Admin has enabled parent-detail downloads for your role.</p>
        {canDownloadParentDetails ? <button className={btnDownload.emerald + " mt-3"} type="button" onClick={async () => {
          try {
            const backup = await exportSchoolBackup();
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `mukuyu-school-backup-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
            flash("School records backup downloaded successfully. Store it somewhere private.");
          } catch (error) { flash(errText(error), true); }
        }}>Download school backup</button> : <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">School backup downloads are locked by the Super Admin because they contain parent and guardian details.</p>}
        {ws.me.role === "super_admin" ? <RestoreBackupPanel flash={flash} refresh={refresh} /> : null}
      </section> : null}
      {canDownloadParentDetails ? <ParentContactsExportCard flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <RoleAccessCard policy={ws.roleAccess} refresh={refresh} flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <ParentLoginAuditCard flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <AdmissionNumberFormatCard flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <WelcomePageCard flash={flash} refresh={refresh} beginActivity={beginActivity} onWelcomeChange={onWelcomeChange} /> : null}
      {ws.me.role === "super_admin" ? <AppIconCard flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <AppearanceColorsCard flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <AdminAutomationCards flash={flash} /> : null}
      {ws.me.role === "super_admin" ? <WhatsAppGroupCard profile={ws.profile} flash={flash} refresh={refresh} /> : null}
      {(ws.me.role === "super_admin" || ws.me.isDeputy) ? <ReportOptionsCard ws={ws} flash={flash} refresh={refresh} /> : null}
      {(ws.me.role === "super_admin" || ws.me.isDeputy) ? <MarkEntryControlsCard ws={ws} flash={flash} refresh={refresh} /> : null}
      {can(ws.me, "settings") ? (
        <>
          <ProfileCard profile={ws.profile} flash={flash} refresh={refresh} />
          <StreamsCard ws={ws} flash={flash} refresh={refresh} />
          <SubjectsCard ws={ws} flash={flash} refresh={refresh} />
          <ExamsCard ws={ws} flash={flash} refresh={refresh} />
          <TermCatsCard ws={ws} flash={flash} refresh={refresh} />
          <BandsCard bands={ws.bands} flash={flash} refresh={refresh} />
        </>
      ) : null}
      {can(ws.me, "calendar") ? <CalendarCard ws={ws} flash={flash} refresh={refresh} /> : null}
    </div>
  );
}

function ParentLoginAuditCard({ flash }: Pick<Gate, "flash">) {
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof getParentLoginAudit>> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setAudit(await getParentLoginAudit()); }
    catch (error) { flash(errText(error), true); }
    finally { setBusy(false); }
  }, [flash]);
  useEffect(() => { void load(); }, [load]);
  return <section className="space-y-4 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-indigo-50 p-5 shadow-card">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-800">Super Admin · parent access</p><h2 className="font-serif text-2xl text-navy">Successful parent logins</h2><p className="mt-1 text-sm text-muted">Each row is one email-verified sign-in. Parent name and phone are supplied by the parent; phone ownership is not verified, and the school should confirm guardianship separately where required.</p></div>
      <button className={btnGhost} type="button" onClick={() => void load()} disabled={busy}>{busy ? "Refreshing…" : "Refresh records"}</button>
    </div>
    {audit ? <>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-cyan-200 bg-white/80 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Email-verified sign-ins recorded</p><p className="mt-1 text-3xl font-bold text-navy">{audit.total}</p></div><div className="rounded-xl border border-indigo-200 bg-white/80 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Distinct parent email addresses</p><p className="mt-1 text-3xl font-bold text-navy">{audit.uniqueParents}</p></div></div>
      {audit.events.length ? <div className="space-y-2">{audit.events.map((event) => <article key={event.id} className="grid gap-1 rounded-xl border border-line bg-white/85 p-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr_1fr] sm:items-center">
        <div><p className="font-semibold text-navy">{event.parentName}</p><p className="break-all text-xs text-muted">{event.parentEmail}</p></div>
        <p><span className="font-semibold sm:hidden">Phone entered: </span>{event.parentPhone || "No phone supplied"}</p>
        <p><span className="font-semibold sm:hidden">Learner: </span>{event.learnerName}</p>
        <time className="text-xs text-muted" dateTime={event.loggedInAt}>{new Date(event.loggedInAt).toLocaleString()}</time>
      </article>)}</div> : <p className="rounded-xl border border-dashed border-line bg-white/70 p-5 text-center text-sm text-muted">No successful parent sign-ins have been recorded yet.</p>}
      {audit.total > audit.events.length ? <p className="text-xs text-muted">Showing the latest {audit.events.length} of {audit.total} recorded sign-ins.</p> : null}
    </> : <p className="rounded-xl border border-dashed border-line bg-white/70 p-5 text-sm text-muted">{busy ? "Loading parent access records…" : "Parent access records are not available."}</p>}
  </section>;
}


function ParentContactsExportCard({ flash }: Pick<Gate, "flash">) {
  const [busy, setBusy] = useState(false);
  return <section className="space-y-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-card">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">Restricted data · role permission required</p><h2 className="font-serif text-2xl text-navy">Parent contact details</h2><p className="mt-1 text-sm text-muted">Download registered parent names, email addresses, linked learner names, account status, and the latest parent-entered contact number when available. Phone numbers have not been verified. The Super Admin controls which staff roles can download this file.</p></div>
    <button className={btnDownload.emerald} type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const contacts = await exportParentContacts();
        const rows = [
          ["Parent name", "Parent email", "Linked learner(s)", "Contact phone (parent-entered, not verified)", "Account active", "Last email-verified portal login"],
          ...contacts.map((contact) => [contact.parentName, contact.parentEmail, contact.learnerNames, contact.phoneEntered || "", contact.active ? "Yes" : "No", contact.lastVerifiedLogin || ""]),
        ];
        const csvCell = (value: string) => {
          const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
          return `"${safe.replace(/"/g, '""')}"`;
        };
        const blob = new Blob(["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `mukuyu-parent-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        flash(`Downloaded ${contacts.length} parent contact records. Store the file securely.`);
      } catch (error) { flash(errText(error), true); }
      finally { setBusy(false); }
    }}>{busy ? "Preparing secure download…" : "Download parent contacts (CSV)"}</button>
  </section>;
}

function RoleAccessCard({ policy, refresh, flash }: { policy: RoleAccessPolicy; refresh: Gate["refresh"]; flash: Gate["flash"] }) {
  const [draft, setDraft] = useState<RoleAccessPolicy>(policy);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(policy), [policy]);
  const labels: Record<AccessGroup, string> = { admin: "Admin", teacher: "Teacher", parent: "Parent", student: "Student", qr_guest: "Public QR report" };
  const areaLabels: Record<AccessArea, string> = { reports: "Report cards", analysis: "Analysis", marklists: "Mark lists", familyResults: "Linked family results", parentDetails: "Parent contact details" };
  const matrixGroups = ACCESS_GROUPS.filter((group) => group !== "qr_guest");
  const qrViewingUnlocked = draft.qr_guest.reports.view;
  function update(group: AccessGroup, area: AccessArea, action: "view" | "download", checked: boolean) {
    if (area === "parentDetails" && group !== "admin" && group !== "teacher") return;
    setDraft((current) => ({ ...current, [group]: { ...current[group], [area]: { ...current[group][area], [action]: checked, ...(action === "view" && !checked ? { download: false } : {}) } } }));
  }
  return <section className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-5 shadow-card space-y-4">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-800">Super Admin · access policy</p><h2 className="font-serif text-2xl text-navy">Role-group viewing and downloads</h2><p className="mt-1 text-sm text-muted">Allow or lock viewing and downloads separately for report cards, analysis, mark lists, linked family results, and sensitive parent contact details. Parent-detail access is off by default and can only be granted to Admin or Teacher roles. Super Admin always retains access.</p></div>
    <div className="rounded-xl border-2 border-sky-200 bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold text-navy">Public report-card QR links</h3><p className="mt-1 text-sm text-muted">Tick exactly one option. This controls whether families can open a report using its QR code or link.</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold tracking-wide ${qrViewingUnlocked ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>Currently {qrViewingUnlocked ? "UNLOCKED" : "LOCKED"}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 ${!qrViewingUnlocked ? "border-rose-400 bg-rose-50" : "border-line bg-white"}`}>
          <input className="mt-1 size-5 accent-rose-700" type="checkbox" checked={!qrViewingUnlocked} onChange={(event) => update("qr_guest", "reports", "view", !event.target.checked)} aria-label="Tick to lock public report QR viewing" />
          <span><strong className="block text-sm text-rose-800">Tick to LOCK</strong><span className="text-xs text-muted">Block public QR links from opening report cards.</span></span>
        </label>
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 ${qrViewingUnlocked ? "border-emerald-400 bg-emerald-50" : "border-line bg-white"}`}>
          <input className="mt-1 size-5 accent-emerald-700" type="checkbox" checked={qrViewingUnlocked} onChange={(event) => update("qr_guest", "reports", "view", event.target.checked)} aria-label="Tick to unlock public report QR viewing" />
          <span><strong className="block text-sm text-emerald-800">Tick to UNLOCK</strong><span className="text-xs text-muted">Allow valid learner QR links and codes to open reports.</span></span>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">Your selection is applied only after you press “Save role access controls.” The lock is checked by the server; it does not delete report cards or learner codes.</p>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-sm"><thead><tr className="border-b border-line text-left"><th className="p-2">Group</th>{ACCESS_AREAS.map((area) => <th key={area} className="p-2">{areaLabels[area]}<div className="mt-1 flex gap-3 text-xs font-normal"><span>View</span><span>Download</span></div></th>)}</tr></thead><tbody>{matrixGroups.map((group) => <tr key={group} className="border-b border-line/70"><th className="p-2 text-left">{labels[group]}</th>{ACCESS_AREAS.map((area) => <td key={area} className="p-2"><div className="flex gap-4"><label className="inline-flex items-center gap-1" title={`Allow ${labels[group]} to view ${areaLabels[area]}`}><input type="checkbox" checked={draft[group][area].view} disabled={area === "parentDetails" && group !== "admin" && group !== "teacher"} onChange={(event) => update(group, area, "view", event.target.checked)} aria-label={`${labels[group]} ${areaLabels[area]} view`} />On</label><label className="inline-flex items-center gap-1" title={`Allow ${labels[group]} to download ${areaLabels[area]}`}><input type="checkbox" checked={draft[group][area].download} disabled={!draft[group][area].view || (area === "parentDetails" && group !== "admin" && group !== "teacher")} onChange={(event) => update(group, area, "download", event.target.checked)} aria-label={`${labels[group]} ${areaLabels[area]} download`} />On</label></div></td>)}</tr>)}</tbody></table></div>
    <p className="rounded-lg border border-amber-200 bg-white/70 p-3 text-xs text-muted">Parent contact downloads and full school-backup exports are checked by the server against this permission. Parent-contact CSV downloads are also recorded in the school audit log. Download locks cannot prevent screenshots. The public QR control above is enforced by the server.</p>
    <button className={btnClass} type="button" disabled={busy} onClick={async () => { setBusy(true); try { const saved = await saveRoleAccessPolicy({ data: { policy: draft } }); setDraft(saved); await refresh(); flash(`Role access controls saved. Public QR report viewing is ${saved.qr_guest.reports.view ? "UNLOCKED" : "LOCKED"}.`); } catch (error) { flash(errText(error), true); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Save role access controls"}</button>
  </section>;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32_768, bytes.length)));
  }
  return btoa(binary);
}

function RestoreBackupPanel({ flash, refresh }: Pick<Gate, "flash" | "refresh">) {
  const [payload, setPayload] = useState("");
  const [compressedBackup, setCompressedBackup] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="mt-4 border-t border-line pt-4 space-y-3">
    <h3 className="font-semibold text-navy">Restore from JSON or compressed JSON backup</h3>
    <p className="text-sm text-muted">Super admin only. You can select a plain .json file or the smaller .json.gz attachment from a backup email. The system first stores a safety snapshot in the database, then merges the backup's records. It does not delete newer records or restore account passwords. Keep a separate Neon backup before doing this.</p>
    <input className="block text-sm" type="file" accept="application/json,.json,application/gzip,.gz,.json.gz" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ""; if (!file) return; setPayload(""); setCompressedBackup(false); const isGzip = file.name.toLowerCase().endsWith(".gz") || file.type === "application/gzip"; if (isGzip && file.size > MAX_GZIPPED_BACKUP_BYTES) { flash("Compressed backup must be 2.8 MB or smaller for web restore.", true); return; } if (!isGzip && file.size > MAX_WEB_BACKUP_JSON_BYTES) { flash("JSON backup must be 4 MB or smaller for web restore; use its .json.gz version or a database-level restore for larger files.", true); return; } try { if (isGzip) { setPayload(arrayBufferToBase64(await file.arrayBuffer())); setCompressedBackup(true); flash("Compressed backup loaded. Type RESTORE only when you are ready."); } else { setPayload(await file.text()); flash("Backup loaded. Type RESTORE only when you are ready."); } } catch (error) { flash(errText(error), true); } }} />
    <label className="block text-sm">Type RESTORE to confirm<input className={inputClass + " mt-1 max-w-xs"} value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="RESTORE" /></label>
    <button className="inline-flex h-11 items-center justify-center rounded-md border border-bad/40 px-4 text-sm font-semibold text-bad disabled:opacity-50" type="button" disabled={!payload || confirmText !== "RESTORE" || busy} onClick={async () => { if (!confirm("Restore the uploaded backup into this database? A safety snapshot will be saved first.")) return; setBusy(true); try { const result = await restoreSchoolBackup({ data: { payload, confirm: confirmText, ...(compressedBackup ? { compression: "gzip-base64" as const } : {}) } }); flash(`Restore merged ${result.restored.learners} learners and ${result.restored.marks} marks. ${result.note}`); setPayload(""); setCompressedBackup(false); setConfirmText(""); await refresh(); } catch (error) { flash(errText(error), true); } finally { setBusy(false); } }}>{busy ? "Restoring…" : "Restore backup (merge records)"}</button>
    <button className={btnDownload.violet} type="button" onClick={async () => { try { const snapshots = await listBackupSnapshots(); if (!snapshots.length) { flash("No restore safety snapshots have been saved yet."); return; } const blob = new Blob([snapshots[0].payload], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `mukuyu-safety-snapshot-${new Date(snapshots[0].createdAt).toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url); flash("Latest safety snapshot downloaded."); } catch (error) { flash(errText(error), true); } }}>Download latest safety snapshot</button>
  </div>;
}

function AdmissionNumberFormatCard({ flash }: Pick<Gate, "flash">) {
  const [settings, setSettings] = useState<AdmissionNumberSettings>(DEFAULT_ADMISSION_NUMBER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getAdmissionNumberSettings().then((value) => {
      setSettings(value);
      setLoaded(true);
    }).catch((error) => flash(errText(error), true));
  }, [flash]);
  const example = formatAdmissionNumberExample(settings);
  return <form className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-5 shadow-card space-y-3" onSubmit={async (event) => {
    event.preventDefault();
    try {
      const saved = await saveAdmissionNumberSettings({ data: settings });
      setSettings(saved);
      flash("Admission-number appearance saved for newly added learners. Existing numbers were not changed.");
    } catch (error) { flash(errText(error), true); }
  }}>
    <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-800">Super admin · learner identity</p>
    <h2 className="font-serif text-2xl text-navy">Admission-number appearance</h2>
    <p className="text-sm text-muted">Set the format used when the portal automatically assigns a number to a new learner. Existing admission numbers are never rewritten by this setting.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Prefix (1–12 letters or numbers)
        <input className={inputClass + " mt-1"} value={settings.prefix} onChange={(event) => setSettings({ ...settings, prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} pattern="[A-Za-z0-9]{1,12}" maxLength={12} required />
      </label>
      <label className="block text-sm font-semibold">Number section width
        <select className={inputClass + " mt-1"} value={settings.numberDigits} onChange={(event) => setSettings({ ...settings, numberDigits: Number(event.target.value) })}>
          {[4, 5, 6, 7, 8].map((digits) => <option key={digits} value={digits}>{digits} digits</option>)}
        </select>
      </label>
    </div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={settings.includeYear} onChange={(event) => setSettings({ ...settings, includeYear: event.target.checked })} /><span>Include the current calendar year as a separate section</span></label>
    <div className="rounded-xl border border-violet-200 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live example for a new learner</p>
      <p className="mt-1 font-mono text-xl font-bold tracking-wide text-navy" aria-live="polite">{example}</p>
      <p className="mt-1 text-xs text-muted">The final number is randomly generated and checked for uniqueness; it is not a sequential count.</p>
    </div>
    <button className={btnClass} type="submit" disabled={!loaded}>Save admission-number format</button>
  </form>;
}

function AppIconCard({ flash }: Pick<Gate, "flash">) {
  const [iconData, setIconData] = useState("");
  const [savedIconData, setSavedIconData] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getSuperAdminAppIcon()
      .then(({ appIconData }) => {
        if (!active) return;
        setIconData(appIconData);
        setSavedIconData(appIconData);
      })
      .catch((error) => {
        if (active) flash(errText(error), true);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, [flash]);

  function uploadAppIcon(file?: File) {
    if (!file) return;
    if (file.type !== "image/png") {
      flash("Choose a PNG file for the school app icon.", true);
      return;
    }
    if (file.size > MAX_SCHOOL_APP_ICON_BYTES) {
      flash("Use an app icon no larger than 250 KB.", true);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => flash("The selected app icon could not be read.", true);
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!isValidSchoolAppIconDataUrl(dataUrl)) {
        flash("Choose a valid square 512 × 512 PNG app icon no larger than 250 KB.", true);
        return;
      }
      const image = new Image();
      image.onerror = () => flash("The selected PNG could not be decoded as an image.", true);
      image.onload = () => {
        if (image.naturalWidth !== 512 || image.naturalHeight !== 512) {
          flash("App icons must be exactly 512 × 512 pixels.", true);
          return;
        }
        setIconData(dataUrl);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function saveAppIcon(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidSchoolAppIconDataUrl(iconData)) {
      flash("Choose a valid 512 × 512 PNG app icon no larger than 250 KB.", true);
      return;
    }
    setSaving(true);
    try {
      await saveSuperAdminAppIcon({ data: { appIconData: iconData } });
      setSavedIconData(iconData);
      const iconUrl = `/__grok/school-app-icon.png?v=${Date.now()}`;
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
        link.href = iconUrl;
      });
      flash(iconData ? "School app icon saved. New installs will use it." : "Redesigned default app icon restored.");
    } catch (error) {
      flash(errText(error), true);
    } finally {
      setSaving(false);
    }
  }

  return <form className="space-y-3 rounded-md border border-line bg-card p-4" onSubmit={saveAppIcon}>
    <h2 className="font-serif text-xl text-navy">School app icon</h2>
    <p className="text-sm text-muted">Super Admin only. This icon is separate from the welcome-page and school-profile logos. It is used for the browser tab and app install; the redesigned default icon stays active until you save a custom one.</p>
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-paper p-3">
      <img src={iconData || "/icons/mukuyu-app-512.png?v=5"} alt={iconData ? "Custom school app icon preview" : "Redesigned default school app icon preview"} width={112} height={112} className="size-28 rounded-2xl border border-line bg-white object-contain shadow-sm" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-navy">{iconData ? "Custom app icon preview" : "Redesigned default icon"}</p>
        <p className="mt-1 text-xs text-muted">Upload a square 512 × 512 PNG, up to 250 KB. Your selection is only published when you save.</p>
        {iconData ? <button className={btnGhost + " mt-2"} type="button" onClick={() => setIconData("")}>Use redesigned default icon</button> : null}
      </div>
    </div>
    <label className="block text-sm">Upload custom app icon<input className="mt-2 block w-full text-sm" type="file" accept="image/png,.png" onChange={(event) => { uploadAppIcon(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
    <button className={btnClass} type="submit" disabled={!loaded || saving || iconData === savedIconData}>{saving ? "Saving app icon…" : "Save app icon"}</button>
  </form>;
}

type WelcomeForm = { title: string; subtitle: string; announcement: string; contact: string; logoData: string; backgroundStart: string; backgroundEnd: string; titleSize: number; fontFamily: string; animationStyle: string; animated: boolean; musicEnabled: boolean; musicUrl: string; highlights: string; certification: string; footerText: string; paragraphColoursEnabled: boolean; paragraphColourInterval: number; splashDurationSeconds: number; portalBackgroundDurationSeconds: number; display: WelcomeDisplayOptions };

function WelcomePageCard({ flash, refresh, beginActivity, onWelcomeChange }: Pick<Gate, "flash" | "refresh" | "beginActivity" | "onWelcomeChange">) {
  const [form, setForm] = useState<WelcomeForm>({ title: "Mukuyu Junior School", subtitle: "Learner Progress Portal", announcement: "", contact: "", logoData: "", backgroundStart: "#0e2a4a", backgroundEnd: "#245b82", titleSize: 48, fontFamily: "serif", animationStyle: "aurora", animated: true, musicEnabled: false, musicUrl: "", highlights: "", certification: "© 2026 Certified", footerText: "", paragraphColoursEnabled: true, paragraphColourInterval: 4, splashDurationSeconds: 10, portalBackgroundDurationSeconds: 30, display: DEFAULT_WELCOME_DISPLAY });
  const [loaded, setLoaded] = useState(false);
  const [playlistText, setPlaylistText] = useState("");
  const [musicGenre, setMusicGenre] = useState("Mixed");
  const [musicOptions, setMusicOptions] = useState<MusicOptions>(DEFAULT_MUSIC_OPTIONS);
  const [automaticMusic, setAutomaticMusic] = useState(false);
  useEffect(() => {
    getWelcomePage().then((data) => {
      setForm({ title: data.title, subtitle: data.subtitle, announcement: data.announcement, contact: data.contact, logoData: data.logoData || "", backgroundStart: data.backgroundStart || "#0e2a4a", backgroundEnd: data.backgroundEnd || "#245b82", titleSize: data.titleSize || 48, fontFamily: data.fontFamily || "serif", animationStyle: data.animationStyle || "aurora", animated: data.animated ?? true, musicEnabled: data.musicEnabled ?? false, musicUrl: data.musicUrl || "", highlights: data.highlights || "", certification: data.certification || "© 2026 Certified", footerText: data.footerText || "", paragraphColoursEnabled: data.paragraphColoursEnabled ?? true, paragraphColourInterval: data.paragraphColourInterval || 4, splashDurationSeconds: Math.max(5, Math.min(30, data.splashDurationSeconds || 10)), portalBackgroundDurationSeconds: Math.max(5, Math.min(60, data.portalBackgroundDurationSeconds || 30)), display: normalizeWelcomeDisplay(data.display) });
      const savedMusic = parseMusicSetting(data.musicUrl || "");
      setPlaylistText(savedMusic.isPlaylist ? formatPlaylistText(savedMusic.tracks) : "");
      setMusicGenre(savedMusic.genre);
      setMusicOptions(normalizeMusicOptions(savedMusic.options));
      setAutomaticMusic(savedMusic.autoSearch);
      setLoaded(true);
    }).catch((error) => flash(errText(error), true));
  }, [flash]);
  function updateDisplay(patch: Partial<WelcomeDisplayOptions>) {
    setForm((current) => ({ ...current, display: { ...current.display, ...patch } }));
  }
  function uploadLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { flash("Choose an image file for the welcome logo.", true); return; }
    if (file.size > 250000) { flash("Use a logo smaller than 250 KB.", true); return; }
    const reader = new FileReader(); reader.onload = () => setForm((current) => ({ ...current, logoData: String(reader.result || "") })); reader.readAsDataURL(file);
  }
  return <form className="rounded-md border border-line bg-card p-4 space-y-3" onSubmit={async (event) => {
    event.preventDefault();
    let finishActivity: ((finishedMessage?: string) => void) | undefined;
    try {
      const tracks = parsePlaylistText(playlistText, musicGenre);
      const finalTracks = tracks.length ? tracks : (form.musicUrl && !form.musicUrl.startsWith("{") ? [{ title: "Selected audio", genre: musicGenre, url: form.musicUrl }] : []);
      const musicUrl = automaticMusic ? JSON.stringify({ kind: "mukuyu-auto-music", genre: musicGenre, options: musicOptions }) : finalTracks.length ? JSON.stringify({ kind: "mukuyu-playlist", genre: musicGenre, tracks: finalTracks, options: musicOptions }) : (form.musicUrl.startsWith("{") ? "" : form.musicUrl);
      finishActivity = beginActivity?.("Welcome page is being published…");
      await saveWelcomePage({ data: { ...form, musicUrl } });
      const latest = await getWelcomePage();
      finishActivity?.("Welcome page published for the whole school.");
      onWelcomeChange?.({ enabled: Boolean(latest.musicEnabled), url: latest.musicUrl || "" });
      flash("Welcome page published for the whole school.");
      await refresh();
    } catch (error) {
      finishActivity?.();
      flash(errText(error), true);
    }
  }}>
    <h2 className="font-serif text-xl text-navy">Welcome screen designer</h2>
    <p className="text-sm text-muted">Super Admin only. Changes are saved centrally and appear to everyone who opens the site.</p>
    <label className="block text-sm">Page title<input className={inputClass + " mt-1"} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required maxLength={100} /></label>
    <label className="block text-sm">Subtitle<input className={inputClass + " mt-1"} value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} maxLength={160} /></label>
    <label className="block text-sm">Announcement<textarea className={inputClass + " mt-1 h-24 py-2"} value={form.announcement} onChange={(event) => setForm({ ...form, announcement: event.target.value })} maxLength={2000} /></label>
    <label className="block text-sm">Additional welcome-page details / highlights<textarea className={inputClass + " mt-1 h-24 py-2"} value={form.highlights} onChange={(event) => setForm({ ...form, highlights: event.target.value })} maxLength={3000} /></label>
    <label className="block text-sm">Certification message<input className={inputClass + " mt-1"} value={form.certification} onChange={(event) => setForm({ ...form, certification: event.target.value })} maxLength={200} /></label>
    <label className="block text-sm">Footer details<input className={inputClass + " mt-1"} value={form.footerText} onChange={(event) => setForm({ ...form, footerText: event.target.value })} maxLength={1000} /></label>
    <label className="block text-sm">Public contact details<input className={inputClass + " mt-1"} value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} maxLength={200} /></label>
    <label className="block text-sm">Welcome screen logo <span className="text-muted">(image up to 250 KB)</span><input className="mt-2 block w-full text-sm" type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} /></label>
    {form.logoData ? <div className="flex items-center gap-3"><img src={form.logoData} alt="Welcome logo preview" className="size-16 rounded-full bg-white object-contain p-1"/><button className={btnGhost} type="button" onClick={() => setForm({ ...form, logoData: "" })}>Use default logo</button></div> : null}
    <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-3 text-sm">Background colour 1<input type="color" value={form.backgroundStart} onChange={(event) => setForm({ ...form, backgroundStart: event.target.value })} /></label><label className="flex items-center gap-3 text-sm">Background colour 2<input type="color" value={form.backgroundEnd} onChange={(event) => setForm({ ...form, backgroundEnd: event.target.value })} /></label></div>
    <label className="block text-sm">Splash display duration: {form.splashDurationSeconds} seconds<input className="mt-2 w-full" type="range" min={5} max={30} step={1} value={form.splashDurationSeconds} onChange={(event) => setForm({ ...form, splashDurationSeconds: Number(event.target.value) })} /><span className="mt-1 block text-xs text-muted">The sign-in splash appears for 10 seconds by default (adjustable from 5–30 seconds). Visitors can still continue to sign in immediately.</span></label>
    <label className="block text-sm">Portal section background duration: {form.portalBackgroundDurationSeconds} seconds<input className="mt-2 w-full" type="range" min={5} max={60} step={1} value={form.portalBackgroundDurationSeconds} onChange={(event) => setForm({ ...form, portalBackgroundDurationSeconds: Number(event.target.value) })} /><span className="mt-1 block text-xs text-muted">When animated portal backgrounds are enabled, each section background stays visible for this long before the next scene appears. The default is now 30 seconds. The mobile portal remains still.</span></label>
    <label className="block text-sm">Title font size: {form.titleSize}px<input className="mt-2 w-full" type="range" min={28} max={72} step={2} value={form.titleSize} onChange={(event) => setForm({ ...form, titleSize: Number(event.target.value) })} /></label>
    <label className="block text-sm">Font type<select className={inputClass + " mt-1"} value={(form as any).fontFamily || "serif"} onChange={(event) => setForm({ ...form, fontFamily: event.target.value } as any)}>
      <option value="serif">Serif (classic)</option>
      <option value="sans-serif">Sans-serif (modern)</option>
      <option value="Georgia, serif">Georgia</option>
      <option value="Inter, system-ui, sans-serif">Inter / System</option>
      <option value="monospace">Monospace</option>
    </select></label>
    <section className="rounded-lg border border-line bg-paper p-3 space-y-3"><div><h3 className="font-semibold text-navy">Automatic paragraph colours</h3><p className="mt-1 text-xs text-muted">Each announcement and highlights paragraph gets its own colour and automatically changes to the next colour while the welcome page is open.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.paragraphColoursEnabled} onChange={(event) => setForm({ ...form, paragraphColoursEnabled: event.target.checked })} /> Automatically cycle each paragraph colour</label><label className="block text-sm">Change every {form.paragraphColourInterval} seconds<input className="mt-2 w-full" type="range" min={2} max={30} step={1} value={form.paragraphColourInterval} onChange={(event) => setForm({ ...form, paragraphColourInterval: Number(event.target.value) })} /></label></section>
    <label className="block text-sm">Animation style<select className={inputClass + " mt-1"} value={form.animationStyle} onChange={(event) => setForm({ ...form, animationStyle: event.target.value })}><option value="aurora">Aurora gradient</option><option value="ribbons">Moving ribbons</option><option value="pulse">Colour pulse</option><option value="none">Static</option></select></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.animated} onChange={(event) => setForm({ ...form, animated: event.target.checked })} /> Use animated welcome colours</label>
    <WelcomeDisplayControls value={form.display} onChange={updateDisplay} />
    <div className={`overflow-hidden rounded-lg p-4 text-white ${form.display.contentAlignment === "center" ? "text-center" : "text-left"}`} style={{ backgroundImage: `linear-gradient(${form.display.gradientAngle}deg, ${hexToRgba(form.display.accentAltColor, 0.18)}, transparent 70%), linear-gradient(${form.display.gradientAngle}deg, ${form.backgroundStart}, ${form.backgroundEnd})`, backgroundSize: form.animated ? "200% 200%" : "100% 100%", maxWidth: form.display.contentWidth === "narrow" ? "28rem" : form.display.contentWidth === "wide" ? "48rem" : "36rem", marginInline: form.display.contentAlignment === "center" ? "auto" : undefined }}><p className="text-xs uppercase tracking-widest" style={{ color: form.display.eyebrowColor }}>Live preview · {form.display.showRibbons ? "ribbons on" : "ribbons off"}</p><p className="mt-2 font-serif font-bold" style={{ fontSize: `${Math.min(form.titleSize, 40)}px`, color: form.display.titleColor, letterSpacing: `${form.display.titleLetterSpacing}em`, textShadow: form.display.titleShadow ? "0 3px 22px rgba(4,16,35,.42)" : "none" }}>{form.title || "School title"}</p><p className="mt-1 text-sm" style={{ color: form.display.subtitleColor }}>{form.subtitle}</p><p className="mt-3 text-sm" style={{ color: form.display.bodyTextColor }}>Your welcome-page colours and layout preview.</p><span className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold text-navy" style={{ backgroundColor: form.display.accentColor }}>School accent</span><span className="ml-2 mt-3 inline-block rounded-lg px-3 py-2 text-xs font-semibold text-navy" style={{ backgroundColor: hexToRgba(form.display.panelColor, form.display.panelOpacity) }}>Sign-in panel sample</span></div>
    <MusicStudioCard musicEnabled={form.musicEnabled} musicUrl={form.musicUrl} automaticMusic={automaticMusic} setAutomaticMusic={setAutomaticMusic} onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))} playlistText={playlistText} setPlaylistText={setPlaylistText} musicGenre={musicGenre} setMusicGenre={setMusicGenre} musicOptions={musicOptions} setMusicOptions={setMusicOptions} flash={flash} />
    <button className={btnClass} type="submit" disabled={!loaded}>Publish welcome design</button>
  </form>;
}

function WelcomeDisplayControls({ value, onChange }: { value: WelcomeDisplayOptions; onChange: (patch: Partial<WelcomeDisplayOptions>) => void }) {
  const colorControls: Array<[keyof Pick<WelcomeDisplayOptions, "titleColor" | "subtitleColor" | "eyebrowColor" | "bodyTextColor" | "accentColor" | "accentAltColor" | "panelColor">, string]> = [
    ["titleColor", "Title colour"], ["subtitleColor", "Subtitle colour"], ["eyebrowColor", "Top label colour"], ["bodyTextColor", "Paragraph colour when auto-cycling is off"], ["accentColor", "Primary accent colour"], ["accentAltColor", "Secondary accent colour"], ["panelColor", "Sign-in panel colour"],
  ];
  return <section className="space-y-3 rounded-lg border border-line bg-paper p-3" aria-labelledby="welcome-display-controls-title">
    <div><h3 id="welcome-display-controls-title" className="font-semibold text-navy">16 welcome and dashboard display and colour controls</h3><p className="mt-1 text-xs text-muted">These saved controls apply to the public welcome screen for everyone. Use the preview below before publishing.</p></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{colorControls.map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-lg border border-line bg-card p-2 text-xs font-semibold">{label}<input className="ml-auto h-9 w-11 cursor-pointer rounded border-0 bg-transparent p-0" type="color" value={value[key]} onChange={(event) => onChange({ [key]: event.target.value })} /></label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Sign-in panel opacity · {Math.round(value.panelOpacity * 100)}%<input className="mt-2 w-full" type="range" min={0.55} max={1} step={0.01} value={value.panelOpacity} onChange={(event) => onChange({ panelOpacity: Number(event.target.value) })} /></label>
      <label className="block text-sm">Gradient angle · {value.gradientAngle}°<input className="mt-2 w-full" type="range" min={0} max={360} step={5} value={value.gradientAngle} onChange={(event) => onChange({ gradientAngle: Number(event.target.value) })} /></label>
      <label className="block text-sm">Welcome content alignment<select className={inputClass + " mt-1"} value={value.contentAlignment} onChange={(event) => onChange({ contentAlignment: event.target.value as WelcomeDisplayOptions["contentAlignment"] })}><option value="left">Left aligned</option><option value="center">Centered</option></select></label>
      <label className="block text-sm">Welcome content width<select className={inputClass + " mt-1"} value={value.contentWidth} onChange={(event) => onChange({ contentWidth: event.target.value as WelcomeDisplayOptions["contentWidth"] })}><option value="narrow">Narrow</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
      <label className="block text-sm">Title letter spacing · {value.titleLetterSpacing.toFixed(2)}em<input className="mt-2 w-full" type="range" min={-0.08} max={0.12} step={0.005} value={value.titleLetterSpacing} onChange={(event) => onChange({ titleLetterSpacing: Number(event.target.value) })} /></label>
      <div className="space-y-2 pt-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.titleShadow} onChange={(event) => onChange({ titleShadow: event.target.checked })} /> Add shadow behind the main title</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.showRibbons} onChange={(event) => onChange({ showRibbons: event.target.checked })} /> Show decorative colour ribbons</label></div>
    </div>
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-semibold text-navy">Animated wording panels</p><p className="mt-1 text-xs text-muted">Show or hide the 1.8-second mixed-colour rectangles around welcome and sign-in wording. Text and login fields remain available. Publish the welcome design to save the choice.</p></div>
      <button type="button" className={`welcome-word-panels-toggle ${value.animatedWordingPanels ? "is-enabled" : ""}`} aria-pressed={value.animatedWordingPanels} onClick={() => onChange({ animatedWordingPanels: !value.animatedWordingPanels })}>Welcome wording panels: {value.animatedWordingPanels ? "ON" : "OFF"}</button>
    </div>
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-semibold text-navy">Dashboard panel colour motion</p><p className="mt-1 text-xs text-muted">Cycle the large content cards in Overview, Learners, Enter marks and other dashboard sections through very light colours. Text, tables, inputs and controls are left alone. Staff can also turn motion off in Display settings.</p></div>
      <button type="button" className={`welcome-word-panels-toggle ${value.dashboardPanelColorsEnabled ? "is-enabled" : ""}`} aria-pressed={value.dashboardPanelColorsEnabled} onClick={() => onChange({ dashboardPanelColorsEnabled: !value.dashboardPanelColorsEnabled })}>Dashboard panel colours: {value.dashboardPanelColorsEnabled ? "ON" : "OFF"}</button>
    </div>
  </section>;
}

const APPEARANCE_LABELS: Array<{ key: "navy" | "info" | "brass" | "good"; label: string; description: string }> = [
  { key: "navy", label: "Backdrop glow 1", description: "Decorative canvas only" },
  { key: "info", label: "Backdrop glow 2", description: "Decorative canvas only" },
  { key: "brass", label: "Backdrop glow 3", description: "Decorative canvas only" },
  { key: "good", label: "Backdrop glow 4", description: "Decorative canvas only" },
];

function applyAppearance(colors: AppearancePalette) {
  if (typeof document === "undefined") return;
  applyPortalBackdropColors(colors);
  document.documentElement.dataset.schoolAppearance = JSON.stringify(colors);
  document.documentElement.dataset.portalTextContrast = colors.autoTextContrast === false ? "off" : "on";
  document.documentElement.dataset.portalTextCycle = colors.textColorCycle === false ? "off" : "on";
}

function AppearanceColorsCard({ flash }: Pick<Gate, "flash">) {
  const [colors, setColors] = useState<AppearancePalette>(DEFAULT_APPEARANCE);
  const [loaded, setLoaded] = useState(false);
  const [savedTypes, setSavedTypes] = useState<Awaited<ReturnType<typeof getPortalColorTypes>>>([]);
  const [colorTypeName, setColorTypeName] = useState("");
  const [textSettingsSaving, setTextSettingsSaving] = useState(false);

  useEffect(() => {
    getWelcomePage().then((settings) => {
      const next = { ...DEFAULT_APPEARANCE, ...(settings.appearance || {}), backdropTheme: settings.appearance?.backdropTheme || "auto-sections" } as AppearancePalette;
      setColors(next);
      applyAppearance(next);
      setLoaded(true);
    }).catch(() => {
      applyAppearance({ ...DEFAULT_APPEARANCE, backdropTheme: "auto-sections" });
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    getPortalColorTypes().then(setSavedTypes).catch((error) => flash(errText(error), true));
  }, [flash]);

  function updateColor(key: "navy" | "info" | "brass" | "good", value: string) {
    const next = { ...colors, [key]: value };
    setColors(next);
    applyAppearance(next);
  }

  async function updateTextOption(key: "autoTextContrast" | "textColorCycle", value: boolean) {
    const previous = colors;
    const next: AppearancePalette = {
      ...colors,
      [key]: value,
      ...(key === "autoTextContrast" && !value ? { textColorCycle: false } : {}),
    };
    setColors(next);
    applyAppearance(next);
    setTextSettingsSaving(true);
    try {
      await saveAppearance({ data: { appearance: next } });
      flash(key === "autoTextContrast"
        ? `Automatic text contrast ${value ? "enabled" : "disabled"} school-wide.`
        : `One-second title and message colour cycling ${value ? "enabled" : "disabled"} school-wide.`);
    } catch (error) {
      setColors(previous);
      applyAppearance(previous);
      flash(errText(error), true);
    } finally {
      setTextSettingsSaving(false);
    }
  }

  async function saveColors() {
    try {
      await saveAppearance({ data: { appearance: colors } });
      flash("Backdrop colours saved for the whole school. Cards, tables, controls and report cards keep their readable colours.");
    } catch (error) {
      flash(errText(error), true);
    }
  }

  async function choosePreset(preset: AppearancePalette) {
    const next = { ...preset, autoTextContrast: colors.autoTextContrast ?? true, textColorCycle: colors.textColorCycle ?? true, backdropTheme: preset.backdropTheme ?? colors.backdropTheme ?? "auto-sections" };
    setColors(next);
    applyAppearance(next);
    try {
      await saveAppearance({ data: { appearance: next } });
      flash("Backdrop colour preset applied and saved. Content surfaces and text colours remain unchanged.");
    } catch (error) {
      flash(errText(error), true);
    }
  }

  async function chooseBackdropTheme(theme: PortalBackdropThemeId) {
    const previous = colors;
    const next = { ...colors, backdropTheme: theme };
    setColors(next);
    applyAppearance(next);
    try {
      await saveAppearance({ data: { appearance: next } });
      flash(`“${PORTAL_BACKDROP_THEMES.find((item) => item.id === theme)?.name || theme}” applied across the school.`);
    } catch (error) {
      setColors(previous);
      applyAppearance(previous);
      flash(errText(error), true);
    }
  }

  async function saveCurrentColorType() {
    try {
      const saved = await savePortalColorType({ data: { name: colorTypeName, colors } });
      setSavedTypes((current) => [...current.filter((type) => type.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setColorTypeName("");
      flash(`Colour type “${saved.name}” saved centrally for the whole school.`);
    } catch (error) { flash(errText(error), true); }
  }

  return <section className="rounded-md border border-line bg-card p-4 space-y-4">
    <div>
      <h2 className="font-serif text-xl text-navy">Portal backdrop scenes</h2>
      <p className="mt-1 text-sm text-muted">Super Admin only. This single school-wide control changes the large inner page background—not the cards, tables, forms, controls, navigation or report cards.</p>
    </div>
    <div className="flex flex-wrap gap-2">{DISPLAY_PALETTES.map((preset) => <button key={preset.id} type="button" className={btnGhost} onClick={() => choosePreset(preset.colors)}>{preset.name}</button>)}</div>
    <div className="space-y-3 rounded-lg border border-line bg-paper p-3">
      <h3 className="text-sm font-semibold text-navy">Choose the school-wide background mode</h3>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="School-wide background mode">
        {PORTAL_BACKDROP_THEMES.map((theme) => {
          const selected = (colors.backdropTheme ?? "auto-sections") === theme.id;
          const label = theme.id === "auto-sections" ? "Automatic 18-scene cycle" : theme.id === "nature-cycle" ? "Mukuyu Nature Motion" : "Mukuyu Starfall";
          const description = theme.id === "auto-sections"
            ? "One mode automatically rotates through all 18 moving scenes every 30 seconds; scenes are not selected individually."
            : theme.id === "nature-cycle"
              ? "A separate nature mode: 15 moving nature and wildlife scenes cycle automatically every 30 seconds, without colour gradients or glow layers."
              : "The original Mukuyu Starfall background, preserved as an alternative.";
          return <button key={theme.id} type="button" disabled={!loaded} aria-pressed={selected} onClick={() => void chooseBackdropTheme(theme.id)} className={`rounded-md border p-3 text-left transition-colors disabled:opacity-60 ${selected ? "border-navy bg-navy text-white shadow-sm" : "border-line bg-card text-ink hover:border-navy"}`}>
            <span className="block font-semibold">{label}</span>
            <span className={`mt-1 block text-xs ${selected ? "text-white/85" : "text-muted"}`}>{description}</span>
          </button>;
        })}
      </div>
      <p className="text-xs text-muted">All modes are school-wide and stay behind the large inner page only; cards and tables remain unchanged. The 15 nature scenes are: {NATURE_BACKDROP_SCENE_LABELS.join(" · ")}.</p>
    </div>
    <div className="space-y-3 rounded-lg border border-cyan-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white shadow-card">
      <div><h3 className="font-semibold text-white">Automatic text clarity &amp; colour motion</h3><p className="mt-1 text-sm text-slate-200">School-wide controls for page titles and their lead messages. The contrast guard adds a dark, soft backing and crisp outline so moving backgrounds cannot wash the words out.</p></div>
      <label className="flex items-start gap-3 rounded-md border border-white/15 bg-white/5 p-3 text-sm"><input className="mt-1" type="checkbox" checked={colors.autoTextContrast !== false} disabled={!loaded || textSettingsSaving} onChange={(event) => void updateTextOption("autoTextContrast", event.target.checked)} /><span><span className="block font-semibold">Protect page titles and lead messages</span><span className="block text-xs text-slate-300">Keeps text clear over the selected animated scene, without recolouring cards, tables, buttons, inputs, or report-card content.</span></span></label>
      <label className="flex items-start gap-3 rounded-md border border-white/15 bg-white/5 p-3 text-sm"><input className="mt-1" type="checkbox" checked={colors.textColorCycle !== false} disabled={!loaded || textSettingsSaving || colors.autoTextContrast === false} onChange={(event) => void updateTextOption("textColorCycle", event.target.checked)} /><span><span className="block font-semibold">Rotate title and message colours every second</span><span className="block text-xs text-slate-300">Titles and lead messages use separate high-contrast colour sequences. The animation pauses when reduced motion is requested.</span></span></label>
      <p className="text-xs text-slate-300">This uses the existing secure appearance settings service and CSS contrast guard—no external AI, extra server, or database migration is required. Changes save centrally for the whole school.</p>
    </div>
    <div className="space-y-3 rounded-lg border border-line bg-paper p-3">
      <div><h3 className="font-semibold text-navy">Saved colour types</h3><p className="mt-1 text-xs text-muted">Save each custom backdrop palette with a name. Saved types are shared centrally and can be selected again by the Super Admin on any device.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={inputClass} value={colorTypeName} onChange={(event) => setColorTypeName(event.target.value)} maxLength={48} placeholder="Name this colour type" aria-label="Name this colour type" />
        <button className={btnClass} type="button" disabled={!loaded || colorTypeName.trim().length < 2} onClick={() => void saveCurrentColorType()}>Save as colour type</button>
      </div>
      {savedTypes.length ? <div className="flex flex-wrap gap-2" aria-label="Saved colour types">{savedTypes.map((type) => <button key={type.id} type="button" className={btnGhost} onClick={() => void choosePreset(type.colors)} title={`Select ${type.name}`}><span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: `linear-gradient(135deg, ${type.colors.navy}, ${type.colors.info}, ${type.colors.brass}, ${type.colors.good})` }} aria-hidden="true" />{type.name}</button>)}</div> : <p className="text-xs text-muted">No custom colour types saved yet.</p>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{APPEARANCE_LABELS.map(({ key, label, description }) => <label key={key} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm">
      <input aria-label={label} className="h-11 w-12 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" type="color" value={colors[key]} disabled={!loaded} onChange={(event) => updateColor(key, event.target.value)} />
      <span className="min-w-0"><span className="block font-semibold">{label}</span><span className="block text-xs text-muted">{description}</span><span className="mt-1 block font-mono text-xs uppercase">{colors[key]}</span></span>
    </label>)}</div>
    <button className={btnClass} type="button" onClick={saveColors} disabled={!loaded}>Save colour changes</button>
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
      <span className="text-sm font-semibold">Backdrop preview</span>
      <span className="h-9 w-36 rounded-full" aria-hidden="true" style={{ background: `linear-gradient(110deg, ${colors.navy}, ${colors.info}, ${colors.brass}, ${colors.good})` }} />
      <span className="rounded border border-line bg-card px-3 py-2 text-sm text-ink">Text and content surfaces stay unchanged</span>
    </div>
    <button className={btnGhost} type="button" onClick={() => choosePreset({ ...DEFAULT_APPEARANCE, backdropTheme: "starfall" })}>Use original Mukuyu Starfall background</button>
  </section>;
}

function WhatsAppGroupCard({ profile, flash, refresh }: { profile: Profile; flash: Gate["flash"]; refresh: Gate["refresh"] }) {
  const [form, setForm] = useState({ enabled: profile.whatsappGroupEnabled, url: profile.whatsappGroupUrl, label: profile.whatsappGroupLabel || `Join ${profile.name} WhatsApp group` });
  return <form className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4 space-y-3" onSubmit={async (event) => { event.preventDefault(); try { await saveProfile({ data: { ...profile, whatsappGroupEnabled: form.enabled, whatsappGroupUrl: form.url, whatsappGroupLabel: form.label } }); flash("Scanned report WhatsApp group settings saved."); await refresh(); } catch (error) { flash(errText(error), true); } }}>
    <h2 className="font-serif text-xl text-navy">Parent WhatsApp group invitation</h2><p className="text-sm text-muted">When enabled, an optional invite appears on scanned public report cards. Parents open the link and choose whether to join; entering a phone number does not automatically add anyone. The link is not shown when disabled.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />Show optional WhatsApp invite on scanned reports</label>
    <input className={inputClass} type="url" placeholder="https://chat.whatsapp.com/..." value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
    <input className={inputClass} maxLength={100} placeholder={`Join ${profile.name} WhatsApp group`} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
    <button className={btnClass} type="submit">Save parent WhatsApp invite setting</button>
  </form>;
}
function ReportOptionsCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [count, setCount] = useState(String(ws.profile.reportExamCount || 2));
  const [showInitials, setShowInitials] = useState(Boolean(ws.profile.showTeacherInitials));
  const [showSubjectInitials, setShowSubjectInitials] = useState(Boolean(ws.profile.showSubjectTeacherInitials));
  const [showRank, setShowRank] = useState(Boolean(ws.profile.showSubjectRank));
  const [showSpotlight, setShowSpotlight] = useState(Boolean(ws.profile.showSubjectSpotlight));
  const [showPrevious, setShowPrevious] = useState(Boolean(ws.profile.showPreviousTerm));
  const [showAttendance, setShowAttendance] = useState(Boolean(ws.profile.showAttendance));
  const [showCustom, setShowCustom] = useState(Boolean(ws.profile.showCustomRemarks));
  const missingInitials = [...new Map(ws.assignments
    .filter((assignment) => (assignment.kind === "subject_teacher" || assignment.kind === "hod") && assignment.subjectId)
    .map((assignment) => {
      const person = ws.staff.find((member) => member.id === assignment.userId);
      return person && !person.initials?.trim() ? [person.id, person.fullName] as const : null;
    })
    .filter((row): row is readonly [string, string] => Boolean(row))).values()];
  return <form className="rounded-md border border-line bg-card p-4 space-y-3" onSubmit={async (event) => {
    event.preventDefault();
    try {
      await saveReportOptions({ data: {
        reportExamCount: Number(count),
        showTeacherInitials: showInitials,
        showSubjectTeacherInitials: showSubjectInitials,
        showSubjectRank: showRank,
        showSubjectSpotlight: showSpotlight,
        showPreviousTerm: showPrevious,
        showAttendance,
        showCustomRemarks: showCustom,
      } });
      flash("Report layout saved."); await refresh();
    } catch (error) { flash(errText(error), true); }
  }}>
    <h2 className="font-serif text-xl text-navy">Advanced report layout</h2>
    <p className="text-sm text-muted">Super admin and deputy super admins can control how many CAT/exam columns appear on report cards. Add the CAT entries under Exams first. New lines below stay off until you tick them, so cards you already print do not change.</p>
    <label className="block text-sm font-medium">Number of CATs/exams to show on report cards
      <select className={inputClass + " mt-1 block w-full max-w-xs"} value={count} onChange={(event) => setCount(event.target.value)}>
        {Array.from({ length: Math.max(1, Math.min(10, ws.exams.length)) }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{n} {Number(n) === 1 ? "CAT" : "CATs"}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showInitials} onChange={(event) => setShowInitials(event.target.checked)} /> Show assigned class-teacher initials after the remarks section</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSubjectInitials} onChange={(event) => setShowSubjectInitials(event.target.checked)} /> Show each subject teacher's initials after that subject's remarks</label>
    <p className="text-xs text-muted">Class-teacher initials stay where they are, after the class-teacher remarks. Subject-teacher initials are different: they sit at the end of each subject row, after that subject's remark. Untick the box to remove them.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRank} onChange={(event) => setShowRank(event.target.checked)} /> Show each subject's position in the stream</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSpotlight} onChange={(event) => setShowSpotlight(event.target.checked)} /> Show the best subject and the subject that needs attention</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPrevious} onChange={(event) => setShowPrevious(event.target.checked)} /> Show the previous term mean</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAttendance} onChange={(event) => setShowAttendance(event.target.checked)} /> Show attendance, conduct and the class-teacher comment</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCustom} onChange={(event) => setShowCustom(event.target.checked)} /> Use a teacher's own subject remark when one has been written</label>
    {missingInitials.length ? <p className="text-sm text-warn">These subject teachers have no initials yet, so nothing will appear after their subject remarks: {missingInitials.join(", ")}.</p> : null}
    <button className={btnClass} type="submit">Save report layout</button>
  </form>;
}

function CalendarCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [yearId, setYearId] = useState(ws.profile.activeYearId || ws.years[0]?.id || "");
  const [termId, setTermId] = useState(ws.profile.activeTermId || "t3");
  const [nextYear, setNextYear] = useState("");
  const found = ws.calendars.find((row) => row.yearId === yearId && row.termId === termId);
  const [closing, setClosing] = useState(found?.closingDate ?? "");
  const [opening, setOpening] = useState(found?.openingDate ?? "");
  const [title, setTitle] = useState(found?.reportTitle ?? "");
  const [requirements, setRequirements] = useState(found?.requirements ?? "");
  function load(nextYearId: string, nextTermId: string) {
    const row = ws.calendars.find((item) => item.yearId === nextYearId && item.termId === nextTermId);
    setClosing(row?.closingDate ?? "");
    setOpening(row?.openingDate ?? "");
    setTitle(row?.reportTitle ?? "");
    setRequirements(row?.requirements ?? "");
  }
  return (
    <form className="space-y-3 rounded-md border border-line bg-card p-4" onSubmit={async (event) => {
      event.preventDefault();
      try {
        await saveTermDate({ data: { yearId, termId, closingDate: closing, openingDate: opening, reportTitle: title, requirements } });
        flash("Term dates saved.");
        await refresh();
      } catch (error) { flash(errText(error), true); }
    }}>
      <h2 className="font-serif text-xl text-navy">Report dates for a selected year and term</h2>
      <p className="text-sm text-muted">Choose an academic year and term below before editing. Opening and closing dates are saved separately for that exact year–term combination; blank dates stay blank and do not inherit dates from the school profile or another term. The current term is what parents see first.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm font-semibold">Academic year<select className={`${inputClass} mt-1`} value={yearId} onChange={(event) => { setYearId(event.target.value); load(event.target.value, termId); }}>
          {ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </select></label>
        <label className="text-sm font-semibold">Term<select className={`${inputClass} mt-1`} value={termId} onChange={(event) => { setTermId(event.target.value); load(yearId, event.target.value); }}>
          {ws.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select></label>
        <label className="text-sm">Closing date for this year and term<input className={`${inputClass} mt-1`} value={closing} onChange={(event) => setClosing(event.target.value)} placeholder="23/10/2026" /></label>
        <label className="text-sm">Opening / resumption date for this year and term<input className={`${inputClass} mt-1`} value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="4/1/2027" /></label>
      </div>
      <label className="block text-sm">Report title for this term<input className={`${inputClass} mt-1`} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="block text-sm">Requirements for this term<textarea className={`${inputClass} mt-1 h-16 py-2`} value={requirements} onChange={(event) => setRequirements(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={btnClass} type="submit">Save these dates</button>
        <button className={btnGhost} type="button" onClick={async () => {
          try { await setActivePeriod({ data: { yearId, termId } }); flash("This is now the current term."); await refresh(); }
          catch (error) { flash(errText(error), true); }
        }}>Make this the current term</button>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <input className={`${inputClass} max-w-[10rem]`} placeholder="2028" value={nextYear} onChange={(event) => setNextYear(event.target.value)} />
        <button className={btnGhost} type="button" onClick={async () => {
          try { await addYear({ data: { name: nextYear } }); setNextYear(""); flash("Year added with Term 1, 2 and 3."); await refresh(); }
          catch (error) { flash(errText(error), true); }
        }}>Add a year</button>
        {ws.years.length > 1 ? <button className={btnGhost + " text-bad"} type="button" onClick={async () => {
          if (!confirm(`Delete year ${ws.years.find(y => y.id === yearId)?.name || yearId}? This cannot be undone if no marks exist.`)) return;
          try { await deleteYear({ data: { id: yearId } }); flash("Year deleted."); await refresh(); }
          catch (error) { flash(errText(error), true); }
        }}>Remove selected year</button> : null}
      </div>
    </form>
  );
}

function PasswordCard({ flash }: { flash: Gate["flash"] }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <form className="grid gap-3 rounded-md border border-line bg-card p-4 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      try {
        await changePassword({ data: { current, next } });
        setCurrent(""); setNext("");
        flash("Password successfully changed.");
      } catch (error) { flash(errText(error), true); }
    }}>
      <h2 className="font-serif text-xl text-navy sm:col-span-2">Your password</h2>
      <input className={inputClass} type="password" placeholder="Current password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
      <input className={inputClass} type="password" placeholder="New password" value={next} onChange={(event) => setNext(event.target.value)} required />
      <button className={btnClass} type="submit">Update password</button>
    </form>
  );
}

function ProfileCard({ profile, flash, refresh }: { profile: Profile; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const [form, setForm] = useState(profile);
  const fields: Array<["name" | "poBox" | "motto" | "headTeacher" | "dos" | "location" | "contact" | "email" | "academicYear" | "termName" | "reportTitle" | "closingDate" | "resumptionDate" | "catNote" | "publicBaseUrl", string]> = [
    ["name", "School name"], ["poBox", "P.O. Box"], ["motto", "Motto"], ["headTeacher", "Head teacher"],
    ["dos", "DOS"], ["location", "Location"], ["contact", "Contact"], ["email", "School email"],
    ["academicYear", "Academic year"], ["termName", "Term"], ["reportTitle", "Report title"],
    ["closingDate", "Closing date"], ["resumptionDate", "Opening date"], ["catNote", "CAT note"],
    ["publicBaseUrl", "Public report address"],
  ];
  return (
    <form className="space-y-3 rounded-md border border-line bg-card p-4" onSubmit={async (event) => {
      event.preventDefault();
      try { await saveProfile({ data: form }); flash("School details successfully saved."); await refresh(); }
      catch (error) { flash(errText(error), true); }
    }}>
      <h2 className="font-serif text-xl text-navy">Report card and school details</h2>
      <p className="text-sm text-muted">What you save here is what prints between the two logos, and what a scanned QR code opens. Leave the public address blank to use this website.</p>
      <div className="flex items-center gap-3">
        <img src={form.logoData || "/logo.png"} alt="" className="size-16 rounded-full bg-white object-contain" />
        <label className="text-sm">Replace logo
          <input className="mt-1 block text-sm" type="file" accept="image/png,image/jpeg" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 250000) { flash("Use a logo under 250KB.", true); return; }
            const reader = new FileReader();
            reader.onload = () => setForm({ ...form, logoData: String(reader.result) });
            reader.readAsDataURL(file);
          }} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="text-sm">{label}
            <input className={`${inputClass} mt-1`} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      <label className="block text-sm">Mission
        <textarea className={`${inputClass} mt-1 h-20 py-2`} value={form.mission} onChange={(event) => setForm({ ...form, mission: event.target.value })} />
      </label>
      <label className="block text-sm">Vision (prints under the school name)
        <textarea className={`${inputClass} mt-1 h-20 py-2`} value={form.vision} onChange={(event) => setForm({ ...form, vision: event.target.value })} />
      </label>
      <label className="block text-sm">Next-term requirements
        <textarea className={`${inputClass} mt-1 h-16 py-2`} value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Term 1 display colour<input className="mt-1 block h-10 w-full" type="color" value={form.term1Color || "#1d4e89"} onChange={(event) => setForm({ ...form, term1Color: event.target.value })} /></label><label className="text-sm">Term 2 display colour<input className="mt-1 block h-10 w-full" type="color" value={form.term2Color || "#9a7430"} onChange={(event) => setForm({ ...form, term2Color: event.target.value })} /></label><label className="text-sm">Term 3 display colour<input className="mt-1 block h-10 w-full" type="color" value={form.term3Color || "#1f7a4d"} onChange={(event) => setForm({ ...form, term3Color: event.target.value })} /></label></div>
      <label className="block text-sm">Greeting on the report
        <input className={`${inputClass} mt-1`} value={form.greeting} onChange={(event) => setForm({ ...form, greeting: event.target.value })} />
      </label>
      <label className="block text-sm">Note to the learner
        <input className={`${inputClass} mt-1`} value={form.homeNote} onChange={(event) => setForm({ ...form, homeNote: event.target.value })} />
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.showQr} onChange={(event) => setForm({ ...form, showQr: event.target.checked })} /> QR code</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.showChart} onChange={(event) => setForm({ ...form, showChart: event.target.checked })} /> Subject chart</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.showRemarks} onChange={(event) => setForm({ ...form, showRemarks: event.target.checked })} /> Remarks</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.showPositions} onChange={(event) => setForm({ ...form, showPositions: event.target.checked })} /> Stream and gender positions</label>
      </div>
      <button className={btnClass} type="submit">Save report card</button>
    </form>
  );
}

function StreamsCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [gradeId, setGradeId] = useState(ws.grades[0]?.id ?? "");
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  return (
    <section className="rounded-md border border-line bg-card p-4">
      <h2 className="font-serif text-xl text-navy">Streams</h2>
      <p className="mt-1 text-sm text-muted">North and South can be renamed. The class teacher line is what prints on the report card.</p>
      <select className={`${inputClass} mt-3 max-w-xs`} value={gradeId} onChange={(event) => setGradeId(event.target.value)}>
        {ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
      </select>
      <ul className="mt-3 space-y-2">
        {streams.map((stream) => <StreamRow key={stream.id} stream={stream} gradeId={gradeId} flash={flash} refresh={refresh} />)}
      </ul>
      <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={async (event) => {
        event.preventDefault();
        try { await saveStream({ data: { gradeId, name, classTeacherLabel: teacher } }); setName(""); setTeacher(""); flash("Stream added."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>
        <input className={inputClass} placeholder="New stream name" value={name} onChange={(event) => setName(event.target.value)} required />
        <input className={inputClass} placeholder="Class teacher on reports" value={teacher} onChange={(event) => setTeacher(event.target.value)} />
        <button className={btnClass} type="submit">Add stream</button>
      </form>
    </section>
  );
}

function StreamRow({ stream, gradeId, flash, refresh }: { stream: Gate["ws"]["streams"][number]; gradeId: string; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const [name, setName] = useState(stream.name);
  const [teacher, setTeacher] = useState(stream.classTeacherLabel);
  return (
    <li className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
      <input className={inputClass} value={teacher} onChange={(event) => setTeacher(event.target.value)} />
      <button className={btnGhost} type="button" onClick={async () => {
        try { await saveStream({ data: { id: stream.id, gradeId, name, classTeacherLabel: teacher } }); flash("Stream saved."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>Save</button>
      <button className={btnGhost} type="button" onClick={async () => {
        try { await deleteStream({ data: { id: stream.id } }); flash("Stream removed."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>Delete</button>
    </li>
  );
}

function SubjectsCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [rows, setRows] = useState(ws.subjects);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  return (
    <section className="rounded-md border border-line bg-card p-4">
      <h2 className="font-serif text-xl text-navy">Learning areas</h2>
      <div className="mt-3 space-y-2">
        {rows.map((subject, index) => (
          <div key={subject.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <input className={inputClass} value={subject.name} onChange={(event) => setRows(rows.map((item) => item.id === subject.id ? { ...item, name: event.target.value } : item))} />
            <input className={inputClass} value={subject.shortName} onChange={(event) => setRows(rows.map((item) => item.id === subject.id ? { ...item, shortName: event.target.value, sort: index + 1 } : item))} />
            <button type="button" className="rounded-lg border border-bad/30 px-3 py-2 text-sm font-semibold text-bad" onClick={async () => {
              if (!confirm(`Remove ${subject.name}? This is allowed only when it has no marks or teacher/class assignments.`)) return;
              try { await deleteSubject({ data: { id: subject.id } }); setRows(rows.filter((item) => item.id !== subject.id)); flash(`${subject.name} removed.`); await refresh(); }
              catch (error) { flash(errText(error), true); }
            }}>Remove</button>
          </div>
        ))}
      </div>
      <button className={`${btnClass} mt-3`} type="button" onClick={async () => {
        try { await saveSubjects({ data: { subjects: rows.map((subject, index) => ({ ...subject, sort: index + 1 })) } }); flash("Subjects saved."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>Save subjects</button>
      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem_auto]" onSubmit={async (event) => {
        event.preventDefault();
        try { await addSubject({ data: { name, shortName } }); setName(""); setShortName(""); flash("Subject added."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>
        <input className={inputClass} placeholder="New learning area" value={name} onChange={(event) => setName(event.target.value)} required />
        <input className={inputClass} placeholder="Short" value={shortName} onChange={(event) => setShortName(event.target.value)} required />
        <button className={btnGhost} type="submit">Add</button>
      </form>
    </section>
  );
}

function ExamsCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [rows, setRows] = useState(ws.exams);
  const [newName, setNewName] = useState(`CAT ${ws.exams.length + 1}`);
  return (
    <section className="rounded-md border border-line bg-card p-4">
      <h2 className="font-serif text-xl text-navy">Exams</h2>
      <div className="mt-3 space-y-2">
        {rows.map((exam) => (
          <div key={exam.id} className="flex gap-2">
            <input className={inputClass + " flex-1"} value={exam.name} onChange={(event) => setRows(rows.map((item) => item.id === exam.id ? { ...item, name: event.target.value } : item))} />
            <button type="button" className="text-bad text-sm font-semibold px-2" onClick={async () => {
              if (!confirm(`Remove ${exam.name}? Marks for this CAT will also be deleted.`)) return;
              try { await deleteExam({ data: { id: exam.id } }); flash(`${exam.name} removed.`); await refresh(); }
              catch (error) { flash(errText(error), true); }
            }}>Remove</button>
          </div>
        ))}
      </div>
      <button className={`${btnClass} mt-3`} type="button" onClick={async () => {
        try { await saveExams({ data: { exams: rows.map((exam) => ({ id: exam.id, name: exam.name })) } }); flash("Exam names saved."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>Save exams</button>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={async (event) => { event.preventDefault(); try { await addExam({ data: { name: newName } }); setNewName(`CAT ${rows.length + 2}`); flash("New CAT/exam added. You can now include it on report cards."); await refresh(); } catch (error) { flash(errText(error), true); } }}>
        <input className={inputClass + " flex-1"} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. CAT 3" required />
        <button className={btnGhost} type="submit">Add CAT / exam</button>
      </form>
    </section>
  );
}

function TermCatsCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [yearId, setYearId] = useState(ws.profile.activeYearId || ws.years[0]?.id || "");
  const [termId, setTermId] = useState(ws.profile.activeTermId || ws.terms[0]?.id || "");
  const configured = ws.termAssessments.filter((item) => item.yearId === yearId && item.termId === termId);
  const [selected, setSelected] = useState<string[]>(configured.length ? configured.filter((item) => item.active).map((item) => item.examId) : ws.exams.map((exam) => exam.id));
  function load(nextYear: string, nextTerm: string) {
    const rows = ws.termAssessments.filter((item) => item.yearId === nextYear && item.termId === nextTerm);
    setSelected(rows.length ? rows.filter((item) => item.active).map((item) => item.examId) : ws.exams.map((exam) => exam.id));
  }
  return <section className="rounded-md border border-line bg-card p-4 space-y-3">
    <h2 className="font-serif text-xl text-navy">CATs for a specific year and term</h2>
    <p className="text-sm text-muted">Choose which CATs were actually conducted for each period. This list is used by historical report cards and missing-marks checks. If no CAT list is saved for a period, all CATs remain enabled by default.</p>
    <div className="grid gap-2 sm:grid-cols-2"><select className={inputClass} value={yearId} onChange={(event) => { setYearId(event.target.value); load(event.target.value, termId); }}>{ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select><select className={inputClass} value={termId} onChange={(event) => { setTermId(event.target.value); load(yearId, event.target.value); }}>{ws.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
    <div className="flex flex-wrap gap-3">{ws.exams.map((exam) => <label key={exam.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(exam.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, exam.id] : selected.filter((id) => id !== exam.id))} />{exam.name}</label>)}</div>
    <button className={btnClass} type="button" onClick={async () => { try { const result = await saveTermAssessments({ data: { yearId, termId, examIds: selected } }); flash(`${result.activeCount} CAT(s) enabled for the selected period.`); await refresh(); } catch (error) { flash(errText(error), true); } }}>Save CATs for this term</button>
  </section>;
}

function MarkEntryControlsCard({ ws, flash, refresh }: Pick<Gate, "ws" | "flash" | "refresh">) {
  const [yearId, setYearId] = useState(ws.profile.activeYearId || ws.years[0]?.id || "");
  const [termId, setTermId] = useState(ws.profile.activeTermId || ws.terms[0]?.id || "");
  const [examId, setExamId] = useState(ws.exams[0]?.id || "");
  const [draft, setDraft] = useState<MarkControl>({ yearId, termId, examId, entryAllowed: true, editAllowed: true, reason: "", deadlineAt: null, adminsCanEnter: true, subjectTeachersCanEnter: true, classTeachersCanEnter: true, classTeachersAllSubjects: true, adminsCanViewMarks: true, subjectTeachersCanViewMarks: true, classTeachersCanViewMarks: true, adminsCanEditLocked: false, subjectTeachersCanEditLocked: false, classTeachersCanEditLocked: false });
  const [history, setHistory] = useState<Array<{id:string;actorName:string;actorRole:string;action:string;source:string;learnerName:string;subjectName:string;examId:string;yearId:string;termId:string;oldScore:number|null;newScore:number|null;reason:string;createdAt:string}>>([]);
  const [busy, setBusy] = useState(false);
  const localDateTimeValue = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  // Read the saved lock for the chosen year, term and CAT straight from the workspace so the switches always match what is stored.
  useEffect(() => {
    const saved = ws.markControls.find((row) => row.yearId === yearId && row.termId === termId && row.examId === examId);
    setDraft({ yearId, termId, examId, entryAllowed: saved?.entryAllowed ?? true, editAllowed: saved?.editAllowed ?? true, reason: saved?.reason ?? "", deadlineAt: saved?.deadlineAt ?? null, adminsCanEnter: saved?.adminsCanEnter ?? true, subjectTeachersCanEnter: saved?.subjectTeachersCanEnter ?? true, classTeachersCanEnter: saved?.classTeachersCanEnter ?? true, classTeachersAllSubjects: saved?.classTeachersAllSubjects ?? true, adminsCanViewMarks: saved?.adminsCanViewMarks ?? true, subjectTeachersCanViewMarks: saved?.subjectTeachersCanViewMarks ?? true, classTeachersCanViewMarks: saved?.classTeachersCanViewMarks ?? true, adminsCanEditLocked: saved?.adminsCanEditLocked ?? false, subjectTeachersCanEditLocked: saved?.subjectTeachersCanEditLocked ?? false, classTeachersCanEditLocked: saved?.classTeachersCanEditLocked ?? false });
  }, [ws.markControls, yearId, termId, examId]);
  useEffect(() => { getMarkAuditHistory().then(setHistory).catch(() => setHistory([])); }, [ws.marks.length]);
  function set<K extends keyof MarkControl>(key: K, value: MarkControl[K]) { setDraft((old) => ({ ...old, [key]: value })); }
  const expired = Boolean(draft.deadlineAt && new Date(draft.deadlineAt).getTime() <= Date.now());
  const permissionOptions: Array<[keyof MarkControl, string]> = [["adminsCanEnter", "Admins may enter new marks"], ["subjectTeachersCanEnter", "Subject teachers may enter assigned subjects"], ["classTeachersCanEnter", "Class teachers may enter marks"], ["classTeachersAllSubjects", "Class teachers may enter every subject in their class"], ["adminsCanViewMarks", "Admins may view marks"], ["subjectTeachersCanViewMarks", "Subject teachers may view assigned-subject marks"], ["classTeachersCanViewMarks", "Class teachers may view class marks"], ["adminsCanEditLocked", "Admins may edit marks after lock/deadline"], ["subjectTeachersCanEditLocked", "Subject teachers may edit assigned marks after lock/deadline"], ["classTeachersCanEditLocked", "Class teachers may edit class marks after lock/deadline"]];
  return <section className="rounded-md border border-amber-300 bg-card p-4 space-y-3">
    <h2 className="font-serif text-xl text-navy">Lock or allow marks by year, term and CAT</h2>
    <p className="text-sm text-muted">Only the Super Admin and the three Deputy Super Admins can change these controls. The server checks them for both manual entry and Excel/CSV uploads.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="block text-sm">Academic year<select className={inputClass + " mt-1"} value={yearId} onChange={(event) => setYearId(event.target.value)}>{ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label className="block text-sm">Term<select className={inputClass + " mt-1"} value={termId} onChange={(event) => setTermId(event.target.value)}>{ws.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
      <label className="block text-sm">Specific CAT / exam<select className={inputClass + " mt-1"} value={examId} onChange={(event) => setExamId(event.target.value)}>{ws.exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></label>
    </div>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft.entryAllowed} onChange={(event) => set("entryAllowed", event.target.checked)} /><span><strong>Allow new marks to be entered</strong><br/><span className="text-muted">Turn off to block blank/new mark cells for this CAT.</span></span></label>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={draft.editAllowed} onChange={(event) => set("editAllowed", event.target.checked)} /><span><strong>Allow existing results to be edited or cleared</strong><br/><span className="text-muted">Turn off to protect results already saved for this CAT.</span></span></label>
    <label className="block text-sm">Automatic deadline (optional)<input className={inputClass + " mt-1"} type="datetime-local" value={localDateTimeValue(draft.deadlineAt)} onChange={(event) => set("deadlineAt", event.target.value ? new Date(event.target.value).toISOString() : null)} /><span className="text-xs text-muted">Local school time. At the deadline, entry and editing lock automatically; Super Admin and deputies can still override.</span></label>
    <div className="grid gap-2 sm:grid-cols-2">{permissionOptions.map(([key, label]) => <label key={String(key)} className="flex items-start gap-2 rounded-lg border border-line bg-paper/70 p-2 text-sm"><input className="mt-1" type="checkbox" checked={Boolean(draft[key])} onChange={(event) => set(key, event.target.checked as never)} /><span>{label}</span></label>)}</div>
    <label className="block text-sm">Reason / instruction (optional)<input className={inputClass + " mt-1"} value={draft.reason} onChange={(event) => set("reason", event.target.value)} maxLength={300} placeholder="e.g. Results close after approval" /></label>
    <div className="rounded bg-paper p-3 text-sm"><strong>Status:</strong> {expired ? "Deadline passed — automatically locked" : draft.entryAllowed && draft.editAllowed ? "Entry and editing open" : "One or more actions locked"}{draft.deadlineAt ? ` · deadline ${new Date(draft.deadlineAt).toLocaleString()}` : ""}.</div>
    <button className={btnClass} type="button" disabled={busy || !yearId || !termId || !examId} onClick={async () => { setBusy(true); try { await saveMarkControl({ data: { ...draft, yearId, termId, examId } }); flash("Mark governance controls saved for this year, term and CAT."); await refresh(); } catch (error) { flash(errText(error), true); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Save mark controls"}</button>
    <div className="border-t border-line pt-3"><h3 className="font-semibold text-navy">Recent mark history (last 200 changes)</h3><p className="text-xs text-muted">Visible only to Super Admin and Deputy Super Admins. Each event records who changed which learner/subject, when, and the old/new value.</p><div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line"><table className="w-full min-w-[42rem] text-left text-xs"><thead className="sticky top-0 bg-paper"><tr><th className="p-2">When / account</th><th className="p-2">Learner · subject</th><th className="p-2">Action / source</th><th className="p-2">Old → new</th></tr></thead><tbody>{history.map((item) => <tr key={item.id} className="border-t border-line"><td className="p-2">{new Date(item.createdAt).toLocaleString()}<br/>{item.actorName} · {item.actorRole}</td><td className="p-2">{item.learnerName}<br/>{item.subjectName}</td><td className="p-2">{item.action} · {item.source}</td><td className="p-2">{item.oldScore ?? "—"} → {item.newScore ?? "—"}</td></tr>)}</tbody></table>{!history.length ? <p className="p-3 text-xs text-muted">No mark-history events yet.</p> : null}</div></div>
  </section>;
}

function BandsCard({ bands, flash, refresh }: { bands: Band[]; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const [rows, setRows] = useState([...bands].sort((a, b) => b.minScore - a.minScore));
  function edit(index: number, patch: Partial<Band>) {
    setRows(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  return (
    <section className="rounded-md border border-line bg-card p-4">
      <h2 className="font-serif text-xl text-navy">Grading scale</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th>From</th><th>Level</th><th>Pts</th><th>Subject remark</th><th>Head teacher</th><th>Class teacher</th></tr></thead>
          <tbody>
            {rows.map((band, index) => (
              <tr key={band.code + index}>
                {(["minScore", "code", "points", "subjectRemark", "headRemark", "classRemark"] as const).map((key) => (
                  <td key={key} className="py-1 pr-2">
                    <input className={inputClass} value={String(band[key])} onChange={(event) => edit(index, { [key]: key === "minScore" || key === "points" ? Number(event.target.value) : event.target.value })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={`${btnClass} mt-3`} type="button" onClick={async () => {
        try { await saveBands({ data: { bands: rows } }); flash("Grading scale saved."); await refresh(); }
        catch (error) { flash(errText(error), true); }
      }}>Save grading scale</button>
    </section>
  );
}
