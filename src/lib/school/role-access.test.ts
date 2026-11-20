import assert from "node:assert/strict";
import test from "node:test";
import { canActorAccess, canRoleAccess, DEFAULT_ROLE_ACCESS, normalizeRoleAccess } from "./role-access.ts";

test("defaults preserve staff reports, analysis, marklists and family linked results", () => {
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "admin", "reports", "view"), true);
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "teacher", "analysis", "download"), true);
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "teacher", "familyResults", "view"), false);
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "parent", "familyResults", "view"), true);
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "student", "familyResults", "download"), true);
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "qr_guest", "reports", "view"), true);
  assert.equal(canRoleAccess(DEFAULT_ROLE_ACCESS, "qr_guest", "reports", "download"), false);
});

test("public QR report viewing can be explicitly locked and unlocked", () => {
  const locked = normalizeRoleAccess({ qr_guest: { reports: { view: false, download: true } } });
  assert.equal(canRoleAccess(locked, "qr_guest", "reports", "view"), false);
  assert.equal(canRoleAccess(locked, "qr_guest", "reports", "download"), false);
  assert.equal(canActorAccess(locked, "qr_guest", "reports", "view"), false);

  const unlocked = normalizeRoleAccess({ qr_guest: { reports: { view: true, download: false } } });
  assert.equal(canRoleAccess(unlocked, "qr_guest", "reports", "view"), true);
  assert.equal(canActorAccess(unlocked, "qr_guest", "reports", "view"), true);
  assert.equal(canActorAccess(DEFAULT_ROLE_ACCESS, "qr_guest", "reports", "view"), true);
});

test("locked views force downloads off and unrelated groups stay unchanged", () => {
  const policy = normalizeRoleAccess({ teacher: { reports: { view: false, download: true } } });
  assert.equal(canRoleAccess(policy, "teacher", "reports", "view"), false);
  assert.equal(canRoleAccess(policy, "teacher", "reports", "download"), false);
  assert.equal(canRoleAccess(policy, "admin", "reports", "view"), true);
});

test("Super Admin access cannot be revoked by editable role policy", () => {
  const policy = normalizeRoleAccess({ admin: { reports: { view: false, download: false } } });
  assert.equal(canActorAccess(policy, "super_admin", "reports", "view"), true);
  assert.equal(canActorAccess(policy, "super_admin", "marklists", "download"), true);
  assert.equal(canActorAccess(policy, "admin", "reports", "view"), false);
});
