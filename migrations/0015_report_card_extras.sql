-- Optional report-card extras. Every switch defaults off, so existing cards do not change until an admin turns one on.
alter table school_profile add column if not exists show_subject_teacher_initials boolean not null default false;
alter table school_profile add column if not exists show_subject_rank boolean not null default false;
alter table school_profile add column if not exists show_subject_spotlight boolean not null default false;
alter table school_profile add column if not exists show_previous_term boolean not null default false;
alter table school_profile add column if not exists show_attendance boolean not null default false;
alter table school_profile add column if not exists show_custom_remarks boolean not null default false;

create table if not exists learner_term_notes (
  learner_id text not null references learners(id) on delete cascade,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  days_present int,
  days_expected int,
  conduct text not null default '',
  comment text not null default '',
  primary key (learner_id, year_id, term_id)
);

create table if not exists subject_remarks (
  learner_id text not null references learners(id) on delete cascade,
  subject_id text not null references subjects(id) on delete cascade,
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id) on delete cascade,
  remark text not null default '',
  primary key (learner_id, subject_id, year_id, term_id)
);
