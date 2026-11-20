import assert from "node:assert/strict";
import test from "node:test";
import { normalizeYouTubeSearchResults, youtubeSearchUrl } from "./youtube.ts";

test("youtubeSearchUrl includes the required bounded search parameters", () => {
  const url = new URL(youtubeSearchUrl(`  ${"x".repeat(240)}  `, "server-secret"));
  assert.equal(url.origin + url.pathname, "https://www.googleapis.com/youtube/v3/search");
  assert.equal(url.searchParams.get("part"), "snippet");
  assert.equal(url.searchParams.get("type"), "video");
  assert.equal(url.searchParams.get("maxResults"), "10");
  assert.equal(url.searchParams.get("videoEmbeddable"), "true");
  assert.equal(url.searchParams.get("safeSearch"), "strict");
  assert.equal(url.searchParams.get("q"), "x".repeat(200));
  assert.equal(url.searchParams.get("key"), "server-secret");
  assert.equal(youtubeSearchUrl("  jazz  ", "k").includes("q=jazz"), true);
});

test("normalization filters invalid entries and produces safe links and preferred HTTPS artwork", () => {
  const results = normalizeYouTubeSearchResults({
    items: [
      {
        id: { videoId: "Abc_123-def" },
        snippet: {
          title: ` ${"T".repeat(250)} `,
          channelTitle: "  Artist  ",
          thumbnails: {
            default: { url: "https://cdn.example.com/thumb.jpg" },
            high: { url: "http://i.ytimg.com/unsafe.jpg" },
            medium: { url: "https://i.ytimg.com/vi/Abc_123-def/mqdefault.jpg" },
          },
        },
      },
      { id: { videoId: "short" }, snippet: { title: "Too short" } },
      { id: { videoId: "validID123" }, snippet: { title: "<script>bad</script>", thumbnails: {} } },
      { id: { videoId: "validID456" }, snippet: { title: "No channel", thumbnails: {} } },
      { id: { videoId: "validID789" }, snippet: null },
    ],
  });
  assert.equal(results.length, 3);
  const first = results[0]!;
  assert.equal(first.provider, "YouTube");
  assert.equal(first.id, "Abc_123-def");
  assert.equal(first.title.length, 200);
  assert.equal(first.artist, "Artist");
  assert.equal(first.playbackUrl, "https://www.youtube.com/watch?v=Abc_123-def");
  assert.equal(first.sourcePageUrl, first.playbackUrl);
  assert.equal(first.artworkUrl, "https://i.ytimg.com/vi/Abc_123-def/mqdefault.jpg");
  assert.equal(first.licenseName, "");
  assert.equal(first.licenseUrl, "");
  assert.equal(results[1]!.artworkUrl, "");
  assert.deepEqual(normalizeYouTubeSearchResults(null), []);
  assert.deepEqual(normalizeYouTubeSearchResults({ items: "not-an-array" }), []);
});
