/**
 * Deployed-app (Nitro) half of the platform PWA chrome. Auto-registered as
 * global h3 middleware because vite.config.ts sets `serverDir: "./server"` —
 * without that option Nitro v3 never scans this directory.
 *
 * - `?install=1&platform=ios` on a document path → the Home Screen tutorial,
 *   bundled into the server build via `?raw` (the public/ directory is CDN
 *   static output on Vercel and not readable from the function).
 * - `/__grok/manifest.webmanifest` → per-app-named manifest (kept out of
 *   public/ so this dynamic response is the only one).
 * - Other HTML documents → stream-inject PWA + OG head tags at `</head>`.
 *   OG identity is baked via `virtual:grok-og-identity` at `vite build`
 *   (this function cannot read `src/lib/og/site.json` or `public/og.jpg`).
 *   This must be a middleware transforming `next()`: h3 discards the `response`
 *   runtime hook's return value, and `render:html` does not exist in Nitro v3.
 */
import installPageTemplate from "../../scripts/install-page.html?raw";
import { grokOgIdentity } from "virtual:grok-og-identity";
import { getSql } from "../../src/lib/db";
import { decodeSchoolAppIconDataUrl } from "../../src/lib/school/app-icon";
import {
  acceptsHtml,
  createHeadInjector,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderSchoolIconSvg,
  renderWebManifest,
  versionedSchoolAppIconUrl,
} from "../../scripts/grok-pwa-shared.mjs";

interface GrokPwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function requestHost(event: GrokPwaEvent): string {
  return (
    event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host
  );
}

async function schoolBrandName(): Promise<string> {
  try {
    const sql = await getSql();
    const rows = await sql<{ name: string }>`select name from school_profile where id = 1`;
    const name = rows[0]?.name?.trim().replace(/\s+/g, " ").slice(0, 100);
    return name || "Mukuyu Junior School";
  } catch {
    return "Mukuyu Junior School";
  }
}

async function schoolAppIconBytes(): Promise<Uint8Array | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ app_icon_data: string | null }>`select app_icon_data from welcome_page where id = 1`;
    return decodeSchoolAppIconDataUrl(rows[0]?.app_icon_data) ?? null;
  } catch {
    return null;
  }
}

function injectHeadStreaming(response: Response, host: string): Response {
  const injector = createHeadInjector({
    host,
    site: grokOgIdentity.site,
  });
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const out of injector.push(chunk)) controller.enqueue(out);
      },
      flush(controller) {
        for (const out of injector.flush()) controller.enqueue(out);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function grokPwaMiddleware(
  event: GrokPwaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET") return next();

  const path = event.url.pathname;
  const urlWithQuery = path + event.url.search;

  if (path === "/__grok/manifest.webmanifest" || path === "/__grok/manifest.json") {
    const [schoolName, iconBytes] = await Promise.all([schoolBrandName(), schoolAppIconBytes()]);
    const iconPath = iconBytes ? versionedSchoolAppIconUrl(iconBytes) : "/icons/mukuyu-app-192.png";
    return new Response(renderWebManifest(requestHost(event), schoolName, iconPath), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (path === "/__grok/school-app-icon.png") {
    const iconBytes = await schoolAppIconBytes();
    if (!iconBytes) {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/icons/mukuyu-app-512.png?v=5",
          "cache-control": "no-cache",
        },
      });
    }
    const versionedUrl = versionedSchoolAppIconUrl(iconBytes);
    const expectedVersion = versionedUrl.split("v=")[1] ?? "";
    const requestedVersion = event.url.searchParams.get("v");
    const cacheControl = requestedVersion === expectedVersion
      ? "public, max-age=31536000, immutable"
      : requestedVersion ? "no-cache" : "public, max-age=300";
    return new Response(Buffer.from(iconBytes), {
      headers: {
        "content-type": "image/png",
        "cache-control": cacheControl,
      },
    });
  }

  if (path === "/__grok/school-icon.svg") {
    const schoolName = await schoolBrandName();
    return new Response(renderSchoolIconSvg(schoolName), {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  if (
    isInstallQuery(urlWithQuery) &&
    isDocumentPath(path) &&
    acceptsHtml(event.req.headers.get("accept"))
  ) {
    const schoolName = await schoolBrandName();
    const html = renderInstallPageHtml(installPageTemplate, {
      host: requestHost(event),
      url: urlWithQuery,
      appName: schoolName,
    });
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  if (!isDocumentPath(path)) return next();

  const result = await next();
  if (
    result instanceof Response &&
    result.body &&
    String(result.headers.get("content-type") ?? "").includes("text/html") &&
    !result.headers.get("content-encoding")
  ) {
    return injectHeadStreaming(result, requestHost(event));
  }
  return result;
}
