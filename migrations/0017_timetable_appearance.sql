-- Central appearance settings, configurable timetable periods and ASC-style timetable entries.
alter table welcome_page add column if not exists appearance_json text not null default '{}';

create table if not exists timetable_periods (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  label text not null,
  start_time text not null,
  end_time text not null,
  sort int not null default 1,
  unique (year_id, term_id, sort)
);

create table if not exists timetable_entries (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5),
  period_id text not null references timetable_periods(id) on delete cascade,
  grade_id text not null references grades(id) on delete restrict,
  stream_id text references streams(id) on delete restrict,
  subject_id text not null references subjects(id) on delete restrict,
  teacher_user_id text not null references users(id) on delete restrict,
  room text not null default '',
  notes text not null default '',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timetable_periods_period_idx on timetable_periods (year_id, term_id, sort);
create index if not exists timetable_entries_period_idx on timetable_entries (year_id, term_id, day_of_week, period_id);
create index if not exists timetable_entries_teacher_idx on timetable_entries (teacher_user_id, year_id, term_id);
create index if not exists timetable_entries_class_idx on timetable_entries (grade_id, stream_id, year_id, term_id);
