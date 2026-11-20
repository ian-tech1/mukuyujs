import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Music2 } from "lucide-react";
import { normalizeMusicOptions, parseMusicSetting, playbackEndAction, resolveMusicSource, type MusicOptions, type MusicTrack } from "@/lib/school/music";
import { countRadioStationClick, searchRadioStations, type RadioStation } from "@/lib/school/radio";
import { searchAutomaticMusic } from "@/lib/school/api";
import type { MusicCatalogResult } from "@/lib/school/music-catalogs/types";

function playlistKey(tracks: MusicTrack[]) {
  const value = tracks.map((track) => track.url).join("\u001f");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function StaffMusicDock({ url, options: rawOptions }: { url: string; options?: Partial<MusicOptions> }) {
  const saved = parseMusicSetting(url);
  const options = normalizeMusicOptions({ ...saved.options, ...rawOptions });
  const [autoTracks, setAutoTracks] = useState<MusicTrack[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState("");
  const tracks = saved.autoSearch ? autoTracks : saved.tracks;
  const [expanded, setExpanded] = useState(options.showQueue);
  const [dockMinimized, setDockMinimized] = useState(true);
  const [dockPosition, setDockPosition] = useState<"top" | "bottom">(options.playerPosition);
  const [error, setError] = useState(false);
  const [shuffle, setShuffle] = useState(options.shuffle);
  const [repeatMode, setRepeatMode] = useState<MusicOptions["repeatMode"]>(options.repeatMode);
  const [volume, setVolume] = useState(options.defaultVolume);
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [radioOpen, setRadioOpen] = useState(false);
  const [radioMode, setRadioMode] = useState(false);
  const [radioStation, setRadioStation] = useState<RadioStation | null>(null);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [radioQuery, setRadioQuery] = useState("");
  const [radioCountry, setRadioCountry] = useState("KE");
  const [radioBusy, setRadioBusy] = useState(false);
  const [radioError, setRadioError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [radioStartRequested, setRadioStartRequested] = useState(false);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const countedStations = useRef(new Set<string>());
  const wasPlaying = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const autoPlayKey = useRef("");
  const currentIndex = tracks.length ? Math.min(index, tracks.length - 1) : 0;
  const current = tracks[currentIndex];
  const activeUrl = current ? (sourceAttempt === 1 && current.fallbackUrl ? current.fallbackUrl : current.url) : "";
  const source = activeUrl ? resolveMusicSource(activeUrl, options.useProviderEmbeds) : null;
  const key = playlistKey(tracks);
  const retryLimit = options.retryOnError ? options.maxRetries : 0;

  useEffect(() => {
    if (!saved.autoSearch) {
      setAutoTracks([]);
      setAutoError("");
      autoPlayKey.current = "";
      return;
    }
    let cancelled = false;
    setAutoLoading(true);
    setAutoError("");
    searchAutomaticMusic({ data: { genre: saved.genre } }).then((results: MusicCatalogResult[]) => {
      if (cancelled) return;
      setAutoTracks(results.map((track) => ({ title: `${track.title}${track.artist ? ` — ${track.artist}` : ""}`, genre: saved.genre, url: track.playbackUrl, credit: track.credit, sourcePageUrl: track.sourcePageUrl, licenseName: track.licenseName, licenseUrl: track.licenseUrl })));
      if (!results.length) setAutoError("No playable public audio was found for this genre. Try Mixed or another genre.");
    }).catch((reason) => {
      if (!cancelled) setAutoError(reason instanceof Error ? reason.message : "Automatic music search could not be completed.");
    }).finally(() => { if (!cancelled) setAutoLoading(false); });
    return () => { cancelled = true; };
  }, [saved.autoSearch, saved.genre]);

  useEffect(() => {
    if (!saved.autoSearch || radioMode || !current || source?.kind !== "audio" || !audioElement.current) return;
    const playKey = `${saved.genre}|${current.url}`;
    if (autoPlayKey.current === playKey) return;
    autoPlayKey.current = playKey;
    const player = audioElement.current;
    void player.play().then(() => {
      setIsPlaying(true);
      setError(false);
    }).catch(() => {
      setError(false);
      setAutoError("Music is ready. Tap Play once to allow automatic playback in this browser.");
    });
  }, [saved.autoSearch, saved.genre, radioMode, current, source?.kind]);

  useEffect(() => {
    setExpanded(options.showQueue);
  }, [options.showQueue]);

  useEffect(() => {
    try {
      const minimized = window.localStorage.getItem("mukuyu-music-dock-minimized-v1");
      const position = window.localStorage.getItem("mukuyu-music-dock-position-v1");
      if (minimized !== null) setDockMinimized(minimized === "true");
      if (position === "top" || position === "bottom") setDockPosition(position);
    } catch {
      // The player remains usable when browser storage is disabled.
    }
  }, []);

  useEffect(() => {
    function minimizeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !dockMinimized) setDockMinimized(true);
    }
    window.addEventListener("keydown", minimizeOnEscape);
    return () => window.removeEventListener("keydown", minimizeOnEscape);
  }, [dockMinimized]);

  useEffect(() => {
    setShuffle(options.shuffle);
    setRepeatMode(options.repeatMode);
  }, [options.shuffle, options.repeatMode]);

  useEffect(() => {
    setIndex(0);
    setError(false);
    setRetry(0);
    setSourceAttempt(0);
    wasPlaying.current = false;
    if (!options.rememberTrack || typeof window === "undefined") return;
    try {
      const storedKey = `mukuyu-music-track-v2-${key}`;
      const previous = Number(window.localStorage.getItem(storedKey) || 0);
      if (Number.isInteger(previous) && previous >= 0 && previous < tracks.length) setIndex(previous);
    } catch {
      // Browser storage can be disabled by privacy settings.
    }
  }, [key, options.rememberTrack, tracks.length]);

  useEffect(() => {
    if (!options.rememberTrack || typeof window === "undefined" || !tracks.length) return;
    try { window.localStorage.setItem(`mukuyu-music-track-v2-${key}`, String(currentIndex)); } catch { /* Ignore storage restrictions. */ }
  }, [currentIndex, key, options.rememberTrack, tracks.length]);

  useEffect(() => {
    if (!options.rememberVolume || typeof window === "undefined") {
      setVolume(options.defaultVolume);
      return;
    }
    try {
      const stored = window.localStorage.getItem("mukuyu-music-volume");
      setVolume(stored === null ? options.defaultVolume : Math.max(0, Math.min(1, Number(stored))));
    } catch {
      setVolume(options.defaultVolume);
    }
  }, [options.defaultVolume, options.rememberVolume]);

  useEffect(() => {
    if (!options.rememberVolume || typeof window === "undefined") return;
    try { window.localStorage.setItem("mukuyu-music-volume", String(volume)); } catch { /* Ignore storage restrictions. */ }
  }, [options.rememberVolume, volume]);

  useLayoutEffect(() => {
    if (!radioStartRequested || !radioMode || !radioStation || !audioElement.current) return;
    const player = audioElement.current;
    void player.play().then(() => {
      setRadioStartRequested(false);
    }).catch(() => {
      setRadioStartRequested(false);
      setRadioError("The browser could not start this station automatically. Tap Play on the audio control below.");
    });
  }, [radioMode, radioStartRequested, radioStation]);

  useEffect(() => {
    if (!audioElement.current) return;
    audioElement.current.volume = volume;
    audioElement.current.playbackRate = options.playbackRate;
  }, [volume, options.playbackRate, currentIndex, retry, sourceAttempt]);

  useEffect(() => {
    if (wasPlaying.current && audioElement.current && source?.kind === "audio") audioElement.current.play().catch(() => undefined);
  }, [currentIndex, retry, sourceAttempt, source?.kind]);

  useEffect(() => () => {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
  }, []);

  function clearRetryTimer() {
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setRetryPending(false);
  }

  function move(direction: number, resumePlayback = false) {
    clearRetryTimer();
    setError(false);
    setIsPlaying(false);
    setRetry(0);
    setSourceAttempt(0);
    wasPlaying.current = resumePlayback || Boolean(audioElement.current && !audioElement.current.paused);
    setIndex((old) => {
      if (shuffle && tracks.length > 1) {
        let next = old;
        while (next === old) next = Math.floor(Math.random() * tracks.length);
        return next;
      }
      return (old + direction + tracks.length) % tracks.length;
    });
  }

  function handleAudioError() {
    if (!current || !source || source.kind !== "audio") return;
    setIsPlaying(false);
    if (retryPending) return;
    if (retry < retryLimit) {
      setRetryPending(true);
      retryTimer.current = window.setTimeout(() => {
        setRetry((attempt) => attempt + 1);
        setRetryPending(false);
        retryTimer.current = null;
      }, options.retryDelayMs);
      return;
    }
    if (sourceAttempt === 0 && current.fallbackUrl) {
      setSourceAttempt(1);
      setRetry(0);
      setError(false);
      return;
    }
    setError(true);
    wasPlaying.current = false;
  }

  const top = dockPosition === "top";
  const compact = options.compact;
  const hasMultipleTracks = tracks.length > 1;

  function setMinimized(value: boolean) {
    setDockMinimized(value);
    try { window.localStorage.setItem("mukuyu-music-dock-minimized-v1", String(value)); } catch { /* Optional per-device preference. */ }
  }

  function toggleDockPosition() {
    const position = dockPosition === "top" ? "bottom" : "top";
    setDockPosition(position);
    try { window.localStorage.setItem("mukuyu-music-dock-position-v1", position); } catch { /* Optional per-device preference. */ }
  }

  async function loadRadioStations() {
    setRadioBusy(true);
    setRadioError("");
    try {
      const stations = await searchRadioStations(radioQuery, radioCountry);
      setRadioStations(stations);
      if (!stations.length) setRadioError("No reachable HTTPS stations matched. Try another country or name.");
    } catch (loadError) {
      setRadioError(loadError instanceof Error ? loadError.message : "The live radio directory is temporarily unavailable.");
      setRadioStations([]);
    } finally {
      setRadioBusy(false);
    }
  }

  function chooseRadio(station: RadioStation) {
    clearRetryTimer();
    setRadioStation(station);
    setRadioMode(true);
    setRadioStartRequested(true);
    setIsPlaying(false);
    setError(false);
    setRadioError("");
    setRetry(0);
  }

  async function toggleNativePlayback() {
    const player = audioElement.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    setError(false);
    setRadioError("");
    try {
      await player.play();
    } catch {
      setIsPlaying(false);
      if (radioMode) setRadioError("Playback was blocked or this stream is unavailable. Use the audio control or choose another station.");
      else { setError(true); wasPlaying.current = false; }
    }
  }

  return <aside className={dockMinimized
    ? `music-dock-mini-anchor fixed right-4 z-40 ${top ? "top-16" : "bottom-4"}`
    : `music-dock-panel fixed right-3 z-40 ${top ? "top-16" : "bottom-3"} w-[min(28rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-line bg-card/95 shadow-2xl backdrop-blur-xl`}
    aria-label="Portal music and live radio player">
    {dockMinimized ? <button
      type="button"
      className="music-dock-mini-button inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-3 py-2 text-xs font-semibold text-navy shadow-xl backdrop-blur-xl"
      aria-label="Open the Mukuyu music player"
      aria-expanded={false}
      title="Open music and live radio"
      onClick={() => setMinimized(false)}
    >
      <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-navy via-indigo-700 to-fuchsia-600 text-white" aria-hidden="true"><Music2 size={15} /></span>
      <span>Music</span>
      {isPlaying ? <span className="music-playing-pulse size-2 rounded-full bg-good" aria-label="Music is playing" /> : null}
      <ChevronUp size={15} aria-hidden="true" />
    </button> : null}
    <div className={dockMinimized ? "music-dock-kept-alive" : "music-dock-open-content"} aria-hidden={dockMinimized || undefined}>
      {!dockMinimized ? <div className="flex items-start justify-between gap-3 border-b border-line px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy via-indigo-700 to-fuchsia-600 text-white shadow" aria-hidden="true"><Music2 size={18} /></span>
          <div className="min-w-0"><p className="text-sm font-bold text-navy">Mukuyu Music & Radio</p><p className="truncate text-[11px] text-muted">{radioMode && radioStation ? `${radioStation.name} · ${radioStation.country || "Live radio"}` : current ? `${current.title} · ${current.genre || saved.genre}` : "Choose a live station or add music in Settings."}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="rounded-full border border-line px-2.5 py-2 text-[11px] font-semibold text-navy" aria-label={`Move music player to the ${top ? "bottom" : "top"} right`} title={`Move to ${top ? "bottom" : "top"} right`} onClick={toggleDockPosition}>{top ? "Bottom-right" : "Top-right"}</button>
          <button type="button" className="grid size-9 place-items-center rounded-full border border-line text-navy" aria-label="Minimize music player" title="Minimize music player; audio keeps playing" onClick={() => setMinimized(true)}><ChevronDown size={17} aria-hidden="true" /></button>
        </div>
      </div> : null}
      <div className={`flex flex-wrap items-center ${compact ? "gap-2 px-2 py-2" : "gap-3 px-3 py-3"}`}>
        <div className="min-w-0 flex-1 basis-full">
          {radioMode && radioStation ? <div><audio key={`radio-${radioStation.stationuuid}`} ref={(element) => { audioElement.current = element; if (element) element.volume = volume; }} className="h-9 w-full" controls preload="none" aria-label={`Live radio: ${radioStation.name}`} src={radioStation.streamUrl}
            onPlay={() => { setIsPlaying(true); setRadioError(""); if (!countedStations.current.has(radioStation.stationuuid)) { countedStations.current.add(radioStation.stationuuid); void countRadioStationClick(radioStation); } }}
            onPause={() => setIsPlaying(false)}
            onError={() => { setIsPlaying(false); setRadioError("This radio stream could not play in this browser. Choose another station; availability and codecs vary by station."); }}
            onCanPlay={() => setRadioError("")} />{radioError ? <p role="status" className="mt-1 text-xs text-bad">{radioError}</p> : null}</div> : null}
          {!radioMode && source?.kind === "audio" && current ? <audio key={`${activeUrl}-${retry}`} ref={(element) => { audioElement.current = element; if (element) { element.volume = volume; element.playbackRate = options.playbackRate; } }} className="h-9 w-full" controls preload={options.preload} loop={repeatMode === "one" || (repeatMode === "all" && options.autoNext && tracks.length === 1)} aria-label="Mukuyu music playback" src={source.url}
            onError={handleAudioError}
            onCanPlay={() => { setError(false); setRetryPending(false); if (retryTimer.current !== null) window.clearTimeout(retryTimer.current); retryTimer.current = null; }}
            onPlay={() => { wasPlaying.current = true; setIsPlaying(true); }}
            onPause={() => { wasPlaying.current = false; setIsPlaying(false); }}
            onEnded={() => {
              const action = playbackEndAction({ autoNext: options.autoNext, repeatMode, currentIndex, trackCount: tracks.length });
              if (action === "advance") move(1, true);
              else if (action === "repeat" && audioElement.current) { audioElement.current.currentTime = 0; audioElement.current.play().catch(() => undefined); }
              else wasPlaying.current = false;
            }}>
            <span>Your browser does not support audio playback.</span>
          </audio> : null}
          {(radioMode && radioStation || !radioMode && source?.kind === "audio" && current) ? <button type="button" className="mt-2 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white" onClick={() => { void toggleNativePlayback(); }} aria-pressed={isPlaying}>{isPlaying ? "Pause" : "Play"}</button> : null}
          {!radioMode && current && source?.kind === "embed" ? <div className="w-full min-w-0 rounded-lg bg-white p-1"><p className="px-2 pb-1 text-[10px] font-semibold text-muted">{source.provider} in-page player</p><iframe className="w-full rounded-md" style={{ height: `${Math.max(200, source.height)}px` }} src={source.url} title={`${source.provider}: ${current.title}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share" allowFullScreen /></div> : null}
          {!radioMode && source?.kind === "embed" ? <p className="mt-1 text-[11px] text-muted">Tap Play inside the official {source.provider} player. Its cross-origin playback controls are managed by the provider. If the provider says this item is unavailable, open the source link below or skip to another track.</p> : null}
          {!radioMode && current?.sourcePageUrl ? <p className="mt-1 text-[11px] text-muted">Credit: <a className="font-semibold underline" href={current.sourcePageUrl} target="_blank" rel="noreferrer">{current.credit || "Open source page"}</a>{current.licenseName ? <> · License: {current.licenseUrl ? <a className="underline" href={current.licenseUrl} target="_blank" rel="noreferrer">{current.licenseName}</a> : current.licenseName}</> : null}</p> : null}
          {!radioMode && source?.kind === "invalid" ? <p className="text-xs text-bad">{source.message}</p> : null}
          {!radioMode && current?.fallbackUrl ? <button className="mt-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold" type="button" onClick={() => { clearRetryTimer(); setError(false); setRetry(0); setSourceAttempt(sourceAttempt === 0 ? 1 : 0); }}>{sourceAttempt === 0 ? "Try backup source" : "Return to primary source"}</button> : null}
          {error ? <div role="status" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-bad"><span>This source could not play. Check the direct stream URL, browser codec support, or provider availability. The player stayed in the portal.</span>{hasMultipleTracks ? <button type="button" className="rounded-full border border-bad/30 px-3 py-1.5 font-semibold" onClick={() => move(1)}>Skip unavailable track</button> : null}</div> : null}
          {retryPending ? <p role="status" className="mt-1 text-xs text-muted">Retrying this source…</p> : null}
          {saved.autoSearch && autoLoading ? <p role="status" className="mt-1 text-xs text-muted">Loading public {saved.genre === "Mixed" ? "music" : saved.genre.toLowerCase()} from the online library…</p> : null}
          {saved.autoSearch && autoError ? <p role="status" className="mt-1 text-xs text-bad">{autoError}</p> : null}
        </div>
        {hasMultipleTracks && !radioMode ? <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold" onClick={() => move(-1)} aria-label="Previous song">⏮</button>
          <button type="button" className={`rounded-full border px-3 py-2 text-xs font-semibold ${shuffle ? "border-navy bg-navy text-white" : "border-line"}`} onClick={() => setShuffle(!shuffle)} aria-pressed={shuffle}>Shuffle</button>
          <button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold" onClick={() => setRepeatMode((mode) => mode === "all" ? "one" : mode === "one" ? "off" : "all")}>Repeat: {repeatMode}</button>
          <button type="button" className="rounded-full border border-line px-3 py-2 text-xs font-semibold" onClick={() => move(1)} aria-label="Next song">⏭</button>
        </div> : null}
        <label className="flex items-center gap-2 text-xs text-muted" title={source?.kind === "embed" ? "Use the embedded provider player's own volume control." : undefined}><span>Vol</span><input aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={volume} disabled={source?.kind === "embed"} onChange={(event) => setVolume(Number(event.target.value))} /></label>
        {radioMode && current ? <button className="rounded-full border border-line px-3 py-2 text-xs font-semibold" type="button" onClick={() => { setRadioMode(false); setRadioError(""); }}>Return to music</button> : null}
        <button className={`rounded-full border px-3 py-2 text-xs font-semibold ${radioOpen ? "border-navy bg-navy text-white" : "border-line"}`} type="button" onClick={() => { const opening = !radioOpen; setRadioOpen(opening); if (opening && !radioStations.length) void loadRadioStations(); }}>{radioOpen ? "Close live radio" : "Live radio"}</button>
        {tracks.length ? <button className="rounded-full border border-line px-3 py-2 text-xs font-semibold" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Hide queue" : "Playlist"}</button> : null}
      </div>
      {radioOpen ? <div className="px-3 pb-3"><section className="rounded-xl border border-line bg-card p-3" aria-label="Live radio station finder"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-navy">Live radio stations</h2><p className="text-xs text-muted">Browse the free Radio Browser directory. No API key required; only checked HTTPS streams are shown.</p></div>{radioMode && radioStation ? <span className="text-xs font-semibold text-good">Selected: {radioStation.name}</span> : null}</div><form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void loadRadioStations(); }}><input className="min-w-40 flex-1 rounded-lg border border-line px-3 py-2 text-sm" aria-label="Search radio stations" value={radioQuery} onChange={(event) => setRadioQuery(event.target.value)} placeholder="Search station name"/><select className="rounded-lg border border-line px-3 py-2 text-sm" aria-label="Radio country" value={radioCountry} onChange={(event) => setRadioCountry(event.target.value)}><option value="KE">Kenya</option><option value="NG">Nigeria</option><option value="ZA">South Africa</option><option value="UG">Uganda</option><option value="TZ">Tanzania</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="all">Worldwide</option></select><button className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white" type="submit" disabled={radioBusy}>{radioBusy ? "Searching…" : "Find stations"}</button></form>{radioError && !radioStation ? <p role="status" className="mt-2 text-sm text-bad">{radioError}</p> : null}<ul className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{radioStations.map((station) => <li key={station.stationuuid} className="flex min-w-0 items-center gap-3 rounded-lg border border-line p-2">{station.favicon ? <img className="size-8 shrink-0 rounded object-contain" src={station.favicon} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : <span className="grid size-8 shrink-0 place-items-center rounded bg-navy/5 text-navy" aria-hidden="true">♫</span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{station.name}</span><span className="block truncate text-xs text-muted">{[station.country, station.codec, station.bitrate ? `${station.bitrate} kbps` : "", station.tags].filter(Boolean).join(" · ")}</span></span><button className="rounded-full border border-line px-3 py-2 text-xs font-semibold" type="button" onClick={() => chooseRadio(station)}>{radioMode && radioStation?.stationuuid === station.stationuuid ? "Playing" : "Play"}</button></li>)}</ul>{!radioStations.length && !radioBusy && !radioError ? <p className="mt-2 text-sm text-muted">Search stations in Kenya or choose Worldwide.</p> : null}<p className="mt-2 text-xs text-muted">Press Play on a station to start. Browser autoplay rules require a user action; streams can still be unavailable or unsupported by a device.</p></section></div> : null}
      {expanded ? <div className="px-3 pb-3"><div className="rounded-xl border border-line bg-card p-3"><p className="mb-2 text-sm font-semibold text-navy">Music queue</p>{tracks.length ? (hasMultipleTracks ? <ol className="grid gap-1 sm:grid-cols-2">{tracks.map((track, trackIndex) => <li key={`${track.url}-${trackIndex}`}><button type="button" className={`w-full rounded-lg px-3 py-2 text-left text-sm ${trackIndex === currentIndex ? "bg-navy/10 font-semibold text-navy" : "hover:bg-muted/10"}`} onClick={() => { clearRetryTimer(); setRadioMode(false); wasPlaying.current = Boolean(audioElement.current && !audioElement.current.paused); setIndex(trackIndex); setSourceAttempt(0); setRetry(0); setError(false); }}><span className="mr-2 text-xs text-muted">{trackIndex + 1}.</span>{track.title}<span className="ml-2 text-xs text-muted">{track.genre || saved.genre}</span></button></li>)}</ol> : <p className="text-sm text-muted">{tracks[0]?.title}</p>) : <p className="text-sm text-muted">{saved.autoSearch ? "The portal is searching for public audio…" : "No playlist has been configured. Add licensed audio or provider links in Settings → Music Studio."}</p>}<p className="mt-2 text-xs text-muted">Press Play to start. Browsers may block automatic playback. Embedded providers use their own controls and may not expose end-of-track events to the portal.</p></div></div> : null}
    </div>
  </aside>;
}
