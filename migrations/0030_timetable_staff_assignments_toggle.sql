-- Super-admin-controlled use of staff subject assignments in timetable generation.
alter table timetable_admin_permissions
  add column if not exists staff_assignments_enabled boolean not null default false;
