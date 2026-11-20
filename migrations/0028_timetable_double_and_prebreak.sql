-- Per-subject double-lesson rule (NULL = follow each lesson card, 0 = never double, n = exactly n doubles a week)
-- and the most lessons a class may have in the two periods before a break.
alter table subject_constraints add column if not exists double_count int;
alter table subject_constraints add column if not exists max_before_break int not null default 3
  check (max_before_break between 1 and 10);

notify pgrst, 'reload schema';
