alter table welcome_page
  alter column portal_background_duration_seconds set default 30;

update welcome_page
set portal_background_duration_seconds = 30
where id = 1 and portal_background_duration_seconds <= 15;
