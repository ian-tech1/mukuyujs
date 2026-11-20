export type SpotifyCatalogTrack = {
  id: string;
  title: string;
  artists: string;
  album: string;
  artwork: string;
  spotifyUrl: string;
  uri: string;
};

type SpotifyApiTrack = {
  id?: unknown;
  name?: unknown;
  artists?: unknown;
  album?: unknown;
  external_urls?: unknown;
  uri?: unknown;
};

function safeSpotifyUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeArtworkUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.hostname !== "i.scdn.co" && !url.hostname.endsWith(".scdn.co")) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function spotifyTrackSearchUrl(query: string, market = "KE") {
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", query.trim().slice(0, 100));
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "10");
  url.searchParams.set("market", /^[A-Z]{2}$/.test(market) ? market : "KE");
  return url.toString();
}

export function normalizeSpotifyTrackResults(payload: unknown): SpotifyCatalogTrack[] {
  if (!payload || typeof payload !== "object") return [];
  const tracks = (payload as { tracks?: { items?: unknown } }).tracks;
  if (!tracks || !Array.isArray(tracks.items)) return [];
  return tracks.items.flatMap((raw): SpotifyCatalogTrack[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as SpotifyApiTrack;
    const id = typeof item.id === "string" ? item.id : "";
    const title = typeof item.name === "string" ? item.name.trim() : "";
    const urls = item.external_urls && typeof item.external_urls === "object" ? (item.external_urls as Record<string, unknown>) : {};
    const spotifyUrl = safeSpotifyUrl(urls.spotify);
    const uri = typeof item.uri === "string" && /^spotify:track:[A-Za-z0-9]+$/.test(item.uri) ? item.uri : "";
    if (!id || !title || !spotifyUrl || !uri) return [];
    const artists = Array.isArray(item.artists) ? item.artists.flatMap((artist) => {
      if (!artist || typeof artist !== "object") return [];
      const name = (artist as { name?: unknown }).name;
      return typeof name === "string" && name.trim() ? [name.trim()] : [];
    }).slice(0, 5).join(", ") : "";
    const album = item.album && typeof item.album === "object" ? item.album as { name?: unknown; images?: unknown } : {};
    const images = Array.isArray(album.images) ? album.images : [];
    const artwork = images.flatMap((image) => {
      if (!image || typeof image !== "object") return [];
      const url = safeArtworkUrl((image as { url?: unknown }).url);
      return url ? [url] : [];
    })[0] || "";
    return [{
      id: id.slice(0, 100),
      title: title.slice(0, 160),
      artists: artists.slice(0, 240),
      album: typeof album.name === "string" ? album.name.trim().slice(0, 160) : "",
      artwork,
      spotifyUrl,
      uri,
    }];
  }).slice(0, 10);
}
