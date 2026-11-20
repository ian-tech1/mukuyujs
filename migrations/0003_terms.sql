-- Years, terms, public report codes, report layout, admin privileges
alter table school_profile add column if not exists requirements text not null default '';
alter table school_profile add column if not exists greeting text not null default '';
alter table school_profile add column if not exists home_note text not null default '';
alter table school_profile add column if not exists public_base_url text not null default '';
alter table school_profile add column if not exists logo_data text not null default '';
alter table school_profile add column if not exists active_year_id text not null default 'y2026';
alter table school_profile add column if not exists active_term_id text not null default 't3';
alter table school_profile add column if not exists show_qr boolean not null default true;
alter table school_profile add column if not exists show_chart boolean not null default true;
alter table school_profile add column if not exists show_remarks boolean not null default true;
alter table school_profile add column if not exists show_positions boolean not null default true;

update school_profile set
  po_box = '47, TURBO',
  requirements = 'Mathematical calculator | Geometrical set | Mathematical log table | English set books',
  greeting = 'JS Teachers wish you a Merry Christmas and a Happy New Year!',
  home_note = 'Remember to read at home.',
  active_year_id = 'y2026',
  active_term_id = 't3'
where id = 1;

create table if not exists academic_years (
  id text primary key,
  name text not null,
  sort int not null
);

create table if not exists terms (
  id text primary key,
  name text not null,
  sort int not null
);

create table if not exists term_dates (
  year_id text not null references academic_years(id) on delete cascade,
  term_id text not null references terms(id),
  closing_date text not null default '',
  opening_date text not null default '',
  report_title text not null default '',
  requirements text not null default '',
  primary key (year_id, term_id)
);

insert into academic_years (id, name, sort) values
('y2024','2024',2024),
('y2025','2025',2025),
('y2026','2026',2026),
('y2027','2027',2027)
on conflict (id) do nothing;

insert into terms (id, name, sort) values
('t1','Term 1',1),
('t2','Term 2',2),
('t3','Term 3',3)
on conflict (id) do nothing;

insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2024','t1','','','TERM 1 YEAR 2024 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2024','t2','','','TERM 2 YEAR 2024 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2024','t3','','','TERM 3 YEAR 2024 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2025','t1','','','TERM 1 YEAR 2025 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2025','t2','','','TERM 2 YEAR 2025 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2025','t3','','','TERM 3 YEAR 2025 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2026','t1','','','TERM 1 YEAR 2026 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2026','t2','','','TERM 2 YEAR 2026 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2026','t3','23/10/2026','4/1/2027','TERM 3 YEAR 2026 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2027','t1','','','TERM 1 YEAR 2027 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2027','t2','','','TERM 2 YEAR 2027 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;
insert into term_dates (year_id, term_id, closing_date, opening_date, report_title, requirements) values ('y2027','t3','','','TERM 3 YEAR 2027 REPORT CARDS','Mathematical calculator | Geometrical set | Mathematical log table | English set books') on conflict (year_id, term_id) do nothing;

alter table marks add column if not exists year_id text not null default 'y2026';
alter table marks add column if not exists term_id text not null default 't3';
alter table marks drop constraint if exists marks_pkey;
alter table marks add primary key (learner_id, subject_id, exam_id, year_id, term_id);

alter table learners add column if not exists public_code text;
update learners set public_code = substr(md5(id), 1, 8) where public_code is null or public_code = '';

