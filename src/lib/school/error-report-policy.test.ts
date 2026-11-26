import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeErrorReportPayload,
  safeErrorName,
  safeErrorPage,
  shouldCaptureServerError,
} from "./error-report-policy.ts";

test("error pages are reduced to a small route allow-list without preserving IDs or query strings", () => {
  assert.equal(safeErrorPage("/"), "opening");
  assert.equal(safeErrorPage("/portal"), "portal");
  assert.equal(safeErrorPage("/portal/learner/learner-123?parent=email@example.com"), "portal");
  assert.equal(safeErrorPage("/api/lookup?token=secret"), "other");
});

test("error names are normalized to known categories", () => {
  assert.equal(safeErrorName(new TypeError("private message")), "TypeError");
  assert.equal(safeErrorName({ name: "StudentRecordError", message: "private" }), "UnknownError");
  assert.equal(safeErrorName("email@example.com"), "UnknownError");
});

test("report validation returns only the three allowed metadata fields", () => {
  const normalized = normalizeErrorReportPayload({
    source: "window_error",
    page: "portal",
    errorName: "TypeError",
    message: "student name and phone",
    stack: "secret stack",
    userId: "user-1",
    url: "/portal?token=secret",
  });
  assert.deepEqual(normalized, {
    source: "window_error",
    page: "portal",
    errorName: "TypeError",
  });
  assert.throws(() => normalizeErrorReportPayload({ source: "unknown", page: "portal", errorName: "Error" }));
});

test("expected validation, authorization and cancellation failures are filtered", () => {
  assert.equal(shouldCaptureServerError(new Error("Sign in required.")), false);
  assert.equal(shouldCaptureServerError(new Error("Enter a valid date.")), false);
  assert.equal(shouldCaptureServerError(Object.assign(new Error("cancelled"), { name: "AbortError" })), false);
  assert.equal(shouldCaptureServerError(new TypeError("Cannot read properties of undefined")), true);
  assert.equal(shouldCaptureServerError(new Error("Database connection failed.")), true);
});
