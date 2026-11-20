-- Keep the entry cohort year separate from the learner's current grade/stream.
alter table learners add column if not exists cohort_year text;
update learners l set cohort_year = coalesce(
  (select ay.name from marks m join academic_years ay on ay.id = m.year_id where m.learner_id = l.id order by ay.sort asc limit 1),
  (select sp.academic_year from school_profile sp where sp.id = 1),
  '2026'
) where cohort_year is null or trim(cohort_year) = '';
alter table learners alter column cohort_year set not null;
create index if not exists learners_cohort_grade_idx on learners (cohort_year, grade_id, stream_id);
