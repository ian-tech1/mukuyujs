import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { getWelcomePage } from "@/lib/school/api";
import { applyDisplayPreferences, readDisplayPreferences } from "@/lib/school/display";
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
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,560;8..60,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
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
        <Scripts />
      </body>
    </html>
  ),
});


function AppearanceBootstrap() {
  useEffect(() => {
    const variables: Record<string, string> = {
      navy: "--color-navy", navy2: "--color-navy-2", brass: "--color-brass", brassSoft: "--color-brass-soft", paper: "--color-paper", card: "--color-card",
      ink: "--color-ink", muted: "--color-muted", line: "--color-line", good: "--color-good",
      warn: "--color-warn", bad: "--color-bad", info: "--color-info",
    };
    const apply = (colors: Record<string, unknown>) => {
      const saved: Record<string, string> = {};
      for (const [key, variable] of Object.entries(variables)) {
        const value = colors[key];
        if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
          document.documentElement.style.setProperty(variable, value);
          saved[key] = value;
        }
      }
      document.documentElement.dataset.schoolAppearance = JSON.stringify(saved);
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
