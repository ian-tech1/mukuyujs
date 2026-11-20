import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const migration = await readFile(join(here, "..", "migrations", "0032_qr_feedback_and_backup_delivery.sql"), "utf8");

test("QR feedback and scheduled-backup migration creates safe defaults and constraints", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table learners (id text primary key); create table users (id text primary key);");
    await db.exec(migration);
    const feedback = await db.query("select recipient_scope, allow_teacher_selection, autoreply_enabled from qr_feedback_settings where id=1");
    assert.deepEqual(feedback.rows[0], { recipient_scope: "class_teacher", allow_teacher_selection: true, autoreply_enabled: false });
    const backup = await db.query("select enabled, recipient_email, cadence from scheduled_backup_settings where id=1");
    assert.deepEqual(backup.rows[0], { enabled: false, recipient_email: "", cadence: "daily" });
    await assert.rejects(db.exec("insert into scheduled_backup_settings (id,cadence) values (2,'daily')"));
    await assert.rejects(db.exec("insert into qr_feedback_settings (recipient_scope) values ('learner')"));
  } finally {
    await db.close();
  }
});
