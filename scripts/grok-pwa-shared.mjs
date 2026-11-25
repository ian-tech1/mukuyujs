/**
 * Single source of truth for platform head chrome (PWA, extensions.js, OG),
 * shared by the Vite plugin and Nitro middleware. Plain ESM so `node --test`
 * and the Nitro bundler can both consume it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_APP_NAME = "Grok App";
export const OG_SERVICE_URL_DEFAULT = "https://og.grok.me";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";
const PWA_INSTALL_CAPTURE_TAG =
  '<script id="mukuyu-pwa-install-capture">window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();window.__mukuyuBeforeInstallPrompt=event;});</script>';

const SHARE_META_KEYS = new Set([
  "og:title",
  "og:description",
  "og:image",
  "og:image:width",
  "og:image:height",
  "og:type",
  "og:url",
  "og:site_name",
  "twitter:card",
  "twitter:title",
  "twitter:image",
  "twitter:description",
  "x:game:image",
  "x:game:image:width",
  "x:game:image:height",
]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Inverse of escapeHtml. Decode &amp; last so a single pass undoes one encode. */
function unescapeHtml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** 6-digit hex for the og.grok.me placeholder, or "" if site.color is missing/invalid. */
function placeholderCardColor(site = {}) {
  const raw = String(site.color ?? "").trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : "";
}

/**
 * "wild-race.grok.me" → "Wild Race". Only published app hosts encode the
 * display name in the first label. Preview / guest hosts are image origins
 * only — slugifying them produced internal names like "Hds Abc 3000 Xy".
 */
export function appNameFromHost(hostHeader) {
  const host = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host.endsWith(".grok.me")) {
    return DEFAULT_APP_NAME;
  }
  const slug = host.split(".")[0] ?? "";
  if (!slug || slug === "www" || !/^[a-z0-9-]{1,63}$/.test(slug)) {
    return DEFAULT_APP_NAME;
  }
  return (
    slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || DEFAULT_APP_NAME
  );
}

/** True for Vercel system domains. Envoy rewrites origin Host to these; they SSO-protect `/og.jpg`. */
function isVercelSystemHost(host) {
  return (
    host === "vercel.app" ||
    host.endsWith(".vercel.app") ||
    host === "vercel.com" ||
    host.endsWith(".vercel.com")
  );
}

/** Hostname suitable for absolute og:image URLs. Preview guests (X-Forwarded-Host) are allowed. */
export function publicAppHost(hostHeader) {
  const host = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  if (isVercelSystemHost(host)) return "";
  return host;
}

/**
 * Published apps always use `VITE_PUBLIC_HOSTNAME` (the grok.me host the
 * deployer injects). Live preview has no such env, so fall back to the
 * request host / X-Forwarded-Host. Never prefer request Host on a published
 * app — Envoy rewrites it to `*.vercel.app`.
 */
export function resolvePublicHost(hostHeader) {
  return (
    publicAppHost(process.env?.VITE_PUBLIC_HOSTNAME) || publicAppHost(hostHeader)
  );
}

export function isInstallQuery(url) {
  const query = String(url ?? "").split("?", 2)[1] ?? "";
  const params = new URLSearchParams(query);
  const install = params.get("install");
  const platform = (params.get("platform") ?? "").toLowerCase();
  return (install === "1" || install === "true") && platform === "ios";
}

/** Paths that can carry an app document (vs assets / API / internals). */
export function isDocumentPath(pathname) {
  const path = String(pathname ?? "");
  return (
    !path.startsWith("/__grok/") &&
    !path.startsWith("/api/") &&
    !path.startsWith("/@") &&
    !path.startsWith("/node_modules") &&
    !/\.[a-z0-9]+$/i.test(path)
  );
}

export function acceptsHtml(accept) {
  const value = String(accept ?? "");
  return value === "" || value.includes("text/html") || value.includes("*/*");
}

