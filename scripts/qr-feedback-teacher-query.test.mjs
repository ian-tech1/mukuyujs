import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("QR feedback teacher lookup includes class and grade-wide subject assignments", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table users (id text primary key, full_name text not null, active boolean not null default true);
      create table subjects (id text primary key, name text not null);
      create table assignments (user_id text not null, kind text not null, grade_id text, stream_id text, subject_id text);
      insert into users values ('class-1','Class Teacher',true), ('eng-1','English Teacher',true), ('other-1','Other Grade Teacher',true);
      insert into subjects values ('english','English'), ('math','Mathematics');
      insert into assignments values ('class-1','class_teacher','grade-1','stream-a',null);
      insert into assignments values ('eng-1','subject_teacher','grade-1',null,'english');
      insert into assignments values ('eng-1','subject_teacher','grade-1','stream-a','math');
      insert into assignments values ('other-1','subject_teacher','grade-2',null,'english');
    `);
    const rows = await db.query(`
      select u.id, u.full_name as "fullName",
        string_agg(distinct case
          when a.kind='class_teacher' then 'Class teacher'
          when a.kind='subject_teacher' then coalesce(sb.name,'Subject') || ' teacher'
          when a.kind='hod' then 'Head of department'
          else 'Teacher'
        end, ', ' order by case
          when a.kind='class_teacher' then 'Class teacher'
          when a.kind='subject_teacher' then coalesce(sb.name,'Subject') || ' teacher'
          when a.kind='hod' then 'Head of department'
          else 'Teacher'
        end) as "subjectName"
      from assignments a
      join users u on u.id=a.user_id and u.active=true
      left join subjects sb on sb.id=a.subject_id
      where (a.grade_id is null or a.grade_id='grade-1')
        and (a.stream_id is null or a.stream_id='stream-a')
        and a.kind in ('class_teacher','subject_teacher','hod')
      group by u.id,u.full_name order by u.full_name
    `);
    assert.deepEqual(rows.rows, [
      { id: "class-1", fullName: "Class Teacher", subjectName: "Class teacher" },
      { id: "eng-1", fullName: "English Teacher", subjectName: "English teacher, Mathematics teacher" },
    ]);
  } finally {
    await db.close();
  }
});
