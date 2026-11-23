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
import { normalizeWelcomeDisplay } from "@/lib/school/welcome-display";
import { applyDisplayPreferences, DEFAULT_DISPLAY_PREFERENCES, DISPLAY_PALETTES, NATURE_BACKDROP_SCENES, NATURE_BACKDROP_SCENE_LABELS, readDisplayPreferences, saveDisplayPreferences, type LocalDisplayPreferences } from "@/lib/school/display";

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

function NatureBackdropVideo({ scene, visible, motionEnabled }: { scene: number; visible: boolean; motionEnabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = NATURE_BACKDROP_SCENES[scene]?.src ?? NATURE_BACKDROP_SCENES[0].src;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (!visible) return;
    video.load();
    if (!motionEnabled) return;
    const playWhenReady = () => {
      if (visible && motionEnabled) void video.play().catch(() => undefined);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) playWhenReady();
    else video.addEventListener("canplay", playWhenReady, { once: true });
    return () => {
      video.removeEventListener("canplay", playWhenReady);
      video.pause();
    };
  }, [source, visible, motionEnabled]);

  return <div className="portal-nature-scene" data-active={visible} aria-hidden="true">
    <video ref={videoRef} className="portal-nature-video" src={visible ? source : undefined} muted loop playsInline preload={visible ? "auto" : "none"} />
  </div>;
}

