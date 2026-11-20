import type { MusicCatalogResult } from "./types.ts";

const SEARCH_ENDPOINT = "https://archive.org/advancedsearch.php";
const MAX_QUERY_LENGTH = 100;

export function internetArchiveSearchUrl(query: string): string {
  const clean = query.trim().slice(0, MAX_QUERY_LENGTH).replace(/[{}[\]"']/g, " ").replace(/\s+/g, " ");
  const escaped = clean.split(" ").filter(Boolean).map((word) => `${word}*`).join(" AND ");
  const params = new URLSearchParams({
    q: `mediatype:audio AND (${escaped || "title:*"})`,
    "fl[]": "identifier,title,creator,description,subject",
    rows: "12",
    page: "1",
    output: "json",
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

export function internetArchiveGenreSearchUrl(genre: string): string {
  const clean = genre.trim().slice(0, 60).replace(/[{}[\]"']/g, " ").replace(/\s+/g, " ");
  const phrase = clean || "music";
  const params = new URLSearchParams({
    q: `mediatype:audio AND (subject:"${phrase}" OR title:"${phrase}" OR description:"${phrase}" OR creator:"${phrase}")`,
    "fl[]": "identifier,title,creator,description,subject",
    rows: "20",
    page: "1",
    output: "json",
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function firstText(value: unknown, limit: number): string {
  if (Array.isArray(value)) return text(value.find((item) => typeof item === "string"), limit);
  return text(value, limit);
}

function safeIdentifier(value: unknown): string {
  const id = text(value, 120);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(id) ? id : "";
}

export type InternetArchiveRecord = { identifier?: unknown; title?: unknown; creator?: unknown; description?: unknown; subject?: unknown };

export function normalizeInternetArchiveResults(payload: unknown): MusicCatalogResult[] {
  const docs = payload && typeof payload === "object"
    && (payload as { response?: unknown }).response && typeof (payload as { response: unknown }).response === "object"
    && Array.isArray(((payload as { response: { docs?: unknown[] } }).response).docs)
    ? ((payload as { response: { docs: InternetArchiveRecord[] } }).response).docs
    : [];
  return docs.flatMap((row): MusicCatalogResult[] => {
    const id = safeIdentifier(row.identifier);
    const title = firstText(row.title, 180);
    if (!id || !title) return [];
    const artist = firstText(row.creator, 160);
    const genre = firstText(row.subject, 100);
    const sourcePageUrl = `https://archive.org/details/${encodeURIComponent(id)}`;
    return [{
      provider: "Internet Archive",
      id,
      title,
      artist,
      genre,
      playbackUrl: `https://archive.org/download/${encodeURIComponent(id)}`,
      artworkUrl: "",
      sourcePageUrl,
      credit: artist ? `${artist} · Internet Archive` : "Internet Archive",
      licenseName: "Check item license",
      licenseUrl: sourcePageUrl,
    }];
  }).slice(0, 12);
}

export function safeInternetArchiveFileUrl(identifier: string, filename: string): string {
  const id = safeIdentifier(identifier);
  const file = filename.trim().split("/").map((part) => encodeURIComponent(part)).join("/");
  return id && file ? `https://archive.org/download/${encodeURIComponent(id)}/${file}` : "";
}
