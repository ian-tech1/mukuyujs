-- Reusable school-wide portal backdrop palettes managed by the Super Admin.
create table if not exists portal_color_types (
  id text primary key,
  name text not null,
  name_key text not null unique,
  colors_json text not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
