import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { MAX_GZIPPED_BACKUP_BYTES } from "./backup-format.ts";
import { sendSchoolBackupEmail } from "./backup-email.ts";

test("backup email reports missing configuration without attempting a request", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  globalThis.fetch = async () => { throw new Error("fetch should not be called"); };
  try {
    const result = await sendSchoolBackupEmail("owner@example.test", { generatedAt: "2026-11-25T02:00:00.000Z", tables: { learners: [], marks: [] } }, "bak_test", "test");
    assert.deepEqual(result, { sent: false, reason: "RESEND_API_KEY is not configured." });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = originalFrom;
  }
});

test("backup email reports provider acceptance and sends the attachment only through the server helper", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Mukuyu Test <no-reply@example.test>";
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response("{}", { status: 200 });
  };
  try {
    const payload = { generatedAt: "2026-11-25T02:00:00.000Z", tables: { learners: [{ id: "synthetic" }], marks: [] } };
    const result = await sendSchoolBackupEmail("owner@example.test", payload, "bak_test", "test");
    assert.deepEqual(result, { sent: true });
    assert.equal(requestBody?.subject, "Mukuyu school backup test · 2026-11-25");
    assert.deepEqual(requestBody?.to, ["owner@example.test"]);
    const attachments = requestBody?.attachments as Array<{ filename: string; content: string }>;
    assert.equal(attachments[0]?.filename, "mukuyu-school-backup-2026-11-25.json.gz");
    const compressed = Buffer.from(attachments[0].content, "base64");
    assert.ok(compressed.byteLength < MAX_GZIPPED_BACKUP_BYTES);
    assert.equal(gunzipSync(compressed).toString("utf8"), JSON.stringify(payload));
    assert.match(String(requestBody?.text), /no manual extraction is needed/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = originalFrom;
  }
});

test("backup email refuses compressed attachments over the 2.8 MB target", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Mukuyu Test <no-reply@example.test>";
  let attemptedRequest = false;
  globalThis.fetch = async () => { attemptedRequest = true; return new Response("{}", { status: 200 }); };
  try {
    const mostlyIncompressible = randomBytes(3_000_000).toString("base64");
    const result = await sendSchoolBackupEmail("owner@example.test", { generatedAt: "2026-11-25T02:00:00.000Z", tables: { sample: [mostlyIncompressible] } }, "bak_large", "test");
    assert.equal(result.sent, false);
    assert.match(result.reason ?? "", /limit is 2\.8 MB/i);
    assert.equal(attemptedRequest, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = originalFrom;
  }
});

test("backup email reports provider rejection without exposing the response body", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Mukuyu Test <no-reply@example.test>";
  globalThis.fetch = async () => new Response("secret provider response", { status: 422 });
  try {
    const result = await sendSchoolBackupEmail("owner@example.test", { generatedAt: "2026-11-25T02:00:00.000Z", tables: { learners: [], marks: [] } }, "bak_test", "scheduled");
    assert.deepEqual(result, { sent: false, reason: "Email provider returned HTTP 422." });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = originalFrom;
  }
});
