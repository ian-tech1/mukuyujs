-- Store only normalized error categories. Do not add message, stack, request,
-- learner, user, IP, user-agent, or full-URL fields to this table.
create table if not exists school_error_reports (
  report_key text primary key check (report_key ~ '^[a-f0-9]{64}$'),
  source text not null check (source in (
    'server_function', 'window_error', 'unhandled_rejection', 'route_boundary'
  )),
  page text not null check (page in ('opening', 'portal', 'other')),
  error_name text not null check (error_name in (
    'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
    'ChunkLoadError', 'NetworkError', 'UnknownError'
  )),
  reporting_windows integer not null default 1 check (reporting_windows >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists school_error_reports_last_seen_idx
  on school_error_reports (last_seen desc);
