-- Mukuyu timetable advanced studio. Additive only; existing timetable tables and records remain intact.
create table if not exists timetable_cycles (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  name text not null,
  week_count int not null default 1 check (week_count between 1 and 6),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists timetable_cycle_weeks (
  id text primary key,
  cycle_id text not null references timetable_cycles(id) on delete cascade,
  week_number int not null check (week_number between 1 and 6),
  label text not null,
  unique(cycle_id, week_number)
);
create table if not exists timetable_blackouts (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  label text not null,
  reason text not null default '',
  created_by text references users(id) on delete set null
);
create table if not exists timetable_staff_absences (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  teacher_user_id text not null references users(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null default '',
  status text not null default 'planned' check (status in ('planned','approved','cancelled'))
);
create table if not exists timetable_substitutions (
  id text primary key,
  entry_id text not null references timetable_entries(id) on delete cascade,
  substitute_teacher_user_id text not null references users(id) on delete restrict,
  effective_on date not null,
  reason text not null default '',
  approved_by text references users(id) on delete set null
);
create table if not exists timetable_resource_requirements (
  id text primary key,
  subject_id text references subjects(id) on delete cascade,
  room_type text not null default '',
  required_features text not null default '',
  minimum_capacity int not null default 0 check (minimum_capacity >= 0)
);
create table if not exists timetable_lesson_groups (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  name text not null,
  mode text not null default 'combined' check (mode in ('combined','split','co_teach')),
  notes text not null default ''
);
create table if not exists timetable_lesson_group_members (
  group_id text not null references timetable_lesson_groups(id) on delete cascade,
  entry_id text not null references timetable_entries(id) on delete cascade,
  primary key(group_id, entry_id)
);
create table if not exists timetable_elective_bands (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  name text not null,
  synchronized boolean not null default true,
  subject_ids text[] not null default '{}'
);
create table if not exists timetable_events (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5),
  period_id text references timetable_periods(id) on delete cascade,
  event_type text not null check (event_type in ('assembly','club','duty','games','meeting','other')),
  label text not null,
  audience text not null default 'school',
  room text not null default ''
);
create table if not exists timetable_exam_sessions (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  exam_id text references exams(id) on delete set null,
  day date not null,
  start_time text not null,
  end_time text not null,
  subject_id text references subjects(id) on delete set null,
  room text not null default '',
  capacity int not null default 0
);
create table if not exists timetable_invigilation (
  id text primary key,
  session_id text not null references timetable_exam_sessions(id) on delete cascade,
  teacher_user_id text not null references users(id) on delete restrict,
  role text not null default 'invigilator'
);
create table if not exists timetable_approvals (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  version_id text references timetable_versions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by text references users(id) on delete set null,
  reviewed_by text references users(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists timetable_change_log (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  user_id text references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json text not null default '{}',
  after_json text not null default '{}',
  reason text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists timetable_import_jobs (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  file_name text not null,
  format text not null check (format in ('csv','xlsx','json')),
  status text not null default 'queued',
  total_rows int not null default 0,
  accepted_rows int not null default 0,
  rejected_rows int not null default 0,
  errors_json text not null default '[]',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists timetable_export_jobs (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  format text not null check (format in ('pdf','csv','xlsx','ics','json')),
  scope text not null default 'school',
  status text not null default 'queued',
  file_path text not null default '',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists timetable_subscriptions (
  id text primary key,
  user_id text references users(id) on delete cascade,
  learner_id text references learners(id) on delete cascade,
  scope text not null check (scope in ('teacher','class','learner','school')),
  scope_id text not null,
  frequency text not null default 'on_change' check (frequency in ('on_change','daily','weekly')),
  active boolean not null default true,
  unique(user_id, learner_id, scope, scope_id)
);
create table if not exists timetable_share_tokens (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  scope text not null,
  scope_id text not null default '',
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text references users(id) on delete set null
);
create table if not exists timetable_optimization_profiles (
  id text primary key,
  name text not null unique,
  description text not null default '',
  weights_json text not null default '{}',
  active boolean not null default true
);
create table if not exists timetable_optimization_runs (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  profile_id text references timetable_optimization_profiles(id) on delete set null,
  status text not null default 'queued',
  score_before numeric,
  score_after numeric,
  placed_count int not null default 0,
  unplaced_count int not null default 0,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists timetable_undo_log (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  user_id text references users(id) on delete set null,
  action text not null,
  inverse_json text not null default '{}',
  undone_at timestamptz
);
create table if not exists timetable_conflicts (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  severity text not null check (severity in ('error','warning','info')),
  conflict_type text not null,
  message text not null,
  entity_ids text[] not null default '{}',
  resolved boolean not null default false,
  detected_at timestamptz not null default now()
);
create table if not exists timetable_calendar_links (
  id text primary key,
  subscription_id text not null references timetable_subscriptions(id) on delete cascade,
  provider text not null default 'ics',
  token_hash text not null unique,
  last_generated_at timestamptz
);
create table if not exists timetable_duty_rota (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5),
  duty_type text not null,
  teacher_user_id text not null references users(id) on delete restrict,
  room text not null default ''
);
create table if not exists timetable_sync_snapshots (
  id text primary key,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  source text not null,
  checksum text not null,
  payload_json text not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists timetable_feature_flags (
  key text primary key,
  enabled boolean not null default true,
  description text not null default '',
  updated_by text references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into timetable_optimization_profiles (id, name, description, weights_json) values
('balanced', 'Balanced school day', 'Balances teacher load, class gaps, subject spread, and preferred periods.', '{"load":1,"gaps":1,"spread":1,"preferences":1}'),
('morning', 'Morning priority', 'Prioritizes high-complexity subjects and protected morning periods.', '{"load":1,"gaps":1,"spread":1,"preferences":3}'),
('compact', 'Compact lessons', 'Reduces teacher windows and class gaps while respecting hard constraints.', '{"load":2,"gaps":3,"spread":1,"preferences":1}')
on conflict (id) do nothing;
create index if not exists timetable_cycles_scope_idx on timetable_cycles(year_id, term_id, active);
create index if not exists timetable_blackouts_scope_idx on timetable_blackouts(year_id, term_id, starts_on);
create index if not exists timetable_absences_scope_idx on timetable_staff_absences(year_id, term_id, teacher_user_id, starts_on);
create index if not exists timetable_events_scope_idx on timetable_events(year_id, term_id, day_of_week, period_id);
create index if not exists timetable_approvals_scope_idx on timetable_approvals(year_id, term_id, status, created_at desc);
create index if not exists timetable_changes_scope_idx on timetable_change_log(year_id, term_id, created_at desc);
create index if not exists timetable_conflicts_scope_idx on timetable_conflicts(year_id, term_id, resolved, severity);
create index if not exists timetable_exports_scope_idx on timetable_export_jobs(year_id, term_id, status, created_at desc);
create index if not exists timetable_subscriptions_scope_idx on timetable_subscriptions(scope, scope_id, active);
notify pgrst, 'reload schema';
