-- Store last issued password so super admin / deputy can view it
alter table users add column if not exists last_password text not null default '';
