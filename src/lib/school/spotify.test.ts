import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSpotifyTrackResults, spotifyTrackSearchUrl } from "./spotify.ts";

test("Spotify search request is bounded to tracks, ten results, and Kenya market", () => {
  const url = new URL(spotifyTrackSearchUrl("  school morning music  "));
  assert.equal(url.pathname, "/v1/search");
  assert.equal(url.searchParams.get("q"), "school morning music");
  assert.equal(url.searchParams.get("type"), "track");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.get("market"), "KE");
});

test("Spotify result mapping returns only safe track and artwork URLs", () => {
  const tracks = normalizeSpotifyTrackResults({
    tracks: { items: [
      {
        id: "track-1",
        name: "  Morning Song  ",
        uri: "spotify:track:track1",
        external_urls: { spotify: "https://open.spotify.com/track/track1" },
        artists: [{ name: " Artist One " }, { name: "Artist Two" }],
        album: { name: "Album", images: [{ url: "https://i.scdn.co/image/cover", width: 300 }] },
      },
      {
        id: "bad-link",
        name: "Do not link elsewhere",
        uri: "spotify:track:bad1",
        external_urls: { spotify: "https://evil.example.test/track/bad1" },
        artists: [], album: { images: [{ url: "https://evil.example.test/cover" }] },
      },
    ] },
  });
  assert.equal(tracks.length, 1);
  assert.deepEqual(tracks[0], {
    id: "track-1",
    title: "Morning Song",
    artists: "Artist One, Artist Two",
    album: "Album",
    artwork: "https://i.scdn.co/image/cover",
    spotifyUrl: "https://open.spotify.com/track/track1",
    uri: "spotify:track:track1",
  });
});

test("Spotify result mapping caps output at ten and tolerates malformed payloads", () => {
  assert.deepEqual(normalizeSpotifyTrackResults(null), []);
  const items = Array.from({ length: 14 }, (_, index) => ({
    id: `track-${index}`,
    name: `Track ${index}`,
    uri: `spotify:track:id${index}`,
    external_urls: { spotify: `https://open.spotify.com/track/id${index}` },
    artists: [],
  }));
  assert.equal(normalizeSpotifyTrackResults({ tracks: { items } }).length, 10);
});
