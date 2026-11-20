-- Additional ASC-style subject constraints and locked lessons.
-- Additive only. Existing periods, entries, availability, and requirements remain unchanged.

alter table timetable_entries add column if not exists locked boolean not null default false;

create table if not exists subject_constraints (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  subject_id text not null references subjects(id) on delete cascade,
  max_per_day int not null default 2 check (max_per_day between 1 and 8),
  min_days_per_week int not null default 1 check (min_days_per_week between 1 and 5),
  no_afternoon boolean not null default false,
  preferred_morning boolean not null default false,
  avoid_consecutive_days boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (year_id, term_id, subject_id)
);

create index if not exists subject_constraints_scope_idx on subject_constraints (year_id, term_id, subject_id);

-- Seed a few common defaults (optional, safe to re-run)
insert into subject_constraints (id, year_id, term_id, subject_id, max_per_day, no_afternoon, preferred_morning, notes)
select 'sc_' || s.id || '_' || y.id || '_' || t.id,
       y.id, t.id, s.id,
       2,
       case when lower(s.short_name) in ('math','maths','mathematics') then true else false end,
       case when lower(s.short_name) in ('math','maths','mathematics','eng','english') then true else false end,
       'Auto-seeded ASC-style defaults'
from subjects s
cross join academic_years y
cross join terms t
on conflict (year_id, term_id, subject_id) do nothing;
