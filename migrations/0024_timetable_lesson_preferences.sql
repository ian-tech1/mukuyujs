alter table timetable_requirements
  add column if not exists preferred_double_day int check (preferred_double_day between 1 and 5),
  add column if not exists timing_preference text not null default 'none' check (timing_preference in ('none', 'before_break', 'before_lunch'));

notify pgrst, 'reload schema';
