import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jamendoSearchUrl, normalizeJamendoSearchResults } from "./jamendo.ts";

const validResult = {
  id: "42",
  name: "Quiet Morning",
  artist_name: "The Example",
  audio: "https://storage.jamendo.com/?trackid=42&format=mp32",
  shareurl: "https://www.jamendo.com/track/42",
  image: "https://usercontent.jamendo.com/?type=album&id=42&width=300",
  license_ccurl: "http://creativecommons.org/licenses/by-nc-nd/4.0/",
  musicinfo: { tags: { genres: ["Ambient", "Chill"] } },
};

describe("jamendoSearchUrl", () => {
  it("includes the required API parameters and safely encodes bounded inputs", () => {
    const url = new URL(jamendoSearchUrl("calm & focus", "client id"));
    assert.equal(url.origin + url.pathname, "https://api.jamendo.com/v3.0/tracks/");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      format: "json",
      limit: "10",
      search: "calm & focus",
      include: "licenses",
      audioformat: "mp32",
      client_id: "client id",
    });
    const bounded = new URL(jamendoSearchUrl("q".repeat(500), "c".repeat(500)));
    assert.equal(bounded.searchParams.get("search")?.length, 200);
    assert.equal(bounded.searchParams.get("client_id")?.length, 200);
  });
});

describe("normalizeJamendoSearchResults", () => {
  it("normalizes valid track data and upgrades Creative Commons license URLs", () => {
    assert.deepEqual(normalizeJamendoSearchResults({ results: [validResult] }), [{
      provider: "Jamendo",
      id: "42",
      title: "Quiet Morning",
      artist: "The Example",
      genre: "Ambient",
      playbackUrl: validResult.audio,
      artworkUrl: validResult.image,
      sourcePageUrl: validResult.shareurl,
      credit: "The Example · Jamendo",
      licenseName: "CC BY-NC-ND",
      licenseUrl: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    }]);
  });

  it("rejects unsafe audio, track page, artwork, and license hosts", () => {
    const omitted = normalizeJamendoSearchResults({ results: [
      { ...validResult, audio: "https://evil.example/audio.mp3" },
      { ...validResult, audio: "http://storage.jamendo.com/audio.mp3" },
      { ...validResult, shareurl: "https://evil.example/track/42" },
      { ...validResult, shareurl: "https://jamendo.com/track/42" },
      { ...validResult, shareurl: "https://www.jamendo.com/track/other" },
    ] });
    assert.deepEqual(omitted, []);
    const badArtwork = normalizeJamendoSearchResults({ results: [{
      ...validResult,
      image: "https://evil.example/art.jpg",
    }] });
    assert.equal(badArtwork[0].artworkUrl, "");
    const badLicense = normalizeJamendoSearchResults({ results: [{
      ...validResult,
      license_ccurl: "https://evil.example/licenses/by/4.0",
    }] });
    assert.equal(badLicense[0].licenseUrl, "");
    assert.equal(badLicense[0].licenseName, "");
  });

  it("omits malformed result entries and returns an empty list for malformed payloads", () => {
    assert.deepEqual(normalizeJamendoSearchResults(null), []);
    assert.deepEqual(normalizeJamendoSearchResults({ results: {} }), []);
    assert.deepEqual(normalizeJamendoSearchResults({ results: [
      null,
      {},
      { ...validResult, id: "" },
      { ...validResult, name: 12 },
      { ...validResult, artist_name: undefined },
      { ...validResult, audio: "not a URL" },
      { ...validResult, shareurl: "https://www.jamendo.com/track/%E0%A4%A" },
    ] }), []);
  });
});
