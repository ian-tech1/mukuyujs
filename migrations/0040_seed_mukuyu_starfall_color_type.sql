-- Add the new reference-inspired loading palette without changing or deleting existing types.
insert into portal_color_types (id, name, name_key, colors_json)
values (
  'mukuyu-starfall-v1',
  'Mukuyu Starfall',
  'mukuyu starfall',
  '{"navy":"#20c9e8","info":"#596cf2","brass":"#f3b747","good":"#d84cbb"}'
)
on conflict (name_key) do nothing;
