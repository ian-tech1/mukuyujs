import { useEffect, useMemo, useState } from "react";
import type { Gate } from "@/components/school/gate";
import { btnClass, btnGhost, errText, inputClass } from "@/components/school/gate";
import { can, canEditLearner, isAdmin, learnersForYear, type Learner } from "@/lib/school/model";
import { bulkCreateStudentLogins, bulkDeleteLearners, bulkMoveLearners, createLearnerLogin, deleteClassLearners, deleteLearner, importLearners, listArchivedLearners, moveLearner, promoteClass, resetStudentPassword, restoreArchivedLearner, setAdmissionNumber, saveLearner } from "@/lib/school/api";
import { parseDelimited, parseSpreadsheet, type SheetRow } from "@/lib/school/sheet";

export function LearnersView({ ws, refresh, flash }: Gate) {
  const [gradeId, setGradeId] = useState(ws.grades[1]?.id ?? ws.grades[0]?.id ?? "");
  const [selectedYearId, setSelectedYearId] = useState(ws.profile.activeYearId);
  const [streamId, setStreamId] = useState("");
  const [query, setQuery] = useState("");
  const streams = ws.streams.filter((stream) => stream.gradeId === gradeId);
  const activeStream = streamId || streams[0]?.id || "";
  const rows = useMemo(
    () => learnersForYear(ws, selectedYearId).filter((learner) => learner.gradeId === gradeId && learner.streamId === activeStream && learner.fullName.includes(query.trim().toUpperCase())).sort((a, b) => a.roll - b.roll),
    [ws, selectedYearId, gradeId, activeStream, query],
  );
  const duplicateNameGroups = useMemo(() => {
    const groups = new Map<string, typeof ws.learners>();
    for (const learner of ws.learners) {
      const key = learner.fullName.trim().replace(/\s+/g, " ").toUpperCase();
      groups.set(key, [...(groups.get(key) ?? []), learner]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }, [ws.learners]);
  const canEdit = activeStream ? canEditLearner(ws.me, ws.assignments, activeStream) : false;
  const [draft, setDraft] = useState({ roll: "", fullName: "", gender: "FEMALE" });
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [autoResult, setAutoResult] = useState<{ name: string; email: string; password: string }[] | null>(null);
  const [targetGrade, setTargetGrade] = useState("");
  const [targetYearId, setTargetYearId] = useState("");
  const [targetStreamForPromotion, setTargetStreamForPromotion] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGradeId, setBulkGradeId] = useState("");
  const [bulkStreamId, setBulkStreamId] = useState("");
  const [bulkYearId, setBulkYearId] = useState("");
  const [admissionDrafts, setAdmissionDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [archived, setArchived] = useState<Learner[]>([]);
  const [archivedQuery, setArchivedQuery] = useState("");
  const [archivedLoaded, setArchivedLoaded] = useState(false);

  useEffect(() => {
    if (ws.me.role !== "super_admin") return;
    listArchivedLearners().then((rows) => { setArchived(rows); setArchivedLoaded(true); }).catch(() => setArchivedLoaded(true));
  }, [ws.me.role]);

  async function doBulkLogins() {
    try {
      const res = await bulkCreateStudentLogins({ data: { streamId: activeStream } });
      setAutoResult(res.created);
      flash(res.created.length ? `Student logins automatically created for ${res.created.length} learner(s).` : "All learners in this class already have logins.");
      await refresh();
    } catch (error) { flash(errText(error), true); }
  }

  async function doPromote() {
    if (!targetGrade || !targetYearId) { flash("Choose the destination grade and academic year first.", true); return; }
    if (!confirm(`Move every active learner in this class to ${ws.grades.find((g) => g.id === targetGrade)?.name}, ${ws.years.find((y) => y.id === targetYearId)?.name}?`)) return;
    try {
      const res = await promoteClass({ data: { streamId: activeStream, sourceYearId: selectedYearId, targetGradeId: targetGrade, targetYearId, targetStreamId: targetStreamForPromotion || undefined } });
      flash(`Class successfully promoted. Learners moved to the next grade.`);
      await refresh();
    } catch (error) { flash(errText(error), true); }
  }

  async function doBulkMove() {
    if (!selectedIds.length) { flash("Select one or more learners first.", true); return; }
    if (!bulkGradeId || !bulkStreamId || !bulkYearId) { flash("Choose a destination academic year, grade and stream.", true); return; }
    if (!confirm(`Move ${selectedIds.length} selected learner(s) to ${ws.grades.find((g) => g.id === bulkGradeId)?.name} / ${ws.streams.find((s) => s.id === bulkStreamId)?.name}? Existing marks will remain unchanged.`)) return;
    try {
      const result = await bulkMoveLearners({ data: { learnerIds: selectedIds, targetGradeId: bulkGradeId, targetStreamId: bulkStreamId, targetYearId: bulkYearId, reason: "super-admin bulk placement change" } });
      setSelectedIds([]); flash(`${result.moved} learner(s) moved. Historical marks were preserved.`); await refresh();
    } catch (error) { flash(errText(error), true); }
  }

  async function saveName(learnerId: string) {
    const learner = ws.learners.find((item) => item.id === learnerId);
    if (!learner) return;
    const fullName = (nameDrafts[learnerId] ?? learner.fullName).trim();
    if (!fullName) { flash("Learner name cannot be blank.", true); return; }
    try {
      await saveLearner({ data: { id: learner.id, roll: learner.roll, fullName, gender: learner.gender, gradeId: learner.gradeId, streamId: learner.streamId, admissionNumber: learner.admissionNumber ?? undefined } });
      flash("Learner name corrected. Admission number and historical marks were preserved.");
      await refresh();
    } catch (error) { flash(errText(error), true); }
  }

  async function saveAdmission(learnerId: string) {
    try { await setAdmissionNumber({ data: { learnerId, admissionNumber: admissionDrafts[learnerId] ?? ws.learners.find((l) => l.id === learnerId)?.admissionNumber ?? "" } }); flash("Admission number saved."); await refresh(); }
    catch (error) { flash(errText(error), true); }
  }

  async function addLearner(event: React.FormEvent) {
    event.preventDefault();
    try {
      const nextRoll = draft.roll ? Number(draft.roll) : (rows.at(-1)?.roll ?? 0) + 1;
      await saveLearner({ data: { roll: nextRoll, fullName: draft.fullName, gender: draft.gender, gradeId, streamId: activeStream, yearId: selectedYearId } });
      setDraft({ roll: "", fullName: "", gender: "FEMALE" });
      flash("Learner successfully added.");
      await refresh();
    } catch (error) {
      flash(errText(error), true);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-navy">Learners</h1>
          <p className="text-sm text-muted">Listed by roll number. Paste a spreadsheet, or upload Excel or CSV, to add a whole class. Student and parent logins can be created so families can view results.</p>
        </div>
        {isAdmin(ws.me.role) || canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button className={btnClass} type="button" onClick={doBulkLogins}>Auto-create student logins</button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <select className={inputClass} aria-label="Academic year" value={selectedYearId} onChange={(event) => { setSelectedYearId(event.target.value); setStreamId(""); }}>
            {ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
          <select className={inputClass} value={gradeId} onChange={(event) => { setGradeId(event.target.value); setStreamId(""); }}>
            {ws.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
          </select>
          <select className={inputClass} value={activeStream} onChange={(event) => setStreamId(event.target.value)}>
            {streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
          </select>
        </div>
      </header>
      {duplicateNameGroups.length ? <section className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Possible duplicate learner names: {duplicateNameGroups.length} group(s)</strong><p className="mt-1">Check admission numbers before editing or deleting records. Learners are not automatically merged.</p><ul className="mt-2 space-y-1">{duplicateNameGroups.slice(0, 8).map((group) => <li key={group[0].id}>{group[0].fullName}: {group.map((learner) => `${learner.admissionNumber ?? "No admission number"} (${ws.grades.find((g) => g.id === learner.gradeId)?.name ?? "?"} ${ws.streams.find((stream) => stream.id === learner.streamId)?.name ?? ""})`).join(" · ")}</li>)}</ul></section> : null}
      {isAdmin(ws.me.role) ? (
        <section className="rounded-md border border-line bg-card p-4">
          <h2 className="font-serif text-xl text-navy">End of year — promote this class</h2>
          <p className="mt-1 text-sm text-muted">Choose the destination grade and see the destination academic year before promoting. Example: Grade 7 North in 2026 should progress to Grade 8 North in 2027, then Grade 9 North in 2028; repeats should be handled by an explicit placement decision. Historical marks stay permanently.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select className={inputClass + " max-w-xs"} value={targetGrade} onChange={(e) => setTargetGrade(e.target.value)}>
              <option value="">Choose next grade and year…</option>
              {ws.grades.filter((g) => g.level > (ws.grades.find((gg) => gg.id === gradeId)?.level ?? 0)).map((g) => (
                <option key={g.id} value={g.id}>{g.name} · destination academic year: {Number(ws.years.find((year) => year.id === ws.profile.activeYearId)?.name ?? ws.profile.academicYear) + Math.max(1, g.level - (ws.grades.find((gg) => gg.id === gradeId)?.level ?? 0))}</option>
              ))}
            </select>
            <select className={inputClass + " max-w-xs"} value={targetYearId} onChange={(e) => setTargetYearId(e.target.value)}>
              <option value="">Choose destination academic year…</option>
              {ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
            <select className={inputClass + " max-w-xs"} value={targetStreamForPromotion} onChange={(e) => setTargetStreamForPromotion(e.target.value)}>
              <option value="">Choose destination stream…</option>
              {ws.streams.filter((stream) => stream.gradeId === targetGrade).map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
            </select>
            <button className={btnClass} type="button" onClick={doPromote} disabled={!activeStream}>Promote class</button>
          </div>
        </section>
      ) : null}
      {ws.me.role === "super_admin" ? <section className="rounded-md border border-bad/40 bg-card p-4 space-y-3">
        <h2 className="font-serif text-xl text-bad">Delete all learner details in a class</h2>
        <p className="text-sm text-muted">Super admin only. This permanently removes every learner in the selected class ({ws.grades.find((grade) => grade.id === gradeId)?.name} {streams.find((stream) => stream.id === activeStream)?.name ?? ""}, {ws.learners.filter((learner) => learner.streamId === activeStream).length} active learners) together with their marks, logins and parent links. A safety copy of the whole school is saved first, and can be restored from Settings.</p>
        <button className="inline-flex h-11 items-center justify-center rounded-md border border-bad/40 px-4 text-sm font-semibold text-bad disabled:opacity-50" type="button" disabled={!activeStream} onClick={async () => {
          const label = `${ws.grades.find((grade) => grade.id === gradeId)?.name ?? ""} ${streams.find((stream) => stream.id === activeStream)?.name ?? ""}`.trim();
          const typed = window.prompt(`This permanently deletes every learner in ${label} and all their marks.\n\nTo confirm, type exactly:\nDELETE ${label}`);
          if (typed == null) return;
          try {
            const result = await deleteClassLearners({ data: { streamId: activeStream, confirmText: typed } });
            setSelectedIds([]);
            flash(`${result.deleted} learner(s) and ${result.marksDeleted} mark(s) deleted from ${result.label}.`);
            await refresh();
          } catch (error) { flash(errText(error), true); }
        }}>Delete everything in this class</button>
      </section> : null}
      {(ws.me.role === "super_admin" || ws.me.isDeputy) ? <section className="rounded-md border border-line bg-card p-4 space-y-3">
        <h2 className="font-serif text-xl text-navy">Bulk promotion / demotion / stream change</h2>
        <p className="mt-1 text-sm text-muted">Choose the destination academic year as well as grade and stream. Learners are placed only in that year; historical year placements remain separate.</p>
        <p className="text-sm text-muted">Select several learners in the list below, then move them to any grade and stream. Their historical marks remain attached to their learner records.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={inputClass} aria-label="Destination academic year" value={bulkYearId} onChange={(e) => setBulkYearId(e.target.value)}><option value="">Destination year…</option>{ws.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
          <select className={inputClass} value={bulkGradeId} onChange={(event) => { setBulkGradeId(event.target.value); setBulkStreamId(""); }}><option value="">Destination grade</option>{ws.grades.map((g) => <option key={g.id} value={g.id}>{g.name} · year {Number(ws.years.find((year) => year.id === ws.profile.activeYearId)?.name ?? ws.profile.academicYear) + Math.max(0, g.level - (ws.grades.find((gg) => gg.id === gradeId)?.level ?? g.level))}</option>)}</select>
          <select className={inputClass} value={bulkStreamId} onChange={(event) => setBulkStreamId(event.target.value)}><option value="">Destination stream</option>{ws.streams.filter((stream) => stream.gradeId === bulkGradeId).map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select>
          <button className={btnClass} type="button" onClick={doBulkMove} disabled={!selectedIds.length}>Move {selectedIds.length} selected</button>
          {ws.me.role === "super_admin" ? <button className="inline-flex h-11 items-center justify-center rounded-md border border-bad/40 px-4 text-sm font-semibold text-bad disabled:opacity-50" type="button" disabled={!selectedIds.length} onClick={async () => { if (!confirm(`Archive ${selectedIds.length} selected learner(s)? A full school safety snapshot will be saved first. Their marks and admission records will be retained but hidden from active lists.`)) return; try { const result = await bulkDeleteLearners({ data: { ids: selectedIds } }); setSelectedIds([]); flash(`${result.archived} learner(s) archived. Historical marks were retained.`); await refresh(); } catch (error) { flash(errText(error), true); } }}>Archive selected</button> : null}
        </div>
      </section> : null}
      {ws.me.role === "super_admin" ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-xl">Archived learners · restore</h2><p className="mt-1 text-sm">Restore a learner archived from the active list. Their admission number, marks, cohort, report code, parent links and movement history remain unchanged.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{archived.length} archived</span></div>
        <div className="mt-3 flex flex-wrap gap-2"><input className={inputClass + " max-w-sm bg-white"} placeholder="Search archived names or admission number" value={archivedQuery} onChange={(event) => setArchivedQuery(event.target.value)} /><button className={btnGhost} type="button" onClick={async () => { try { setArchived(await listArchivedLearners()); setArchivedLoaded(true); flash("Archived learner list refreshed."); } catch (error) { flash(errText(error), true); } }}>Refresh archived list</button></div>
        {archivedLoaded && !archived.length ? <p className="mt-3 text-sm">No archived learners found.</p> : null}
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">{archived.filter((learner) => `${learner.fullName} ${learner.admissionNumber ?? ""}`.toUpperCase().includes(archivedQuery.trim().toUpperCase())).map((learner) => <li key={learner.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3 text-sm"><span><strong>{learner.fullName}</strong><span className="block text-xs text-muted">{ws.grades.find((grade) => grade.id === learner.gradeId)?.name ?? learner.gradeId} · {ws.streams.find((stream) => stream.id === learner.streamId)?.name ?? learner.streamId} · Admission {learner.admissionNumber ?? "not assigned"}</span></span><button className={btnClass} type="button" onClick={async () => { if (!confirm(`Restore ${learner.fullName} to the active learner list?`)) return; try { const result = await restoreArchivedLearner({ data: { learnerId: learner.id } }); setArchived((rows) => rows.filter((row) => row.id !== learner.id)); flash(`${result.name} restored. Historical records were preserved.`); await refresh(); } catch (error) { flash(errText(error), true); } }}>Restore learner</button></li>)}</ul>
      </section> : null}
      {autoResult && autoResult.length ? (
        <section className="rounded-md border border-line bg-card p-4">
          <h2 className="font-serif text-xl text-navy">New student logins</h2>
          <p className="mt-1 text-sm text-muted">Share these once. Passwords will not be shown again. Admins and class teachers can reset them later.</p>
          <ul className="mt-2 space-y-1 text-sm font-mono">
            {autoResult.map((r) => <li key={r.email}>{r.name} — {r.email} / {r.password}</li>)}
          </ul>
          <button className={btnGhost + " mt-2"} type="button" onClick={() => setAutoResult(null)}>Hide</button>
        </section>
      ) : null}
      <input className={inputClass} placeholder="Search name" value={query} onChange={(event) => setQuery(event.target.value)} />
      {canEdit ? (
        <form onSubmit={addLearner} className="grid gap-2 rounded-md border border-line bg-card p-3 sm:grid-cols-[6rem_1fr_8rem_auto]">
          <input className={inputClass} placeholder="No." value={draft.roll} onChange={(event) => setDraft({ ...draft, roll: event.target.value })} />
          <input className={inputClass} placeholder="Full name" value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required />
          <select className={inputClass} value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })}>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
          </select>
          <button className={btnClass} type="submit">Add learner</button>
        </form>
      ) : <p className="text-sm text-muted">You can view this stream. Adding learners is for the admin or its class teacher.</p>}
      {can(ws.me, "import") || canEdit ? <ImportCard gradeId={gradeId} yearId={selectedYearId} streamName={streams.find((stream) => stream.id === activeStream)?.name ?? ""} flash={flash} refresh={refresh} /> : null}
      <div className="overflow-x-auto rounded-md border border-line bg-card">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-3 py-2"><input aria-label="Select all learners shown" type="checkbox" checked={rows.length > 0 && rows.every((learner) => selectedIds.includes(learner.id))} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...rows.map((l) => l.id)])] : selectedIds.filter((id) => !rows.some((l) => l.id === id)))} /></th><th className="px-3 py-2">No.</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Admission no.</th><th className="px-3 py-2">Entry cohort</th><th className="px-3 py-2">Gender</th><th className="px-3 py-2">Report code</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {rows.map((learner) => (
              <tr key={learner.id} className="border-t border-line">
                <td className="px-3 py-2"><input aria-label={`Select ${learner.fullName}`} type="checkbox" checked={selectedIds.includes(learner.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, learner.id] : selectedIds.filter((id) => id !== learner.id))} /></td>
                <td className="px-3 py-2">{learner.roll}</td>
                <td className="px-3 py-2 font-medium">{isAdmin(ws.me.role) ? <div className="flex min-w-56 gap-1"><input className={inputClass + " min-w-36"} value={nameDrafts[learner.id] ?? learner.fullName} onChange={(event) => setNameDrafts({ ...nameDrafts, [learner.id]: event.target.value })} aria-label={`Correct name for ${learner.fullName}`} /><button className="text-xs font-semibold text-info" type="button" onClick={() => saveName(learner.id)}>Save</button></div> : learner.fullName}</td>
                <td className="px-3 py-2"><div className="flex gap-1"><input className={inputClass + " min-w-28"} value={admissionDrafts[learner.id] ?? learner.admissionNumber ?? ""} onChange={(event) => setAdmissionDrafts({ ...admissionDrafts, [learner.id]: event.target.value })} aria-label={`Admission number for ${learner.fullName}`} /><button className="text-xs font-semibold text-info" type="button" onClick={() => saveAdmission(learner.id)}>Save</button></div></td>
                <td className="px-3 py-2">Grade 7–9 entry {learner.cohortYear}</td>
                <td className="px-3 py-2">{learner.gender}</td>
                <td className="px-3 py-2 font-mono text-xs">{learner.publicCode}</td>
                <td className="px-3 py-2 text-right">
                  {isAdmin(ws.me.role) ? (
                    <>
                      <button className="text-sm font-semibold text-info" type="button" onClick={async () => {
                        try { await moveLearner({ data: { learnerId: learner.id, direction: "up" } }); flash(`${learner.fullName} moved to next class.`); await refresh(); }
                        catch (error) { flash(errText(error), true); }
                      }}>Move up</button>
                      <button className="ml-2 text-sm font-semibold text-info" type="button" onClick={async () => {
                        try { await moveLearner({ data: { learnerId: learner.id, direction: "down" } }); flash(`${learner.fullName} moved back.`); await refresh(); }
                        catch (error) { flash(errText(error), true); }
                      }}>Move back</button>
                    </>
                  ) : null}
                  {isAdmin(ws.me.role) || canEdit ? <button className="ml-2 text-sm font-semibold text-info" type="button" onClick={async () => {
                    try {
                      const res = await resetStudentPassword({ data: { learnerId: learner.id } });
                      setAutoResult([{ name: res.name, email: res.email, password: res.password }]);
                      flash(res.emailSent ? `Student password reset and emailed to ${res.email}. The one-time credentials are shown above.` : `Student password reset successfully for ${res.name}. Email was not sent (${res.emailNote || "email service unavailable"}); copy the login details shown above.`);
                    } catch (error) { flash(errText(error), true); }
                  }}>Reset password</button> : null}
                  {isAdmin(ws.me.role) ? <button className="ml-3 text-sm font-semibold text-info" type="button" onClick={() => setLoginFor(learner.id)}>Logins</button> : null}
                  {canEdit ? <button className="ml-3 text-sm text-bad" type="button" onClick={async () => {
                    if (!confirm(`Archive ${learner.fullName}? Their marks and admission record will be retained but hidden from active lists.`)) return;
                    try { await deleteLearner({ data: { id: learner.id } }); flash("Learner archived; historical marks retained."); await refresh(); }
                    catch (error) { flash(errText(error), true); }
                  }}>Archive</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loginFor ? <LoginCard learnerId={loginFor} name={rows.find((row) => row.id === loginFor)?.fullName ?? "Learner"} flash={flash} onCreated={(credential) => setAutoResult([credential])} onClose={() => setLoginFor(null)} /> : null}
    </div>
  );
}

function LoginCard({ learnerId, name, flash, onCreated, onClose }: { learnerId: string; name: string; flash: Gate["flash"]; onCreated: (credential: { name: string; email: string; password: string }) => void; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kind, setKind] = useState<"student" | "parent">("student");
  const [parentName, setParentName] = useState("");
  return (
    <form className="grid gap-2 rounded-md border border-line bg-card p-4 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      try {
        const result = await createLearnerLogin({ data: { learnerId, email, password, kind, parentName } });
        onCreated({ name: result.name || name, email: result.email || email, password: result.password || password });
        flash(kind === "student" ? "Student login created. Copy the credentials shown above." : "Parent login created. Share the initial password securely; the parent will be asked to choose a new password at first sign-in.");
        onClose();
      } catch (error) { flash(errText(error), true); }
    }}>
      <h2 className="font-serif text-xl text-navy sm:col-span-2">Login for {name}</h2>
      <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as "student" | "parent")}>
        <option value="student">Student</option>
        <option value="parent">Parent</option>
      </select>
      {kind === "parent" ? <input className={inputClass} placeholder="Parent name" value={parentName} onChange={(event) => setParentName(event.target.value)} /> : <span />}
      <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <input className={inputClass} type="password" placeholder="Password (12+ characters)" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
      <div className="flex gap-2">
        <button className={btnClass} type="submit">Create login</button>
        <button className={btnGhost} type="button" onClick={onClose}>Close</button>
      </div>
    </form>
  );
}

