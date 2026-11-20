-- Extra editable public welcome-page content, safe for existing deployments.
alter table welcome_page add column if not exists highlights text not null default '';
alter table welcome_page add column if not exists certification text not null default '© 2026 Certified';
alter table welcome_page add column if not exists footer_text text not null default '';
