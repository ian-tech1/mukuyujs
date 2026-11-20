-- Deputy super admin flag, long-term retention note
alter table users add column if not exists is_deputy boolean not null default false;

-- Marks and learner records are kept indefinitely (no automatic purge).
-- Academic years and terms remain queryable for more than 3 years.
