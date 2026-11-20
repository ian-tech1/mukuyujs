export type RadioStation = {
  stationuuid: string;
  name: string;
  streamUrl: string;
  country: string;
  tags: string;
  codec: string;
  bitrate: number;
  favicon: string;
  homepage: string;
  apiBase: string;
};

type RadioBrowserEntry = {
  stationuuid?: unknown;
  name?: unknown;
  url_resolved?: unknown;
  country?: unknown;
  tags?: unknown;
  codec?: unknown;
  bitrate?: unknown;
  favicon?: unknown;
  homepage?: unknown;
  lastcheckok?: unknown;
  hls?: unknown;
};

const SERVER_DISCOVERY = "https://all.api.radio-browser.info/json/servers";
const FALLBACK_HOSTS = ["de1.api.radio-browser.info", "de2.api.radio-browser.info", "fi1.api.radio-browser.info"];
const RADIO_HOST = /^[a-z0-9-]+\.api\.radio-browser\.info$/i;

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function radioApiBasesFromPayload(payload: unknown): string[] {
  const rows = Array.isArray(payload) ? payload : [];
  const discovered = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const name = (row as { name?: unknown }).name;
    if (typeof name !== "string" || !RADIO_HOST.test(name)) return [];
    return [`https://${name.toLowerCase()}`];
  });
  const fallbacks = FALLBACK_HOSTS.map((host) => `https://${host}`);
  return [...new Set([...discovered, ...fallbacks])];
}

export function normalizeRadioStations(payload: unknown, apiBase: string): RadioStation[] {
  if (!Array.isArray(payload)) return [];
  const output: RadioStation[] = [];
  const seen = new Set<string>();
  for (const raw of payload as RadioBrowserEntry[]) {
    const stationuuid = typeof raw.stationuuid === "string" ? raw.stationuuid : "";
    const streamUrl = safeHttpsUrl(raw.url_resolved);
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!stationuuid || !name || !streamUrl || raw.lastcheckok === 0 || raw.hls === 1 || seen.has(stationuuid)) continue;
    seen.add(stationuuid);
    output.push({
      stationuuid,
      name: name.slice(0, 160),
      streamUrl,
      country: typeof raw.country === "string" ? raw.country.trim().slice(0, 80) : "",
      tags: typeof raw.tags === "string" ? raw.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 6).join(", ") : "",
      codec: typeof raw.codec === "string" ? raw.codec.toUpperCase().slice(0, 20) : "",
      bitrate: typeof raw.bitrate === "number" && Number.isFinite(raw.bitrate) ? raw.bitrate : 0,
      favicon: safeHttpsUrl(raw.favicon),
      homepage: safeHttpsUrl(raw.homepage),
      apiBase,
    });
  }
  return output;
}

export function radioSearchUrl(apiBase: string, query: string, countryCode: string) {
  const url = new URL("/json/stations/search", apiBase);
  const term = query.trim().slice(0, 80);
  if (term) url.searchParams.set("name", term);
  if (countryCode !== "all") url.searchParams.set("countrycode", countryCode.toUpperCase());
  url.searchParams.set("is_https", "true");
  url.searchParams.set("hidebroken", "true");
  url.searchParams.set("order", "clickcount");
  url.searchParams.set("reverse", "true");
  url.searchParams.set("limit", "30");
  return url.toString();
}

async function requestJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Radio directory returned ${response.status}.`);
  return response.json() as Promise<unknown>;
}

export async function searchRadioStations(query: string, countryCode = "KE", signal?: AbortSignal): Promise<RadioStation[]> {
  const timeoutSignal = (milliseconds: number) => signal || AbortSignal.timeout(milliseconds);
  let bases: string[] = [];
  try {
    bases = radioApiBasesFromPayload(await requestJson(SERVER_DISCOVERY, timeoutSignal(2500)));
  } catch {
    bases = FALLBACK_HOSTS.map((host) => `https://${host}`);
  }
  let lastError: unknown = null;
  for (const base of bases) {
    try {
      const stations = normalizeRadioStations(await requestJson(radioSearchUrl(base, query, countryCode), timeoutSignal(3500)), base);
      if (stations.length) return stations;
      lastError = new Error("No currently reachable HTTPS stations matched those filters.");
    } catch (error) {
      lastError = error;
      if (signal?.aborted) break;
    }
  }
  if (signal?.aborted) throw new Error("Radio search was cancelled. Please try again.");
  if (lastError instanceof Error) throw new Error(`Could not load radio stations. ${lastError.message}`);
  return [];
}

export function countRadioStationClick(station: RadioStation) {
  const url = `${station.apiBase}/json/url/${encodeURIComponent(station.stationuuid)}`;
  return fetch(url, { mode: "cors", cache: "no-store" }).catch(() => undefined);
}