function ImportCard({ gradeId, yearId, streamName, flash, refresh }: { gradeId: string; yearId: string; streamName: string; flash: Gate["flash"]; refresh: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<SheetRow[]>([]);
  return (
    <section className="marks-import-panel space-y-3 rounded-2xl border border-line p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-info">Roster spreadsheet</p><h2 className="font-serif text-xl text-navy">Paste or upload learners</h2></div><span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-navy">Excel-ready · preview first</span></div>
      <p className="mt-1 text-sm text-muted">Paste directly from Excel or upload .xlsx / CSV. Columns: roll, learner name, gender and stream. Review the preview before saving. Existing names in this grade are updated; new names join {streamName || "the first stream"} if stream is blank.</p>
      <textarea aria-label="Paste learner spreadsheet" className={`${inputClass} marks-paste-grid mt-3 h-32 py-2 font-mono text-xs`} placeholder={"1\tAmina Yusuf\tF\tNorth\n2\tBrian Otieno\tM\tSouth"} value={text} onChange={(event) => { setText(event.target.value); setRows(parseDelimited(event.target.value)); }} />
      <label className="mt-2 block text-sm">Upload spreadsheet
        <input className="mt-1 block" type="file" accept=".csv,.txt,.tsv,.xlsx" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            const parsed = await parseSpreadsheet(file);
            setRows(parsed);
            setText(parsed.map((row) => [row.roll ?? "", row.fullName, row.gender ?? "", row.streamName ?? ""].join("\t")).join("\n"));
          } catch (error) { flash(errText(error), true); }
        }} />
      </label>
      <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-navy">{rows.length} learner row{rows.length === 1 ? "" : "s"} ready · {rows.filter((row) => !row.fullName.trim()).length} missing names · {new Set(rows.map((row) => row.fullName.trim().toUpperCase())).size < rows.length ? "possible duplicate names" : "no duplicate names detected"}</p>
      {rows.length ? <div className="marks-grid-scroll max-h-40 overflow-auto rounded-xl border border-line"><table className="marks-preview-table text-xs"><thead><tr><th className="p-2">Roll</th><th className="p-2 text-left">Learner name</th><th className="p-2">Gender</th><th className="p-2">Stream</th></tr></thead><tbody>{rows.slice(0, 30).map((row, index) => <tr key={`${row.fullName}-${index}`}><td className="p-2 text-center">{row.roll ?? index + 1}</td><td className="p-2">{row.fullName || "Missing name"}</td><td className="p-2 text-center">{row.gender || "—"}</td><td className="p-2 text-center">{row.streamName || streamName || "Default stream"}</td></tr>)}</tbody></table></div> : null}
      <button className={`${btnClass} mt-2`} type="button" disabled={!rows.length} onClick={async () => {
        try {
          const result = await importLearners({ data: { gradeId, yearId, rows: rows.map((row) => ({ ...row, streamName: row.streamName || streamName })) } });
          flash(`${result.added} added, ${result.updated} updated.`);
          setText("");
          setRows([]);
          await refresh();
        } catch (error) { flash(errText(error), true); }
      }}>Update the roll</button>
    </section>
  );
}
