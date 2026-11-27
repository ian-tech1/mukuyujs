import assert from "node:assert/strict";
import test from "node:test";
import { decodeSchoolAppIconDataUrl, isValidSchoolAppIconDataUrl, MAX_SCHOOL_APP_ICON_BYTES } from "./app-icon.ts";

function pngHeaderDataUrl(width = 512, height = 512, byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

test("app icon decoder accepts a 512 by 512 PNG data URL", () => {
  const dataUrl = pngHeaderDataUrl();
  const decoded = decodeSchoolAppIconDataUrl(dataUrl);
  assert.ok(decoded);
  assert.equal(decoded.length, 24);
  assert.equal(isValidSchoolAppIconDataUrl(dataUrl), true);
});

test("app icon decoder rejects non-PNG, malformed, and non-square or wrong-sized images", () => {
  assert.equal(decodeSchoolAppIconDataUrl("data:image/jpeg;base64,AAAA"), null);
  assert.equal(decodeSchoolAppIconDataUrl("data:image/png;base64,not-base64!"), null);
  assert.equal(decodeSchoolAppIconDataUrl(pngHeaderDataUrl(512, 192)), null);
  assert.equal(decodeSchoolAppIconDataUrl(pngHeaderDataUrl(1024, 1024)), null);
  assert.equal(isValidSchoolAppIconDataUrl(""), true);
  assert.equal(isValidSchoolAppIconDataUrl(undefined), false);
});

test("app icon decoder enforces the 250 KB encoded PNG limit", () => {
  assert.equal(decodeSchoolAppIconDataUrl(pngHeaderDataUrl(512, 512, MAX_SCHOOL_APP_ICON_BYTES + 1)), null);
});
