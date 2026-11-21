-- Short-lived one-time codes for parent email verification and self-service access.
create table if not exists parent_login_codes (
  id text primary key,
  email text not null,
  code_hash text not null,
  learner_ids text[] not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists parent_login_codes_email_created_idx
  on parent_login_codes (email, created_at desc);

create table if not exists parent_login_rate_limits (
  email text primary key,
  window_started_at timestamptz not null default now(),
  request_count int not null default 0
);
