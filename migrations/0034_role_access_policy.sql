create table if not exists role_access_policy (
  id smallint primary key check (id = 1),
  policy_json jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
