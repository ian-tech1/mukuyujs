-- Never retain plaintext passwords. Existing password_hash values remain valid.
update users set last_password = '' where last_password is not null and last_password <> '';
alter table users drop column if exists last_password;
-- Redact legacy temporary passwords that may have been written into the mail log.
update mail_outbox set body = regexp_replace(body, 'Temporary password: [^\r\n]*', 'Temporary password: [redacted]', 'g') where body like '%Temporary password:%';

-- Keep a permanent audit trail of learner/class movements for school records.
create table if not exists learner_move_history (
  id text primary key,
  learner_id text not null,
  learner_name text not null,
  from_grade_id text not null,
  to_grade_id text not null,
  from_stream_id text not null,
  to_stream_id text not null,
  moved_by text not null,
  reason text not null default 'manual move',
  moved_at timestamptz not null default now()
);
create index if not exists learner_move_history_learner_idx on learner_move_history (learner_id, moved_at desc);
create index if not exists learner_move_history_moved_at_idx on learner_move_history (moved_at desc);
