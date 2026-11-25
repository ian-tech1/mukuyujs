-- Admin-issued parent credentials are temporary and must be used within 24 hours.
-- NULL preserves legacy first-login credentials and parent self-service resets.
alter table users
  add column if not exists must_change_password_expires_at timestamptz;
