alter table welcome_page add column if not exists paragraph_colours_enabled boolean not null default true;
alter table welcome_page add column if not exists paragraph_colour_interval int not null default 4;