function PortalPage() {
  const navigate = useNavigate();
  const { view } = Route.useSearch();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [staffMusic, setStaffMusic] = useState<{ enabled: boolean; url: string; options?: Partial<MusicOptions> }>({ enabled: false, url: "" });
  const [display, setDisplay] = useState<LocalDisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const [dashboardPanelColorsEnabled, setDashboardPanelColorsEnabled] = useState(true);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [backdropScene, setBackdropScene] = useState(0);
  const [backdropTheme, setBackdropTheme] = useState("auto-sections");
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const displayControlsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const next = await getWorkspace();
    setWs(next);
  }, []);

  useEffect(() => {
    refresh().catch(() => navigate({ to: "/", search: { c: undefined } }));
    getWelcomePage().then((settings) => {
      const music = parseMusicSetting(settings.musicUrl || "");
      setDashboardPanelColorsEnabled(normalizeWelcomeDisplay(settings.display).dashboardPanelColorsEnabled);
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
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!display.motion || display.backgroundMode !== "animated" || systemReducedMotion) return;
    const timer = window.setInterval(() => {
      const count = document.documentElement.dataset.portalBackdropTheme === "nature-cycle" ? NATURE_BACKDROP_SCENE_LABELS.length : 18;
      setBackdropScene((scene) => (scene + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [display.backgroundMode, display.motion, systemReducedMotion]);

  useEffect(() => {
    const resetScene = () => {
      setBackdropScene(0);
      setBackdropTheme(document.documentElement.dataset.portalBackdropTheme || "auto-sections");
    };
    resetScene();
    window.addEventListener("mukuyu-portal-backdrop-change", resetScene);
    return () => window.removeEventListener("mukuyu-portal-backdrop-change", resetScene);
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
      <main className="portal-loading grid min-h-screen place-items-center bg-paper px-6">
        <div className="portal-loading-aurora" aria-hidden="true" />
        <div className="portal-loading-ribbon-field" aria-hidden="true">
          <span className="portal-loading-ribbon portal-loading-ribbon-one" />
          <span className="portal-loading-ribbon portal-loading-ribbon-two" />
          <span className="portal-loading-ribbon portal-loading-ribbon-three" />
          <span className="portal-loading-ribbon portal-loading-ribbon-four" />
          <span className="portal-loading-ribbon-orb portal-loading-ribbon-orb-one" />
          <span className="portal-loading-ribbon-orb portal-loading-ribbon-orb-two" />
        </div>
        <div className="portal-loading-rays" aria-hidden="true" />
        <div className="portal-loading-atom" aria-hidden="true" />
        <div className="portal-loading-orbit-glints" aria-hidden="true" />
        <div className="portal-loading-stars" aria-hidden="true" />
        <div className="portal-loading-dust" aria-hidden="true" />
        <div className="portal-loading-motes" aria-hidden="true">
          <span className="portal-loading-mote portal-loading-mote-one" />
          <span className="portal-loading-mote portal-loading-mote-two" />
          <span className="portal-loading-mote portal-loading-mote-three" />
          <span className="portal-loading-mote portal-loading-mote-four" />
          <span className="portal-loading-mote portal-loading-mote-five" />
          <span className="portal-loading-mote portal-loading-mote-six" />
        </div>
        <div className="portal-loading-comets" aria-hidden="true">
          <span className="portal-loading-comet portal-loading-comet-one" />
          <span className="portal-loading-comet portal-loading-comet-two" />
          <span className="portal-loading-comet portal-loading-comet-three" />
        </div>
        <div className="portal-loading-orbiting-objects" aria-hidden="true">
          <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-one" />
          <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-two" />
          <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-three" />
          <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-four" />
          <span className="portal-loading-object portal-loading-object-ring portal-loading-object-five" />
          <span className="portal-loading-object portal-loading-object-ring portal-loading-object-six" />
          <span className="portal-loading-object portal-loading-object-ring portal-loading-object-seven" />
          <span className="portal-loading-object portal-loading-object-ring portal-loading-object-eight" />
          <span className="portal-loading-object portal-loading-object-star portal-loading-object-nine" />
          <span className="portal-loading-object portal-loading-object-star portal-loading-object-ten" />
          <span className="portal-loading-object portal-loading-object-hex portal-loading-object-eleven" />
          <span className="portal-loading-object portal-loading-object-hex portal-loading-object-twelve" />
          <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-thirteen" />
          <span className="portal-loading-object portal-loading-object-ring portal-loading-object-fourteen" />
          <span className="portal-loading-object portal-loading-object-star portal-loading-object-fifteen" />
          <span className="portal-loading-object portal-loading-object-hex portal-loading-object-sixteen" />
          <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-seventeen" />
          <span className="portal-loading-object portal-loading-object-ring portal-loading-object-eighteen" />
          <span className="portal-loading-object portal-loading-object-star portal-loading-object-nineteen" />
          <span className="portal-loading-object portal-loading-object-hex portal-loading-object-twenty" />
        </div>
        <div className="portal-loading-card text-center" role="status" aria-live="polite">
          <p className="portal-loading-monogram" aria-label="Mukuyu Junior School initials"><span>MJS</span></p>
          <p className="portal-loading-kicker portal-loading-box portal-loading-box-kicker">MUKUYU JUNIOR SCHOOL · LEARNING PORTAL</p>
          <span className="portal-loading-orbit" aria-hidden="true"><SchoolLogo className="size-24" /></span>
          <h1 className="portal-loading-title portal-loading-box portal-loading-box-title mt-5">Mukuyu Junior School</h1>
          <p className="portal-loading-tagline portal-loading-box portal-loading-box-tagline mt-2">Learn with purpose. Grow with confidence.</p>
          <p className="portal-loading-message portal-loading-box portal-loading-box-message mt-4 text-sm">Opening your school office and getting everything ready…</p>
          <div className="portal-loading-track mt-6" aria-hidden="true"><span /></div>
          <div className="portal-loading-footnote portal-loading-box portal-loading-box-footnote mt-3"><span>Preparing your learning space</span><span className="portal-loading-live"><i aria-hidden="true" /> IN MOTION</span></div>
        </div>
      </main>
    );
  }

  const views = visibleViews(ws.me, ws.roleAccess);
  const current = views.includes(view) ? view : views[0];
  const gate = { ws, refresh, flash, onWelcomeChange: (settings: { enabled: boolean; url: string }) => setStaffMusic({ ...settings, options: parseMusicSetting(settings.url || "").options }) };

  return (
    <div className="portal-animated-background min-h-screen w-full min-w-0 max-w-none overflow-x-clip bg-paper lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]" data-portal-section={current}>
      <aside id="portal-navigation" aria-label="Main navigation" className={`${open ? "fixed inset-0 z-20" : "hidden"} bg-navy text-paper lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <SchoolLogo className="size-10" />
            <div>
              <span className="portal-nav-monogram" aria-label="Mukuyu Junior School initials">MJS</span>
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
          <button className="lg:hidden" type="button" onClick={() => { setDisplaySettingsOpen(false); setOpen(true); }} aria-label="Open menu" aria-expanded={open} aria-controls="portal-navigation">
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
              <div className="mb-3 rounded-xl border border-line p-3">
                <p className="mb-2 text-xs font-semibold text-navy">Large background colours</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose large background colours">
                  <button type="button" className={`rounded-lg border px-2 py-2 text-xs font-semibold ${display.backgroundMode === "animated" ? "border-navy bg-navy/5 text-navy" : "border-line hover:bg-paper"}`} aria-pressed={display.backgroundMode === "animated"} onClick={() => updateDisplay({ backgroundMode: "animated" })}>Animated Colours</button>
                  <button type="button" className={`rounded-lg border px-2 py-2 text-xs font-semibold ${display.backgroundMode === "original" ? "border-navy bg-navy/5 text-navy" : "border-line hover:bg-paper"}`} aria-pressed={display.backgroundMode === "original"} onClick={() => updateDisplay({ backgroundMode: "original" })}>Original Colours</button>
                </div>
              </div>
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
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-left text-xs font-semibold" aria-pressed={display.accentMotion} onClick={() => updateDisplay({ accentMotion: !display.accentMotion })}>{display.accentMotion ? "Panel colour effect: on" : "Panel colour effect: off"}</button><button type="button" className="rounded-xl border border-line px-3 py-2 text-left text-xs font-semibold" aria-pressed={display.motion} onClick={() => updateDisplay({ motion: !display.motion })}>{display.motion ? "Other motion: on" : "Other motion: off"}</button>
              </div>
              <div className="mt-4 border-t border-line pt-3"><h3 className="text-xs font-bold uppercase tracking-wide text-navy">Welcome page design</h3><p className="mt-1 text-xs text-muted">The 16 shared welcome and dashboard display controls are saved centrally by the Super Admin.</p>{ws.me.role === "super_admin" ? <button type="button" className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => { setDisplaySettingsOpen(false); navigate({ to: "/portal", search: { view: "settings" } }); }}>Open welcome screen designer</button> : <p className="mt-2 text-xs text-muted">Your colour, font, size and spacing choices above remain private to this device.</p>}</div><button type="button" className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold text-navy" onClick={() => updateDisplay(DEFAULT_DISPLAY_PREFERENCES)}>Reset display and follow school defaults</button>
            </section> : null}
          </div>
        </header>
        <div className={`portal-page-content w-full min-w-0 max-w-none px-4 py-6 lg:px-8 ${dashboardPanelColorsEnabled && display.motion && display.accentMotion ? "portal-panel-color-motion" : ""}`}>
          {Array.from({ length: 18 }, (_, scene) => <span key={scene} className="portal-background-scene" data-background-scene={scene} data-active={backdropScene === scene} aria-hidden="true" />)}
          <NatureBackdropVideo scene={backdropScene % NATURE_BACKDROP_SCENES.length} visible={backdropTheme === "nature-cycle" && display.backgroundMode === "animated"} motionEnabled={display.motion && !systemReducedMotion} />
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
