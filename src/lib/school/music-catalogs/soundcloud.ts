import type { MusicCatalogResult } from "./types.ts";

type SoundCloudTrack = {
  id?: unknown;
  title?: unknown;
  permalink_url?: unknown;
  access?: unknown;
  genre?: unknown;
  artwork_url?: unknown;
  user?: unknown;
};

function safeSoundCloudPermalink(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "soundcloud.com" ||
      url.port ||
      url.username ||
      url.password ||
      segments.length < 2
    ) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeSoundCloudArtwork(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".sndcdn.com") ||
      url.username ||
      url.password
    ) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function soundCloudSearchUrl(query: string): string {
  const url = new URL("https://api.soundcloud.com/tracks");
  url.searchParams.set("q", query.trim().slice(0, 100));
  url.searchParams.set("limit", "10");
  return url.toString();
}

export function normalizeSoundCloudSearchResults(payload: unknown): MusicCatalogResult[] {
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { collection?: unknown }).collection)
      ? (payload as { collection: unknown[] }).collection
      : [];

  return items.flatMap((raw): MusicCatalogResult[] => {
    if (!raw || typeof raw !== "object") return [];
    const track = raw as SoundCloudTrack;
    if (track.access === "blocked") return [];

    const id = typeof track.id === "string" || typeof track.id === "number" ? String(track.id).trim() : "";
    const title = text(track.title, 160);
    const permalink = safeSoundCloudPermalink(track.permalink_url);
    if (!id || !title || !permalink) return [];

    const user = track.user && typeof track.user === "object" ? track.user as { username?: unknown } : {};
    return [{
      provider: "SoundCloud",
      id: id.slice(0, 100),
      title,
      artist: text(user.username, 240),
      genre: text(track.genre, 120),
      playbackUrl: permalink,
      artworkUrl: safeSoundCloudArtwork(track.artwork_url),
      sourcePageUrl: permalink,
      credit: "",
      licenseName: "",
      licenseUrl: "",
    }];
  }).slice(0, 10);
}
