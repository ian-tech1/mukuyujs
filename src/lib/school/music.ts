export type MusicTrack = {
  title: string;
  genre: string;
  url: string;
  fallbackUrl?: string;
  credit?: string;
  sourcePageUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
};

export type KenyaTrendingTrack = MusicTrack & { chartRank: number };

export const KENYA_TRENDING_TRACKS: KenyaTrendingTrack[] = [
  { title: "I'll Be Okay — Bien", genre: "Kenya Trending", chartRank: 1, url: "https://www.youtube.com/watch?v=_POKM8PhWrA", credit: "Bien · Official YouTube video", sourcePageUrl: "https://www.youtube.com/watch?v=_POKM8PhWrA" },
  { title: "Kwa Neema — Otile Brown & Darassa", genre: "Kenya Trending", chartRank: 4, url: "https://www.youtube.com/watch?v=ZLwACuh7hkY", credit: "Otile Brown Official · Official video", sourcePageUrl: "https://www.youtube.com/watch?v=ZLwACuh7hkY" },
  { title: "Shing — Kapitani & Toxic Lyrikali", genre: "Kenya Trending", chartRank: 7, url: "https://www.youtube.com/watch?v=6YARCFVmO9I", credit: "Kapitani · Official YouTube video", sourcePageUrl: "https://www.youtube.com/watch?v=6YARCFVmO9I" },
  { title: "Mafia Boss — Toxic Lyrikali", genre: "Kenya Trending", chartRank: 10, url: "https://www.youtube.com/watch?v=3GoBDHycNl8", credit: "Toxic Lyrikali · Lyric video", sourcePageUrl: "https://www.youtube.com/watch?v=3GoBDHycNl8" },
];

export const KENYA_DAILY_CHART_TRACK: MusicTrack = {
  title: "Apple Music Top 100: Kenya — daily chart",
  genre: "Kenya Trending",
  url: "https://music.apple.com/ke/playlist/top-100-kenya/pl.0b36ea82865d4adeb9d1d62207aab172",
  credit: "Apple Music · Top 100: Kenya",
  sourcePageUrl: "https://music.apple.com/ke/playlist/top-100-kenya/pl.0b36ea82865d4adeb9d1d62207aab172",
};

export type MusicOptions = {
  defaultVolume: number;
  playbackRate: number;
  shuffle: boolean;
  repeatMode: "all" | "one" | "off";
  rememberTrack: boolean;
  autoNext: boolean;
  compact: boolean;
  playerPosition: "top" | "bottom";
  showQueue: boolean;
  retryOnError: boolean;
  useProviderEmbeds: boolean;
  rememberVolume: boolean;
  preload: "none" | "metadata" | "auto";
  maxRetries: number;
  retryDelayMs: number;
};

export const DEFAULT_MUSIC_OPTIONS: MusicOptions = {
  defaultVolume: 0.8,
  playbackRate: 1,
  shuffle: false,
  repeatMode: "all",
  rememberTrack: true,
  autoNext: true,
  compact: false,
  playerPosition: "bottom",
  showQueue: true,
  retryOnError: true,
  useProviderEmbeds: true,
  rememberVolume: true,
  preload: "metadata",
  maxRetries: 1,
  retryDelayMs: 900,
};

export type MusicSource =
  | { kind: "audio"; provider: "Direct audio"; url: string }
  | { kind: "embed"; provider: string; url: string; height: number }
  | { kind: "invalid"; provider: "Unsupported source"; message: string };

export function playbackEndAction(input: { autoNext: boolean; repeatMode: MusicOptions["repeatMode"]; currentIndex: number; trackCount: number }): "advance" | "repeat" | "stop" {
  if (input.repeatMode === "one") return "repeat";
  if (!input.autoNext) return "stop";
  if (input.repeatMode === "all") return "advance";
  return input.currentIndex < input.trackCount - 1 ? "advance" : "stop";
}

export function canReadPortalMusic(role: string | null | undefined) {
  return role === "teacher" || role === "admin" || role === "super_admin" || role === "parent" || role === "student";
}

export const canReadStaffMusic = canReadPortalMusic;

const AUDIO_DATA_URL = /^data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i;
const MAX_AUDIO_DATA_URL_LENGTH = 700_000;
const EMBED_ID = /^[a-zA-Z0-9_-]{6,80}$/;

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

