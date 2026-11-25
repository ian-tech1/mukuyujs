import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SchoolLogo } from "@/components/school/logo";
import { PortalLoadingBackdrop } from "@/components/school/portal-loading-backdrop";
import { isStandalonePwa } from "@/lib/pwa-install";
import { PublicReport } from "@/components/school/public-report";
import { btnClass, errText, inputClass } from "@/components/school/gate";
import { completeParentFirstLoginPasswordChange, getParentPasswordChangeStatus, getWorkspace, getWelcomePage, login, loginParent, logout, portalStatus, requestParentLoginCode, requestParentPasswordResetCode, resetParentPassword, verifyParentLoginCode } from "@/lib/school/api";
import { applyDisplayPreferences, DEFAULT_DISPLAY_PREFERENCES, DISPLAY_PALETTES, readDisplayPreferences, saveDisplayPreferences, type LocalDisplayPreferences } from "@/lib/school/display";
import { DEFAULT_WELCOME_DISPLAY, hexToRgba, normalizeWelcomeDisplay, type WelcomeDisplayOptions } from "@/lib/school/welcome-display";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    const code = typeof search.c === "string" ? search.c.trim().toLowerCase() : "";
    return { c: code || undefined };
  },
  component: GatePage,
});

function GatePage() {
  const { c } = Route.useSearch();
  if (c) return <PublicReport code={c} />;
  return <LoginPage />;
}

function safeWhatsAppGroupInvite(enabled: boolean | undefined, rawUrl: string | undefined) {
  if (!enabled || !rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "chat.whatsapp.com" ? url.toString() : "";
  } catch {
    return "";
  }
}

