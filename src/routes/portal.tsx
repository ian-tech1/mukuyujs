import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Palette, SlidersHorizontal, X } from "lucide-react";
import { SchoolLogo } from "@/components/school/logo";
import { AnalysisView } from "@/components/school/analysis-view";
import { DashboardView } from "@/components/school/dashboard-view";
import { LearnersView } from "@/components/school/learners-view";
import { MailView } from "@/components/school/mail-view";
import { MarklistsView } from "@/components/school/marklists-view";
import { MarksView } from "@/components/school/marks-view";
import { ReportsView } from "@/components/school/reports-view";
import { ResultsView } from "@/components/school/results-view";
import { SettingsView } from "@/components/school/settings-view";
import { StaffView } from "@/components/school/staff-view";
import { TimetableView } from "@/components/school/timetable-view";
import { SchoolServicesView } from "@/components/school/school-services-view";
import { QrParentFeedbackInbox } from "@/components/school/qr-parent-feedback-inbox";
import { StaffMusicDock } from "@/components/school/music-dock";
import { getWorkspace, getWelcomePage, logout } from "@/lib/school/api";
import { visibleViews, type Workspace } from "@/lib/school/model";
import { parseMusicSetting, type MusicOptions } from "@/lib/school/music";
import { applyDisplayPreferences, DEFAULT_DISPLAY_PREFERENCES, DISPLAY_PALETTES, readDisplayPreferences, saveDisplayPreferences, type LocalDisplayPreferences } from "@/lib/school/display";

const LABELS: Record<string, string> = {
  home: "Overview",
  learners: "Learners",
  marks: "Enter marks",
  analysis: "Analysis",
  reports: "Report cards",
  marklists: "Mark lists",
  staff: "Staff",
  mail: "Mail log",
  timetable: "Timetable",
  services: "School Services",
  "parent-feedback": "Parents Feedback",
  settings: "Settings",
  results: "My results",
};

export const Route = createFileRoute("/portal")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: typeof search.view === "string" ? search.view : "home",
  }),
  component: PortalPage,
});

