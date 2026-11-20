-- aSc-style teacher contract: when a teacher teaches on a day, require at least this many periods.
alter table teacher_contracts
  add column if not exists min_per_day int not null default 0
  check (min_per_day between 0 and 8);

notify pgrst, 'reload schema';
