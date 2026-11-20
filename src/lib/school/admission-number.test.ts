import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ADMISSION_NUMBER_SETTINGS,
  formatAdmissionNumberExample,
  normalizeAdmissionNumberSettings,
  validateAdmissionNumberSettings,
} from "./admission-number.ts";

test("default admission-number example preserves the current MKS-year-five-digit appearance", () => {
  assert.equal(formatAdmissionNumberExample(DEFAULT_ADMISSION_NUMBER_SETTINGS, 2026, 42), "MKS-2026-00042");
});

test("prefix is normalized and the year and number width can be configured", () => {
  const settings = validateAdmissionNumberSettings({ prefix: "mukuyu8", includeYear: false, numberDigits: 6 });
  assert.deepEqual(settings, { prefix: "MUKUYU8", includeYear: false, numberDigits: 6 });
  assert.equal(formatAdmissionNumberExample(settings, 2026, 42), "MUKUYU8-000042");
});

test("invalid persisted values safely fall back to defaults", () => {
  assert.deepEqual(normalizeAdmissionNumberSettings({ prefix: "two words", includeYear: "yes", numberDigits: 12 }), DEFAULT_ADMISSION_NUMBER_SETTINGS);
});

test("invalid prefixes and number widths are rejected on save", () => {
  assert.throws(() => validateAdmissionNumberSettings({ prefix: "MKS-1", includeYear: true, numberDigits: 5 }), /prefix/);
  assert.throws(() => validateAdmissionNumberSettings({ prefix: "MKS", includeYear: true, numberDigits: 9 }), /4 and 8/);
});
