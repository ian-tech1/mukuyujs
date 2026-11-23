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
import { applyDisplayPreferences, DEFAULT_DISPLAY_PREFERENCES, DISPLAY_PALETTES, NATURE_BACKDROP_SCENE_LABELS, readDisplayPreferences, saveDisplayPreferences, type LocalDisplayPreferences } from "@/lib/school/display";

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

function NatureBackdropArt({ scene }: { scene: number }) {
  const art = [
    <g key="rain"><path d="M250 265c-48 0-84-32-84-73 0-39 31-69 73-73 20-53 71-85 128-77 52 7 88 43 97 92 41 4 70 32 70 68 0 38-33 63-77 63H250Z"/><g className="portal-nature-rain"><path d="m245 296-17 49m83-49-17 49m83-49-17 49m83-49-17 49m82-49-17 49"/></g></g>,
    <g key="trees"><path d="M80 520h1040M210 520V250m-72 100 72-153 74 153m-117-41 43-85 44 85m457 211V198m-103 140 103-212 103 212m-157-57 157-260 158 260m-204-77 46-76 47 76m-150 318V312m-68 102 68-142 68 142"/></g>,
    <g key="stars"><path d="M918 123a112 112 0 1 0 91 178 124 124 0 0 1-91-178Z"/><path d="m274 140 12 32 34 2-26 20 9 33-29-18-29 18 9-33-26-20 34-2 12-32Zm206 110 8 22 24 1-19 14 7 24-20-14-21 14 8-24-19-14 24-1 8-22Zm405-92 9 25 27 1-21 16 8 26-23-15-23 15 8-26-21-16 27-1 9-25Z"/></g>,
    <g key="clouds" className="portal-nature-cloud-drift"><path d="M104 350c-36 0-63-24-63-55 0-29 23-52 55-55 15-40 53-64 97-58 39 5 66 32 73 69 31 3 53 24 53 51 0 29-25 48-58 48H104Zm570-117c-28 0-49-19-49-43 0-23 18-41 43-43 12-31 42-50 76-45 31 4 52 25 57 54 24 2 42 19 42 40 0 23-20 37-46 37H674Z"/><path d="M695 454c-24 0-42-16-42-37 0-20 15-35 37-37 10-27 36-43 65-39 26 3 44 21 49 47 21 2 36 16 36 35 0 19-17 31-39 31H695Z"/></g>,
    <g key="birds" className="portal-nature-birds"><path d="M170 250q56-68 112 0 56-68 112 0m118-96q47-57 94 0 47-57 94 0m-48 224q42-51 84 0 42-51 84 0m96-167q35-43 70 0 35-43 70 0"/></g>,
    <g key="elephant"><path d="M216 428c-39-21-53-63-41-108l22-81c14-51 58-82 113-82h172c72 0 128 54 128 123v119c0 36-28 64-64 64h-30v-92H307v91h-31v-84c-21 20-40 34-60 50Zm391-207c31 10 52 39 52 76v60c0 43-23 77-61 90m-270-52c0 40-23 69-54 69m8-188c20-18 50-26 77-21m158 173 14 34m-70-34 13 34m86-180 15 35m-79-34 12 34m-88 25c-6 34 4 57 25 67m-63-184v29m-26-29v29"/></g>,
    <g key="giraffe"><path d="M327 511V309l28-105 12-98 37-42 38 42-10 98 45 105v202m-150-174h116m-106-53h92m-69-99h42m-42 39h43m-37 38h40m-82 148v139m124-139v139m-97-271-29-41m104 40 31-38m-117-79-17-31m90 31 17-31m-85 184h31m52 0h29"/><path d="M385 102h25m-21-18h21"/></g>,
    <g key="butterfly" className="portal-nature-butterfly"><path d="M600 280c-40-92-191-127-211-38-16 72 91 112 211 86-93 60-96 151-37 156 54 5 75-74 37-156 38 82 107 137 150 106 48-35 2-119-150-106 120 26 227-14 211-86-20-89-171-54-211 38Zm0-12v246m-5-242-38-52m48 52 38-52"/><circle cx="600" cy="281" r="13"/></g>,
    <g key="fish"><path d="M163 317c95-108 270-134 418-44l129-85-25 105c83 26 150 61 211 113-61 52-128 87-211 113l25 105-129-85c-148 90-323 64-418-44l-79 53 20-84-62-58 62-58-20-84 79 53Z"/><circle cx="358" cy="311" r="11"/><path d="M439 276q47 41 0 82m70-100q54 59 0 118m-68-25 47 51m-48-100 47-51"/></g>,
    <g key="lion"><circle cx="600" cy="315" r="186"/><path d="m600 97 26 36 42-27 12 44 49-7-4 48 47 15-23 42 37 31-36 31 22 43-47 14 4 49-49-7-12 44-42-27-24 37-24-37-42 27-12-44-49 7 4-49-47-14 22-43-36-31 37-31-23-42 47-15-4-48 49 7 12-44 42 27 26-36Zm-68 184c-20-26-49-32-67-17m203 0c-18-15-47-9-67 17m-95 85q27 43 67 4 40 39 67-4m-67-39v39m-45 27q45 35 90 0"/></g>,
    <g key="rabbits"><path d="M285 492c-47-16-69-58-53-97 12-30 43-45 81-40 4-53 16-111 45-114 33-3 28 68 25 112 10-59 28-104 55-96 31 9 7 87-5 128 55-20 107 2 115 42 9 44-34 77-94 79-60 2-115 1-169-14Zm397 4c-38-15-54-50-40-81 11-25 36-37 67-33 3-44 13-91 37-93 27-2 23 56 20 92 8-49 23-86 45-79 26 7 6 72-4 106 45-16 88 2 95 35 7 37-29 64-78 66-50 2-96 0-142-13Z"/><circle cx="384" cy="397" r="4"/><circle cx="766" cy="411" r="4"/></g>,
    <g key="deer"><path d="M298 347c44-43 112-56 177-39l107 27 90-51 52 20 36 47-39 44-54-13-83 64-151-3-79 68m100-63-22 97m149-100 22 101m-208-211-46-54-37-85m37 85 16-86m30 116 45-53 39-83m-39 83-14-87m122 121 44-25"/><path d="M904 293c34-34 66-31 87-2m-86 3 12-61m-12 61 49-45m-49 45 70-27"/></g>,
    <g key="mountains"><path d="m65 467 214-267 146 175 165-230 248 322 116-152 181 152H65Z"/><path d="m236 255 43-55 44 55m267-55 45-55 48 62m-323 270V356m-43 111V389m86 78V372m-45-13-42-73-42 73m548 108V363m-41 104V392m82 75V378m-41-15-41-71-41 71"/></g>,
    <g key="leaves" className="portal-nature-leaves"><path d="M601 500c-3-134 13-240 116-361m-93 232c-96-5-162-52-182-135 84-9 152 28 182 135Zm35-73c105-12 166-67 176-148-82-2-146 43-176 148Zm-10 102c-91-4-147-46-159-118 71-4 129 35 159 118Zm26-178c89-18 130-62 138-123-70 3-116 39-138 123Z"/></g>,
    <g key="owl"><path d="M381 498c-19-71-10-165 10-227l-16-124 107 72c49-18 107-18 156 0l107-72-16 124c20 62 29 156 10 227-44 61-111 91-179 91s-135-30-179-91Z"/><circle cx="495" cy="342" r="53"/><circle cx="625" cy="342" r="53"/><circle cx="495" cy="342" r="13"/><circle cx="625" cy="342" r="13"/><path d="m548 398 25 34 25-34m-151 156-31 36m236-36 31 36m-263-216-52-17m371 17 52-17m-259-74 22-39m74 39 22-39"/></g>,
  ];
  return <svg className="portal-nature-art" viewBox="0 0 1200 650" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">{art[scene]}</g></svg>;
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
    const resetScene = () => setBackdropScene(0);
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
          {NATURE_BACKDROP_SCENE_LABELS.map((label, scene) => <span key={label} className="portal-nature-scene" data-nature-scene={scene} data-active={backdropScene === scene} aria-hidden="true"><NatureBackdropArt scene={scene} /></span>)}
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
