import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { DownloadActivityOverlay } from "@/components/school/download-activity-overlay";
import { getWelcomePage } from "@/lib/school/api";
import { PORTAL_BACKDROP_THEME_IDS, type AppearancePalette } from "@/lib/school/model";
import { applyDisplayPreferences, applyPortalBackdropColors, readDisplayPreferences } from "@/lib/school/display";
import { initializePwaInstallCapture } from "@/lib/pwa-install";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mukuyu JSS Portal" },
      { name: "theme-color", content: "#0e2a4a" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/icons/mukuyu-app-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,560;8..60,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/mukuyu-app-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppearanceBootstrap />
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <DownloadActivityOverlay />
        <Scripts />
      </body>
    </html>
  ),
});


function AppearanceBootstrap() {
  useEffect(() => {
    initializePwaInstallCapture();
    const apply = (colors: Record<string, unknown>) => {
      const saved: Record<string, string> = {};
      for (const key of ["navy", "navy2", "brass", "brassSoft", "paper", "card", "ink", "muted", "line", "good", "warn", "bad", "info"]) {
        const value = colors[key];
        if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
          saved[key] = value;
        }
      }
      saved.backdropTheme = typeof colors.backdropTheme === "string" && PORTAL_BACKDROP_THEME_IDS.includes(colors.backdropTheme as typeof PORTAL_BACKDROP_THEME_IDS[number])
        ? colors.backdropTheme
        : "auto-sections";
      document.documentElement.dataset.schoolAppearance = JSON.stringify(saved);
      applyPortalBackdropColors(saved as Partial<AppearancePalette>);
    };
    applyDisplayPreferences(readDisplayPreferences());
    getWelcomePage().then((settings) => apply(settings.appearance || {})).catch(() => {
      try {
        const raw = localStorage.getItem("mukuyu-super-admin-appearance-v1");
        if (raw) apply(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        // Invalid or unavailable browser storage should not prevent the portal from loading.
      }
    }).finally(() => applyDisplayPreferences(readDisplayPreferences()));
  }, []);
  return null;
}