function PortalPage() {
  const navigate = useNavigate();
  const { view } = Route.useSearch();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [staffMusic, setStaffMusic] = useState<{ enabled: boolean; url: string; options?: Partial<MusicOptions> }>({ enabled: false, url: "" });
  const [display, setDisplay] = useState<LocalDisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const displayControlsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const next = await getWorkspace();
    setWs(next);
  }, []);

  useEffect(() => {
    refresh().catch(() => navigate({ to: "/", search: { c: undefined } }));
    getWelcomePage().then((settings) => {
      const music = parseMusicSetting(settings.musicUrl || "");
      setStaffMusic({ enabled: Boolean(settings.musicEnabled), url: settings.musicUrl || "", options: music.options });
      document.documentElement.dataset.schoolAppearance = JSON.stringify(settings.appearance);
      applyDisplayPreferences(readDisplayPreferences());
    }).catch(() => undefined);
  }, [refresh, navigate]);

  useEffect(() => {
    const preferences = readDisplayPreferences();
    setDisplay(preferences);
    applyDisplayPreferences(preferences);
  }, []);

  useEffect(() => {
    setOpen(false);
    setDisplaySettingsOpen(false);
    window.scrollTo(0, 0);
  }, [view]);

  useEffect(() => {
    if (!displaySettingsOpen) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!displayControlsRef.current?.contains(event.target as Node)) setDisplaySettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDisplaySettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [displaySettingsOpen]);

  const flash = useCallback((message: string, bad?: boolean) => {
    if (bad) {
      setError(message);
      setNotice("");
    } else {
      setNotice(message);
      setError("");
    }
    window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 4200);
  }, []);

  function updateDisplay(patch: Partial<LocalDisplayPreferences>) {
    const next = { ...display, ...patch };
    setDisplay(next);
    saveDisplayPreferences(next);
  }

  const paletteIndex = DISPLAY_PALETTES.findIndex((palette) => palette.id === display.theme);
  const nextPalette = DISPLAY_PALETTES[(paletteIndex + 1 + DISPLAY_PALETTES.length) % DISPLAY_PALETTES.length];
  const currentPaletteName = DISPLAY_PALETTES.find((palette) => palette.id === display.theme)?.name ?? "School colours";

  if (!ws) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        <div className="text-center">
          <SchoolLogo className="mx-auto size-16" />
          <p className="mt-4 text-sm text-muted">Opening the school office…</p>
        </div>
      </main>
    );
  }

  const views = visibleViews(ws.me, ws.roleAccess);
  const current = views.includes(view) ? view : views[0];
  const gate = { ws, refresh, flash, onWelcomeChange: (settings: { enabled: boolean; url: string }) => setStaffMusic({ ...settings, options: parseMusicSetting(settings.url || "").options }) };

  return (
    <div className="portal-animated-background min-h-screen bg-paper lg:grid lg:grid-cols-[16rem_1fr]">
      <aside id="portal-navigation" aria-label="Main navigation" className={`${open ? "fixed inset-0 z-20" : "hidden"} bg-navy text-paper lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <SchoolLogo className="size-10" />
            <div>
              <p className="font-serif text-sm leading-tight">Mukuyu JSS</p>
              <p className="text-xs text-brass-soft">Exam portal</p>
            </div>
          </div>
          <button className="lg:hidden" type="button" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </button>
        </div>
        <nav className="px-3">
          {views.map((item) => (
            <button
              key={item}
              type="button"
              className={`mb-1 flex h-11 w-full items-center rounded-md px-3 text-left text-sm ${current === item ? "bg-navy-2 text-brass-soft" : "text-paper/85"}`}
              aria-current={current === item ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                setDisplaySettingsOpen(false);
                window.scrollTo(0, 0);
                void navigate({ to: "/portal", search: { view: item } });
              }}
            >
              {LABELS[item] ?? item}
            </button>
          ))}
        </nav>
        <div className="mt-6 border-t border-white/10 px-4 py-4 text-xs text-paper/70">
          <p className="font-semibold text-paper">{ws.me.fullName}</p>
          <p>{ws.me.email}</p>
          <button
            className="mt-3 text-sm font-semibold text-brass-soft"
            type="button"
            onClick={async () => {
              await logout();
              navigate({ to: "/", search: { c: undefined } });
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div>
        <header className="relative flex items-center justify-between border-b border-line bg-card px-4 py-3 lg:px-8">
          <button className="lg:hidden" type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="portal-navigation">
            <Menu />
          </button>
          <p className="text-sm text-muted">
            {ws.profile.termName} {ws.profile.academicYear}
          </p>
          <div className="relative flex items-center gap-2" ref={displayControlsRef}>
            <p className="hidden pr-1 text-sm font-medium sm:block">{LABELS[current]}</p>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3 text-xs font-semibold text-navy shadow-sm"
              aria-label={`One-tap colour change. Current theme: ${currentPaletteName}. Next theme: ${nextPalette.name}.`}
              title={`Tap once to switch to ${nextPalette.name}`}
              onClick={() => updateDisplay({ theme: nextPalette.id })}
            >
              <Palette size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Colour</span>
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3 text-xs font-semibold text-navy shadow-sm"
              aria-expanded={displaySettingsOpen}
              aria-controls="quick-display-controls"
              onClick={() => setDisplaySettingsOpen((value) => !value)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Display</span>
            </button>
            {displaySettingsOpen ? <section id="quick-display-controls" className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-card p-4 shadow-2xl" aria-label="Quick display settings">
              <div className="mb-3"><h2 className="font-semibold text-navy">Quick display</h2><p className="text-xs text-muted">Changes apply immediately and are saved on this device.</p></div>
              <div className="space-y-2" role="group" aria-label="Choose a colour theme">
                <button type="button" className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${display.theme === null ? "border-navy bg-navy/5 font-semibold text-navy" : "border-line hover:bg-paper"}`} aria-pressed={display.theme === null} onClick={() => { updateDisplay({ theme: null }); setDisplaySettingsOpen(false); }}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-paper text-xs" aria-hidden="true">S</span>
                  <span className="flex-1">Follow school colours</span>
                  {display.theme === null ? <span aria-hidden="true">✓</span> : null}
                </button>
                {DISPLAY_PALETTES.map((palette) => <button key={palette.id} type="button" className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${display.theme === palette.id ? "border-navy bg-navy/5 font-semibold text-navy" : "border-line hover:bg-paper"}`} aria-pressed={display.theme === palette.id} onClick={() => { updateDisplay({ theme: palette.id }); setDisplaySettingsOpen(false); }}>
                  <span className="size-8 shrink-0 rounded-full border border-black/10 shadow-sm" style={{ background: `linear-gradient(135deg, ${palette.colors.navy}, ${palette.colors.info}, ${palette.colors.brass})` }} aria-hidden="true" />
                  <span className="flex-1">{palette.name}</span>
                  {display.theme === palette.id ? <span aria-hidden="true">✓</span> : null}
                </button>)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2"><label className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Font<select className="mt-1 w-full bg-transparent text-xs" value={display.fontFamily} onChange={(event) => updateDisplay({ fontFamily: event.target.value as LocalDisplayPreferences["fontFamily"] })}><option value="sans">Source Sans</option><option value="serif">Serif</option><option value="system">System</option><option value="mono">Mono</option></select></label><label className="rounded-xl border border-line px-3 py-2 text-xs font-semibold">Text size<select className="mt-1 w-full bg-transparent text-xs" value={display.fontScale} onChange={(event) => updateDisplay({ fontScale: event.target.value as LocalDisplayPreferences["fontScale"] })}><option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option></select></label>
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-left text-xs font-semibold" aria-pressed={display.density === "compact"} onClick={() => updateDisplay({ density: display.density === "compact" ? "comfortable" : "compact" })}>{display.density === "compact" ? "Compact spacing ✓" : "Comfortable spacing"}</button>
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-left text-xs font-semibold" aria-pressed={display.accentMotion} onClick={() => updateDisplay({ accentMotion: !display.accentMotion })}>{display.accentMotion ? "Moving colours: on" : "Moving colours: off"}</button><button type="button" className="rounded-xl border border-line px-3 py-2 text-left text-xs font-semibold" aria-pressed={display.motion} onClick={() => updateDisplay({ motion: !display.motion })}>{display.motion ? "Colour motion: on" : "Colour motion: off"}</button>
              </div>
              <div className="mt-4 border-t border-line pt-3"><h3 className="text-xs font-bold uppercase tracking-wide text-navy">Welcome page design</h3><p className="mt-1 text-xs text-muted">The 14 shared welcome-page display and colour controls are saved centrally by the Super Admin.</p>{ws.me.role === "super_admin" ? <button type="button" className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => { setDisplaySettingsOpen(false); navigate({ to: "/portal", search: { view: "settings" } }); }}>Open welcome screen designer</button> : <p className="mt-2 text-xs text-muted">Your colour, font, size and spacing choices above remain private to this device.</p>}</div><button type="button" className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => updateDisplay(DEFAULT_DISPLAY_PREFERENCES)}>Reset display and follow school defaults</button>
            </section> : null}
          </div>
        </header>
        <div className="portal-page-content px-4 py-6 lg:px-8">
          {error ? <p className="mb-4 rounded-md border border-bad/30 bg-card px-3 py-2 text-sm text-bad">{error}</p> : null}
          {notice ? <p className="mb-4 rounded-md border border-good/30 bg-card px-3 py-2 text-sm text-good">{notice}</p> : null}
          {current === "home" ? <DashboardView {...gate} /> : null}
          {current === "learners" ? <LearnersView {...gate} /> : null}
          {current === "marks" ? <MarksView {...gate} /> : null}
          {current === "analysis" ? <AnalysisView {...gate} /> : null}
          {current === "reports" ? <ReportsView {...gate} /> : null}
          {current === "marklists" ? <MarklistsView {...gate} /> : null}
          {current === "staff" ? <StaffView {...gate} /> : null}
          {current === "mail" ? <MailView {...gate} /> : null}
          {current === "timetable" ? <TimetableView {...gate} /> : null}
          {current === "services" ? <SchoolServicesView {...gate} /> : null}
          {current === "parent-feedback" ? <QrParentFeedbackInbox flash={flash} /> : null}
          {current === "settings" ? <SettingsView {...gate} /> : null}
          {current === "results" ? <ResultsView {...gate} /> : null}
        </div>
      </div>
      {ws.me.active ? <StaffMusicDock url={staffMusic.enabled ? staffMusic.url : ""} options={staffMusic.options || {}} /> : null}
    </div>
  );
}