update learners set public_code = '9vn3j52b' where id = 'g7-1';
update learners set public_code = 'dc6vj2ag' where id = 'g7-2';
update learners set public_code = 'huqpjxhm' where id = 'g7-3';
update learners set public_code = 'nb8gkuss' where id = 'g7-4';
update learners set public_code = 'stsakrzw' where id = 'g7-5';
update learners set public_code = 'waa4km93' where id = 'g7-6';
update learners set public_code = '2stwkhg8' where id = 'g7-7';
update learners set public_code = '69cqkerc' where id = 'g7-8';
update learners set public_code = 'aqvjkbyh' where id = 'g7-9';
update learners set public_code = 'e7eck88p' where id = 'g7-10';
update learners set public_code = 'jpx6k5ft' where id = 'g7-11';
update learners set public_code = 'p6fykzqy' where id = 'g7-12';
update learners set public_code = 'tnzskwx4' where id = 'g7-13';
update learners set public_code = 'x5hkkt79' where id = 'g7-14';
update learners set public_code = '3m3dkqee' where id = 'g7-15';
update learners set public_code = '74k7kmpj' where id = 'g7-16';
update learners set public_code = 'bk4zkgwq' where id = 'g7-17';
update learners set public_code = 'f3ntkd6u' where id = 'g7-18';
update learners set public_code = 'kj6nkadz' where id = 'g7-19';
update learners set public_code = 'q2qfk7n6' where id = 'g7-20';
update learners set public_code = 'ug89k4va' where id = 'g7-21';
update learners set public_code = 'yyr3ky5f' where id = 'g7-22';
update learners set public_code = '4favkvck' where id = 'g7-23';
update learners set public_code = '8xtpksmr' where id = 'g7-24';
update learners set public_code = 'cecgkpuw' where id = 'g7-25';
update learners set public_code = 'gwvakk42' where id = 'g7-26';
update learners set public_code = 'mdd4kgb7' where id = 'g7-27';
update learners set public_code = 'rvxxkckb' where id = 'g7-28';
update learners set public_code = 'vcfrk9tg' where id = 'g7-29';
update learners set public_code = '8iv5tbvt' where id = 'g7-30';
update learners set public_code = '5bhck3as' where id = 'g7-31';
update learners set public_code = '9s26kyhx' where id = 'g7-32';
update learners set public_code = 'd9kykus3' where id = 'g7-33';
update learners set public_code = 'hr4skrz8' where id = 'g7-34';
update learners set public_code = 'n8nkmn9d' where id = 'g7-35';
update learners set public_code = 'sq6dmjgh' where id = 'g7-36';
update learners set public_code = 'w7p8mfrp' where id = 'g7-37';
update learners set public_code = '2p82mbyt' where id = 'g7-38';
update learners set public_code = '66rum88y' where id = 'g7-39';
update learners set public_code = 'ananm5f5' where id = 'g7-40';
update learners set public_code = 'e5tfm2q9' where id = 'g7-41';
update learners set public_code = 'jmb9mxxe' where id = 'g7-42';
update learners set public_code = 'p4v3mt7j' where id = 'g7-43';
update learners set public_code = 'tjdvmqeq' where id = 'g7-44';
update learners set public_code = 'x2xpmmpv' where id = 'g7-45';
update learners set public_code = '3hfhmhwz' where id = 'g7-46';
update learners set public_code = '7zybme66' where id = 'g7-47';
update learners set public_code = 'bgh5mbda' where id = 'g7-48';
update learners set public_code = 'fy2xm7nf' where id = 'g7-49';
update learners set public_code = 'kfkrm4vm' where id = 'g7-50';
update learners set public_code = 'qx4jmz5r' where id = 'g7-51';
update learners set public_code = 'uemcmwcw' where id = 'g7-52';
update learners set public_code = 'yw66mtm2' where id = 'g7-53';
update learners set public_code = '4dpympu7' where id = 'g7-54';
update learners set public_code = '8v8tmk4c' where id = 'g7-55';
update learners set public_code = 'cbrmmgbg' where id = 'g7-56';
update learners set public_code = 'gt9emdkn' where id = 'g7-57';
update learners set public_code = 'mat8mats' where id = 'g7-58';
update learners set public_code = 'rsb2m63x' where id = 'g7-59';
update learners set public_code = 'v9vum3a4' where id = 'g7-60';
update learners set public_code = 'z8nfk644' where id = 'g7-61';
update learners set public_code = 'm2nyxtmj' where id = 'g8-1';
update learners set public_code = 'rh6sxquq' where id = 'g8-2';
update learners set public_code = 'vzqkxm4v' where id = 'g8-3';
update learners set public_code = '7356ufpu' where id = 'g8-4';
update learners set public_code = '5xr7xek6' where id = 'g8-5';
update learners set public_code = '9eazxata' where id = 'g8-6';
update learners set public_code = 'dwttx73f' where id = 'g8-7';
update learners set public_code = 'hdcmx4am' where id = 'g8-8';
update learners set public_code = 'nvvfxzjr' where id = 'g8-9';
update learners set public_code = 'scd9xwsw' where id = 'g8-10';
update learners set public_code = 'wux3xs22' where id = 'g8-11';
update learners set public_code = '2bfvxp97' where id = 'g8-12';
update learners set public_code = 'aahgxgrg' where id = 'g8-14';
update learners set public_code = 'es2axdzn' where id = 'g8-15';
update learners set public_code = 'j8k4xa8s' where id = 'g8-16';
update learners set public_code = 'pq4wx6gx' where id = 'g8-17';
update learners set public_code = 't7nqx3q4' where id = 'g8-18';
update learners set public_code = 'xp6jxyy8' where id = 'g8-19';
update learners set public_code = '36pcxv7d' where id = 'g8-20';
update learners set public_code = '7n86xsfh' where id = 'g8-21';
update learners set public_code = 'b5ryxnpp' where id = 'g8-22';
update learners set public_code = 'fmasxjxu' where id = 'g8-23';
update learners set public_code = 'k4tkxf6y' where id = 'g8-24';
update learners set public_code = 'qkbdxcd5' where id = 'g8-25';
update learners set public_code = 'u3v7y9n9' where id = 'g8-26';
update learners set public_code = 'yhdzy5ve' where id = 'g8-27';
update learners set public_code = '4zxuy25k' where id = 'g8-28';
update learners set public_code = '8gfnyxcq' where id = 'g8-29';
update learners set public_code = 'cyyfyumv' where id = 'g8-30';
update learners set public_code = 'gfh9yruz' where id = 'g8-31';
update learners set public_code = 'mx23ym46' where id = 'g8-32';
update learners set public_code = 'rekvyhbb' where id = 'g8-33';
update learners set public_code = 'vw4pyekf' where id = 'g8-34';
update learners set public_code = '6agw02ke' where id = 'g8-35';
update learners set public_code = '5v6ay83r' where id = 'g8-36';
update learners set public_code = '9cp5y5aw' where id = 'g8-37';
update learners set public_code = 'du8xyzj3' where id = 'g8-38';
update learners set public_code = 'harryws7' where id = 'g8-39';
update learners set public_code = 'ns9jyt2c' where id = 'g8-40';
update learners set public_code = 's9tcyq9g' where id = 'g8-41';
update learners set public_code = 'wrb6ymhn' where id = 'g8-42';
update learners set public_code = '28vyygrt' where id = 'g8-43';
update learners set public_code = '6qdsydzx' where id = 'g8-44';
update learners set public_code = 'a7wkya84' where id = 'g8-45';
update learners set public_code = 'epfey7g8' where id = 'g8-46';
update learners set public_code = 'j6y8y4qd' where id = 'g8-47';
update learners set public_code = 'pnh2yyyj' where id = 'g8-48';
update learners set public_code = 't52uyv7p' where id = 'g8-49';
update learners set public_code = 'xmjnysfu' where id = 'g8-50';
update learners set public_code = '334fyppz' where id = 'g8-51';
update learners set public_code = '7jm9ykx5' where id = 'g8-52';
update learners set public_code = 'b263yg6a' where id = 'g8-53';
update learners set public_code = 'fhpvycee' where id = 'g8-54';
update learners set public_code = 'kz7py9nk' where id = 'g8-55';
update learners set public_code = 'qgrhy6wr' where id = 'g8-56';
update learners set public_code = 'uy9bz35v' where id = 'g8-57';
update learners set public_code = 'yft5zyd2' where id = 'g8-58';
update learners set public_code = '4xbxzum6' where id = 'g8-59';
update learners set public_code = '8eurzrub' where id = 'g8-60';
update learners set public_code = 'cwdjzn4g' where id = 'g8-61';
update learners set public_code = 'gdwczjbm' where id = 'g8-62';
update learners set public_code = 'muf6zfks' where id = 'g8-63';
update learners set public_code = 'rbyyzbtw' where id = 'g8-64';
update learners set public_code = 'vtgtz833' where id = 'g8-65';
update learners set public_code = '0vbb9315' where id = 'g8-66';
update learners set public_code = '5sjez2jc' where id = 'g8-67';
update learners set public_code = '9948zxsh' where id = 'g8-68';
update learners set public_code = 'drm2zt2n' where id = 'g8-69';
update learners set public_code = 'h85uzq9t' where id = 'g8-70';
update learners set public_code = 'nqpnzmhy' where id = 'g8-71';
update learners set public_code = 's77fzhr4' where id = 'g8-72';
update learners set public_code = 'wpq9zez9' where id = 'g8-73';
update learners set public_code = '2594zb8d' where id = 'g8-74';
update learners set public_code = '6mswz7gj' where id = 'g8-75';
update learners set public_code = 'a4bqz4qq' where id = 'g8-76';
update learners set public_code = 'ekuhzzyu' where id = 'g8-77';
update learners set public_code = 'j3cbzw7z' where id = 'g8-78';
update learners set public_code = 'pjw5ztf5' where id = 'g8-79';

alter table learners alter column public_code set not null;
create unique index if not exists learners_public_code_idx on learners (public_code);

alter table users add column if not exists priv_settings boolean not null default true;
alter table users add column if not exists priv_staff boolean not null default false;
alter table users add column if not exists priv_import boolean not null default true;
alter table users add column if not exists priv_calendar boolean not null default true;
update users set priv_staff = true, priv_settings = true, priv_import = true, priv_calendar = true where role in ('super_admin', 'admin');