export function normalizeMusicOptions(input: unknown): MusicOptions {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const repeatMode = source.repeatMode === "one" || source.repeatMode === "off" ? source.repeatMode : "all";
  const playerPosition = source.playerPosition === "top" ? "top" : "bottom";
  const preload = source.preload === "none" || source.preload === "auto" ? source.preload : "metadata";
  return {
    defaultVolume: clamp(source.defaultVolume, 0, 1, DEFAULT_MUSIC_OPTIONS.defaultVolume),
    playbackRate: clamp(source.playbackRate, 0.5, 2, DEFAULT_MUSIC_OPTIONS.playbackRate),
    shuffle: typeof source.shuffle === "boolean" ? source.shuffle : DEFAULT_MUSIC_OPTIONS.shuffle,
    repeatMode,
    rememberTrack: typeof source.rememberTrack === "boolean" ? source.rememberTrack : DEFAULT_MUSIC_OPTIONS.rememberTrack,
    autoNext: typeof source.autoNext === "boolean" ? source.autoNext : DEFAULT_MUSIC_OPTIONS.autoNext,
    compact: typeof source.compact === "boolean" ? source.compact : DEFAULT_MUSIC_OPTIONS.compact,
    playerPosition,
    showQueue: typeof source.showQueue === "boolean" ? source.showQueue : DEFAULT_MUSIC_OPTIONS.showQueue,
    retryOnError: typeof source.retryOnError === "boolean" ? source.retryOnError : DEFAULT_MUSIC_OPTIONS.retryOnError,
    useProviderEmbeds: typeof source.useProviderEmbeds === "boolean" ? source.useProviderEmbeds : DEFAULT_MUSIC_OPTIONS.useProviderEmbeds,
    rememberVolume: typeof source.rememberVolume === "boolean" ? source.rememberVolume : DEFAULT_MUSIC_OPTIONS.rememberVolume,
    preload,
    maxRetries: Math.round(clamp(source.maxRetries, 0, 3, DEFAULT_MUSIC_OPTIONS.maxRetries)),
    retryDelayMs: Math.round(clamp(source.retryDelayMs, 0, 5_000, DEFAULT_MUSIC_OPTIONS.retryDelayMs)),
  };
}

function validAudioDataUrl(value: string) {
  return value.length <= MAX_AUDIO_DATA_URL_LENGTH && AUDIO_DATA_URL.test(value);
}

