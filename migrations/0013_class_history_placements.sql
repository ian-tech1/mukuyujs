-- Remember which class a learner was in for each academic year, so promoting a learner
-- never empties the old class. Results stay under (year, grade, stream) as they were.
create table if not exists learner_year_placements (
  learner_id text not null references learners(id) on delete cascade,
  year_id text not null references academic_years(id) on delete cascade,
  grade_id text not null,
  stream_id text not null,
  recorded_at timestamptz not null default now(),
  primary key (learner_id, year_id)
);
create index if not exists learner_year_placements_class_idx on learner_year_placements (year_id, grade_id, stream_id);

-- Fill in every year before the current one from the class stamped on the learner's marks.
insert into learner_year_placements (learner_id, year_id, grade_id, stream_id)
select distinct on (m.learner_id, m.year_id) m.learner_id, m.year_id, m.grade_id, m.stream_id
from marks m
where (select ay.sort from academic_years ay where ay.id = m.year_id)
    < coalesce((select ay2.sort from academic_years ay2 where ay2.id = (select sp.active_year_id from school_profile sp where sp.id = 1)), 0)
order by m.learner_id, m.year_id, m.updated_at desc
on conflict (learner_id, year_id) do nothing;
