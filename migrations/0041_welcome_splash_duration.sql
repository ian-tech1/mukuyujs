-- School-wide opening splash duration, configurable by the Super Admin.
alter table welcome_page
  add column if not exists splash_duration_seconds integer not null default 10;

alter table welcome_page
  drop constraint if exists welcome_page_splash_duration_seconds_check;

alter table welcome_page
  add constraint welcome_page_splash_duration_seconds_check
  check (splash_duration_seconds between 5 and 30);
