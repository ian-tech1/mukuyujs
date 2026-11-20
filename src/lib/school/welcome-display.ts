export type WelcomeDisplayOptions = {
  titleColor: string;
  subtitleColor: string;
  eyebrowColor: string;
  bodyTextColor: string;
  accentColor: string;
  accentAltColor: string;
  panelColor: string;
  panelOpacity: number;
  gradientAngle: number;
  contentAlignment: "left" | "center";
  contentWidth: "narrow" | "standard" | "wide";
  titleLetterSpacing: number;
  titleShadow: boolean;
  showRibbons: boolean;
};

export const DEFAULT_WELCOME_DISPLAY: WelcomeDisplayOptions = {
  titleColor: "#fffdf5",
  subtitleColor: "#f3e6c4",
  eyebrowColor: "#f3e6c4",
  bodyTextColor: "#fff9e9",
  accentColor: "#f4ca72",
  accentAltColor: "#8bd5ff",
  panelColor: "#fffcf7",
  panelOpacity: 0.94,
  gradientAngle: 125,
  contentAlignment: "left",
  contentWidth: "standard",
  titleLetterSpacing: -0.035,
  titleShadow: true,
  showRibbons: true,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function boundedNumber(value: unknown, min: number, max: number, fallback: number, decimals = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clipped = Math.min(max, Math.max(min, numeric));
  const scale = 10 ** decimals;
  return Math.round(clipped * scale) / scale;
}

export function normalizeWelcomeDisplay(value: unknown): WelcomeDisplayOptions {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const color = (key: keyof Pick<WelcomeDisplayOptions, "titleColor" | "subtitleColor" | "eyebrowColor" | "bodyTextColor" | "accentColor" | "accentAltColor" | "panelColor">) => {
    const candidate = source[key];
    return typeof candidate === "string" && HEX_COLOR.test(candidate) ? candidate : DEFAULT_WELCOME_DISPLAY[key];
  };
  return {
    titleColor: color("titleColor"),
    subtitleColor: color("subtitleColor"),
    eyebrowColor: color("eyebrowColor"),
    bodyTextColor: color("bodyTextColor"),
    accentColor: color("accentColor"),
    accentAltColor: color("accentAltColor"),
    panelColor: color("panelColor"),
    panelOpacity: boundedNumber(source.panelOpacity, 0.55, 1, DEFAULT_WELCOME_DISPLAY.panelOpacity, 2),
    gradientAngle: Math.round(boundedNumber(source.gradientAngle, 0, 360, DEFAULT_WELCOME_DISPLAY.gradientAngle)),
    contentAlignment: source.contentAlignment === "center" ? "center" : "left",
    contentWidth: source.contentWidth === "narrow" || source.contentWidth === "wide" ? source.contentWidth : "standard",
    titleLetterSpacing: boundedNumber(source.titleLetterSpacing, -0.08, 0.12, DEFAULT_WELCOME_DISPLAY.titleLetterSpacing, 3),
    titleShadow: typeof source.titleShadow === "boolean" ? source.titleShadow : DEFAULT_WELCOME_DISPLAY.titleShadow,
    showRibbons: typeof source.showRibbons === "boolean" ? source.showRibbons : DEFAULT_WELCOME_DISPLAY.showRibbons,
  };
}

export function hexToRgba(hex: string, alpha: number) {
  const safe = HEX_COLOR.test(hex) ? hex : DEFAULT_WELCOME_DISPLAY.panelColor;
  const red = Number.parseInt(safe.slice(1, 3), 16);
  const green = Number.parseInt(safe.slice(3, 5), 16);
  const blue = Number.parseInt(safe.slice(5, 7), 16);
  const opacity = boundedNumber(alpha, 0, 1, 1, 2);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}