/** The same URL without the install-tutorial params (used as the app link). */
export function stripInstallParams(url) {
  const [path = "/", query = ""] = String(url ?? "/").split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("install");
  params.delete("platform");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

export function renderInstallPageHtml(template, { host, url, appName } = {}) {
  const displayName = String(appName ?? "").trim() || appNameFromHost(host);
  return String(template)
    .replaceAll("{{APP_NAME}}", escapeHtml(displayName))
    .replaceAll("{{APP_URL}}", escapeHtml(stripInstallParams(url)));
}

export function renderWebManifest(hostHeader, appNameOverride, iconPath) {
  const name = String(appNameOverride ?? "").trim().replace(/\s+/g, " ").slice(0, 100) || appNameFromHost(hostHeader);
  const icons = iconPath === "/icons/mukuyu-app-192.png"
    ? [
        { src: "/icons/mukuyu-app-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/mukuyu-app-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ]
    : iconPath === "/__grok/school-icon.svg"
      ? [
          { src: iconPath, sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
          { src: "/__grok/icon-180.png", sizes: "180x180", type: "image/png" },
        ]
      : [{ src: "/__grok/icon-180.png", sizes: "180x180", type: "image/png" }];
  return JSON.stringify(
    {
      name,
      short_name: /^Mukuyu Junior School$/i.test(name) ? "Mukuyu Junior School" : name.slice(0, 20).trim(),
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#030914",
      theme_color: "#030914",
      icons,
    },
    null,
    2,
  );
}

export function renderSchoolIconSvg(schoolName = "Mukuyu Junior School") {
  const safeName = String(schoolName ?? "").trim().replace(/\s+/g, " ").slice(0, 100) || "Mukuyu Junior School";
  const initials = /^Mukuyu Junior School$/i.test(safeName) ? "MKJ" : safeName.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("").toUpperCase() || "M";
  const fontSize = initials.length === 1 ? 76 : initials.length === 2 ? 62 : 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-label="${escapeHtml(safeName)} school app icon"><defs><linearGradient id="school" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#123b70"/><stop offset=".48" stop-color="#4379b7"/><stop offset="1" stop-color="#be8d36"/></linearGradient><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".36"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="192" height="192" rx="44" fill="url(#school)"/><circle cx="150" cy="39" r="39" fill="#f2a8cf" fill-opacity=".28"/><circle cx="38" cy="158" r="46" fill="#7de0e6" fill-opacity=".24"/><path d="M22 69c21-30 57-47 94-43 22 2 39 11 54 24-29-17-63-20-92-9-21 8-39 21-56 42z" fill="url(#shine)"/><path d="M47 118c17-11 29-16 49-16s32 5 49 16v34c-16-9-31-13-49-13s-33 4-49 13z" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-opacity=".83" stroke-width="4" stroke-linejoin="round"/><path d="M96 103v35" stroke="#fff" stroke-opacity=".82" stroke-width="3"/><text x="96" y="92" text-anchor="middle" font-family="Georgia,serif" font-size="${fontSize}" font-weight="700" letter-spacing="-3" fill="#fffdf4" stroke="#15375e" stroke-opacity=".22" stroke-width="2" paint-order="stroke">${escapeHtml(initials)}</text><path d="M68 161h56" stroke="#f5d58a" stroke-width="5" stroke-linecap="round"/></svg>`;
}

export function grokPwaHeadTags(appName = DEFAULT_APP_NAME) {
  return [
    // Standalone display comes from the manifest ("display": "standalone");
    // the legacy *-web-app-capable metas it replaces are deliberately absent.
    ["manifest", '<link rel="manifest" href="/__grok/manifest.webmanifest">'],
    ["apple-touch-icon", '<link rel="apple-touch-icon" href="/icons/mukuyu-app-180.png?v=3">'],
    [
      "apple-mobile-web-app-title",
      `<meta name="apple-mobile-web-app-title" content="${escapeHtml(appName)}">`,
    ],
    [
      "apple-mobile-web-app-status-bar-style",
      '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    ],
    ["theme-color", '<meta name="theme-color" content="#030914">'],
  ];
}

export const GROK_EXTENSIONS_SCRIPT_SRC = "https://grok.com/grok-app-builder/extensions.js";

export function readGrokProjectId() {
  const fromProcess = typeof process !== "undefined" ? process.env?.VITE_PROJECT_ID : "";
  return String(fromProcess ?? "").trim();
}

export function readGrokExtensionsEnabled() {
  const fromProcess = typeof process !== "undefined" ? process.env?.VITE_GROK_EXTENSIONS : "";
  return String(fromProcess ?? "").trim() !== "0";
}

export function readXCreator() {
  const fromProcess = typeof process !== "undefined" ? process.env?.X_CREATOR : "";
  return String(fromProcess ?? "").trim();
}

export function readXCreatorId() {
  const fromProcess = typeof process !== "undefined" ? process.env?.X_CREATOR_ID : "";
  return String(fromProcess ?? "").trim();
}

export function grokXCreatorHeadTags(creator = readXCreator(), creatorId = readXCreatorId()) {
  const name = String(creator ?? "").trim();
  const id = String(creatorId ?? "").trim();
  if (!name || !id) return [];
  return [
    `<meta property="x:creator" content="${escapeHtml(name)}">`,
    `<meta property="x:creator:id" content="${escapeHtml(id)}">`,
  ];
}

/** Platform "Created with Grok" banner — injected into every HTML document. */
export function grokExtensionsHeadTags(projectId = readGrokProjectId()) {
  const id = escapeHtml(projectId);
  const tags = [];
  if (projectId) {
    tags.push(`<meta name="grok-project-id" content="${id}">`);
  }
  if (!readGrokExtensionsEnabled()) return tags;
  tags.push(
    `<script src="${GROK_EXTENSIONS_SCRIPT_SRC}"${
      projectId ? ` data-project-id="${id}"` : ""
    } defer></script>`,
  );
  return tags;
}

export function readOgSite(cwd = process.cwd()) {
  try {
    const raw = readFileSync(join(cwd, OG_SITE_REL_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Public path of an on-disk share card, or "" if neither file exists. */
export function ogCardPublicPath(cwd = process.cwd()) {
  if (existsSync(join(cwd, "public/og.jpg"))) return "/og.jpg";
  if (existsSync(join(cwd, "public/og.png"))) return "/og.png";
  return "";
}

function detectCustomOgCard(cwd = process.cwd(), site = {}) {
  if (ogCardPublicPath(cwd)) return true;
  // Vercel runtime has no public/: trust a bake that already saw the file.
  return siteHasCustomCard(site) || Boolean(String(site.image ?? "").trim());
}

/** Snapshot for Vite/Nitro to bake into the server bundle (Vercel has no workspace FS). */
export function snapshotOgIdentity(cwd = process.cwd()) {
  const site = { ...readOgSite(cwd) };
  const disk = ogCardPublicPath(cwd);
  if (disk) {
    site.card = "custom";
    site.image = disk;
  } else {
    // site.json `card=custom` without a file must not bake a 404 /og.jpg URL.
    if (siteHasCustomCard(site)) delete site.card;
    if (site.image) delete site.image;
  }
  if (existsSync(join(cwd, "public/x-banner.jpg"))) {
    site.banner = site.banner || "/x-banner.jpg";
  }
  return { site };
}

export function customOgAssetPath(cwd = process.cwd()) {
  return ogCardPublicPath(cwd) || "/og.jpg";
}

export function ogServiceUrl() {
  const fromEnv = String(process.env?.VITE_OG_SERVICE_URL ?? "").trim();
  return (fromEnv || OG_SERVICE_URL_DEFAULT).replace(/\/+$/, "");
}

export function titleFromDocument(html) {
  const match = String(html ?? "").match(/<title\b[^>]*>([^<]*)<\/title>/i);
  return match ? unescapeHtml(match[1]).trim() : "";
}

export function resolveOgTitle(
  site = {},
  appName = DEFAULT_APP_NAME,
  host = "",
  documentTitle = "",
) {
  const fromSite = String(site.title ?? "").trim();
  if (fromSite) return fromSite;
  const fromDoc = String(documentTitle ?? "").trim();
  if (fromDoc) return fromDoc;
  const fromHost = appNameFromHost(host);
  if (fromHost && fromHost !== DEFAULT_APP_NAME) return fromHost;
  const fromArg = String(appName ?? "").trim();
  return fromArg || DEFAULT_APP_NAME;
}

export function siteHasCustomCard(site = {}) {
  return String(site.card ?? "").toLowerCase() === "custom";
}

/**
 * Preview: public/og.jpg|png on disk.
 * Vercel: the bake (`card=custom` / `image`) because the function cannot stat public/.
 * Otherwise empty — caller emits the og.grok.me placeholder.
 */
export function resolveOgCardAsset(site = {}, cwd = process.cwd()) {
  return ogCardPublicPath(cwd) || (detectCustomOgCard(cwd, site) ? String(site.image ?? "").trim() || "/og.jpg" : "");
}

/** Stamp `card=custom` when public/og.jpg or public/og.png is on disk. */
function applyCustomCardFromFs(site, cwd) {
  const disk = ogCardPublicPath(cwd);
  if (!disk) return site;
  return { ...site, card: "custom", image: disk };
}

export function grokOgHeadTags({
  host = "",
  appName = DEFAULT_APP_NAME,
  site = {},
  documentTitle = "",
  cwd = process.cwd(),
} = {}) {
  const title = resolveOgTitle(site, appName, host, documentTitle);
  const publicHost = resolvePublicHost(host);
  const tags = [
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
  ];
  const description = String(site.description ?? "").trim();
  if (description) {
    tags.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  }
  if (String(site.type ?? "").toLowerCase() === "x:game") {
    tags.push(`<meta property="og:type" content="x:game">`);
  }
  if (publicHost) {
    const asset = resolveOgCardAsset(site, cwd);
    const custom = Boolean(asset);
    let image = custom
      ? `https://${publicHost}${asset.startsWith("/") ? asset : `/${asset}`}`
      : `${ogServiceUrl()}/v1/card.png?host=${encodeURIComponent(publicHost)}&title=${encodeURIComponent(title)}`;
    const color = !custom ? placeholderCardColor(site) : "";
    if (color) image += `&color=${encodeURIComponent(color)}`;
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    tags.push(`<meta property="og:image:width" content="1200">`);
    tags.push(`<meta property="og:image:height" content="630">`);
    const banner = String(site.banner ?? "").trim();
    if (banner) {
      const bannerUrl = `https://${publicHost}${banner.startsWith("/") ? banner : `/${banner}`}`;
      tags.push(`<meta property="x:game:image" content="${escapeHtml(bannerUrl)}">`);
      tags.push(`<meta property="x:game:image:width" content="1200">`);
      tags.push(`<meta property="x:game:image:height" content="264">`);
    }
  }
  return tags;
}

function stripGrokExtensionsScript(html) {
  return String(html).replace(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\/grok-app-builder\/extensions\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    "",
  );
}

export function stripShareMetaTags(html) {
  return String(html).replace(/<meta\b[^>]*>/gi, (tag) => {
    const attrs = [...tag.matchAll(/\b(?:property|name)\s*=\s*["']([^"']+)["']/gi)];
    for (const match of attrs) {
      if (SHARE_META_KEYS.has(String(match[1]).toLowerCase())) return "";
    }
    return tag;
  });
}

function insertAfterHeadOpen(html, snippet) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${snippet}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${snippet}</head>`);
  }
  return `<!doctype html><html><head>${snippet}</head>${html}`;
}

function insertBeforeHeadClose(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}</head>`);
  return insertAfterHeadOpen(html, snippet);
}

export function normalizeHeadContext(ctx = {}) {
  const cwd = ctx.cwd ?? process.cwd();
  // Middleware passes a baked `site`. Still consult the workspace so a
  // public/og.jpg generated after that snapshot (or missed by a wrong cwd)
  // wins over the og.grok.me placeholder. Vercel has no public/ to read, so
  // a correct bake is unchanged.
  const site = applyCustomCardFromFs(
    ctx.site !== undefined ? ctx.site : snapshotOgIdentity(cwd).site,
    cwd,
  );
  const appName = resolveOgTitle(site, ctx.appName ?? DEFAULT_APP_NAME, ctx.host ?? "");
  return {
    appName,
    projectId: ctx.projectId ?? readGrokProjectId(),
    creator: ctx.creator ?? readXCreator(),
    creatorId: ctx.creatorId ?? readXCreatorId(),
    host: ctx.host ?? "",
    cwd,
    site,
  };
}

export function injectGrokPwaHead(html, ctx = {}) {
  if (typeof html !== "string") return html;
  const { site, projectId, creator, creatorId, host, cwd } = normalizeHeadContext(ctx);
  const documentTitle = titleFromDocument(html);
  const appName = resolveOgTitle(
    site,
    ctx.appName ?? DEFAULT_APP_NAME,
    host,
    documentTitle,
  );
  let next = stripShareMetaTags(html);
  if (!readGrokExtensionsEnabled()) next = stripGrokExtensionsScript(next);

  const missing = grokPwaHeadTags(appName)
    .filter(([key]) => {
      if (key === "manifest") return !next.includes('href="/__grok/manifest.webmanifest"');
      if (key === "apple-touch-icon") return !next.includes('href="/icons/mukuyu-app-180.png?v=3"');
      return !next.includes(`name="${key}"`);
    })
    .map(([, tag]) => tag);

  if (!next.includes('id="mukuyu-pwa-install-capture"')) {
    next = insertAfterHeadOpen(next, PWA_INSTALL_CAPTURE_TAG);
  }
  next = insertAfterHeadOpen(
    next,
    grokOgHeadTags({ host, appName, site, documentTitle, cwd }).join(""),
  );

  if (readGrokExtensionsEnabled() && !next.includes("/grok-app-builder/extensions.js")) {
    missing.push(...grokExtensionsHeadTags(projectId));
  } else if (projectId && !next.includes('name="grok-project-id"')) {
    missing.push(`<meta name="grok-project-id" content="${escapeHtml(projectId)}">`);
  }
  if (
    projectId &&
    !next.includes('property="grok:app_id"') &&
    !next.includes("property='grok:app_id'")
  ) {
    missing.push(`<meta property="grok:app_id" content="${escapeHtml(projectId)}">`);
  }
  const creatorTags = grokXCreatorHeadTags(creator, creatorId);
  if (creatorTags.length > 0) {
    const hasCreator =
      next.includes('property="x:creator" content=') ||
      next.includes("property='x:creator' content=");
    if (!hasCreator) missing.push(creatorTags[0]);
    if (!next.includes('property="x:creator:id"')) missing.push(creatorTags[1]);
  }

  if (missing.length === 0) return next;
  return insertBeforeHeadClose(next, missing.join(""));
}

function findHeadClose(buf) {
  const at = buf.toString("latin1").search(/<\/head>/i);
  return at;
}

/**
 * Streaming head injector: buffers only until `</head>` (ASCII marker; never
 * appears inside a UTF-8 continuation byte), overwrites share-card metas,
 * then passes later chunks through so streaming SSR keeps streaming.
 */
export function createHeadInjector(ctx = {}) {
  const normalized = normalizeHeadContext(ctx);

  /** @type {Buffer[]} */
  let pending = [];
  let done = false;

  const apply = (html) =>
    injectGrokPwaHead(html, {
      appName: normalized.appName,
      projectId: normalized.projectId,
      creator: normalized.creator,
      creatorId: normalized.creatorId,
      host: normalized.host,
      cwd: normalized.cwd,
      site: normalized.site,
    });

  return {
    /** @param {Uint8Array | string} chunk @returns {Buffer[]} chunks ready to emit */
    push(chunk) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (done) return [buf];
      pending.push(buf);
      const joined = Buffer.concat(pending);
      const at = findHeadClose(joined);
      if (at === -1) return [];
      done = true;
      pending = [];
      const closeLen = joined.toString("latin1", at).match(/^<\/head>/i)[0].length;
      const head = apply(joined.subarray(0, at + closeLen).toString("utf8"));
      return [Buffer.concat([Buffer.from(head, "utf8"), joined.subarray(at + closeLen)])];
    },
    /** @returns {Buffer[]} whatever is still buffered (no `</head>` seen) */
    flush() {
      if (done || pending.length === 0) return [];
      const rest = Buffer.concat(pending);
      pending = [];
      done = true;
      return [Buffer.from(apply(rest.toString("utf8")), "utf8")];
    },
  };
}
