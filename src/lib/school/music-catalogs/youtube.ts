import type { MusicCatalogResult } from "./types.ts";

const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const MAX_QUERY_LENGTH = 200;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;

/** Build a server-side YouTube Data API search URL. Keep the API key out of client code. */
export function youtubeSearchUrl(query: string, apiKey: string): string {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "10",
    videoEmbeddable: "true",
    safeSearch: "strict",
    q: (typeof query === "string" ? query : "").trim().slice(0, MAX_QUERY_LENGTH),
    key: apiKey,
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safeArtwork(thumbnails: unknown): string {
  if (!isRecord(thumbnails)) return "";
  const preferred: string[] = [];
  const other: string[] = [];
  for (const candidate of Object.values(thumbnails)) {
    if (!isRecord(candidate) || typeof candidate.url !== "string") continue;
    try {
      const url = new URL(candidate.url);
      if (url.protocol !== "https:") continue;
      if (url.hostname === "i.ytimg.com" || url.hostname === "yt3.ggpht.com") {
        preferred.push(url.href);
      } else {
        other.push(url.href);
      }
    } catch {
      // Ignore malformed thumbnail URLs.
    }
  }
  return preferred[0] ?? other[0] ?? "";
}

export function normalizeYouTubeSearchResults(payload: unknown): MusicCatalogResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  const results: MusicCatalogResult[] = [];
  for (const item of payload.items) {
    if (!isRecord(item) || !isRecord(item.id) || !isRecord(item.snippet)) continue;
    const id = item.id.videoId;
    if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) continue;
    const snippet = item.snippet;
    results.push({
      provider: "YouTube",
      id,
      title: text(snippet.title, 200),
      artist: text(snippet.channelTitle, 120),
      genre: "",
      playbackUrl: `https://www.youtube.com/watch?v=${id}`,
      artworkUrl: safeArtwork(snippet.thumbnails),
      sourcePageUrl: `https://www.youtube.com/watch?v=${id}`,
      credit: "",
      licenseName: "",
      licenseUrl: "",
    });
  }
  return results;
}
