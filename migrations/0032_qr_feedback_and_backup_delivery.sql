create table if not exists qr_feedback_settings (
  id integer primary key default 1 check (id = 1),
  recipient_scope text not null default 'class_teacher' check (recipient_scope in ('teacher','class_teacher','admin','super_admin')),
  allow_teacher_selection boolean not null default true,
  autoreply_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into qr_feedback_settings (id) values (1) on conflict (id) do nothing;

create table if not exists qr_parent_feedback (
  id text primary key,
  learner_id text not null references learners(id) on delete cascade,
  learner_name text not null,
  grade_name text not null,
  stream_name text not null,
  parent_name text not null,
  parent_email text not null default '',
  teacher_user_id text references users(id) on delete set null,
  recipient_scope text not null check (recipient_scope in ('teacher','class_teacher','admin','super_admin')),
  message text not null,
  status text not null default 'new' check (status in ('new','read','replied','closed')),
  staff_reply text not null default '',
  created_at timestamptz not null default now(),
  replied_at timestamptz
);
create index if not exists qr_parent_feedback_learner_idx on qr_parent_feedback(learner_id, created_at desc);
create index if not exists qr_parent_feedback_teacher_idx on qr_parent_feedback(teacher_user_id, created_at desc);

create table if not exists scheduled_backup_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  recipient_email text not null default '',
  cadence text not null default 'daily' check (cadence in ('daily','weekly','monthly')),
  updated_at timestamptz not null default now()
);
insert into scheduled_backup_settings (id) values (1) on conflict (id) do nothing;
