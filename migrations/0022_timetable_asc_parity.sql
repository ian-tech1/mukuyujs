-- aSc-style timetable rules plus the School Services column the office page queries.
-- Additive only. Existing lessons, marks, and service rows stay in place.

alter table learner_support_events add column if not exists created_at timestamptz not null default now();

alter table timetable_availability add column if not exists level text not null default 'off';

alter table subject_constraints add column if not exists distribution text not null default '';
alter table subject_constraints add column if not exists no_last_period boolean not null default false;
alter table subject_constraints add column if not exists complexity int not null default 1;
alter table subject_constraints add column if not exists place_in_order boolean not null default true;
alter table subject_constraints add column if not exists color text not null default '';

alter table timetable_requirements add column if not exists distribution text not null default '';

create table if not exists teacher_contracts (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  teacher_user_id text not null references users(id) on delete cascade,
  max_per_day int not null default 6 check (max_per_day between 1 and 12),
  max_per_week int not null default 30 check (max_per_week between 1 and 50),
  max_consecutive int not null default 4 check (max_consecutive between 1 and 10),
  max_days int not null default 5 check (max_days between 1 and 5),
  max_windows int not null default 3 check (max_windows between 0 and 8),
  unique (year_id, term_id, teacher_user_id)
);

create table if not exists class_constraints (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  grade_id text not null references grades(id) on delete cascade,
  stream_id text references streams(id) on delete cascade,
  max_per_day int not null default 8 check (max_per_day between 1 and 12),
  no_gaps boolean not null default true
);
create unique index if not exists class_constraints_scope_uidx
  on class_constraints (year_id, term_id, grade_id, coalesce(stream_id, ''));

create table if not exists lesson_relations (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  grade_id text not null references grades(id) on delete cascade,
  stream_id text references streams(id) on delete cascade,
  left_subject_id text not null references subjects(id) on delete cascade,
  right_subject_id text not null references subjects(id) on delete cascade,
  relation text not null check (relation in ('before', 'same_day', 'different_day', 'not_consecutive')),
  created_at timestamptz not null default now()
);

-- Mathematics stays out of the afternoon even if an older seed missed the short name MATH.
update subject_constraints
set no_afternoon = true,
    preferred_morning = true,
    place_in_order = true,
    complexity = 2
where subject_id in (
  select id from subjects
  where lower(short_name) in ('math', 'maths') or lower(name) like '%math%'
);
