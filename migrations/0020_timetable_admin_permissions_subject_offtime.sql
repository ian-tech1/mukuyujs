-- Super-admin-controlled timetable editing for ordinary admins, plus subject-specific unavailable periods.
create table if not exists timetable_admin_permissions (
  id int primary key default 1 check (id = 1),
  admins_can_edit boolean not null default false,
  updated_by text references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into timetable_admin_permissions (id, admins_can_edit) values (1, false) on conflict (id) do nothing;

alter table timetable_availability drop constraint if exists timetable_availability_entity_type_check;
alter table timetable_availability add constraint timetable_availability_entity_type_check check (entity_type in ('teacher','grade','stream','room','subject'));