function safeHttpsLink(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeMusicAttribution(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const credit = typeof source.credit === "string" ? source.credit.trim().slice(0, 240) : "";
  const sourcePageUrl = safeHttpsLink(source.sourcePageUrl);
  const licenseName = typeof source.licenseName === "string" ? source.licenseName.trim().slice(0, 120) : "";
  const licenseUrl = safeHttpsLink(source.licenseUrl);
  return {
    ...(credit ? { credit } : {}),
    ...(sourcePageUrl ? { sourcePageUrl } : {}),
    ...(licenseName ? { licenseName } : {}),
    ...(licenseUrl ? { licenseUrl } : {}),
  };
}

function hostIs(host: string, ...domains: string[]) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function likelyDirectAudioUrl(url: URL) {
  const path = url.pathname.toLowerCase();
  if (/\.(mp3|mp4|m4a|m4b|aac|ogg|oga|opus|wav|flac|webm)$/.test(path)) return true;
  if (/(^|\/)(stream|listen|live|radio)(\/|$)/.test(path)) return true;
  const formatHint = `${url.searchParams.get("format") || ""} ${url.searchParams.get("type") || ""}`.toLowerCase();
  if (/audio\/|mp3|mpeg|aac|ogg|wav|flac|m4a/.test(formatHint)) return true;
  return hostIs(url.hostname.toLowerCase(), "jamendo.com") && url.searchParams.has("trackid");
}

function youtubeEmbed(url: URL): MusicSource | null {
  const host = url.hostname.toLowerCase();
  if (!hostIs(host, "youtube.com", "youtube-nocookie.com", "youtu.be")) return null;

  let videoId = "";
  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live", "v"].includes(segments[0] || "")) videoId = segments[1] || "";
    if (segments[0] === "watch") videoId = url.searchParams.get("v") || "";
    if (!videoId && url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
  }

  const listId = url.searchParams.get("list");
  if (!videoId && listId && EMBED_ID.test(listId)) {
    const target = new URL("https://www.youtube.com/embed/videoseries");
    target.searchParams.set("list", listId);
    target.searchParams.set("autoplay", "0");
    return { kind: "embed", provider: "YouTube", url: target.toString(), height: 240 };
  }
  if (!EMBED_ID.test(videoId)) return null;
  const target = new URL(`https://www.youtube.com/embed/${videoId}`);
  target.searchParams.set("playsinline", "1");
  target.searchParams.set("rel", "0");
  target.searchParams.set("autoplay", "0");
  if (listId && EMBED_ID.test(listId)) target.searchParams.set("list", listId);
  return { kind: "embed", provider: "YouTube", url: target.toString(), height: 240 };
}

function spotifyEmbed(value: string, url?: URL): MusicSource | null {
  const uri = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/i.exec(value.trim());
  if (uri) {
    return {
      kind: "embed",
      provider: "Spotify",
      url: `https://open.spotify.com/embed/${uri[1].toLowerCase()}/${uri[2]}?utm_source=generator&autoplay=false`,
      height: 240,
    };
  }
  if (!url || !hostIs(url.hostname.toLowerCase(), "open.spotify.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const typeIndex = segments.findIndex((segment) => ["track", "album", "playlist", "artist", "episode", "show"].includes(segment));
  const type = segments[typeIndex];
  const id = segments[typeIndex + 1];
  if (!type || !id || !EMBED_ID.test(id)) return null;
  return {
    kind: "embed",
    provider: "Spotify",
    url: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&autoplay=false`,
    height: type === "track" || type === "episode" ? 152 : 240,
  };
}

function soundCloudEmbed(url: URL): MusicSource | null {
  if (!hostIs(url.hostname.toLowerCase(), "soundcloud.com")) return null;
  const path = url.pathname.split("/").filter(Boolean);
  if (path.length < 2 || path.some((part) => part === "you" || part === "discover")) return null;
  const target = new URL("https://w.soundcloud.com/player/");
  target.searchParams.set("url", url.toString());
  target.searchParams.set("auto_play", "false");
  target.searchParams.set("hide_related", "true");
  target.searchParams.set("show_comments", "false");
  target.searchParams.set("visual", "false");
  return { kind: "embed", provider: "SoundCloud", url: target.toString(), height: 166 };
}

function mixcloudEmbed(url: URL): MusicSource | null {
  if (!hostIs(url.hostname.toLowerCase(), "mixcloud.com")) return null;
  const feed = `/${url.pathname.split("/").filter(Boolean).join("/")}/`;
  if (feed === "//") return null;
  const target = new URL("https://www.mixcloud.com/widget/iframe/");
  target.searchParams.set("hide_cover", "1");
  target.searchParams.set("light", "1");
  target.searchParams.set("feed", feed);
  target.searchParams.set("autoplay", "0");
  return { kind: "embed", provider: "Mixcloud", url: target.toString(), height: 180 };
}

function appleMusicEmbed(url: URL): MusicSource | null {
  if (!hostIs(url.hostname.toLowerCase(), "music.apple.com")) return null;
  const target = new URL(url.toString());
  target.hostname = "embed.music.apple.com";
  target.searchParams.delete("autoplay");
  return { kind: "embed", provider: "Apple Music", url: target.toString(), height: 175 };
}

function deezerEmbed(url: URL): MusicSource | null {
  if (!hostIs(url.hostname.toLowerCase(), "deezer.com")) return null;
  const match = /\/(track|album|playlist|episode)\/(\d+)/i.exec(url.pathname);
  if (!match) return null;
  const target = new URL(`https://widget.deezer.com/widget/dark/${match[1].toLowerCase()}/${match[2]}`);
  target.searchParams.set("autoplay", "false");
  return { kind: "embed", provider: "Deezer", url: target.toString(), height: 240 };
}

function tidalEmbed(url: URL): MusicSource | null {
  const host = url.hostname.toLowerCase();
  if (!hostIs(host, "tidal.com")) return null;
  const match = /\/(?:browse\/)?(track|album|playlist)\/(\d+)/i.exec(url.pathname);
  if (!match) return null;
  const type = match[1].toLowerCase() === "track" ? "tracks" : `${match[1].toLowerCase()}s`;
  const target = new URL(`https://embed.tidal.com/${type}/${match[2]}`);
  target.searchParams.set("autoplay", "false");
  return { kind: "embed", provider: "TIDAL", url: target.toString(), height: 240 };
}

export function resolveMusicSource(value: string, useProviderEmbeds = true): MusicSource {
  const candidate = value.trim();
  if (!candidate) return { kind: "invalid", provider: "Unsupported source", message: "No music source was configured." };
  if (validAudioDataUrl(candidate)) return { kind: "audio", provider: "Direct audio", url: candidate };

  const spotifyUri = spotifyEmbed(candidate);
  if (spotifyUri) return useProviderEmbeds ? spotifyUri : { kind: "invalid", provider: "Unsupported source", message: "Provider embeds are disabled in Music Studio settings." };
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { kind: "invalid", provider: "Unsupported source", message: "Use a direct HTTPS audio URL or a supported provider share link." };
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return { kind: "invalid", provider: "Unsupported source", message: "Music sources must use HTTPS and must not contain embedded credentials." };
  }

  const embed = youtubeEmbed(url) || spotifyEmbed(candidate, url) || soundCloudEmbed(url) || mixcloudEmbed(url) || appleMusicEmbed(url) || deezerEmbed(url) || tidalEmbed(url);
  if (embed) return useProviderEmbeds ? embed : { kind: "invalid", provider: "Unsupported source", message: "Provider embeds are disabled in Music Studio settings." };
  if (likelyDirectAudioUrl(url)) return { kind: "audio", provider: "Direct audio", url: candidate };
  return { kind: "invalid", provider: "Unsupported source", message: "That HTTPS link looks like a web page, not an audio stream. Use a direct audio file or stream URL, or a supported YouTube, Spotify, SoundCloud, Apple Music, Mixcloud, Deezer, or TIDAL link." };
}

export function isSupportedMusicSource(value: string) {
  return resolveMusicSource(value).kind !== "invalid";
}

export function parseMusicSetting(value: string): { tracks: MusicTrack[]; genre: string; options: MusicOptions; isPlaylist: boolean; autoSearch: boolean } {
  const empty = { tracks: [] as MusicTrack[], genre: "Mixed", options: DEFAULT_MUSIC_OPTIONS, isPlaylist: false, autoSearch: false };
  const candidate = value.trim();
  if (!candidate) return empty;
  try {
    const parsed = JSON.parse(candidate) as { kind?: unknown; genre?: unknown; tracks?: unknown; options?: unknown };
    if (parsed?.kind === "mukuyu-auto-music") {
      return {
        ...empty,
        genre: typeof parsed.genre === "string" && parsed.genre.trim() ? parsed.genre.trim().slice(0, 80) : "Mixed",
        options: normalizeMusicOptions(parsed.options),
        autoSearch: true,
      };
    }
    if (parsed?.kind === "mukuyu-playlist" && Array.isArray(parsed.tracks)) {
      const tracks = parsed.tracks.flatMap((raw): MusicTrack[] => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as Record<string, unknown>;
        const title = typeof item.title === "string" ? item.title.trim().slice(0, 160) : "";
        const url = typeof item.url === "string" ? item.url.trim() : "";
        const fallbackUrl = typeof item.fallbackUrl === "string" ? item.fallbackUrl.trim() : "";
        if (!title || !isSupportedMusicSource(url)) return [];
        return [{
          title,
          genre: typeof item.genre === "string" && item.genre.trim() ? item.genre.trim().slice(0, 80) : "Mixed",
          url,
          ...(fallbackUrl && isSupportedMusicSource(fallbackUrl) ? { fallbackUrl } : {}),
          ...normalizeMusicAttribution(item),
        }];
      }).slice(0, 30);
      return {
        tracks,
        genre: typeof parsed.genre === "string" && parsed.genre.trim() ? parsed.genre.trim().slice(0, 80) : "Mixed",
        options: normalizeMusicOptions(parsed.options),
        isPlaylist: true,
        autoSearch: false,
      };
    }
  } catch {
    // Older versions stored a single direct source or data URL as plain text.
  }
  if (!isSupportedMusicSource(candidate)) return empty;
  return { ...empty, tracks: [{ title: "Selected audio", genre: "Mixed", url: candidate }] };
}

export function parsePlaylistText(text: string, defaultGenre: string): MusicTrack[] {
  return text.split(/\r?\n/).flatMap((line): MusicTrack[] => {
    const [rawTitle, rawGenre, rawUrl, rawFallback, rawCredit, rawSourcePageUrl, rawLicenseName, rawLicenseUrl] = line.split("|").map((part) => part.trim());
    const title = rawTitle?.slice(0, 160) || "";
    const url = rawUrl || "";
    const fallbackUrl = rawFallback || "";
    if (!title || !isSupportedMusicSource(url)) return [];
    return [{
      title,
      genre: (rawGenre || defaultGenre || "Mixed").slice(0, 80),
      url,
      ...(fallbackUrl && isSupportedMusicSource(fallbackUrl) ? { fallbackUrl } : {}),
      ...normalizeMusicAttribution({ credit: rawCredit, sourcePageUrl: rawSourcePageUrl, licenseName: rawLicenseName, licenseUrl: rawLicenseUrl }),
    }];
  }).slice(0, 30);
}

export function formatPlaylistText(tracks: MusicTrack[]) {
  return tracks.map((track) => {
    const attribution = normalizeMusicAttribution(track);
    const hasAttribution = Object.keys(attribution).length > 0;
    const columns = [track.title, track.genre || "Mixed", track.url];
    if (track.fallbackUrl || hasAttribution) columns.push(track.fallbackUrl || "");
    if (hasAttribution) columns.push(attribution.credit || "", attribution.sourcePageUrl || "", attribution.licenseName || "", attribution.licenseUrl || "");
    return columns.join(" | ");
  }).join("\n");
}
