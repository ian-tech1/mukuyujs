-- Super-admin configurable welcome branding and optional staff music player.
alter table welcome_page add column if not exists logo_data text not null default '';
alter table welcome_page add column if not exists background_start text not null default '#0e2a4a';
alter table welcome_page add column if not exists background_end text not null default '#245b82';
alter table welcome_page add column if not exists title_size int not null default 48;
alter table welcome_page add column if not exists animated boolean not null default true;
alter table welcome_page add column if not exists music_enabled boolean not null default false;
alter table welcome_page add column if not exists music_url text not null default '';