function OpeningIntro({ title, motto, logoSrc, durationSeconds, onComplete }: { title: string; motto: string; logoSrc?: string; durationSeconds: number; onComplete: () => void }) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds);
  const [standaloneApp, setStandaloneApp] = useState(false);
  const startedAt = useRef(Date.now());
  const countdownLabel = `Sign-in opens in ${secondsRemaining} ${secondsRemaining === 1 ? "second" : "seconds"}`;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const updateAppMode = () => setStandaloneApp(isStandalonePwa());
    updateAppMode();
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", updateAppMode);
    return () => media.removeEventListener("change", updateAppMode);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const durationMs = Math.max(1, durationSeconds * 1000);
    const remaining = Math.max(0, durationMs - (Date.now() - startedAt.current));
    const updateProgress = () => {
      const elapsedMs = Math.min(durationMs, Math.max(0, Date.now() - startedAt.current));
      setProgress(Math.round((elapsedMs / durationMs) * 100));
      setSecondsRemaining(Math.ceil((durationMs - elapsedMs) / 1000));
    };
    updateProgress();
    const interval = window.setInterval(updateProgress, 100);
    const timeout = window.setTimeout(() => { setVisible(false); onComplete(); }, remaining);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [durationSeconds, visible, onComplete]);

  function continueToSignIn() {
    setVisible(false);
    onComplete();
  }

  if (!visible) return null;
  return <div className={`portal-loading portal-loading-opening fixed inset-0 z-[2147483000] grid min-h-[100svh] w-full place-items-center overflow-hidden px-6 ${standaloneApp ? "portal-opening-app" : "portal-opening-link"}`} role="status" aria-live="polite" aria-label={`Opening ${title}`} onKeyDown={(event) => { if (!standaloneApp && event.key === "Escape") continueToSignIn(); }}>
    <PortalLoadingBackdrop className="portal-opening-backdrop" />
    <div className="portal-loading-center-shade" aria-hidden="true" />
    <span className="portal-opening-center-orbit" aria-hidden="true"><span className="portal-loading-orbit"><SchoolLogo src={logoSrc} className="size-24" /></span></span>
    <div className="portal-loading-card text-center">
      <img className="portal-launch-brand-card" src="/icons/mukuyu-app-icon.svg" alt="MUKUYU JUNIOR SCHOOL · MKJ · POWERED BY IAN TECH" width={512} height={512} />
      <div className="portal-loading-details">
        <p className="portal-loading-kicker">MUKUYU JUNIOR SCHOOL · LEARNING PORTAL</p>
        <span className="portal-loading-orbit" aria-hidden="true"><SchoolLogo src={logoSrc} className="size-24" /></span>
        <h1 id="opening-intro-title" className="portal-loading-title mt-5">{title}</h1>
        <p className="portal-loading-tagline mt-2">{motto}</p>
        <p id="opening-intro-description" className="portal-loading-message mt-4 text-sm">A brighter school day starts here. Welcome to the Mukuyu Junior School portal.</p>
        <div className="portal-loading-progress-meta mt-6" aria-hidden="true"><span>{countdownLabel}</span><strong>{progress}%</strong></div>
        <div className="portal-loading-track mt-2" role="progressbar" aria-label="Welcome splash progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={countdownLabel}><span style={{ width: `${progress}%` }} /></div>
        <button className="portal-loading-continue mt-6" type="button" autoFocus={!standaloneApp} onClick={continueToSignIn}>Continue to sign in</button>
        <p className="portal-loading-footnote mt-4 justify-center">MUKUYU JUNIOR SCHOOL · LEARN WITH PURPOSE</p>
        <p className="portal-loading-credit mt-2">PORTAL DEVELOPED BY IAN TECH</p>
      </div>
    </div>
  </div>;
}
function LoginPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ needsSetup: boolean; schoolName: string; motto: string; poBox: string; location: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [parentPasswordLoginOpen, setParentPasswordLoginOpen] = useState(true);
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [parentPasswordVisible, setParentPasswordVisible] = useState(false);
  const [parentPasswordChangeRequired, setParentPasswordChangeRequired] = useState(false);
  const [parentPasswordChangeEmail, setParentPasswordChangeEmail] = useState("");
  const [parentFirstPassword, setParentFirstPassword] = useState("");
  const [parentConfirmFirstPassword, setParentConfirmFirstPassword] = useState("");
  const [parentPasswordChangeBusy, setParentPasswordChangeBusy] = useState(false);
  const [parentPasswordChangeError, setParentPasswordChangeError] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentLearnerName, setParentLearnerName] = useState("");
  const [parentCode, setParentCode] = useState("");
  const [parentCodeRequested, setParentCodeRequested] = useState(false);
  const [parentPasswordResetOpen, setParentPasswordResetOpen] = useState(false);
  const [parentResetCodeRequested, setParentResetCodeRequested] = useState(false);
  const [parentResetCode, setParentResetCode] = useState("");
  const [parentNewPassword, setParentNewPassword] = useState("");
  const [parentConfirmPassword, setParentConfirmPassword] = useState("");
  const [parentBusy, setParentBusy] = useState(false);
  const [parentError, setParentError] = useState("");
  const [parentNotice, setParentNotice] = useState("");
  const [welcome, setWelcome] = useState<{ title: string; subtitle: string; announcement: string; contact: string; logoData?: string; backgroundStart?: string; backgroundEnd?: string; titleSize?: number; fontFamily?: string; animationStyle?: string; animated?: boolean; highlights?: string; certification?: string; footerText?: string; paragraphColoursEnabled?: boolean; paragraphColourInterval?: number; splashDurationSeconds?: number; whatsappGroupEnabled?: boolean; whatsappGroupUrl?: string; whatsappGroupLabel?: string; display?: WelcomeDisplayOptions } | null>(null);
  const [display, setDisplay] = useState<LocalDisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const [paragraphColourTick, setParagraphColourTick] = useState(0);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [openingIntroComplete, setOpeningIntroComplete] = useState(false);
  const completeOpeningIntro = useCallback(() => setOpeningIntroComplete(true), []);
  const welcomeDisplay = normalizeWelcomeDisplay(welcome?.display ?? DEFAULT_WELCOME_DISPLAY);
  const whatsappGroupInvite = safeWhatsAppGroupInvite(welcome?.whatsappGroupEnabled, welcome?.whatsappGroupUrl);
  const selectedPalette = display.theme ? DISPLAY_PALETTES.find((palette) => palette.id === display.theme) : undefined;
  const welcomeHeroStyle = {
    "--welcome-start": selectedPalette?.colors.navy || welcome?.backgroundStart || "#0e2a4a",
    "--welcome-end": selectedPalette?.colors.info || welcome?.backgroundEnd || "#245b82",
    "--welcome-title-size": `${welcome?.titleSize || 48}px`,
    "--welcome-angle": `${welcomeDisplay.gradientAngle}deg`,
    "--welcome-overlay": hexToRgba(welcomeDisplay.accentAltColor, 0.12),
    "--welcome-title-color": welcomeDisplay.titleColor,
    "--welcome-subtitle-color": welcomeDisplay.subtitleColor,
    "--welcome-eyebrow-color": welcomeDisplay.eyebrowColor,
    "--welcome-body-color": welcomeDisplay.bodyTextColor,
    "--welcome-accent-color": welcomeDisplay.accentColor,
    "--welcome-accent-alt": welcomeDisplay.accentAltColor,
    "--welcome-content-width": welcomeDisplay.contentWidth === "narrow" ? "28rem" : welcomeDisplay.contentWidth === "wide" ? "48rem" : "36rem",
    "--welcome-title-spacing": `${welcomeDisplay.titleLetterSpacing}em`,
    fontFamily: welcome?.fontFamily || "serif",
  } as React.CSSProperties;

  useEffect(() => {
    portalStatus().then((next) => {
      setStatus(next);
      applyPublicSchoolIdentity(next.schoolName);
    }).catch(() => setStatus({ needsSetup: true, schoolName: "Mukuyu Junior School", motto: "Hard Work Pays", poBox: "", location: "" }));
    getWelcomePage().then((settings) => {
      setWelcome(settings);
      document.documentElement.dataset.schoolAppearance = JSON.stringify(settings.appearance);
      applyDisplayPreferences(readDisplayPreferences());
    }).catch(() => setWelcome(null));
    getParentPasswordChangeStatus().then((result) => {
      if (result.required) {
        setParentPasswordChangeRequired(true);
        setParentPasswordChangeEmail(result.email);
      }
    }).catch(() => undefined);
    const preferences = readDisplayPreferences();
    setDisplay(preferences);
    applyDisplayPreferences(preferences);
  }, [navigate]);

  useEffect(() => {
    if (!openingIntroComplete) return;
    getWorkspace()
      .then(() => navigate({ to: "/portal", search: { view: "home" } }))
      .catch(() => undefined);
  }, [openingIntroComplete, navigate]);

  useEffect(() => {
    if (!featuresOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFeaturesOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [featuresOpen]);

  useEffect(() => {
    if (welcome?.paragraphColoursEnabled === false) return;
    const interval = Math.max(2, Math.min(30, welcome?.paragraphColourInterval ?? 4)) * 1000;
    const timer = window.setInterval(() => setParagraphColourTick((tick) => tick + 1), interval);
    return () => window.clearInterval(timer);
  }, [welcome?.paragraphColoursEnabled, welcome?.paragraphColourInterval]);

  function paragraphColour(index: number, sectionOffset: number) {
    if (welcome?.paragraphColoursEnabled === false) return welcomeDisplay.animatedWordingPanels ? "#f7f8ff" : welcomeDisplay.bodyTextColor;
    const hue = (sectionOffset + index * 47 + paragraphColourTick * 31) % 360;
    return `hsl(${hue}, 72%, 86%)`;
  }

  function colouredLines(text: string, sectionOffset: number, fontSize?: string) {
    return text.split(/\r?\n/).map((line, lineIndex) => (
      <span key={`${sectionOffset}-${lineIndex}`} className="block transition-colors duration-1000" style={{ color: paragraphColour(lineIndex, sectionOffset), fontSize }}>
        {line || "\u00a0"}
      </span>
    ));
  }

  function cycleWelcomeColour() {
    const currentIndex = DISPLAY_PALETTES.findIndex((palette) => palette.id === display.theme);
    const next = DISPLAY_PALETTES[(currentIndex + 1 + DISPLAY_PALETTES.length) % DISPLAY_PALETTES.length];
    const nextPreferences = { ...display, theme: next.id };
    setDisplay(nextPreferences);
    saveDisplayPreferences(nextPreferences);
  }

  function changeBackgroundMode(backgroundMode: LocalDisplayPreferences["backgroundMode"]) {
    const nextPreferences = { ...display, backgroundMode };
    setDisplay(nextPreferences);
    saveDisplayPreferences(nextPreferences);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login({ data: { email, password } });
      navigate({ to: "/portal", search: { view: "home" } });
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function onRequestParentCode(event: React.FormEvent) {
    event.preventDefault();
    setParentBusy(true);
    setParentError("");
    setParentNotice("");
    try {
      const result = await requestParentLoginCode({ data: { email: parentEmail, learnerName: parentLearnerName, parentName, phoneNumber: parentPhone } });
      if (!result.matched) {
        if (result.reason === "database_unavailable") {
          setParentError("The school learner records could not be reached. Please ask the school office to check the database connection.");
        } else if (result.reason === "roster_unavailable") {
          setParentError("No active learner records are available for parent sign-in. Please ask the school office to check the connected database and learner register.");
        } else if (result.reason === "rate_limited") {
          setParentError("Too many parent sign-in requests were made recently. Please wait before trying again, or contact the school office.");
        } else if (result.reason === "access_unavailable") {
          setParentError("This email cannot be used for parent access. Please contact the school office.");
        } else {
          setParentError("We could not confidently match that learner. The name must reach at least 60% spelling similarity; a single-name entry must uniquely identify one learner. Check the spelling, try the learner’s full name, or contact the school office.");
        }
        return;
      }
      setParentCodeRequested(true);
      setParentNotice("A verification code has been sent to your email. It expires in 10 minutes and is for email verification only, not for signing in. New parent accounts will be asked to choose a private password after verification.");
    } catch (reason) {
      setParentError(errText(reason));
    } finally {
      setParentBusy(false);
    }
  }

  async function onVerifyParentCode(event: React.FormEvent) {
    event.preventDefault();
    setParentBusy(true);
    setParentError("");
    try {
      const result = await verifyParentLoginCode({ data: { email: parentEmail, code: parentCode } });
      if (result.requiresPasswordSignIn) {
        setParentCodeRequested(false);
        setParentCode("");
        setParentPasswordLoginOpen(true);
        setParentNotice("Your email is verified and the learner is linked. Sign in with your parent portal password to continue.");
      } else if (result.mustChangePassword) {
        setParentPasswordChangeEmail(parentEmail);
        setParentPasswordChangeRequired(true);
      } else {
        navigate({ to: "/portal", search: { view: "results" } });
      }
    } catch (reason) {
      setParentError(errText(reason));
    } finally {
      setParentBusy(false);
    }
  }

  async function onParentPasswordLogin(event: React.FormEvent) {
    event.preventDefault();
    setParentBusy(true);
    setParentError("");
    setParentNotice("");
    try {
      const result = await loginParent({ data: { email: parentEmail, password: parentPassword } });
      if (result.mustChangePassword) {
        setParentPasswordChangeEmail(parentEmail);
        setParentPasswordChangeRequired(true);
        setParentPassword("");
      } else {
        navigate({ to: "/portal", search: { view: "results" } });
      }
    } catch (reason) {
      setParentError(errText(reason));
    } finally {
      setParentBusy(false);
    }
  }

  async function onRequestParentResetCode(event: React.FormEvent) {
    event.preventDefault();
    setParentBusy(true);
    setParentError("");
    setParentNotice("");
    try {
      await requestParentPasswordResetCode({ data: { email: parentEmail } });
      setParentResetCodeRequested(true);
      setParentNotice("If an active parent account uses this email, a one-time reset code will be sent. If none arrives, check your spam folder or contact the school office.");
    } catch (reason) {
      setParentError(errText(reason));
    } finally {
      setParentBusy(false);
    }
  }

  async function onResetParentPassword(event: React.FormEvent) {
    event.preventDefault();
    if (parentNewPassword !== parentConfirmPassword) {
      setParentError("The new passwords do not match.");
      return;
    }
    setParentBusy(true);
    setParentError("");
    setParentNotice("");
    try {
      await resetParentPassword({ data: { email: parentEmail, code: parentResetCode, password: parentNewPassword } });
      setParentPasswordResetOpen(false);
      setParentResetCodeRequested(false);
      setParentResetCode("");
      setParentNewPassword("");
      setParentConfirmPassword("");
      setParentCodeRequested(false);
      setParentCode("");
      setParentNotice("Your password has been reset. Use your email and new password in the main sign-in form above, or continue with parent email-code sign-in.");
    } catch (reason) {
      setParentError(errText(reason));
    } finally {
      setParentBusy(false);
    }
  }

  async function onCompleteParentFirstPasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (parentFirstPassword !== parentConfirmFirstPassword) {
      setParentPasswordChangeError("The new passwords do not match.");
      return;
    }
    setParentPasswordChangeBusy(true);
    setParentPasswordChangeError("");
    try {
      await completeParentFirstLoginPasswordChange({ data: { password: parentFirstPassword } });
      setParentPasswordChangeRequired(false);
      setParentFirstPassword("");
      setParentConfirmFirstPassword("");
      navigate({ to: "/portal", search: { view: "results" } });
    } catch (reason) {
      setParentPasswordChangeError(errText(reason));
    } finally {
      setParentPasswordChangeBusy(false);
    }
  }

  if (parentPasswordChangeRequired) {
    return <main className="welcome-login-panel flex min-h-screen items-center justify-center px-6 py-12" style={welcomeHeroStyle}>
      <form className="w-full max-w-lg space-y-4" onSubmit={onCompleteParentFirstPasswordChange}>
        <div className="welcome-word-panel welcome-word-panel-parent-intro">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-info">Parent account security</p>
          <h1 className="mt-1 font-serif text-3xl text-navy">Choose your new password</h1>
          <p className="mt-2 text-sm text-muted">Before opening the parent portal, replace your initial password with a private password only you know. Use 12–128 characters.</p>
          {parentPasswordChangeEmail ? <p className="mt-2 text-sm font-semibold text-navy">{parentPasswordChangeEmail}</p> : null}
        </div>
        <label className="block text-sm font-medium">New password (12–128 characters)<input className={`${inputClass} mt-1.5`} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={parentFirstPassword} onChange={(event) => setParentFirstPassword(event.target.value)} required /></label>
        <label className="block text-sm font-medium">Confirm new password<input className={`${inputClass} mt-1.5`} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={parentConfirmFirstPassword} onChange={(event) => setParentConfirmFirstPassword(event.target.value)} required /></label>
        {parentPasswordChangeError ? <p className="text-sm text-bad" role="alert">{parentPasswordChangeError}</p> : null}
        <button className={`${btnClass} w-full`} style={{ backgroundColor: welcomeDisplay.accentColor }} disabled={parentPasswordChangeBusy} type="submit">{parentPasswordChangeBusy ? "Saving password…" : "Save new password and continue"}</button>
        <button className="w-full text-sm font-semibold text-info" type="button" onClick={async () => { await logout(); setParentPasswordChangeRequired(false); setParentPasswordChangeEmail(""); setParentPasswordChangeError(""); }}>Sign out instead</button>
      </form>
    </main>;
  }

  return (
    <main className={`welcome-shell grid min-h-screen lg:grid-cols-[1.1fr_0.9fr] ${welcomeDisplay.animatedWordingPanels ? "" : "welcome-word-panels-disabled"}`} style={welcomeHeroStyle}>
      {!openingIntroComplete ? <OpeningIntro title={welcome?.title || status?.schoolName || "Mukuyu Junior School"} motto={status?.motto || "Hard Work Pays"} logoSrc={welcome?.logoData || undefined} durationSeconds={Math.max(5, Math.min(30, welcome?.splashDurationSeconds ?? 10))} onComplete={completeOpeningIntro} /> : null}
      <section className={`welcome-hero relative flex flex-col justify-between px-6 py-8 text-paper sm:px-12 ${welcome?.animated === false || welcome?.animationStyle === "none" ? "welcome-static" : `welcome-animated welcome-animation-${welcome?.animationStyle || "aurora"}`} ${welcomeDisplay.showRibbons ? "" : "welcome-no-ribbons"} ${welcomeDisplay.titleShadow ? "" : "welcome-title-shadow-disabled"} ${welcomeDisplay.contentAlignment === "center" ? "welcome-content-centered" : ""}`}>
        <div className="welcome-ribbon-field" aria-hidden="true"><span className="welcome-ribbon welcome-ribbon-one" /><span className="welcome-ribbon welcome-ribbon-two" /><span className="welcome-ribbon welcome-ribbon-three" /><span className="welcome-ribbon welcome-ribbon-four" /><span className="welcome-ribbon-orb welcome-ribbon-orb-one" /><span className="welcome-ribbon-orb welcome-ribbon-orb-two" /></div>
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <SchoolLogo src={welcome?.logoData || undefined} className="size-16" />
          <p className="welcome-eyebrow welcome-word-panel welcome-word-panel-eyebrow text-xs tracking-[0.22em]" style={{ color: welcomeDisplay.eyebrowColor }}>JUNIOR SECONDARY</p>
          </div>
          <button type="button" className="welcome-display-switch" style={{ borderColor: welcomeDisplay.accentAltColor }} onClick={cycleWelcomeColour} title="Tap once to change welcome colours on this device" aria-label="Change welcome page colours">
            <span className="welcome-display-dot" style={{ background: `linear-gradient(135deg, ${welcomeDisplay.accentColor}, ${welcomeDisplay.accentAltColor})` }} aria-hidden="true" /> Change colours
          </button>
        </div>
        <div className="welcome-background-choice relative z-10 mt-4" role="group" aria-label="Choose large background colours">
          <span className="welcome-background-choice-label">Large background colours</span>
          <button type="button" aria-pressed={display.backgroundMode === "animated"} onClick={() => changeBackgroundMode("animated")}>Animated Colours</button>
          <button type="button" aria-pressed={display.backgroundMode === "original"} onClick={() => changeBackgroundMode("original")}>Original Colours</button>
        </div>
        <div className="welcome-content relative z-10 py-12">
          <h1 className="welcome-title welcome-word-panel welcome-word-panel-title mt-3 font-serif font-black leading-tight" style={{ letterSpacing: `${welcomeDisplay.titleLetterSpacing}em`, textShadow: welcomeDisplay.titleShadow ? "0 3px 22px rgba(4,16,35,.42)" : "none", maxWidth: "var(--welcome-content-width)" }} aria-label={welcome?.title || status?.schoolName || "Mukuyu Junior School"}>{Array.from(welcome?.title || status?.schoolName || "Mukuyu Junior School").map((letter, index) => <span key={`${letter}-${index}`} className={letter === " " ? "welcome-title-space" : "welcome-title-letter"} style={{ "--letter-index": index, color: welcomeDisplay.titleColor } as React.CSSProperties}>{letter === " " ? "\u00a0" : letter}</span>)}</h1>
          <p className="welcome-subtitle welcome-word-panel welcome-word-panel-subtitle mt-3 text-sm font-semibold" style={{ color: welcomeDisplay.subtitleColor }}>{welcome?.subtitle || "Exam portal for Grade 7, Grade 8 and Grade 9"}</p>
          <div className="welcome-heading-rule" aria-hidden="true"><span style={{ backgroundColor: welcomeDisplay.accentColor }} /><span style={{ backgroundColor: welcomeDisplay.accentAltColor }} /><span style={{ backgroundColor: welcomeDisplay.titleColor }} /></div>
          <div className="mt-5 max-w-md space-y-3" aria-labelledby="welcome-overview-heading">
            <h2 id="welcome-overview-heading" className="welcome-section-heading welcome-word-panel welcome-word-panel-heading" style={{ color: welcomeDisplay.accentColor }}>A brighter school day starts here</h2>
            <div className="mt-4 max-w-md space-y-3">
            {(welcome?.announcement || "Marks, streams, merit lists and report cards stay in one office.").split(/\n\n+/).map((para, i) => (
              <p key={i} className="welcome-copy welcome-word-panel welcome-word-panel-copy text-base" style={{ fontFamily: welcome?.fontFamily || "inherit", maxWidth: "var(--welcome-content-width)" }}>{colouredLines(para, 40 + i * 17, welcome?.titleSize ? `${Math.max(14, Math.min(welcome.titleSize * 0.4, 22))}px` : undefined)}</p>
            ))}
            </div>
            <button type="button" className="welcome-features-button" onClick={() => setFeaturesOpen(true)} aria-haspopup="dialog">Explore portal features</button>
          </div>
          {welcome?.contact ? <p className="mt-4 whitespace-pre-wrap text-sm" style={{ color: welcomeDisplay.bodyTextColor }}>{welcome.contact}</p> : null}
          {welcome?.highlights ? <div className="welcome-highlights welcome-word-panel welcome-word-panel-highlights mt-6 space-y-2" style={{ borderColor: hexToRgba(welcomeDisplay.accentAltColor, 0.45) }} aria-labelledby="welcome-highlights-heading"><h2 id="welcome-highlights-heading" className="welcome-section-heading welcome-word-panel welcome-word-panel-heading" style={{ color: welcomeDisplay.accentAltColor }}>What your school office can see</h2>{welcome.highlights.split(/\n\n+/).map((para, i) => <p key={i} className="welcome-copy welcome-word-panel welcome-word-panel-copy text-sm" style={{ fontFamily: welcome?.fontFamily || "inherit" }}>{colouredLines(para, 180 + i * 17)}</p>)}</div> : null}
          <p className="mt-8 font-serif text-lg" style={{ color: welcomeDisplay.accentColor }}>Motto · {status?.motto || "Hard Work Pays"}</p>
          {status?.poBox ? <p className="mt-2 text-sm text-paper/70">P.O. Box {status.poBox}</p> : null}
          {welcome?.footerText ? <p className="mt-3 whitespace-pre-wrap text-xs" style={{ color: welcomeDisplay.bodyTextColor }}>{welcome.footerText}</p> : null}
          <p className="mt-3 text-xs" style={{ color: welcomeDisplay.bodyTextColor }}>{welcome?.certification || "© 2026 Certified"}</p>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-paper/55"><span className="welcome-status-line" /><span>Secure school office</span></div>
      </section>
      <section className="welcome-login-panel flex flex-col items-center justify-center px-6 py-12" style={{ "--welcome-panel-tint": hexToRgba(welcomeDisplay.panelColor, Math.min(0.18, welcomeDisplay.panelOpacity * 0.12)), "--welcome-panel-accent": hexToRgba(welcomeDisplay.accentAltColor, 0.22) } as React.CSSProperties}>
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="welcome-word-panel welcome-word-panel-signin-intro">
            <h2 className="font-serif text-3xl text-navy">Sign in</h2>
            <p className="mt-2 text-sm text-muted">Use the email and password issued by the school. Super admins, admins, teachers and student accounts can sign in here.</p>
          </div>
          <label className="mt-8 block text-sm font-medium">
            Email
            <input className={`${inputClass} mt-1.5`} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Password
            <input className={`${inputClass} mt-1.5`} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <p className="mt-4 text-sm text-bad">{error}</p> : null}
          <button className={`${btnClass} mt-6 w-full`} style={{ backgroundColor: welcomeDisplay.accentColor }} disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {status?.needsSetup ? (
            <p className="mt-6 text-sm text-muted">
              First time for the school office?{" "}
              <Link to="/setup" className="font-semibold text-info">
                Create the super admin account
              </Link>
            </p>
          ) : null}
        </form>
        <div className="mt-5 w-full max-w-sm border-t border-line pt-4">
          <button type="button" className="welcome-parent-toggle w-full rounded-xl border border-line bg-card px-4 py-3 text-left text-sm font-semibold text-navy shadow-sm transition hover:border-info" aria-expanded={parentOpen} aria-controls="parent-sign-in-panel" onClick={() => { setParentOpen((value) => !value); setParentError(""); setParentNotice(""); }}>
            Sign in as PARENTS <span className="float-right" aria-hidden="true">{parentOpen ? "−" : "+"}</span>
          </button>
          {parentOpen ? <section id="parent-sign-in-panel" className="mt-3 rounded-2xl border border-line bg-card/90 p-4 shadow-card" aria-label="Parent sign in">
            <div className="welcome-word-panel welcome-word-panel-parent-intro">
              <h3 className="font-serif text-xl text-navy">{parentPasswordResetOpen ? "Reset parent password" : parentPasswordLoginOpen ? "Parent portal sign in" : "Create a parent account"}</h3>
              <p className="mt-1 text-sm text-muted">{parentPasswordResetOpen
              ? "Enter the email address on your active parent account. We’ll send a short-lived code to verify access to that email before allowing a new password."
              : parentPasswordLoginOpen
                ? "Sign in with the email address you verified and your parent portal password. On your first sign-in, you’ll be asked to choose a new password before opening the portal."
                : "Enter your email, contact number, and Learner’s Name. A first name or surname can work if it uniquely identifies the learner. Spelling match is at least 60%; equally close candidates are not auto-linked. We’ll email a verification code to confirm your email and create your account. Existing accounts must sign in with their parent portal password."}</p>
            </div>
            <form className="mt-4 space-y-3" onSubmit={parentPasswordResetOpen
              ? (parentResetCodeRequested ? onResetParentPassword : onRequestParentResetCode)
              : parentPasswordLoginOpen ? onParentPasswordLogin : (parentCodeRequested ? onVerifyParentCode : onRequestParentCode)}>
              <label className="block text-sm font-medium">Your email address<input className={`${inputClass} mt-1.5`} type="email" autoComplete="email" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} disabled={parentPasswordResetOpen ? parentResetCodeRequested : (!parentPasswordLoginOpen && parentCodeRequested)} required /></label>
              {parentPasswordResetOpen ? <>
                {parentResetCodeRequested ? <>
                  <label className="block text-sm font-medium">Reset code from your email<input className={`${inputClass} mt-1.5 tracking-[0.3em]`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={parentResetCode} onChange={(event) => setParentResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
                  <label className="block text-sm font-medium">New password (12–128 characters)<input className={`${inputClass} mt-1.5`} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={parentNewPassword} onChange={(event) => setParentNewPassword(event.target.value)} required /></label>
                  <label className="block text-sm font-medium">Confirm new password<input className={`${inputClass} mt-1.5`} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={parentConfirmPassword} onChange={(event) => setParentConfirmPassword(event.target.value)} required /></label>
                </> : null}
              </> : parentPasswordLoginOpen ? <label className="block text-sm font-medium">Parent portal password<span className="mt-1.5 flex gap-2"><input className={inputClass + " min-w-0 flex-1"} type={parentPasswordVisible ? "text" : "password"} autoComplete="current-password" value={parentPassword} onChange={(event) => setParentPassword(event.target.value)} required /><button type="button" className="shrink-0 rounded-md border border-line px-3 text-xs font-semibold text-navy" aria-label={parentPasswordVisible ? "Hide parent password" : "Show parent password"} aria-pressed={parentPasswordVisible} onClick={() => setParentPasswordVisible((visible) => !visible)}>{parentPasswordVisible ? "Hide" : "Show"}</button></span></label> : parentCodeRequested ? <label className="block text-sm font-medium">Verification code from your email<input className={`${inputClass} mt-1.5 tracking-[0.3em]`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={parentCode} onChange={(event) => setParentCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label> : <>
                <label className="block text-sm font-medium">Your full name<input className={`${inputClass} mt-1.5`} autoComplete="name" value={parentName} onChange={(event) => setParentName(event.target.value)} maxLength={120} required /></label>
                <label className="block text-sm font-medium">Contact number <span className="font-normal text-muted">(required; entered but not verified)</span><input className={`${inputClass} mt-1.5`} type="tel" autoComplete="tel" value={parentPhone} onChange={(event) => setParentPhone(event.target.value)} maxLength={40} required /></label>
                <label className="block text-sm font-medium">Learner’s Name<input className={`${inputClass} mt-1.5`} autoComplete="off" value={parentLearnerName} onChange={(event) => setParentLearnerName(event.target.value)} maxLength={160} required /></label>
                <p className="welcome-parent-safety-note rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-muted">Email verification confirms access to the email address, not guardianship by itself. The contact number is recorded as entered and is not phone-verified. For learner-record corrections or access concerns, contact the school office. To add another learner later, sign in again with the same parent email and that learner’s name.</p>
                {whatsappGroupInvite ? <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-3 text-sm">
                  <p className="font-semibold text-emerald-900">Optional WhatsApp parents’ group</p>
                  <p className="mt-1 text-xs text-muted">Joining is your choice. Entering a WhatsApp phone number here will not add you to the group; open the invite and choose whether to join.</p>
                  <a className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800" href={whatsappGroupInvite} target="_blank" rel="noopener noreferrer">{welcome?.whatsappGroupLabel?.trim() || "Open WhatsApp group invite"}</a>
                </div> : null}
              </>}
              {parentError ? <p className="text-sm text-bad" role="alert">{parentError}</p> : null}
              {parentNotice ? <p className="text-sm text-good" role="status">{parentNotice}</p> : null}
              <button className={`${btnClass} w-full`} style={{ backgroundColor: welcomeDisplay.accentColor }} disabled={parentBusy} type="submit">{parentBusy ? "Please wait…" : parentPasswordResetOpen
                ? (parentResetCodeRequested ? "Verify email and set new password" : "Email me a reset code")
                : parentPasswordLoginOpen ? "Sign in to parent portal"
                  : (parentCodeRequested ? "Verify email and continue" : "Match learner and email me a verification code")}</button>
              {parentPasswordResetOpen
                ? <button type="button" className="w-full text-sm font-semibold text-info" onClick={() => { setParentPasswordResetOpen(false); setParentPasswordLoginOpen(true); setParentResetCodeRequested(false); setParentResetCode(""); setParentNewPassword(""); setParentConfirmPassword(""); setParentNotice(""); setParentError(""); }}>Back to parent sign in</button>
                : <>
                  {!parentCodeRequested ? <button type="button" className="w-full text-sm font-semibold text-info" onClick={() => { setParentPasswordLoginOpen((value) => !value); setParentPassword(""); setParentNotice(""); setParentError(""); }}>{parentPasswordLoginOpen ? "Create a parent account" : "Already have an account? Sign in"}</button> : null}
                  <button type="button" className="w-full text-sm font-semibold text-info" onClick={() => { setParentPasswordResetOpen(true); setParentPasswordLoginOpen(false); setParentCodeRequested(false); setParentCode(""); setParentResetCodeRequested(false); setParentResetCode(""); setParentNewPassword(""); setParentConfirmPassword(""); setParentNotice(""); setParentError(""); }}>Forgot or reset parent password?</button>
                </>}
              {parentCodeRequested && !parentPasswordResetOpen ? <button type="button" className="w-full text-sm font-semibold text-info" onClick={() => { setParentCodeRequested(false); setParentCode(""); setParentNotice(""); setParentError(""); }}>Use different details</button> : null}
            </form>
          </section> : null}
        </div>
      </section>
      {featuresOpen ? <div className="welcome-features-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFeaturesOpen(false); }}>
        <section className="welcome-features-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-features-title" aria-describedby="welcome-features-description">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-info">A quick tour</p><h2 id="welcome-features-title" className="mt-1 font-serif text-2xl text-navy">Explore the school portal</h2><p id="welcome-features-description" className="mt-2 max-w-2xl text-sm text-muted">The portal includes the tools below. What you can open or change depends on your role, school settings, and optional services configured by the school. This overview uses no real learner records and does not open a sample account.</p></div>
            <button type="button" className="welcome-features-close" autoFocus onClick={() => setFeaturesOpen(false)} aria-label="Close portal features">Close</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {PUBLIC_PORTAL_FEATURES.map((feature, index) => <article key={feature.title} className="welcome-feature-card welcome-word-panel welcome-word-panel-feature" style={{ "--feature-index": index } as React.CSSProperties}>
              <span className="welcome-feature-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div className="welcome-feature-copy">
                <h3 className="font-semibold text-navy">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted">{feature.description}</p>
              </div>
            </article>)}
          </div>
          <p className="mt-5 rounded-xl border border-line bg-paper/70 p-3 text-xs text-muted">Sign-in protects learner results and staff records. The features above describe portal tools only; access depends on each account’s role and permissions.</p>
        </section>
      </div> : null}
    </main>
  );
}

const PUBLIC_PORTAL_FEATURES = [
  { title: "Welcome and sign-in", description: "Staff, administrators and learner accounts use the school sign-in. Parents can create an account after email verification or sign in to their parent portal." },
  { title: "Overview dashboard", description: "See school-office summaries and current academic context, with sections and details shown according to your account permissions." },
  { title: "Learner records and imports", description: "Manage learner records, class rosters, admission numbers and placements, and review bulk imports before saving." },
  { title: "Enter marks", description: "Record assessment results individually or paste spreadsheet data into a grid, preview it and review subject or row-level issues." },
  { title: "Marks permissions and locks", description: "Where enabled, Super Admins can control who enters, edits or views marks and apply term- or assessment-specific access rules." },
  { title: "Analysis and progress", description: "Review learner, class and subject performance summaries for the academic year and term available to your account." },
  { title: "Report cards and QR links", description: "Prepare report cards and QR links; public viewing and downloading follow the school's report-access settings." },
  { title: "Learner and parent results", description: "Learners can view their results, while parents can access linked learners through the parent portal after email verification and sign-in." },
  { title: "Mark lists and merit", description: "Create and review mark lists and merit rankings for the classes, subjects and academic periods you are permitted to access." },
  { title: "Timetable", description: "Plan and review school timetables using the subjects, classes, teachers and scheduling options configured by the school." },
  { title: "School Services", description: "Open the school's services area to manage or review the service information available to your role." },
  { title: "Staff and delegated access", description: "Manage staff records and, for authorized administrators, role-based access and delegated permissions." },
  { title: "Parents Feedback", description: "Review messages sent from report-card QR pages; messages can be routed to selected teachers, while Super Admins can oversee feedback." },
  { title: "Mail log", description: "Review the portal's recorded email activity and delivery status where mail services are configured." },
  { title: "Music player and studio", description: "An optional in-portal music player can be enabled and its playlist and playback settings configured by the school." },
  { title: "School settings and appearance", description: "Authorized administrators can manage school and term settings, report access, welcome-page design, colours and portal backdrops." },
  { title: "Backups and recovery", description: "Super Admins can export and restore school records and configure scheduled backup emails when the deployment is set up for delivery." },
  { title: "Installable portal", description: "On supported browsers and devices, use the install prompt to add a convenient portal shortcut to your home screen." },
];

function applyPublicSchoolIdentity(rawName: string) {
  const schoolName = rawName.trim().replace(/\s+/g, " ").slice(0, 100) || "Mukuyu Junior School";
  document.title = `${schoolName} · School Portal`;
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", schoolName);
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", "/icons/mukuyu-app-192.png");
}
