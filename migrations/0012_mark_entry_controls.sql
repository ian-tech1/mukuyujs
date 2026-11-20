-- Per-academic-year, term and CAT controls for mark entry and editing.
create table if not exists mark_controls (
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  exam_id text not null references exams(id) on delete cascade,
  entry_allowed boolean not null default true,
  edit_allowed boolean not null default true,
  reason text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (year_id, term_id, exam_id)
);
