import { DEFAULT_APPEARANCE, type AppearancePalette, type PortalBackdropThemeId } from "@/lib/school/model";

export type DisplayThemeId = "classic" | "forest" | "royal" | "burgundy";
export type DisplayDensity = "comfortable" | "compact";
export type BackgroundMode = "animated" | "original";
export type LocalDisplayPreferences = {
  theme: DisplayThemeId | null;
  density: DisplayDensity;
  backgroundMode: BackgroundMode;
  motion: boolean;
  fontFamily: "sans" | "serif" | "system" | "mono";
  fontScale: "small" | "normal" | "large";
  accentMotion: boolean;
};

export const DISPLAY_PREFERENCES_KEY = "mukuyu-display-preferences-v1";
export const DEFAULT_DISPLAY_PREFERENCES: LocalDisplayPreferences = {
  theme: null,
  density: "comfortable",
  backgroundMode: "animated",
  motion: true,
  fontFamily: "sans",
  fontScale: "normal",
  accentMotion: true,
};

export const DISPLAY_PALETTES: Array<{ id: DisplayThemeId; name: string; colors: AppearancePalette }> = [
  { id: "classic", name: "Mukuyu classic", colors: DEFAULT_APPEARANCE },
  { id: "forest", name: "Forest green", colors: { ...DEFAULT_APPEARANCE, navy: "#173d32", brass: "#c08b35", paper: "#eef5ef", card: "#ffffff", line: "#cfdfd4", info: "#28765c" } },
  { id: "royal", name: "Royal blue", colors: { ...DEFAULT_APPEARANCE, navy: "#173c78", brass: "#e0a12e", paper: "#eef3fb", card: "#ffffff", line: "#d3deef", info: "#2864b0" } },
  { id: "burgundy", name: "Burgundy", colors: { ...DEFAULT_APPEARANCE, navy: "#67243b", brass: "#c28a45", paper: "#f8eff2", card: "#ffffff", line: "#ead5dd", info: "#7252a3" } },
];

export const PORTAL_BACKDROP_THEMES: Array<{ id: PortalBackdropThemeId; name: string; description: string }> = [
  { id: "auto-sections", name: "Automatic section scenes", description: "Rotate 18 distinct moving background treatments every 5 seconds. Each portal section keeps its own colour identity and ornamental style." },
  { id: "starfall", name: "Mukuyu Starfall", description: "The original Mukuyu Starfall canvas, preserved as a steady alternative." },
  { id: "nature-cycle", name: "Mukuyu Nature Motion", description: "Cycle through 15 real wildlife, rainfall and waterfall video scenes every 5 seconds. Natural footage only, with no illustrations, added gradients or audio." },
];

export const NATURE_BACKDROP_SCENES = [
  { id: "rainfall-forest", label: "Rain falling through forest", src: "/nature-scenes/rainfall-forest.mp4" },
  { id: "raindrops-leaves", label: "Rain drops on leaves", src: "/nature-scenes/raindrops-leaves.mp4" },
  { id: "forest-waterfall", label: "Forest waterfall", src: "/nature-scenes/forest-waterfall.mp4" },
  { id: "mountain-waterfall", label: "Mountain waterfall", src: "/nature-scenes/mountain-waterfall.mp4" },
  { id: "river-rapids", label: "River rapids", src: "/nature-scenes/river-rapids.mp4" },
  { id: "elephant", label: "Elephant in the wild", src: "/nature-scenes/elephant.mp4" },
  { id: "giraffe", label: "Giraffe in the wild", src: "/nature-scenes/giraffe.mp4" },
  { id: "lion", label: "Lion in the wild", src: "/nature-scenes/lion.mp4" },
  { id: "deer", label: "Deer in woodland", src: "/nature-scenes/deer.mp4" },
  { id: "zebra", label: "Zebra herd", src: "/nature-scenes/zebra.mp4" },
  { id: "monkeys", label: "Monkeys in trees", src: "/nature-scenes/monkeys.mp4" },
  { id: "birds", label: "Birds in flight", src: "/nature-scenes/birds.mp4" },
  { id: "flamingos", label: "Flamingos by the water", src: "/nature-scenes/flamingos.mp4" },
  { id: "squirrel", label: "Squirrel in woodland", src: "/nature-scenes/squirrel.mp4" },
  { id: "butterflies", label: "Butterflies among flowers", src: "/nature-scenes/butterflies.mp4" },
] as const;

export const NATURE_BACKDROP_SCENE_LABELS = NATURE_BACKDROP_SCENES.map(({ label }) => label);

