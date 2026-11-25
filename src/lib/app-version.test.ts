import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppVersionResponse, isAppUpdateAvailable } from "./app-version.ts";

test("app update check detects a different non-empty deployment build", () => {
  assert.equal(isAppUpdateAvailable("build-a", "build-b"), true);
  assert.equal(isAppUpdateAvailable("build-a", "build-a"), false);
  assert.equal(isAppUpdateAvailable("", "build-b"), false);
  assert.equal(isAppUpdateAvailable("build-a", ""), false);
});

test("version response identifies the build and prevents intermediary/browser caching", async () => {
  const response = createAppVersionResponse("commit-123");
  assert.deepEqual(await response.json(), { buildId: "commit-123" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
});
