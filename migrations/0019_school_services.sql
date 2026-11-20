-- Additive non-timetable school service tools. Existing learner, report, mark, and timetable records are unchanged.
create table if not exists daily_attendance (
  id text primary key,
  learner_id text not null references learners(id) on delete cascade,
  attendance_date date not null,
  year_id text not null references academic_years(id) on delete restrict,
  term_id text not null references terms(id) on delete restrict,
  grade_id text not null references grades(id) on delete restrict,
  stream_id text not null references streams(id) on delete restrict,
  status text not null check (status in ('present','absent','late','excused')),
  note text not null default '',
  recorded_by text references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (learner_id, attendance_date)
);
create index if not exists daily_attendance_class_date_idx on daily_attendance (attendance_date, year_id, term_id, grade_id, stream_id);

create table if not exists homework_tasks (
  id text primary key,
  title text not null,
  instructions text not null default '',
  subject_id text not null references subjects(id) on delete restrict,
  grade_id text not null references grades(id) on delete restrict,
  stream_id text references streams(id) on delete cascade,
  year_id text not null references academic_years(id) on delete restrict,
  term_id text not null references terms(id) on delete restrict,
  due_date date not null,
  assigned_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists homework_progress (
  task_id text not null references homework_tasks(id) on delete cascade,
  learner_id text not null references learners(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','complete')),
  updated_by text references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (task_id, learner_id)
);
create index if not exists homework_scope_idx on homework_tasks (year_id, term_id, grade_id, stream_id, due_date);

create table if not exists school_events (
  id text primary key,
  title text not null,
  event_date date not null,
  audience text not null check (audience in ('all','parents','students','teachers','staff')),
  venue text not null default '',
  details text not null default '',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists school_events_date_idx on school_events (event_date);

create table if not exists guardian_contacts (
  id text primary key,
  learner_id text not null references learners(id) on delete cascade,
  name text not null,
  relationship text not null default '',
  phone text not null default '',
  email text not null default '',
  preferred_channel text not null default 'phone' check (preferred_channel in ('phone','email','in_person')),
  notes text not null default '',
  created_by text references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists guardian_contacts_learner_idx on guardian_contacts (learner_id);
create table if not exists guardian_contact_log (
  id text primary key,
  learner_id text not null references learners(id) on delete cascade,
  contact_id text references guardian_contacts(id) on delete set null,
  direction text not null check (direction in ('incoming','outgoing')),
  method text not null default 'phone',
  summary text not null,
  follow_up_date date,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists guardian_contact_log_learner_idx on guardian_contact_log (learner_id, created_at desc);

create table if not exists parent_meeting_requests (
  id text primary key,
  learner_id text not null references learners(id) on delete cascade,
  parent_user_id text not null references users(id) on delete cascade,
  topic text not null,
  preferred_method text not null default 'phone' check (preferred_method in ('phone','email','in_person')),
  preferred_date date,
  status text not null default 'pending' check (status in ('pending','accepted','declined','follow_up')),
  staff_response text not null default '',
  handled_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parent_meeting_parent_idx on parent_meeting_requests (parent_user_id, created_at desc);

create table if not exists staff_absence_requests (
  id text primary key,
  requester_id text not null references users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  category text not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  reviewer_id text references users(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists staff_absence_request_idx on staff_absence_requests (requester_id, status, start_date);

create table if not exists learner_support_events (
  id text primary key,
  learner_id text not null references learners(id) on delete cascade,
  event_date date not null,
  category text not null,
  summary text not null,
  follow_up_owner text references users(id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  outcome text not null default '',
  created_by text references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists learner_support_followup_idx on learner_support_events (status, due_date);

create table if not exists learner_emergency_profiles (
  learner_id text primary key references learners(id) on delete cascade,
  contact_name text not null default '',
  relationship text not null default '',
  phone text not null default '',
  critical_note text not null default '',
  updated_by text references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists school_audit_log (
  id text primary key,
  actor_id text,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists school_audit_log_date_idx on school_audit_log (created_at desc);
