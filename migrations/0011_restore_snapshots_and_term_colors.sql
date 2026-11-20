-- Safe in-database pre-restore snapshots, mark approval status and configurable term colours.
create table if not exists office_backups (
  id text primary key,
  kind text not null,
  note text not null default '',
  payload text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table marks add column if not exists status text not null default 'recorded';
alter table school_profile add column if not exists color_t1 text not null default '#1d4e89';
alter table school_profile add column if not exists color_t2 text not null default '#9a7430';
alter table school_profile add column if not exists color_t3 text not null default '#1f7a4d';
