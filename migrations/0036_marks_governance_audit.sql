-- Add configurable staff permissions and automatic deadlines to per-exam mark controls.
-- Defaults preserve the existing open-entry and assigned-staff behavior.
alter table mark_controls
  add column if not exists deadline_at timestamptz,
  add column if not exists admins_can_enter boolean not null default true,
  add column if not exists subject_teachers_can_enter boolean not null default true,
  add column if not exists class_teachers_can_enter boolean not null default true,
  add column if not exists class_teachers_all_subjects boolean not null default true,
  add column if not exists admins_can_view_marks boolean not null default true,
  add column if not exists subject_teachers_can_view_marks boolean not null default true,
  add column if not exists class_teachers_can_view_marks boolean not null default true,
  add column if not exists admins_can_edit_locked boolean not null default false,
  add column if not exists subject_teachers_can_edit_locked boolean not null default false,
  add column if not exists class_teachers_can_edit_locked boolean not null default false;

create table if not exists mark_audit_log (
  id text primary key,
  actor_id text,
  actor_name text not null default '',
  actor_role text not null default '',
  action text not null,
  source text not null default 'manual',
  learner_id text not null,
  learner_name text not null default '',
  subject_id text not null,
  subject_name text not null default '',
  exam_id text not null,
  year_id text not null,
  term_id text not null,
  old_score integer,
  new_score integer,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mark_audit_log_date_idx on mark_audit_log (created_at desc);
create index if not exists mark_audit_log_scope_idx on mark_audit_log (year_id, term_id, exam_id, created_at desc);
