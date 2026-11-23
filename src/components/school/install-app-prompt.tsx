import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import {
  getPwaInstallState,
  requestPwaInstall,
  subscribePwaInstallState,
  type PwaInstallState,
} from "@/lib/pwa-install";

export function InstallAppPrompt() {
  const [installState, setInstallState] = useState<PwaInstallState>(() => getPwaInstallState());
  const [dismissed, setDismissed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribePwaInstallState(setInstallState), []);

  if (installState.installed || dismissed) return null;

  async function install() {
    if (!installState.available) {
      setShowSteps((open) => !open);
      return;
    }
    setBusy(true);
    try {
      const result = await requestPwaInstall();
      if (result === "accepted") setDismissed(true);
      else if (result === "unavailable") setShowSteps(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl border border-violet-300 bg-gradient-to-r from-indigo-950 via-blue-800 to-fuchsia-700 p-4 text-white shadow-lg sm:p-5" aria-label="Install Mukuyu Junior School app">
      <div className="pointer-events-none absolute -right-8 -top-12 size-40 rounded-full bg-cyan-300/20 blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <img src="/icons/mukuyu-app-192.png" alt="MKJ app icon" width={68} height={68} className="size-[68px] shrink-0 rounded-2xl border border-white/40 shadow-md" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">MKJ · Mukuyu Junior School</p>
          <h2 className="mt-1 text-lg font-extrabold sm:text-xl">Add the school app to your home screen</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/85">Open the portal quickly from a colourful app shortcut. It’s the same secure website—no separate app-store download or new account needed.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => void install()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-950 shadow transition hover:bg-cyan-100 disabled:opacity-70">
            <Download size={17} aria-hidden="true" />
            {busy ? "Opening…" : installState.available ? "Install app" : showSteps ? "Hide steps" : "Show install steps"}
          </button>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss app install invitation" className="inline-grid size-11 place-items-center rounded-xl border border-white/35 text-white transition hover:bg-white/15">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {showSteps ? (
        <div className="relative mt-4 rounded-xl border border-white/25 bg-black/15 p-3 text-sm leading-relaxed text-white/95" role="status">
          <p className="font-bold text-white">Install from your browser menu</p>
          <p className="mt-1">On Android in Chrome, tap <strong>⋮</strong> in the top corner, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone/iPad, open this page in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
        </div>
      ) : null}
      <p className="relative mt-3 text-[11px] font-extrabold uppercase tracking-[.22em] text-amber-200">Powered by IAN TECH</p>
    </section>
  );
}
