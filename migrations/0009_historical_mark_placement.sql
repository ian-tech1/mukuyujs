-- Preserve the class/stream context for every mark so promotions never relabel history.
alter table marks add column if not exists grade_id text;
alter table marks add column if not exists stream_id text;

-- Reconstruct the best available historical placement from learner move events and mark timestamps.
update marks m set
  grade_id = coalesce(
    (select h.from_grade_id from learner_move_history h where h.learner_id = m.learner_id and h.moved_at > m.updated_at order by h.moved_at asc limit 1),
    (select h.to_grade_id from learner_move_history h where h.learner_id = m.learner_id and h.moved_at <= m.updated_at order by h.moved_at desc limit 1),
    (select l.grade_id from learners l where l.id = m.learner_id)
  ),
  stream_id = coalesce(
    (select h.from_stream_id from learner_move_history h where h.learner_id = m.learner_id and h.moved_at > m.updated_at order by h.moved_at asc limit 1),
    (select h.to_stream_id from learner_move_history h where h.learner_id = m.learner_id and h.moved_at <= m.updated_at order by h.moved_at desc limit 1),
    (select l.stream_id from learners l where l.id = m.learner_id)
  )
where m.grade_id is null or m.stream_id is null;

alter table marks alter column grade_id set not null;
alter table marks alter column stream_id set not null;
create index if not exists marks_period_grade_idx on marks (year_id, term_id, grade_id, stream_id);
create index if not exists marks_learner_period_idx on marks (learner_id, year_id, term_id);
