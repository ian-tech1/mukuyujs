import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSoundCloudSearchResults, soundCloudSearchUrl } from "./soundcloud.ts";

test("SoundCloud search URL bounds the query and fixes the result limit", () => {
  const url = new URL(soundCloudSearchUrl(`  ${"music ".repeat(30)}  `));
  assert.equal(url.origin + url.pathname, "https://api.soundcloud.com/tracks");
  assert.equal(url.searchParams.get("q")?.length, 100);
  assert.equal(url.searchParams.get("q")?.startsWith("music"), true);
  assert.equal(url.searchParams.get("limit"), "10");
});

test("normalizes API collections and only keeps safe track and artwork links", () => {
  const results = normalizeSoundCloudSearchResults({ collection: [{
    id: 12345,
    title: "  Morning Song  ",
    permalink_url: "https://soundcloud.com/artist-name/morning-song",
    genre: "Folk",
    artwork_url: "https://i1.sndcdn.com/artworks/example-large.jpg",
    user: { username: " Artist One " },
  }] });
  assert.deepEqual(results, [{
    provider: "SoundCloud",
    id: "12345",
    title: "Morning Song",
    artist: "Artist One",
    genre: "Folk",
    playbackUrl: "https://soundcloud.com/artist-name/morning-song",
    artworkUrl: "https://i1.sndcdn.com/artworks/example-large.jpg",
    sourcePageUrl: "https://soundcloud.com/artist-name/morning-song",
    credit: "",
    licenseName: "",
    licenseUrl: "",
  }]);
});

test("accepts array payloads and ignores malformed and blocked results", () => {
  const results = normalizeSoundCloudSearchResults([
    null,
    { id: 1, title: "Missing permalink" },
    { id: 2, title: "Blocked", access: "blocked", permalink_url: "https://soundcloud.com/artist/blocked" },
    { id: 3, title: "   ", permalink_url: "https://soundcloud.com/artist/blank" },
    { id: 4, title: "Valid", permalink_url: "https://soundcloud.com/artist/valid" },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Valid");
  assert.deepEqual(normalizeSoundCloudSearchResults(null), []);
  assert.deepEqual(normalizeSoundCloudSearchResults({ collection: "not an array" }), []);
});

test("rejects unsafe permalink hosts and only accepts HTTPS sndcdn artwork", () => {
  const results = normalizeSoundCloudSearchResults([
    { id: 1, title: "Lookalike", permalink_url: "https://soundcloud.com.evil.example/artist/track" },
    { id: 2, title: "Wrong host", permalink_url: "https://evil.example/artist/track" },
    { id: 3, title: "Too short", permalink_url: "https://soundcloud.com/artist" },
    {
      id: 4,
      title: "Safe track",
      permalink_url: "https://soundcloud.com/artist/safe",
      artwork_url: "https://sndcdn.com.evil.example/cover.jpg",
    },
    {
      id: 5,
      title: "HTTP artwork",
      permalink_url: "https://soundcloud.com/artist/http-cover",
      artwork_url: "http://i1.sndcdn.com/cover.jpg",
    },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].artworkUrl, "");
  assert.equal(results[1].artworkUrl, "");
});

test("caps normalized results at ten", () => {
  const tracks = Array.from({ length: 14 }, (_, index) => ({
    id: index,
    title: `Track ${index}`,
    permalink_url: `https://soundcloud.com/artist/track-${index}`,
  }));
  assert.equal(normalizeSoundCloudSearchResults(tracks).length, 10);
});
