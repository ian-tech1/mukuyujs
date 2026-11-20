create table if not exists admission_number_settings (
  id smallint primary key check (id = 1),
  prefix text not null default 'MKS',
  include_year boolean not null default true,
  number_digits smallint not null default 5 check (number_digits between 4 and 8),
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into admission_number_settings (id, prefix, include_year, number_digits)
values (1, 'MKS', true, 5)
on conflict (id) do nothing;
