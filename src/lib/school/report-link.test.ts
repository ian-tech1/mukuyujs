import assert from "node:assert/strict";
import { test } from "node:test";
import { reportLink } from "./report-link.ts";

test("report links use the portal root, not a configured subpath or stale query", () => {
  const link = reportLink("https://school.example.test/portal?view=reports#old", "ab12cd34");
  const url = new URL(link);
  assert.equal(url.origin, "https://school.example.test");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("c"), "ab12cd34");
  assert.equal(url.searchParams.has("view"), false);
});

test("live report links prefer the reachable app origin over a stale configured host", () => {
  const url = new URL(reportLink("https://old-school.example.test", "ab12cd34", "https://mukuyujs.vercel.app"));
  assert.equal(url.origin, "https://mukuyujs.vercel.app");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("c"), "ab12cd34");
});

test("report codes are URL-encoded and the current origin is used when no base is configured", () => {
  const url = new URL(reportLink("", "code with spaces", "https://school.example.test/app"));
  assert.equal(url.origin, "https://school.example.test");
  assert.equal(url.searchParams.get("c"), "code with spaces");
});
