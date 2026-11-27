alter table welcome_page
  alter column portal_background_duration_seconds set default 15;

update welcome_page
set portal_background_duration_seconds = 15
where id = 1 and portal_background_duration_seconds <= 5;
***
