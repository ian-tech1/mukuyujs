-- Shared visual controls for the public welcome page.
alter table welcome_page
  add column if not exists display_controls_json text not null default '{}';
