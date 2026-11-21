-- Capture the parent-provided details on each single-learner email challenge.
alter table parent_login_codes
  add column if not exists parent_name text not null default 'Parent',
  add column if not exists parent_phone text;

-- Expire pre-upgrade challenges: they were created without a parent identity/contact record.
update parent_login_codes set consumed_at = now() where consumed_at is null;

-- One row per successful verified parent sign-in, retained independently of learner/account deletion.
create table if not exists parent_login_events (
  id bigserial primary key,
  parent_user_id text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  learner_id text not null,
  learner_name text not null,
  logged_in_at timestamptz not null default now()
);

create index if not exists parent_login_events_logged_in_at_idx
  on parent_login_events (logged_in_at desc);
create index if not exists parent_login_events_parent_email_idx
  on parent_login_events (parent_email, logged_in_at desc);
