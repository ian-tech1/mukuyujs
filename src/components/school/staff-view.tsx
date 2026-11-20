import { useEffect, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import type { Role } from "@/lib/school/model";
import { can, isAdmin } from "@/lib/school/model";
import { addAssignment, approveStaffRoleChange, changeStaffRole, createStaff, deleteUser, listCredentials, listStaffRoleChangeRequests, removeAssignment, requestStaffRoleChange, resetPassword, saveDeputyDelegations, saveInitials, savePrivileges, setDeputy, setUserActive } from "@/lib/school/api";

export function StaffView({ ws, refresh, flash }: Gate) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [kind, setKind] = useState("subject_teacher");
  const [gradeId, setGradeId] = useState(ws.grades[0]?.id ?? "");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState(ws.subjects[0]?.id ?? "");
  const [resetEmail, setResetEmail] = useState("");
  const [issuedCredential, setIssuedCredential] = useState<{ email: string; password: string; purpose: string } | null>(null);
  const [grantStaff, setGrantStaff] = useState(true);
  const [grantSettings, setGrantSettings] = useState(true);
  const [grantImport, setGrantImport] = useState(true);
  const [grantCalendar, setGrantCalendar] = useState(true);
  const [roleRequests, setRoleRequests] = useState<Array<{ id: string; userId: string; fullName: string; email: string; currentRole: string; requestedRole: string; requestedBy: string; requesterName: string; superApproved: boolean; deputyApproved: boolean; createdAt: string }> | null>(null);
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  useEffect(() => {
    if (ws.me.role === "super_admin" || ws.me.isDeputy) listStaffRoleChangeRequests().then(setRoleRequests).catch(() => setRoleRequests([]));
  }, [ws.me.role, ws.me.isDeputy]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await createStaff({
        data: {
          fullName,
          email,
          password,
          role,
          privileges: role === "admin" ? { settings: grantSettings, staff: grantStaff, import: grantImport, calendar: grantCalendar } : undefined,
          assignment: role === "teacher" ? { kind, gradeId, streamId: streamId || undefined, subjectId: kind === "class_teacher" || kind === "dos" ? undefined : subjectId } : null,
        },
      });
      setFullName(""); setEmail(""); setPassword("");
      setIssuedCredential({ email: result.email, password: result.password, purpose: role === "admin" ? "Admin account created" : "Teacher account created" });
      flash(`${role === "admin" ? "Admin" : "Teacher"} account created. ${result.emailSent ? "Initial password email sent." : `Email not sent: ${result.emailNote || "configure Resend and verify the sender domain"}. Copy the one-time password below and deliver it securely.`}`);
      await refresh();
    } catch (error) {
      flash(errText(error), true);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-navy">Staff and roles</h1>
        <p className="text-sm text-muted">Admins set each password. The super admin decides which admin can edit the report, the dates, imports, and other teachers.</p>
      </header>
      {(ws.me.role === "super_admin" || ws.me.isDeputy) ? (
        <CredentialsPanel flash={flash} />
      ) : null}
      {(ws.me.role === "super_admin" || ws.me.isDeputy) ? <section className="rounded-md border border-line bg-card p-4"><h2 className="font-serif text-xl text-navy">Role-change approvals</h2><p className="mt-1 text-sm text-muted">Teacher-to-admin and admin-to-teacher changes require approval from both the super admin and one deputy super admin. The role changes only after both approvals.</p>{roleRequests?.length ? <ul className="mt-3 space-y-3">{roleRequests.map((request) => <li key={request.id} className="rounded border border-line p-3"><p className="font-semibold">{request.fullName} · {request.currentRole} → {request.requestedRole}</p><p className="text-xs text-muted">Requested by {request.requesterName} · {new Date(request.createdAt).toLocaleString()}</p><p className="mt-1 text-xs">Super admin: {request.superApproved ? "Approved" : "Pending"} · Deputy: {request.deputyApproved ? "Approved" : "Pending"}</p><button className={btnGhost + " mt-2"} type="button" disabled={(ws.me.role === "super_admin" && request.superApproved) || (ws.me.isDeputy && request.deputyApproved)} onClick={async () => { try { const result = await approveStaffRoleChange({ data: { requestId: request.id } }); flash(result.complete ? "Both approvals received; staff role changed." : "Approval recorded. Waiting for the other required approver."); setRoleRequests(await listStaffRoleChangeRequests()); await refresh(); } catch (error) { flash(errText(error), true); } }}>Approve as {ws.me.role === "super_admin" ? "super admin" : "deputy"}</button></li>)}</ul> : <p className="mt-2 text-sm text-muted">No pending role-change requests.</p>}</section> : null}
      {isAdmin(ws.me.role) ? (
        <form className="rounded-md border border-line bg-card p-4" onSubmit={async (event) => {
          event.preventDefault();
          try {
            const res = await resetPassword({ data: { email: resetEmail } });
            setIssuedCredential({ email: res.email, password: res.temporaryPassword || "Sent to the account email", purpose: res.emailSent ? "Temporary password reset and emailed" : `Password reset; email not sent (${res.emailNote || "check email configuration"})` });
            flash(res.emailSent
              ? `Password reset for ${resetEmail}; temporary password emailed successfully.`
              : `Password reset for ${resetEmail}. Copy the temporary password shown below and share it securely.`);
            setResetEmail("");
            await refresh();
          } catch (error) { flash(errText(error), true); }
        }}>
          <h2 className="font-serif text-xl text-navy">Reset a password</h2>
          <p className="mt-1 text-sm text-muted">Enter the account email. The temporary password is sent through Resend when configured; otherwise it is shown below once so you can share it securely.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input className={inputClass} type="email" placeholder="Email address" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} required />
            <button className={btnClass} type="submit">Send new password</button>
          </div>
        </form>
      ) : null}
      {issuedCredential ? (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="font-semibold">{issuedCredential.purpose}</h2><p className="text-sm">Login: {issuedCredential.email}</p></div>
            <button type="button" className={btnGhost} onClick={() => setIssuedCredential(null)}>Hide credential</button>
          </div>
          <p className="mt-2 text-sm">Temporary password (shown only now):</p>
          <code className="mt-1 block break-all rounded-md bg-white p-3 font-mono text-base">{issuedCredential.password}</code>
          <button type="button" className={`${btnGhost} mt-2`} onClick={async () => { await navigator.clipboard.writeText(issuedCredential.password); flash("Temporary password copied."); }}>Copy password</button>
          <p className="mt-2 text-xs">Share privately and ask the account holder to change it after signing in. The portal does not retain plaintext passwords.</p>
        </section>
      ) : null}
      <form onSubmit={create} className="grid gap-3 rounded-md border border-line bg-card p-4 sm:grid-cols-2">
        <h2 className="font-serif text-xl text-navy sm:col-span-2">New account</h2>
        <input className={inputClass} placeholder="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <input className={inputClass} type="password" placeholder="Initial password (12+ characters; blank generates one)" value={password} onChange={(event) => setPassword(event.target.value)} />
        <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="admin">Admin</option>
          <option value="teacher">Teacher</option>
        </select>
        {role === "admin" ? (
          <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={grantSettings} onChange={(event) => setGrantSettings(event.target.checked)} /> Edit the report card</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={grantCalendar} onChange={(event) => setGrantCalendar(event.target.checked)} /> Years and dates</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={grantImport} onChange={(event) => setGrantImport(event.target.checked)} /> Import learners</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={grantStaff} onChange={(event) => setGrantStaff(event.target.checked)} /> Add teachers</label>
          </div>
        ) : null}
        {role === "teacher" ? (
          <>
            <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="class_teacher">Class teacher</option>
              <option value="subject_teacher">Subject teacher</option>
              <option value="hod">Head of subject (HOD)</option>
              <option value="dos">Director of Studies (D.O.S.)</option>
            </select>
            <select className={inputClass} value={gradeId} onChange={(event) => setGradeId(event.target.value)}>
              {ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
            </select>
            <select className={inputClass} value={streamId} onChange={(event) => setStreamId(event.target.value)}>
              <option value="">{kind === "class_teacher" ? "Choose stream" : "All streams in the grade"}</option>
              {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
            </select>
            {kind !== "class_teacher" && kind !== "dos" ? (
              <select className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            ) : null}
          </>
        ) : null}
        <button className={btnClass} type="submit">Create account</button>
      </form>
      <ul className="space-y-3">
        {ws.staff.filter((member) => member.role !== "student" && member.role !== "parent").map((member) => (
          <li key={member.id} className="rounded-md border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{member.fullName}</p>
                <p className="text-sm text-muted">{member.email} · {label(member.role, (member as any).isDeputy)}{member.active ? "" : " · disabled"}</p>
              </div>
              {member.id !== ws.me.id ? (
                <div className="flex gap-2">
                  <button className={btnGhost} type="button" onClick={async () => {
                    try { await setUserActive({ data: { id: member.id, active: !member.active } }); flash(member.active ? "Account disabled." : "Account enabled."); await refresh(); }
                    catch (error) { flash(errText(error), true); }
                  }}>{member.active ? "Disable" : "Enable"}</button>
                  {((member.role === "teacher" && can(ws.me, "staff")) || (member.role === "admin" && ws.me.role === "super_admin")) ? (
                    <button className="h-11 rounded-md border border-bad bg-card px-4 text-sm font-semibold text-bad" type="button" onClick={async () => {
                      if (!confirm(`Permanently remove ${member.fullName}? This cannot be undone. Their staff assignments, timetable lessons and requirements, substitute/invigilation/duty allocations will also be removed. Any published timetable containing their lessons will return to draft; bell periods and times are kept.`)) return;
                      try { await deleteUser({ data: { id: member.id } }); flash(member.role === "admin" ? "Admin successfully removed." : "Teacher successfully removed."); await refresh(); }
                      catch (error) { flash(errText(error), true); }
                    }}>Delete</button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {(ws.me.role === "super_admin" || ws.me.isDeputy) && (member.role === "teacher" || member.role === "admin") && member.id !== ws.me.id && !(Boolean((member as any).isDeputy) && !((ws.me.role === "super_admin"))) ? (
              <button className={btnGhost + " mt-3"} type="button" onClick={async () => {
                const requestedRole = member.role === "teacher" ? "admin" : "teacher";
                const action = requestedRole === "admin" ? "promote" : "change to teacher";
                if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${member.fullName}? Their account permissions will be reset to the safe defaults for the new role.`)) return;
                try {
                  await changeStaffRole({ data: { userId: member.id, requestedRole } });
                  flash(`${member.fullName} is now ${requestedRole}.`);
                  await refresh();
                } catch (error) { flash(errText(error), true); }
              }}>{member.role === "teacher" ? "Make admin" : "Make teacher"}</button>
            ) : null}
            {(ws.me.role === "super_admin" || ws.me.isDeputy) && ["teacher","admin","super_admin"].includes(member.role) ? <InitialsEditor member={member} flash={flash} refresh={refresh} /> : null}
            {member.role === "admin" && ws.me.role === "super_admin" ? (
              <>
                <Privilege member={member} flash={flash} refresh={refresh} />
                {(member as any).isDeputy ? <DeputyDelegationEditor member={member} flash={flash} refresh={refresh} /> : null}
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean((member as any).isDeputy)} onChange={async (event) => {
                      try {
                        await setDeputy({ data: { id: member.id, isDeputy: event.target.checked } });
                        flash(event.target.checked ? "Deputy super admin powers granted." : "Deputy powers removed.");
                        await refresh();
                      } catch (error) { flash(errText(error), true); }
                    }} />
                    Deputy super admin (delegated responsibilities; super admin retains overall control)
                  </label>
                </div>
              </>
            ) : null}
            {member.role === "teacher" || member.role === "admin" || member.role === "super_admin" ? <Assignments userId={member.id} ws={ws} refresh={refresh} flash={flash} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Privilege({ member, flash, refresh }: { member: Gate["ws"]["staff"][number]; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const [settings, setSettings] = useState(member.privSettings);
  const [staff, setStaff] = useState(member.privStaff);
  const [allowImport, setAllowImport] = useState(member.privImport);
  const [calendar, setCalendar] = useState(member.privCalendar);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={settings} onChange={(event) => setSettings(event.target.checked)} /> Report card</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={calendar} onChange={(event) => setCalendar(event.target.checked)} /> Dates</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={allowImport} onChange={(event) => setAllowImport(event.target.checked)} /> Import</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={staff} onChange={(event) => setStaff(event.target.checked)} /> Staff</label>
      <button className={btnGhost} type="button" onClick={async () => {
        try {
          await savePrivileges({ data: { id: member.id, privSettings: settings, privStaff: staff, privImport: allowImport, privCalendar: calendar } });
          flash("Role successfully added / privileges saved.");
          await refresh();
        } catch (error) { flash(errText(error), true); }
      }}>Save privileges</button>
    </div>
  );
}

function InitialsEditor({ member, flash, refresh }: { member: Gate["ws"]["staff"][number]; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const [initials, setInitials] = useState(member.initials ?? "");
  return <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={async (event) => {
    event.preventDefault();
    try { await saveInitials({ data: { userId: member.id, initials } }); flash("Teacher initials saved."); await refresh(); }
    catch (error) { flash(errText(error), true); }
  }}>
    <label className="text-sm">Report-card initials <input className={inputClass + " ml-2 w-28"} value={initials} maxLength={12} onChange={(event) => setInitials(event.target.value)} placeholder="e.g. IT" /></label>
    <button className={btnGhost} type="submit">Save initials</button>
    <p className="basis-full text-xs text-muted">These initials work in two different places. If this person is the class teacher, they can appear after the class-teacher remarks. If they teach a subject, the same initials can appear after that subject's remark. Each place has its own on/off switch under report layout.</p>
  </form>;
}

function DeputyDelegationEditor({ member, flash, refresh }: { member: Gate["ws"]["staff"][number]; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const all = ["settings", "staff", "import", "calendar"];
  const labels: Record<string, string> = { settings: "Report/settings", staff: "Staff and accounts", import: "Learner/marks imports", calendar: "Academic years and terms" };
  const [selected, setSelected] = useState<string[]>(member.delegatedResponsibilities ?? all);
  return <section className="mt-3 rounded-md border border-line p-3">
    <p className="text-sm font-semibold">Delegated responsibilities</p>
    <p className="text-xs text-muted">Choose a responsibility profile or customise individual areas. These profiles delegate existing permissions only; the super admin retains overall control.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={btnGhost} type="button" onClick={() => setSelected(["settings", "calendar"])}>Academic Operations Deputy</button>
      <button className={btnGhost} type="button" onClick={() => setSelected(["staff", "import"])}>Staff & Records Deputy</button>
      <button className={btnGhost} type="button" onClick={() => setSelected(["settings", "staff", "import", "calendar"])}>Full Deputy Super Admin</button>
      <button className={btnGhost} type="button" onClick={() => setSelected([])}>Remove all delegated areas</button>
    </div>
    <div className="mt-2 flex flex-wrap gap-3">{all.map((key) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(key)} onChange={(event) => setSelected(event.target.checked ? [...selected, key] : selected.filter((x) => x !== key))} />{labels[key]}</label>)}</div>
    <button className={btnGhost + " mt-3"} type="button" onClick={async () => { try { await saveDeputyDelegations({ data: { userId: member.id, responsibilities: selected } }); flash("Deputy responsibilities updated."); await refresh(); } catch (error) { flash(errText(error), true); } }}>Save delegated responsibilities</button>
  </section>;
}

function label(role: string, isDeputy?: boolean) {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return isDeputy ? "Deputy super admin" : "Admin";
  return "Teacher";
}

function Assignments({ userId, ws, refresh, flash }: { userId: string } & Gate) {
  const mine = ws.assignments.filter((assignment) => assignment.userId === userId);
  const [kind, setKind] = useState("subject_teacher");
  const [gradeId, setGradeId] = useState(ws.grades[0]?.id ?? "");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState(ws.subjects[0]?.id ?? "");
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  return (
    <div className="mt-3 space-y-2">
      {mine.map((assignment) => (
        <p key={assignment.id} className="flex items-center justify-between text-sm">
          <span>{assignment.kind.replaceAll("_", " ")} · {ws.grades.find((grade) => grade.id === assignment.gradeId)?.name ?? "Any grade"} · {ws.streams.find((stream) => stream.id === assignment.streamId)?.name ?? "All streams"} · {ws.subjects.find((subject) => subject.id === assignment.subjectId)?.name ?? ""}</span>
          <button className="text-bad" type="button" onClick={async () => { try { await removeAssignment({ data: { id: assignment.id } }); flash("Role successfully removed."); await refresh(); } catch (error) { flash(errText(error), true); } }}>Remove</button>
        </p>
      ))}
      <div className="grid gap-2 sm:grid-cols-5">
        <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="class_teacher">Class teacher</option>
          <option value="subject_teacher">Subject teacher</option>
          <option value="hod">Head of subject (HOD)</option>
              <option value="dos">Director of Studies (D.O.S.)</option>
        </select>
        <select className={inputClass} value={gradeId} onChange={(event) => setGradeId(event.target.value)}>
          {ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
        </select>
        <select className={inputClass} value={streamId} onChange={(event) => setStreamId(event.target.value)}>
          <option value="">All streams</option>
          {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
        </select>
        <select className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={kind === "class_teacher" || kind === "dos"}>
          {ws.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.shortName}</option>)}
        </select>
        <button className={btnGhost} type="button" onClick={async () => {
          try {
            await addAssignment({ data: { userId, kind, gradeId, streamId: streamId || undefined, subjectId: kind === "class_teacher" || kind === "dos" ? undefined : subjectId } });
            flash("Role successfully added.");
            await refresh();
          } catch (error) { flash(errText(error), true); }
        }}>Add role</button>
      </div>
    </div>
  );
}


function CredentialsPanel({ flash }: { flash: Gate["flash"] }) {
  const [rows, setRows] = useState<{ id: string; fullName: string; email: string; role: string; active: boolean }[] | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  async function load() {
    try {
      const data = await listCredentials();
      setRows(data);
      flash("Account credential list loaded.");
    } catch (error) { flash(errText(error), true); }
  }
  return (
    <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-sky-50 p-4">
      <h2 className="font-serif text-xl text-navy">Account access & password resets</h2>
      <p className="mt-1 text-sm text-muted">For security, the portal never displays saved passwords. Super admin and deputy can issue a new temporary password for an account; it is shown once here and emailed when Resend is configured.</p>
      <button className={btnGhost + " mt-3"} type="button" onClick={load}>Load accounts</button>
      {credential ? <div className="mt-3 rounded-lg border border-emerald-300 bg-white p-3"><p className="font-semibold">Temporary password issued for {credential.email}</p><code className="mt-2 block break-all font-mono">{credential.password}</code><button type="button" className={btnGhost + " mt-2"} onClick={async () => { await navigator.clipboard.writeText(credential.password); flash("Temporary password copied."); }}>Copy password</button><button type="button" className={btnGhost + " ml-2 mt-2"} onClick={() => setCredential(null)}>Hide</button></div> : null}
      {rows ? <ul className="mt-3 space-y-2">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white bg-white/90 p-3 text-sm"><span><strong>{row.fullName}</strong><br />{row.email} · {row.role} · {row.active ? "Active" : "Disabled"}</span><button type="button" disabled={busyId === row.id} className={btnGhost} onClick={async () => { setBusyId(row.id); try { const result = await resetPassword({ data: { email: row.email } }); if (result.temporaryPassword) setCredential({ email: result.email, password: result.temporaryPassword }); else setCredential(null); flash(result.emailSent ? `Temporary password emailed to ${row.email}.` : `Password reset. ${result.emailNote || "Email delivery unavailable."}`); } catch (error) { flash(errText(error), true); } finally { setBusyId(""); } }}>{busyId === row.id ? "Resetting…" : "Issue new password"}</button></li>)}</ul> : null}
    </section>
  );
}
