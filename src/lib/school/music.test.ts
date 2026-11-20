import assert from "node:assert/strict";
import test from "node:test";
import { canReadStaffMusic, DEFAULT_MUSIC_OPTIONS, formatPlaylistText, KENYA_DAILY_CHART_TRACK, KENYA_TRENDING_TRACKS, normalizeMusicOptions, parseMusicSetting, parsePlaylistText, playbackEndAction, resolveMusicSource } from "./music.ts";

test("direct HTTPS and uploaded audio remain in the native audio player", () => {
  assert.equal(resolveMusicSource("https://cdn.example.test/song.mp3?token=abc").kind, "audio");
  assert.equal(resolveMusicSource("data:audio/ogg;base64,AAAA").kind, "audio");
  assert.equal(resolveMusicSource("http://cdn.example.test/song.mp3").kind, "invalid");
});

test("web pages are rejected as audio while direct stream endpoints remain supported", () => {
  assert.equal(resolveMusicSource("https://www.youtube.com/").kind, "invalid");
  assert.equal(resolveMusicSource("https://example.test/about-school").kind, "invalid");
  assert.equal(resolveMusicSource("https://radio.example.test/live").kind, "audio");
});

test("Kenya chart shortcuts resolve to official provider embeds and preserve source links", () => {
  assert.equal(KENYA_TRENDING_TRACKS.length, 4);
  assert.deepEqual(KENYA_TRENDING_TRACKS.map((track) => track.chartRank), [1, 4, 7, 10]);
  for (const track of KENYA_TRENDING_TRACKS) {
    assert.equal(resolveMusicSource(track.url).kind, "embed");
    assert.equal(track.sourcePageUrl, track.url);
  }
  assert.equal(resolveMusicSource(KENYA_DAILY_CHART_TRACK.url).kind, "embed");
  const added = parsePlaylistText(formatPlaylistText([KENYA_TRENDING_TRACKS[0]!]), "Mixed")[0];
  assert.equal(added?.sourcePageUrl, KENYA_TRENDING_TRACKS[0]?.sourcePageUrl);
});

test("provider share links resolve to official in-page embeds", () => {
  const cases = [
    ["https://www.youtube.com/watch?v=abcdefghijk", "YouTube", "youtube.com/embed/abcdefghijk"],
    ["https://youtu.be/abcdefghijk", "YouTube", "youtube.com/embed/abcdefghijk"],
    ["https://open.spotify.com/track/1234567890abcdef", "Spotify", "open.spotify.com/embed/track/1234567890abcdef"],
    ["spotify:playlist:1234567890abcdef", "Spotify", "open.spotify.com/embed/playlist/1234567890abcdef"],
    ["https://soundcloud.com/artist/song", "SoundCloud", "w.soundcloud.com/player/"],
    ["https://music.apple.com/us/album/example/123?i=456", "Apple Music", "embed.music.apple.com/us/album/example/123"],
    ["https://www.mixcloud.com/dj/show-name/", "Mixcloud", "mixcloud.com/widget/iframe/"],
    ["https://www.deezer.com/track/1234", "Deezer", "widget.deezer.com/widget/dark/track/1234"],
    ["https://tidal.com/browse/track/12345", "TIDAL", "embed.tidal.com/tracks/12345"],
  ] as const;
  for (const [input, provider, fragment] of cases) {
    const source = resolveMusicSource(input);
    assert.equal(source.kind, "embed", input);
    if (source.kind === "embed") {
      assert.equal(source.provider, provider, input);
      assert.ok(source.url.includes(fragment), source.url);
      assert.equal(new URL(source.url).protocol, "https:");
    }
  }
});

test("YouTube playlists are embedded in-page and recognized provider links can be disabled", () => {
  const playlist = resolveMusicSource("https://www.youtube.com/playlist?list=PLabcdefghijk");
  assert.equal(playlist.kind, "embed");
  if (playlist.kind === "embed") assert.ok(playlist.url.includes("videoseries"));
  assert.equal(resolveMusicSource("https://youtu.be/abcdefghijk", false).kind, "invalid");
});

test("unsupported protocols, URL credentials, and provider landing pages are not navigated", () => {
  assert.equal(resolveMusicSource("javascript:alert(1)").kind, "invalid");
  assert.equal(resolveMusicSource("https://user:password@example.com/song.mp3").kind, "invalid");
  assert.equal(resolveMusicSource("https://www.youtube.com/").kind, "invalid");
});

