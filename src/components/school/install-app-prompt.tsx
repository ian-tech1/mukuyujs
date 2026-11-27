import { useCallback, useEffect, useState } from "react";
import { Check, Download, RefreshCw, X } from "lucide-react";
import {
  getPwaInstallState,
  initializePwaInstallCapture,
  isStandalonePwa,
  requestPwaInstall,
  subscribePwaInstallState,
  type PwaInstallState,
} from "@/lib/pwa-install";
import { getAppBuildId, isAppUpdateAvailable } from "@/lib/app-version";

type PopupTab = "install" | "update";
type UpdateStatus = "checking" | "current" | "available" | "unavailable";
const UPDATE_DISMISSED_KEY = "mukuyu-pwa-update-dismissed-v1";
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function readDismissedUpdateBuildId() {
  try {
    return localStorage.getItem(UPDATE_DISMISSED_KEY) || "";
  } catch {
    return "";
  }
}

function browserInstallHelp() {
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return "In Safari, tap Share, then Add to Home Screen. If you opened this in another iPhone browser, open the page in Safari first.";
  }
  if (/Android/i.test(userAgent)) {
    return "In Chrome, tap the three-dot menu, then Install app or Add to Home screen. If the option is missing, update Chrome and try again later.";
  }
  return "Open this page in Chrome, then use the browser menu and choose Install app or Create shortcut. Some browsers do not support app installation.";
}

function installActionLabel() {
  if (typeof navigator === "undefined") return "Install app";
  const userAgent = navigator.userAgent;
  return /Chrome\//.test(userAgent) && !/(?:Edg|OPR|SamsungBrowser|Vivaldi)\//.test(userAgent)
    ? "Add Chrome shortcut"
    : "Install app";
}

