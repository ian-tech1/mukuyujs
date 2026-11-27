alter table welcome_page
  add column if not exists portal_background_duration_seconds int not null default 5;
