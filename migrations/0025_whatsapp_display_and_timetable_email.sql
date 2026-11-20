-- Additive scanned-report WhatsApp CTA, typography, and welcome animation settings.
alter table school_profile add column if not exists whatsapp_group_enabled boolean not null default false;
alter table school_profile add column if not exists whatsapp_group_url text not null default '';
alter table school_profile add column if not exists whatsapp_group_label text not null default '';
alter table welcome_page add column if not exists font_family text not null default 'serif';
alter table welcome_page add column if not exists animation_style text not null default 'aurora';
