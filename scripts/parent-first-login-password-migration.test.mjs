import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const migration = await readFile(
  join(here, "..", "migrations", "0042_parent_first_login_password_change.sql"),
  "utf8",
);

test("parent first-login migration requires existing parents to choose a password once", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table users (
        id text primary key,
        email text not null unique,
        password_hash text not null,
        role text not null
      );
      insert into users (id, email, password_hash, role) values
        ('parent-1', 'parent@example.test', 'hash', 'parent'),
        ('staff-1', 'staff@example.test', 'hash', 'teacher');
    `);

    await db.exec(migration);
    let rows = await db.query(
      "select id, must_change_password from users order by id",
    );
    assert.deepEqual(rows.rows, [
      { id: "parent-1", must_change_password: true },
      { id: "staff-1", must_change_password: false },
    ]);

    await db.exec(
      "update users set must_change_password = false where id = 'parent-1'",
    );
    await db.exec(migration);
    rows = await db.query(
      "select must_change_password from users where id = 'parent-1'",
    );
    assert.equal(rows.rows[0].must_change_password, false);

    await db.exec(`
      insert into users (id, email, password_hash, role)
      values ('staff-2', 'staff2@example.test', 'hash', 'teacher');
    `);
    rows = await db.query(
      "select must_change_password from users where id = 'staff-2'",
    );
    assert.equal(rows.rows[0].must_change_password, false);
  } finally {
    await db.close();
  }
});