test("playlist text accepts an optional fallback URL and round-trips without losing the source", () => {
  const source = "https://cdn.example.test/primary.mp3";
  const fallback = "https://cdn.example.test/fallback.ogg";
  const tracks = parsePlaylistText(`Morning | Calm | ${source} | ${fallback}\nInvalid | Mixed | not-a-url`, "Mixed");
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]?.fallbackUrl, fallback);
  assert.equal(formatPlaylistText(tracks), `Morning | Calm | ${source} | ${fallback}`);
});

test("Jamendo attribution and Creative Commons license survive playlist text and JSON", () => {
  const line = "Quiet morning — Amina | Calm | https://prod-1.storage.jamendo.com/?trackid=123 |  | Amina · Jamendo | https://www.jamendo.com/track/123 | CC BY-NC-ND 3.0 | https://creativecommons.org/licenses/by-nc-nd/3.0/";
  const [track] = parsePlaylistText(line, "Mixed");
  assert.equal(track?.credit, "Amina · Jamendo");
  assert.equal(track?.sourcePageUrl, "https://www.jamendo.com/track/123");
  assert.equal(track?.licenseName, "CC BY-NC-ND 3.0");
  assert.equal(track?.licenseUrl, "https://creativecommons.org/licenses/by-nc-nd/3.0/");
  assert.equal(formatPlaylistText([track!]), line);

  const stored = parseMusicSetting(JSON.stringify({ kind: "mukuyu-playlist", tracks: [track] }));
  assert.equal(stored.tracks[0]?.credit, "Amina · Jamendo");
  assert.equal(stored.tracks[0]?.licenseUrl, "https://creativecommons.org/licenses/by-nc-nd/3.0/");
  const unsafe = parsePlaylistText("Song | Mixed | https://cdn.example.test/song.mp3 |  | Credit | http://bad.example/ | License | javascript:alert(1)", "Mixed")[0];
  assert.equal(unsafe?.sourcePageUrl, undefined);
  assert.equal(unsafe?.licenseUrl, undefined);
});

test("stored playlists keep provider tracks, options, and backward-compatible single sources", () => {
  const playlist = parseMusicSetting(JSON.stringify({
    kind: "mukuyu-playlist",
    genre: "Gospel",
    tracks: [{ title: "Song", genre: "Gospel", url: "https://open.spotify.com/track/1234567890" }],
    options: { defaultVolume: 0.5, maxRetries: 3, preload: "none" },
  }));
  assert.equal(playlist.isPlaylist, true);
  assert.equal(playlist.tracks[0]?.title, "Song");
  assert.equal(playlist.options.defaultVolume, 0.5);
  assert.equal(playlist.options.maxRetries, 3);
  assert.equal(playlist.options.preload, "none");
  const oldSource = parseMusicSetting("https://cdn.example.test/old.mp3");
  assert.equal(oldSource.isPlaylist, false);
  assert.equal(oldSource.tracks[0]?.url, "https://cdn.example.test/old.mp3");
});

test("music preference values are bounded and legacy defaults remain stable", () => {
  assert.deepEqual(normalizeMusicOptions({ defaultVolume: 8, maxRetries: 99, retryDelayMs: -5, playerPosition: "middle" }), {
    ...DEFAULT_MUSIC_OPTIONS,
    defaultVolume: 1,
    maxRetries: 3,
    retryDelayMs: 0,
  });
});

test("automatic playback advances, wraps repeat-all, and stops when repeat is off at the queue end", () => {
  assert.equal(playbackEndAction({ autoNext: true, repeatMode: "all", currentIndex: 1, trackCount: 2 }), "advance");
  assert.equal(playbackEndAction({ autoNext: true, repeatMode: "off", currentIndex: 0, trackCount: 2 }), "advance");
  assert.equal(playbackEndAction({ autoNext: true, repeatMode: "off", currentIndex: 1, trackCount: 2 }), "stop");
  assert.equal(playbackEndAction({ autoNext: false, repeatMode: "all", currentIndex: 0, trackCount: 2 }), "stop");
  assert.equal(playbackEndAction({ autoNext: true, repeatMode: "one", currentIndex: 0, trackCount: 1 }), "repeat");
});

test("all signed-in portal roles can receive music while anonymous callers cannot", () => {
  assert.equal(canReadStaffMusic("teacher"), true);
  assert.equal(canReadStaffMusic("admin"), true);
  assert.equal(canReadStaffMusic("super_admin"), true);
  assert.equal(canReadStaffMusic("parent"), true);
  assert.equal(canReadStaffMusic("student"), true);
  assert.equal(canReadStaffMusic(undefined), false);
});
