import type { MusicCatalogResult } from "./types.ts";

const API_URL = "https://api.jamendo.com/v3.0/tracks/";
const MAX_QUERY_LENGTH = 200;
const MAX_CLIENT_ID_LENGTH = 200;

export function jamendoSearchUrl(query: string, clientId: string): string {
  const params = new URLSearchParams({
    format: "json",
    limit: "10",
    search: query.slice(0, MAX_QUERY_LENGTH),
    include: "licenses",
    audioformat: "mp32",
    client_id: clientId.slice(0, MAX_CLIENT_ID_LENGTH),
  });
  return `${API_URL}?${params.toString()}`;
}

function safeUrl(value: unknown, allowed: (url: URL) => boolean): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowed(url) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isAudioHost(url: URL): boolean {
  return url.hostname === "storage.jamendo.com" || url.hostname.endsWith(".storage.jamendo.com");
}

function licenseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !["creativecommons.org", "www.creativecommons.org"].includes(url.hostname)
    ) return "";
    url.protocol = "https:";
    return url.toString();
  } catch {
    return "";
  }
}

function licenseLabel(url: string): string {
  if (!url) return "";
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const licenseIndex = segments.findIndex((segment) => /^by(?:-.+)?$/i.test(segment));
  if (licenseIndex < 0) return "";
  return `CC ${segments[licenseIndex].toUpperCase()}`;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeJamendoSearchResults(payload: unknown): MusicCatalogResult[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { results?: unknown }).results)) {
    return [];
  }

  const results: MusicCatalogResult[] = [];
  for (const item of (payload as { results: unknown[] }).results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!nonEmptyString(row.id) || !nonEmptyString(row.name) || !nonEmptyString(row.artist_name)) continue;

    const audio = safeUrl(row.audio, isAudioHost);
    const sourcePageUrl = safeUrl(row.shareurl, (url) => {
      if (url.hostname !== "www.jamendo.com") return false;
      const match = url.pathname.match(/^\/track\/([^/]+)\/?$/);
      if (!match) return false;
      try {
        return decodeURIComponent(match[1]) === row.id;
      } catch {
        return false;
      }
    });
    if (!audio || !sourcePageUrl) continue;

    const artworkUrl = safeUrl(row.image, (url) =>
      url.hostname === "usercontent.jamendo.com" || url.hostname === "images.jamendo.com",
    ) ?? "";
    const license = licenseUrl(row.license_ccurl);
    const musicinfo = row.musicinfo && typeof row.musicinfo === "object"
      ? row.musicinfo as Record<string, unknown>
      : undefined;
    const tags = musicinfo?.tags && typeof musicinfo.tags === "object"
      ? musicinfo.tags as Record<string, unknown>
      : undefined;
    const genres = Array.isArray(tags?.genres) ? tags.genres : [];
    const genre = genres.find((value): value is string => typeof value === "string") ?? "";

    results.push({
      provider: "Jamendo",
      id: row.id,
      title: row.name,
      artist: row.artist_name,
      genre,
      playbackUrl: audio,
      artworkUrl,
      sourcePageUrl,
      credit: `${row.artist_name} · Jamendo`,
      licenseName: licenseLabel(license),
      licenseUrl: license,
    });
  }
  return results;
}