export function InstallAppPrompt() {
  const [installState, setInstallState] = useState<PwaInstallState>(() => getPwaInstallState());
  const inInstalledApp = isStandalonePwa();
  const [ready, setReady] = useState(false);
  const [installPromptDismissed, setInstallPromptDismissed] = useState(false);
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [dismissedUpdateBuildId, setDismissedUpdateBuildId] = useState("");
  const [activeTab, setActiveTab] = useState<PopupTab>("install");
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("checking");
  const [latestBuildId, setLatestBuildId] = useState("");
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    initializePwaInstallCapture();
    setDismissedUpdateBuildId(readDismissedUpdateBuildId());
    const unsubscribe = subscribePwaInstallState(setInstallState);
    setReady(true);
    return unsubscribe;
  }, []);

  const checkForUpdate = useCallback(async () => {
    setUpdateStatus("checking");
    try {
      const response = await fetch(`/api/app-version?check=${Date.now()}`, {
        cache: "no-store",
        headers: { "cache-control": "no-cache", pragma: "no-cache" },
      });
      if (!response.ok) throw new Error("Version check failed");
      const result: unknown = await response.json();
      const serverBuildId = typeof result === "object" && result !== null && "buildId" in result
        ? String(result.buildId)
        : "";
      setLatestBuildId(serverBuildId);
      const available = isAppUpdateAvailable(getAppBuildId(), serverBuildId);
      setUpdateStatus(available ? "available" : "current");
      if (available && inInstalledApp) setActiveTab("update");
    } catch {
      setUpdateStatus("unavailable");
    }
  }, [inInstalledApp]);

  useEffect(() => {
    if (!ready || !inInstalledApp) return;
    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
    const handleFocus = () => void checkForUpdate();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkForUpdate, inInstalledApp, ready]);

  const updateAvailable = updateStatus === "available" && isAppUpdateAvailable(getAppBuildId(), latestBuildId);
  const showUpdatePopup = inInstalledApp && updateAvailable && latestBuildId !== dismissedUpdateBuildId;
  const showInstallPopup = !installState.installed && !installPromptDismissed;
  const shouldShow = ready && (showUpdatePopup || (!installState.installed && (showInstallPopup || shortcutDialogOpen)));
  const showShortcutLauncher = ready && !installState.installed && !showUpdatePopup && !showInstallPopup && !shortcutDialogOpen;

  useEffect(() => {
    if (showUpdatePopup) setActiveTab("update");
    else if (showInstallPopup) setActiveTab("install");
  }, [showInstallPopup, showUpdatePopup]);

  function openShortcutDialog() {
    setActiveTab("install");
    setShowSteps(false);
    setInstallMessage("");
    setShortcutDialogOpen(true);
  }

  if (!shouldShow) {
    return showShortcutLauncher ? <button type="button" onClick={openShortcutDialog} className="fixed bottom-20 right-4 z-[9998] inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-white/95 px-4 py-2 text-sm font-extrabold text-emerald-900 shadow-lg shadow-slate-950/20 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:right-5">
      <Download size={17} aria-hidden="true" />{installActionLabel()}
    </button> : null;
  }

  async function install() {
    setInstallMessage("");
    if (!installState.available) {
      setShowSteps((open) => !open);
      return;
    }
    setBusy(true);
    try {
      const result = await requestPwaInstall();
      if (result === "accepted") setInstallMessage("Mukuyu Junior School is being added to your device.");
      else if (result === "dismissed") setInstallMessage("Installation was cancelled. You can try again whenever you are ready.");
      else setShowSteps(true);
    } catch {
      setShowSteps(true);
      setInstallMessage("Your browser could not open its install dialog. Use the steps below instead.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setShortcutDialogOpen(false);
    if (showUpdatePopup) {
      setDismissedUpdateBuildId(latestBuildId);
      try { localStorage.setItem(UPDATE_DISMISSED_KEY, latestBuildId); } catch { /* Storage may be blocked. */ }
      return;
    }
    setInstallPromptDismissed(true);
  }

  return (
    <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[9999] mx-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto overscroll-contain sm:inset-x-auto sm:right-5 sm:top-5" aria-live="polite">
      <section role="dialog" aria-modal="false" aria-labelledby="app-prompt-title" className="relative overflow-hidden rounded-2xl border border-sky-200 bg-white text-slate-900 shadow-2xl shadow-slate-950/30">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-amber-400" aria-hidden="true" />
        <div className="flex items-start gap-3 p-4 pb-3 sm:p-5 sm:pb-4">
          <img src="/__grok/school-app-icon.png" alt="" width={56} height={56} className="size-14 shrink-0 rounded-2xl border border-slate-200 shadow-sm" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-emerald-800">MUKUYU JUNIOR SCHOOL</p>
            <h2 id="app-prompt-title" className="mt-1 text-lg font-extrabold leading-tight text-slate-950">School app access</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">Install the school portal or refresh an older installed version.</p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Remind me later and close app prompt" className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 sm:px-5">
          <div role="tablist" aria-label="App actions" className={`${installState.installed ? "grid-cols-2" : "grid-cols-1"} grid rounded-xl bg-slate-100 p-1`}>
            <button type="button" role="tab" id="app-install-tab" aria-selected={activeTab === "install"} aria-controls="app-install-panel" onClick={() => setActiveTab("install")} className={`min-h-10 rounded-lg px-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${activeTab === "install" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <Download className="mr-1.5 inline-block" size={16} aria-hidden="true" />Install app
            </button>
            {inInstalledApp ? <button type="button" role="tab" id="app-update-tab" aria-selected={activeTab === "update"} aria-controls="app-update-panel" onClick={() => setActiveTab("update")} className={`min-h-10 rounded-lg px-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${activeTab === "update" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <RefreshCw className="mr-1.5 inline-block" size={15} aria-hidden="true" />Update app
            </button> : null}
          </div>
        </div>

        {activeTab === "install" || !inInstalledApp ? (
          <div role="tabpanel" id="app-install-panel" aria-labelledby="app-install-tab" className="p-4 pt-3 sm:p-5 sm:pt-4">
            {installState.installed ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><Check className="mr-1.5 inline" size={16} aria-hidden="true" />This device is already using the installed app.</p>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-slate-700">Add the secure school portal to your home screen or create a Chrome shortcut for quick access. It is the same website; no app-store account or new school login is needed.</p>
                <button type="button" onClick={() => void install()} disabled={busy} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-900 disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                  <Download size={17} aria-hidden="true" />{busy ? "Opening install…" : installActionLabel()}
                </button>
                {installMessage ? <p className="mt-2 text-sm text-slate-700" role="status">{installMessage}</p> : null}
                {showSteps ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950" role="status"><p className="font-bold">Install from your browser</p><p className="mt-1">{browserInstallHelp()}</p></div> : null}
                {!installState.available && !showSteps ? <p className="mt-2 text-center text-xs text-slate-500">If the browser install prompt is not available, this button shows the steps for your device.</p> : null}
              </>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="app-update-panel" aria-labelledby="app-update-tab" className="p-4 pt-3 sm:p-5 sm:pt-4">
            {!installState.installed ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">Updates apply to the installed app. Install it first, then open it while online to check for a newer version.</div>
            ) : updateStatus === "available" ? (
              <>
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950"><strong>A newer version is ready.</strong> Reload now to open the latest school portal.</p>
                <button type="button" onClick={() => window.location.reload()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-indigo-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"><RefreshCw size={17} aria-hidden="true" />Update now</button>
              </>
            ) : updateStatus === "checking" ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">Checking whether a newer app version is available…</p>
            ) : updateStatus === "unavailable" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950"><p>Could not check for updates. Connect to the internet and check again.</p><button type="button" onClick={() => void checkForUpdate()} className="mt-2 font-bold underline underline-offset-2">Check again</button></div>
            ) : (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><Check className="mr-1.5 inline" size={16} aria-hidden="true" />Your installed app is up to date.</p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Updates are checked online. If one is ready, reloading opens the latest deployed website version.</p>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[.18em] text-slate-500 sm:px-5">Developed by IAN TECH</div>
      </section>
    </div>
  );
}
