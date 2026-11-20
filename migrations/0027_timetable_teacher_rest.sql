-- Optional recovery time between separate timetable lesson blocks for each teacher.
alter table teacher_contracts
  add column if not exists min_rest_periods int not null default 0
  check (min_rest_periods between 0 and 2);

notify pgrst, 'reload schema';
