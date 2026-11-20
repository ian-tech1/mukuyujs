import { useState } from "react";
import { btnGhost, inputClass } from "@/components/school/gate";
import { formatPlaylistText, KENYA_DAILY_CHART_TRACK, KENYA_TRENDING_TRACKS, normalizeMusicOptions, parseMusicSetting, parsePlaylistText, resolveMusicSource, type MusicOptions, type MusicTrack } from "@/lib/school/music";
import { searchMusicCatalog, searchSpotifyCatalog } from "@/lib/school/api";
import type { MusicCatalogProvider, MusicCatalogResult } from "@/lib/school/music-catalogs/types";
import type { SpotifyCatalogTrack } from "@/lib/school/spotify";

export function MusicStudioCard({
  musicEnabled,
  musicUrl,
  automaticMusic,
  setAutomaticMusic,
  onFormChange,
  playlistText,
  setPlaylistText,
  musicGenre,
  setMusicGenre,
  musicOptions,
  setMusicOptions,
  flash,
}: {
  musicEnabled: boolean;
  musicUrl: string;
  automaticMusic: boolean;
  setAutomaticMusic: (value: boolean) => void;
  onFormChange: (patch: { musicEnabled?: boolean; musicUrl?: string }) => void;
  playlistText: string;
  setPlaylistText: (value: string) => void;
  musicGenre: string;
  setMusicGenre: (value: string) => void;
  musicOptions: MusicOptions;
  setMusicOptions: (value: MusicOptions | ((current: MusicOptions) => MusicOptions)) => void;
  flash: (message: string, bad?: boolean) => void;
}) {
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyCatalogTrack[]>([]);
  const [spotifySearching, setSpotifySearching] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");
  const [catalogProvider, setCatalogProvider] = useState<MusicCatalogProvider>("Internet Archive");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<MusicCatalogResult[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const parsedTracks = parsePlaylistText(playlistText, musicGenre);
  const nonEmptyLineCount = playlistText.split(/\r?\n/).filter((line) => line.trim()).length;
  const saved = parseMusicSetting(musicUrl);
  const previewTrack: MusicTrack | null = parsedTracks[0] || saved.tracks[0] || null;
  const previewUrl = previewTrack?.url || "";
  const previewSource = previewUrl ? resolveMusicSource(previewUrl, musicOptions.useProviderEmbeds) : null;
  const updateOption = <K extends keyof MusicOptions>(key: K, value: MusicOptions[K]) => {
    setMusicOptions((current) => ({ ...current, [key]: value }));
  };

  function appendRecommendedTracks(candidates: MusicTrack[]) {
    const present = new Set(parsedTracks.map((track) => track.url));
    const additions = candidates.filter((track) => !present.has(track.url));
    if (!additions.length) {
      flash("Those chart selections are already in the playlist.", true);
      return;
    }
    const capacity = Math.max(0, 30 - nonEmptyLineCount);
    if (!capacity) {
      flash("The playlist supports up to 30 tracks. Remove a track before adding chart selections.", true);
      return;
    }
    const selected = additions.slice(0, capacity);
    const existing = playlistText.split(/\r?\n/).filter((line) => line.trim());
    setPlaylistText([...existing, ...selected.map((track) => formatPlaylistText([track]))].join("\n"));
    setAutomaticMusic(false);
    onFormChange({ musicUrl: "" });
    setPreviewLoaded(false);
    flash(`Added ${selected.length} Kenya chart selection${selected.length === 1 ? "" : "s"}. Save the welcome-page settings to publish them.`);
  }

  async function searchSpotify() {
    const query = spotifyQuery.trim();
    if (query.length < 2) {
      setSpotifyError("Enter at least two characters to search Spotify.");
      return;
    }
    setSpotifySearching(true);
    setSpotifyError("");
    try {
      const results = await searchSpotifyCatalog({ data: { query } });
      setSpotifyResults(results);
      if (!results.length) setSpotifyError("No matching Spotify tracks were found in the Kenya catalog.");
    } catch (error) {
      setSpotifyResults([]);
      setSpotifyError(error instanceof Error ? error.message : "Spotify search could not be completed.");
    } finally {
      setSpotifySearching(false);
    }
  }

  async function searchCatalog() {
    const query = catalogQuery.trim();
    if (query.length < 2) {
      setCatalogError("Enter at least two characters to search.");
      return;
    }
    setCatalogSearching(true);
    setCatalogError("");
    try {
      const results = await searchMusicCatalog({ data: { provider: catalogProvider, query } });
      setCatalogResults(results);
      if (!results.length) setCatalogError(`No matching ${catalogProvider} results were found.`);
    } catch (error) {
      setCatalogResults([]);
      setCatalogError(error instanceof Error ? error.message : `${catalogProvider} search could not be completed.`);
    } finally {
      setCatalogSearching(false);
    }
  }

  function addCatalogTrack(track: MusicCatalogResult) {
    if (parsedTracks.some((item) => item.url === track.playbackUrl)) {
      flash("That selection is already in the playlist.", true);
      return;
    }
    if (nonEmptyLineCount >= 30) {
      flash("The playlist supports up to 30 tracks. Remove a track before adding another.", true);
      return;
    }
    const title = `${track.title}${track.artist ? ` — ${track.artist}` : ""}`.replaceAll("|", "—");
    const genre = (track.genre || musicGenre || "Mixed").replaceAll("|", "—");
    const line = track.provider === "Jamendo"
      ? [title, genre, track.playbackUrl, "", track.credit, track.sourcePageUrl, track.licenseName, track.licenseUrl].join(" | ")
      : [title, genre, track.playbackUrl, "", track.credit || track.artist || track.provider, track.sourcePageUrl].join(" | ");
    const existing = playlistText.split(/\r?\n/).filter((item) => item.trim());
    setPlaylistText([...existing, line].join("\n"));
    setAutomaticMusic(false);
    onFormChange({ musicUrl: "" });
    setPreviewLoaded(false);
    flash(track.provider === "Jamendo"
      ? "Jamendo track added with its creator credit, source link, and license. Review the track license, then save the welcome settings."
      : `${track.provider} selection added. Save the welcome-page settings to publish it.`);
  }

  function addSpotifyTrack(track: SpotifyCatalogTrack) {
    if (parsedTracks.some((item) => item.url === track.spotifyUrl)) {
      flash("That Spotify track is already in the playlist.", true);
      return;
    }
    if (nonEmptyLineCount >= 30) {
      flash("The playlist supports up to 30 tracks. Remove a track before adding another.", true);
      return;
    }
    const title = `${track.title}${track.artists ? ` — ${track.artists}` : ""}`.replaceAll("|", "—");
    const line = [title, musicGenre || "Mixed", track.spotifyUrl, "", `Spotify · ${track.artists || "track"}`, track.spotifyUrl].join(" | ");
    const existing = playlistText.split(/\r?\n/).filter((item) => item.trim());
    setPlaylistText([...existing, line].join("\n"));
    setAutomaticMusic(false);
    onFormChange({ musicUrl: "" });
    setPreviewLoaded(false);
    flash("Spotify track added to the playlist. Save the welcome-page settings to publish it.");
  }

  function uploadAudio(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      flash("Choose a browser-recognized audio file.", true);
      return;
    }
    if (file.size > 500_000) {
      flash("Choose an audio file smaller than 500 KB so it can be saved safely with the website settings.", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPlaylistText("");
      setAutomaticMusic(false);
      onFormChange({ musicUrl: String(reader.result || "") });
      setPreviewLoaded(false);
    };
    reader.onerror = () => flash("Could not read that audio file. Please try another file.", true);
    reader.readAsDataURL(file);
  }

  async function importPlaylist(file?: File) {
    if (!file) return;
    if (file.size > 800_000) {
      flash("Playlist JSON must be smaller than 800 KB.", true);
      return;
    }
    try {
      const imported = parseMusicSetting(await file.text());
      if (!imported.isPlaylist || !imported.tracks.length) {
        throw new Error("Choose a Mukuyu music playlist JSON file containing at least one supported track.");
      }
      setPlaylistText(formatPlaylistText(imported.tracks));
      setMusicGenre(imported.genre);
      setMusicOptions(imported.options);
      setAutomaticMusic(false);
      onFormChange({ musicUrl: "" });
      setPreviewLoaded(false);
      flash(`Imported ${imported.tracks.length} playlist track${imported.tracks.length === 1 ? "" : "s"}. Save the welcome design to publish.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not read that playlist JSON file.", true);
    }
  }

  function exportPlaylist() {
    const tracks = parsedTracks.length ? parsedTracks : saved.tracks;
    if (!tracks.length) {
      flash("Add at least one playable track before exporting a playlist.", true);
      return;
    }
    const payload = {
      kind: "mukuyu-playlist",
      version: 1,
      genre: musicGenre || saved.genre,
      tracks,
      options: normalizeMusicOptions(musicOptions),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mukuyu-music-playlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash("Music playlist exported as JSON.");
  }

  function testSource() {
    if (!previewUrl) {
      flash("Add a playable source or playlist track before testing.", true);
      return;
    }
    if (!previewSource || previewSource.kind === "invalid") {
      flash(previewSource?.message || "This source is not supported.", true);
      return;
    }
    setPreviewKey((key) => key + 1);
    setPreviewLoaded(true);
    if (previewSource.kind === "embed") flash(`${previewSource.provider} player loaded inside this page. Press Play in its player to test it.`);
    else flash("Audio preview loaded inside this page. Press Play to test the source.");
  }

  return <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-navy/5 via-card to-brass/10">
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-navy text-2xl text-white shadow" aria-hidden="true">♫</div>
      <div className="min-w-0 flex-1"><h3 className="font-semibold text-navy">Music studio</h3><p className="text-xs text-muted">Keep music playback inside the portal for signed-in users. Use direct audio streams, supported provider players, or automatic keyless discovery.</p></div>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={musicEnabled} onChange={(event) => onFormChange({ musicEnabled: event.target.checked })} /> Enable</label>
    </div>
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Upload audio <span className="font-normal text-muted">(browser-supported audio · up to 500 KB)</span><input className="mt-2 block w-full text-sm" type="file" accept="audio/*" onChange={(event) => { uploadAudio(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        <label className="block text-sm font-medium">Single audio or provider share URL<input className={inputClass + " mt-1"} type="text" inputMode="url" autoCapitalize="off" placeholder="https://… or spotify:track:…" value={musicUrl.startsWith("data:audio/") || musicUrl.startsWith("{") ? "" : musicUrl} onChange={(event) => { setPlaylistText(""); onFormChange({ musicUrl: event.target.value.trim() }); setPreviewLoaded(false); }} /></label>
      </div>
      {musicUrl.startsWith("data:audio/") ? <p className="rounded-lg border border-line bg-card p-3 text-sm text-muted">Uploaded audio is ready. The player uses the browser's native audio support for this format.</p> : null}
      <section className="space-y-3 rounded-xl border border-line bg-card p-3" aria-labelledby="music-playback-title">
        <div><h4 id="music-playback-title" className="font-semibold text-navy">Advanced playback settings</h4><p className="text-xs text-muted">These school-wide preferences are saved with the welcome-page music configuration.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Default volume: {Math.round(musicOptions.defaultVolume * 100)}%<input className="mt-2 w-full" type="range" min="0" max="1" step="0.05" value={musicOptions.defaultVolume} onChange={(event) => updateOption("defaultVolume", Number(event.target.value))} /></label>
          <label className="block text-sm">Playback speed<select className={inputClass + " mt-1"} value={musicOptions.playbackRate} onChange={(event) => updateOption("playbackRate", Number(event.target.value))}><option value="0.75">0.75×</option><option value="1">Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
          <label className="block text-sm">Repeat mode<select className={inputClass + " mt-1"} value={musicOptions.repeatMode} onChange={(event) => updateOption("repeatMode", event.target.value as MusicOptions["repeatMode"])}><option value="all">Repeat playlist</option><option value="one">Repeat current track</option><option value="off">No repeat</option></select></label>
          <label className="block text-sm">Default player position<select className={inputClass + " mt-1"} value={musicOptions.playerPosition} onChange={(event) => updateOption("playerPosition", event.target.value as MusicOptions["playerPosition"])}><option value="bottom">Bottom-right corner</option><option value="top">Top-right corner</option></select></label>
          <label className="block text-sm">Failed-source retries: {musicOptions.maxRetries}<input className="mt-2 w-full" type="range" min="0" max="3" step="1" value={musicOptions.maxRetries} onChange={(event) => updateOption("maxRetries", Number(event.target.value))} /></label>
          <label className="block text-sm">Retry delay: {musicOptions.retryDelayMs} ms<input className="mt-2 w-full" type="range" min="0" max="5000" step="250" value={musicOptions.retryDelayMs} onChange={(event) => updateOption("retryDelayMs", Number(event.target.value))} /></label>
          <label className="block text-sm">Audio preload<select className={inputClass + " mt-1"} value={musicOptions.preload} onChange={(event) => updateOption("preload", event.target.value as MusicOptions["preload"])}><option value="none">None (data saver)</option><option value="metadata">Metadata only</option><option value="auto">Browser default</option></select></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.shuffle} onChange={(event) => updateOption("shuffle", event.target.checked)} /> Shuffle playlist by default</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.rememberTrack} onChange={(event) => updateOption("rememberTrack", event.target.checked)} /> Remember last track on this device</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.autoNext} onChange={(event) => updateOption("autoNext", event.target.checked)} /> Automatically play next track</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.compact} onChange={(event) => updateOption("compact", event.target.checked)} /> Compact player layout</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.showQueue} onChange={(event) => updateOption("showQueue", event.target.checked)} /> Show queue by default</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.retryOnError} onChange={(event) => updateOption("retryOnError", event.target.checked)} /> Retry after a source error</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.useProviderEmbeds} onChange={(event) => updateOption("useProviderEmbeds", event.target.checked)} /> Play recognized provider links in-page</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={musicOptions.rememberVolume} onChange={(event) => updateOption("rememberVolume", event.target.checked)} /> Remember volume on each staff device</label>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border border-line bg-card p-3" aria-labelledby="music-playlist-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 id="music-playlist-title" className="font-semibold text-navy">Playlist library</h4><p className="text-xs text-muted">Mix licensed direct streams and supported provider share links. Up to 30 tracks.</p></div><div className="flex flex-wrap gap-2"><label className={btnGhost + " cursor-pointer"}>Import playlist JSON<input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { void importPlaylist(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className={btnGhost} type="button" onClick={exportPlaylist}>Export playlist JSON</button></div></div>
      <section className="space-y-3 rounded-xl border border-line bg-navy/5 p-3" aria-labelledby="music-catalog-title">
        <section className="space-y-3 rounded-xl border border-brass/40 bg-brass/10 p-3" aria-labelledby="kenya-chart-title">
          <div><h5 id="kenya-chart-title" className="font-semibold text-navy">Kenya trending music</h5><p className="text-xs text-muted">Four current YouTube Kenya chart picks checked against the 2–3 November 2026 charts, plus Apple's daily Top 100. Official providers control playback and any account/region restrictions.</p></div>
          <ul className="grid gap-1 sm:grid-cols-2">{KENYA_TRENDING_TRACKS.map((track) => <li key={track.url} className="rounded-md border border-line bg-card px-2 py-1.5 text-xs"><span className="mr-2 font-bold text-navy">#{track.chartRank}</span>{track.title}</li>)}</ul>
          <div className="flex flex-wrap gap-2"><button className={btnGhost} type="button" disabled={nonEmptyLineCount >= 30} onClick={() => appendRecommendedTracks(KENYA_TRENDING_TRACKS)}>Add Kenya chart picks</button><button className={btnGhost} type="button" disabled={nonEmptyLineCount >= 30 || parsedTracks.some((track) => track.url === KENYA_DAILY_CHART_TRACK.url)} onClick={() => appendRecommendedTracks([KENYA_DAILY_CHART_TRACK])}>Add Apple daily Top 100</button><a className="self-center text-xs font-semibold text-navy underline" href="https://soundcharts.com/en/charts/youtube/kenya" target="_blank" rel="noreferrer">Open weekly chart ↗</a></div>
        </section>
        <div>
            <h5 id="music-catalog-title" className="font-semibold text-navy">Find music to add</h5>
            <p className="text-xs text-muted">Internet Archive search works without API keys. Other providers remain available when their server-side credentials are configured.</p>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void searchCatalog(); }}>
            <label className="text-sm font-medium">Source<select className={inputClass + " mt-1 min-w-36"} value={catalogProvider} onChange={(event) => { setCatalogProvider(event.target.value as MusicCatalogProvider); setCatalogResults([]); setCatalogError(""); }}>
              <option value="Jamendo">Jamendo (licensed tracks)</option>
              <option value="YouTube">YouTube</option>
              <option value="SoundCloud">SoundCloud</option>
              <option value="Internet Archive">Internet Archive (no key)</option>
            </select></label>
            <label className="min-w-48 flex-1 text-sm font-medium">Track or artist<input className={inputClass + " mt-1"} value={catalogQuery} maxLength={100} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search songs or artists" /></label>
            <button className={btnGhost} type="submit" disabled={catalogSearching}>{catalogSearching ? "Searching…" : `Search ${catalogProvider}`}</button>
          </form>
          {catalogError ? <p role="status" className="text-sm text-muted">{catalogError}</p> : null}
          {catalogResults.length ? <ul className="grid gap-2 sm:grid-cols-2">{catalogResults.map((track) => {
            const alreadyAdded = parsedTracks.some((item) => item.url === track.playbackUrl);
            return <li key={`${track.provider}-${track.id}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-card p-2">
              {track.artworkUrl ? <img className="size-12 shrink-0 rounded object-cover" src={track.artworkUrl} alt="" loading="lazy" /> : <span className="grid size-12 shrink-0 place-items-center rounded bg-navy/10 text-xl" aria-hidden="true">♫</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{track.title}</p>
                <p className="truncate text-xs text-muted">{track.artist}{track.genre ? ` · ${track.genre}` : ""} · {track.provider}</p>
                {track.licenseName ? <p className="truncate text-xs text-muted">License: {track.licenseUrl ? <a className="underline" href={track.licenseUrl} target="_blank" rel="noreferrer">{track.licenseName}</a> : track.licenseName}</p> : null}
                {track.sourcePageUrl ? <a className="text-xs font-semibold text-navy underline" href={track.sourcePageUrl} target="_blank" rel="noreferrer">Open source page ↗</a> : null}
              </div>
              <button className={btnGhost} type="button" disabled={alreadyAdded || nonEmptyLineCount >= 30} onClick={() => addCatalogTrack(track)}>{alreadyAdded ? "Added" : "Add"}</button>
            </li>;
          })}</ul> : null}
          <p className="text-xs text-muted">Internet Archive needs no key and returns public audio items with a source page for license review. Keys for the other catalogs stay server-side and are never sent to the browser.</p>
        </section>
        <div className="space-y-3 rounded-xl border border-line bg-navy/5 p-3">
          <div><h5 className="font-semibold text-navy">Search Spotify tracks (optional)</h5><p className="text-xs text-muted">Spotify catalog search is optional and depends on Spotify app/account eligibility. You do not need Spotify Premium to use the Jamendo, YouTube, or SoundCloud options above; Spotify selections still use Spotify’s own embedded player.</p></div>
          <div className="flex flex-wrap gap-2"><label className="min-w-48 flex-1 text-sm font-medium">Track or artist<input className={inputClass + " mt-1"} value={spotifyQuery} maxLength={100} onChange={(event) => setSpotifyQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchSpotify(); } }} placeholder="Search songs or artists" /></label><button className={btnGhost + " self-end"} type="button" disabled={spotifySearching} onClick={() => { void searchSpotify(); }}>{spotifySearching ? "Searching…" : "Search Spotify"}</button></div>
          {spotifyError ? <p role="status" className="text-sm text-muted">{spotifyError}</p> : null}
          {spotifyResults.length ? <ul className="grid gap-2 sm:grid-cols-2">{spotifyResults.map((track) => {
            const alreadyAdded = parsedTracks.some((item) => item.url === track.spotifyUrl);
            return <li key={track.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-card p-2">
              {track.artwork ? <img className="size-12 shrink-0 rounded object-cover" src={track.artwork} alt={track.album ? `${track.album} cover` : "Album artwork"} loading="lazy" /> : <div className="grid size-12 shrink-0 place-items-center rounded bg-navy/10 text-xl" aria-hidden="true">♫</div>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{track.title}</p><p className="truncate text-xs text-muted">{track.artists}{track.album ? ` · ${track.album}` : ""}</p></div>
              <button className={btnGhost} type="button" disabled={alreadyAdded || nonEmptyLineCount >= 30} onClick={() => addSpotifyTrack(track)}>{alreadyAdded ? "Added" : "Add"}</button>
            </li>;
          })}</ul> : null}
          <p className="text-xs text-muted">Search credentials stay server-side. Add <span className="font-mono">SPOTIFY_CLIENT_ID</span> and <span className="font-mono">SPOTIFY_CLIENT_SECRET</span> as deployment secrets to enable catalog search; never place them in browser code or a public ZIP.</p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-brass/40 bg-brass/10 p-3 text-sm"><input type="checkbox" checked={automaticMusic} onChange={(event) => { setAutomaticMusic(event.target.checked); if (event.target.checked) { setPlaylistText(""); onFormChange({ musicUrl: "" }); } }} /> <span><strong>Automatic online music</strong><span className="block text-xs text-muted">No upload, URL, or API key required. The portal loads public audio for the selected genre and keeps playback inside the portal.</span></span></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Music genre or style<select className={inputClass + " mt-1"} value={musicGenre} onChange={(event) => setMusicGenre(event.target.value)}><option>Mixed</option><option>Gospel</option><option>Bongo Flava</option><option>Afrobeats</option><option>Gengetone</option><option>Kapuka</option><option>Kenyan Hip Hop</option><option>Wakadinali</option><option>East African</option><option>Amapiano</option><option>Afro House</option><option>Dancehall</option><option>Reggae</option><option>Reggaeton</option><option>Rhumba</option><option>Kizomba</option><option>Zouk</option><option>Highlife</option><option>Soukous</option><option>World</option><option>Pop</option><option>R&amp;B</option><option>Soul</option><option>Blues</option><option>Jazz</option><option>Classical</option><option>Opera</option><option>Folk</option><option>Country</option><option>Rock</option><option>Metal</option><option>House</option><option>Techno</option><option>EDM</option><option>Lo-fi</option><option>Ambient</option><option>Instrumental</option><option>School / Calm</option></select></label><label className="block text-sm font-medium">Custom genre or artist <span className="font-normal text-muted">(for example: Wakadinali)</span><input className={inputClass + " mt-1"} value={musicGenre} maxLength={60} onChange={(event) => setMusicGenre(event.target.value)} placeholder="Type any genre, artist, or style" /></label></div>
        <label className="block text-sm font-medium">Playlist, one track per line<textarea className={inputClass + " mt-1 min-h-32 w-full"} value={playlistText} onChange={(event) => setPlaylistText(event.target.value)} placeholder={"Morning Song | Gospel | https://cdn.example/song.mp3 | https://backup.example/song.mp3\nClassical selection | Classical | https://open.spotify.com/track/…"} /></label>
        <a className="text-sm font-semibold text-navy underline" href="https://kaino.dev/library/music" target="_blank" rel="noreferrer">Browse a CC0 royalty-free music library ↗</a>
        <p className="text-xs text-muted">Line format: <span className="font-mono">Title | Genre | Audio or provider URL | Optional fallback | Optional credit | Source page | License name | License URL</span>. YouTube, Spotify, SoundCloud, Apple Music, Mixcloud, Deezer, and TIDAL links use official in-page embeds; Jamendo tracks use their HTTPS audio stream and retain creator/source/license attribution. Direct sources must be browser-playable. Automatic retries/fallback detection apply to direct audio; embedded providers control their own errors and volume.</p>
        <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} type="button" onClick={testSource} disabled={!previewUrl}>Load / test selected source</button><span className="text-xs text-muted">{parsedTracks.length} valid track{parsedTracks.length === 1 ? "" : "s"} in the editor</span></div>
        {nonEmptyLineCount > 30 ? <p role="status" className="text-xs text-bad">The playlist supports 30 tracks. The extra non-empty lines will not be saved.</p> : null}
        {previewLoaded && previewSource?.kind === "embed" ? <div key={previewKey} className="rounded-xl border border-line bg-white p-2"><p className="mb-2 text-xs font-semibold text-muted">{previewSource.provider} preview · playback stays on this page</p><iframe className="w-full rounded-lg" style={{ height: `${Math.max(200, previewSource.height)}px` }} src={previewSource.url} title={`${previewSource.provider} music preview`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share" allowFullScreen /></div> : null}
        {previewLoaded && previewSource?.kind === "audio" ? <div key={previewKey} className="rounded-xl border border-line bg-white p-3"><p className="mb-2 text-xs font-semibold text-muted">Direct audio preview · playback stays on this page</p><audio className="w-full" controls preload={musicOptions.preload} src={previewSource.url} onError={() => flash("This source could not be played here. Check the direct media URL, browser codec support, and provider access rules.", true)} /></div> : null}
        {previewLoaded && previewSource?.kind === "invalid" ? <p className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{previewSource.message}</p> : null}
      </section>
      <p className="rounded-xl bg-navy/5 p-3 text-xs text-muted">The portal does not redirect the player to another site. Tap Play in the dock to start direct audio/Jamendo streams or a live radio station; embedded services must be started with their official in-page Play control. Browser autoplay policies, provider account/region rules, codec support, and stream availability still apply. Jamendo search is for non-commercial use under its API terms, and each track’s license must be checked. Use music the school is authorized to play.</p>
    </div>
  </section>;
}
