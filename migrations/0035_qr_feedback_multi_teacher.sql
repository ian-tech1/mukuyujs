alter table qr_parent_feedback
  add column if not exists teacher_user_ids text[] not null default '{}';

update qr_parent_feedback
set teacher_user_ids = array[teacher_user_id]
where teacher_user_id is not null and cardinality(teacher_user_ids) = 0;

create index if not exists qr_parent_feedback_teacher_ids_idx
  on qr_parent_feedback using gin (teacher_user_ids);
