-- Short-lived, single-use email verification challenges for parent self-service password resets.
create table if not exists parent_password_reset_codes (
  id text primary key,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists parent_password_reset_codes_email_created_idx
  on parent_password_reset_codes (email, created_at desc);
create index if not exists parent_password_reset_codes_expiry_idx
  on parent_password_reset_codes (expires_at);
