-- Configurable CATs, optional teacher initials on reports, and scoped deputy delegation.
alter table school_profile add column if not exists report_exam_count int not null default 2;
alter table school_profile add column if not exists show_teacher_initials boolean not null default false;
alter table users add column if not exists delegated_responsibilities text[] not null default ARRAY['settings','staff','import','calendar']::text[];
update users set delegated_responsibilities = ARRAY['settings','staff','import','calendar']::text[] where is_deputy = true and cardinality(delegated_responsibilities) = 0;

create or replace function mukuyu_limit_deputies() returns trigger language plpgsql as $$
begin
  if NEW.is_deputy = true and (TG_OP = 'INSERT' or OLD.is_deputy is distinct from NEW.is_deputy) then
    if (select count(*) from users where is_deputy = true and id <> NEW.id) >= 3 then
      raise exception 'A maximum of three deputy super admins is allowed.';
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists users_limit_deputies on users;
create trigger users_limit_deputies before insert or update of is_deputy on users for each row execute function mukuyu_limit_deputies();

-- Give legacy learners an admission number once; never rewrite an existing value.
with numbered as (
  select id, row_number() over (order by grade_id, roll, full_name, id) as seq
  from learners where admission_number is null or trim(admission_number) = ''
)
update learners l set admission_number = 'MKS-' || to_char(current_date, 'YYYY') || '-' || lpad(numbered.seq::text, 5, '0')
from numbered where l.id = numbered.id;

create unique index if not exists learners_admission_upper_unique on learners (upper(admission_number)) where admission_number is not null and trim(admission_number) <> '';
