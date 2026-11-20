import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRadioStations, radioApiBasesFromPayload, radioSearchUrl } from "./radio.ts";

test("radio API server discovery accepts official hosts and retains HTTPS fallback servers", () => {
  const bases = radioApiBasesFromPayload([
    { name: "de1.api.radio-browser.info" },
    { name: "de2.api.radio-browser.info" },
    { name: "evil.example.test" },
    { name: "https://not-a-host.example.test" },
  ]);
  assert.equal(bases[0], "https://de1.api.radio-browser.info");
  assert.equal(bases[1], "https://de2.api.radio-browser.info");
  assert.ok(bases.includes("https://fi1.api.radio-browser.info"));
  assert.equal(bases.filter((base) => base === "https://de1.api.radio-browser.info").length, 1);
  assert.ok(bases.every((base) => base.startsWith("https://")));
});

test("radio station normalization only returns checked HTTPS resolved streams", () => {
  const stations = normalizeRadioStations([
    { stationuuid: "ke-1", name: " Kenya FM ", url_resolved: "https://stream.example.test/live", country: "Kenya", codec: "mp3", bitrate: 128, lastcheckok: 1, hls: 0 },
    { stationuuid: "http", name: "Insecure", url_resolved: "http://stream.example.test/live", lastcheckok: 1, hls: 0 },
    { stationuuid: "bad", name: "Broken", url_resolved: "https://stream.example.test/broken", lastcheckok: 0, hls: 0 },
    { stationuuid: "hls", name: "HLS", url_resolved: "https://stream.example.test/live.m3u8", lastcheckok: 1, hls: 1 },
    { stationuuid: "cred", name: "Credentials", url_resolved: "https://user:secret@stream.example.test/live", lastcheckok: 1, hls: 0 },
  ], "https://de1.api.radio-browser.info");
  assert.equal(stations.length, 1);
  assert.equal(stations[0]?.name, "Kenya FM");
  assert.equal(stations[0]?.codec, "MP3");
  assert.equal(stations[0]?.apiBase, "https://de1.api.radio-browser.info");
});

test("radio search builds bounded HTTPS-only Kenya or worldwide queries", () => {
  const kenya = new URL(radioSearchUrl("https://de1.api.radio-browser.info", "  Kameme FM ", "KE"));
  assert.equal(kenya.searchParams.get("name"), "Kameme FM");
  assert.equal(kenya.searchParams.get("countrycode"), "KE");
  assert.equal(kenya.searchParams.get("is_https"), "true");
  assert.equal(kenya.searchParams.get("hidebroken"), "true");
  assert.equal(kenya.searchParams.get("limit"), "30");
  const global = new URL(radioSearchUrl("https://de1.api.radio-browser.info", "", "all"));
  assert.equal(global.searchParams.has("countrycode"), false);
  assert.equal(global.searchParams.has("name"), false);
});
