import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Seal } from "@/components/school/seal";
import { btnClass, errText, inputClass } from "@/components/school/gate";
import { portalStatus, setupSchool } from "@/lib/school/api";

export const Route = createFileRoute("/setup")({ component: SetupPage });

function SetupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    portalStatus().then((status) => {
      if (!status.needsSetup) setBlocked(true);
    }).catch(() => undefined);
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setupSchool({ data: { fullName, email, password } });
      navigate({ to: "/portal", search: { view: "home" } });
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <Seal className="size-16" />
      <h1 className="mt-6 font-serif text-4xl text-navy">Open the school office</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        This account is the super admin. You will add other admins and teachers afterwards, and you set their passwords yourself. Grade 7 and Grade 8 marks already loaded from the Term 3 workbooks will be waiting inside.
      </p>
      {blocked ? (
        <p className="mt-6 text-sm">
          A super admin already exists. <Link to="/" search={{ c: undefined }} className="font-semibold text-info">Return to sign in</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">Your name
            <input className={`${inputClass} mt-1.5`} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">Email for password resets
            <input className={`${inputClass} mt-1.5`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">New password
            <input className={`${inputClass} mt-1.5`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} />
          </label>
          <label className="block text-sm font-medium">Confirm password
            <input className={`${inputClass} mt-1.5`} type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={12} maxLength={128} />
          </label>
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <button className={`${btnClass} w-full`} disabled={busy} type="submit">{busy ? "Creating office…" : "Create super admin"}</button>
          <Link to="/" search={{ c: undefined }} className="block text-center text-sm text-muted">Back to sign in</Link>
        </form>
      )}
    </main>
  );
}
