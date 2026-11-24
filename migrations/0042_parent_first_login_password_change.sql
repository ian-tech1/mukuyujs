-- Parents must choose a private password before using the portal.
-- Backfill only rows that have not yet been initialized so re-applying this
-- migration does not re-lock parents who have already completed the change.
alter table users
  add column if not exists must_change_password boolean;

update users
set must_change_password = (role = 'parent')
where must_change_password is null;

alter table users
  alter column must_change_password set default false;

alter table users
  alter column must_change_password set not null;
