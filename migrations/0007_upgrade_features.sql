-- Admission numbers, teacher initials, welcome page, notifications, role requests, CAT management

alter table learners add column if not exists admission_number text;
create unique index if not exists learners_admission_unique on learners (admission_number) where admission_number is not null and admission_number <> '';

alter table users add column if not exists initials text;
alter table users add column if not exists can_view_other_subjects boolean not null default false;
alter table users add column if not exists can_edit_other_subjects boolean not null default false;

create table if not exists welcome_page (
  id int primary key default 1,
  title text not null default 'Mukuyu Junior School',
  subtitle text not null default 'Learner Progress Portal',
  announcement text not null default '',
  contact text not null default '',
  show_logo boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into welcome_page (id) values (1) on conflict (id) do nothing;

create table if not exists notifications (
  id text primary key,
  from_user text not null,
  to_role text,
  to_user text,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists role_change_requests (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  requested_role text not null,
  requested_by text not null,
  super_approved boolean not null default false,
  deputy_approved boolean not null default false,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists term_assessments (
  id text primary key,
  year_id text not null,
  term_id text not null,
  exam_id text not null,
  active boolean not null default true,
  unique (year_id, term_id, exam_id)
);

-- Ensure marks are keyed by year and term (safe if already present)
alter table marks add column if not exists year_id text;
alter table marks add column if not exists term_id text;
