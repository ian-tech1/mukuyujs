import assert from "node:assert/strict";
import test from "node:test";
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
    const result = await sendSchoolBackupEmail("owner@example.test", { generatedAt: "2026-11-25T02:00:00.000Z", tables: { learners: [{ id: "synthetic" }], marks: [] } }, "bak_test", "test");
    assert.deepEqual(result, { sent: true });
    assert.equal(requestBody?.subject, "Mukuyu school backup test · 2026-11-25");
    assert.deepEqual(requestBody?.to, ["owner@example.test"]);
    assert.equal(Array.isArray(requestBody?.attachments), true);
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