export function applyPortalBackdropColors(colors: Partial<AppearancePalette> = DEFAULT_APPEARANCE) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (colors.backdropTheme && PORTAL_BACKDROP_THEMES.some((theme) => theme.id === colors.backdropTheme)) {
    const previousTheme = root.dataset.portalBackdropTheme;
    root.dataset.portalBackdropTheme = colors.backdropTheme;
    if (previousTheme !== colors.backdropTheme && typeof window !== "undefined") {
      window.dispatchEvent(new Event("mukuyu-portal-backdrop-change"));
    }
  }
  ["--color-navy", "--color-navy-2", "--color-brass", "--color-brass-soft", "--color-paper", "--color-card", "--color-ink", "--color-muted", "--color-line", "--color-good", "--color-warn", "--color-bad", "--color-info"].forEach((name) => root.style.removeProperty(name));
  root.style.setProperty("--portal-user-glow-a", colors.navy || DEFAULT_APPEARANCE.navy);
  root.style.setProperty("--portal-user-glow-b", colors.info || DEFAULT_APPEARANCE.info);
  root.style.setProperty("--portal-user-glow-c", colors.brass || DEFAULT_APPEARANCE.brass);
  root.style.setProperty("--portal-user-glow-d", colors.good || DEFAULT_APPEARANCE.good);
}

export function normalizeDisplayPreferences(value: unknown): LocalDisplayPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const theme = source.theme === null || DISPLAY_PALETTES.some((palette) => palette.id === source.theme)
    ? source.theme as DisplayThemeId | null
    : DEFAULT_DISPLAY_PREFERENCES.theme;
  return {
    theme,
    density: source.density === "compact" ? "compact" : "comfortable",
    backgroundMode: source.backgroundMode === "original" || source.backgroundMode === "animated"
      ? source.backgroundMode
      : DEFAULT_DISPLAY_PREFERENCES.backgroundMode,
    motion: typeof source.motion === "boolean" ? source.motion : DEFAULT_DISPLAY_PREFERENCES.motion,
    fontFamily: source.fontFamily === "serif" || source.fontFamily === "system" || source.fontFamily === "mono" ? source.fontFamily : "sans",
    fontScale: source.fontScale === "small" || source.fontScale === "large" ? source.fontScale : "normal",
    accentMotion: typeof source.accentMotion === "boolean" ? source.accentMotion : DEFAULT_DISPLAY_PREFERENCES.accentMotion,
  };
}

export function readDisplayPreferences(): LocalDisplayPreferences {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_PREFERENCES;
  try {
    return normalizeDisplayPreferences(JSON.parse(window.localStorage.getItem(DISPLAY_PREFERENCES_KEY) || "{}"));
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

export function saveDisplayPreferences(value: LocalDisplayPreferences) {
  const preferences = normalizeDisplayPreferences(value);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Keep the live display usable when browser storage is unavailable. */ }
  }
  applyDisplayPreferences(preferences);
}

export function applyDisplayPreferences(value: LocalDisplayPreferences) {
  if (typeof document === "undefined") return;
  const preferences = normalizeDisplayPreferences(value);
  const root = document.documentElement;
  const colors = DISPLAY_PALETTES.find((palette) => palette.id === preferences.theme)?.colors ?? (() => {
    try {
      const raw = JSON.parse(root.dataset.schoolAppearance || "null") as Record<string, unknown> | null;
      if (!raw) return null;
      const schoolColors = { ...DEFAULT_APPEARANCE };
      const colorKeys = ["navy", "navy2", "brass", "brassSoft", "paper", "card", "ink", "muted", "line", "good", "warn", "bad", "info"] as const;
      colorKeys.forEach((key) => {
        if (typeof raw[key] === "string" && /^#[0-9a-f]{6}$/i.test(raw[key] as string)) schoolColors[key] = raw[key] as string;
      });
      if (typeof raw.backdropTheme === "string" && PORTAL_BACKDROP_THEMES.some((theme) => theme.id === raw.backdropTheme)) {
        schoolColors.backdropTheme = raw.backdropTheme as PortalBackdropThemeId;
      }
      return schoolColors;
    } catch {
      return null;
    }
  })();
  applyPortalBackdropColors(colors ?? DEFAULT_APPEARANCE);
  root.dataset.portalDensity = preferences.density;
  root.dataset.portalBackgroundMode = preferences.backgroundMode;
  root.dataset.portalMotion = preferences.motion ? "full" : "reduced";
  root.dataset.portalAccentMotion = preferences.accentMotion ? "on" : "off";
  root.dataset.portalFont = preferences.fontFamily;
  root.style.fontSize = `${preferences.density === "compact" ? 93.75 : preferences.fontScale === "small" ? 93.75 : preferences.fontScale === "large" ? 108 : 100}%`;
}
