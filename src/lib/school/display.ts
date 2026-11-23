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

export const PORTAL_BACKDROP_THEMES: Array<{ id: PortalBackdropThemeId; name: string; description: string; swatches: [string, string, string] }> = [
  { id: "starfall", name: "Mukuyu Starfall", description: "The original school signature: teal, violet and warm gold drifting behind every section.", swatches: ["#19c4e7", "#cf4fd2", "#e9ad4b"] },
  { id: "aurora", name: "Aurora Veil", description: "Northern-light greens, icy cyan and soft blue glows.", swatches: ["#41c9a2", "#55b6e8", "#a3e5c6"] },
  { id: "rainforest", name: "Rainforest Canopy", description: "Deep leafy emerald, fern and clear-water tones.", swatches: ["#187d58", "#60b66d", "#b8d778"] },
  { id: "coral-reef", name: "Coral Reef", description: "Lagoon turquoise paired with coral, sea-glass and pearl.", swatches: ["#26b5c1", "#f18b78", "#f2d9b5"] },
  { id: "savannah", name: "Savannah Sunset", description: "A warm horizon of amber, terracotta and dusky plum.", swatches: ["#d88b3e", "#cf6d58", "#745b87"] },
  { id: "sapphire-tide", name: "Sapphire Tide", description: "Layered ocean blue, sapphire and cool aqua currents.", swatches: ["#2455a6", "#367fce", "#54c4cf"] },
  { id: "violet-galaxy", name: "Violet Galaxy", description: "Cosmic violet and indigo with restrained rose highlights.", swatches: ["#5745a8", "#9b5bb9", "#d279a8"] },
  { id: "sunrise-mist", name: "Sunrise Mist", description: "Early-light apricot, blush and pale sky blue.", swatches: ["#ed9b68", "#de7696", "#f2c978"] },
  { id: "emerald-grove", name: "Emerald Grove", description: "Polished emerald, jade and a touch of citron.", swatches: ["#087e67", "#33b89b", "#bdd15f"] },
  { id: "amethyst-dusk", name: "Amethyst Dusk", description: "Soft lilac, amethyst and evening-blue gradients.", swatches: ["#7965bb", "#a77bc9", "#536ea9"] },
  { id: "arctic-glow", name: "Arctic Glow", description: "Glacier blue, mint ice and clean silver light.", swatches: ["#5ab2dc", "#83d6c8", "#d6e8ef"] },
  { id: "copper-canyon", name: "Copper Canyon", description: "Copper, sandstone and muted rose-gold movement.", swatches: ["#b76542", "#d18c57", "#d7aa79"] },
  { id: "moonlit-lagoon", name: "Moonlit Lagoon", description: "Midnight teal with moon-blue and pearl-green glows.", swatches: ["#245f72", "#528eaa", "#8ccfbd"] },
  { id: "rose-quartz", name: "Rose Quartz", description: "Gentle rose, mauve and cool lavender shimmer.", swatches: ["#c66e92", "#a777b5", "#e4a6b7"] },
  { id: "tropical-orchid", name: "Tropical Orchid", description: "Vivid orchid, hibiscus and bright island turquoise.", swatches: ["#bd4fa6", "#ec718e", "#36b7b4"] },
  { id: "cosmic-indigo", name: "Cosmic Indigo", description: "Inky indigo, electric blue and a restrained starlight violet.", swatches: ["#303a88", "#5369c4", "#9679d5"] },
  { id: "golden-hour", name: "Golden Hour", description: "Soft champagne, marigold and warm peach light.", swatches: ["#c39136", "#e4ad56", "#e99167"] },
];

export function applyPortalBackdropColors(colors: Partial<AppearancePalette> = DEFAULT_APPEARANCE) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (colors.backdropTheme && PORTAL_BACKDROP_THEMES.some((theme) => theme.id === colors.backdropTheme)) {
    root.dataset.portalBackdropTheme = colors.backdropTheme;
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
      : source.accentMotion === false ? "original" : DEFAULT_DISPLAY_PREFERENCES.backgroundMode,
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
      const paletteValues = schoolColors as Record<keyof typeof DEFAULT_APPEARANCE, string>;
      (Object.keys(DEFAULT_APPEARANCE) as Array<keyof typeof DEFAULT_APPEARANCE>).forEach((key) => {
        if (typeof raw[key] === "string" && /^#[0-9a-f]{6}$/i.test(raw[key] as string)) paletteValues[key] = raw[key] as string;
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
