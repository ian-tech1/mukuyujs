-- Additive ASC-inspired timetable planning tools. Existing periods and entries remain intact.
create table if not exists timetable_rooms (
  id text primary key,
  name text not null,
  capacity int not null default 0 check (capacity >= 0),
  room_type text not null default '',
  features text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists timetable_availability (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  entity_type text not null check (entity_type in ('teacher','grade','stream','room')),
  entity_id text not null,
  day_of_week int not null check (day_of_week between 1 and 5),
  period_id text not null references timetable_periods(id) on delete cascade,
  available boolean not null default false,
  note text not null default '',
  unique (year_id, term_id, entity_type, entity_id, day_of_week, period_id)
);

create table if not exists timetable_requirements (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  grade_id text not null references grades(id) on delete cascade,
  stream_id text references streams(id) on delete cascade,
  subject_id text not null references subjects(id) on delete cascade,
  teacher_user_id text not null references users(id) on delete restrict,
  lessons_per_week int not null check (lessons_per_week between 1 and 40),
  block_length int not null default 1 check (block_length between 1 and 3),
  preferred_room text not null default '',
  created_at timestamptz not null default now()
);

alter table timetable_entries add column if not exists block_length int not null default 1 check (block_length between 1 and 3);
alter table timetable_periods add column if not exists is_break boolean not null default false;

create table if not exists timetable_state (
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  published boolean not null default false,
  effective_from date,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (year_id, term_id)
);

create table if not exists timetable_versions (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  label text not null,
  payload_json text not null,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists timetable_availability_scope_idx on timetable_availability (year_id, term_id, entity_type, entity_id);
create index if not exists timetable_requirements_scope_idx on timetable_requirements (year_id, term_id, grade_id, stream_id);
create index if not exists timetable_versions_scope_idx on timetable_versions (year_id, term_id, created_at desc);

insert into timetable_state (year_id, term_id, published, effective_from, published_at)
select distinct year_id, term_id, true, current_date, now() from timetable_entries
on conflict (year_id, term_id) do nothing;
