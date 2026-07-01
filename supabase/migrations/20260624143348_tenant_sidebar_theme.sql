alter table public.tenant
  add column if not exists sidebar_bg_color text,
  add column if not exists sidebar_text_color text;

alter table public.tenant
  add constraint tenant_sidebar_bg_color_hex_chk
  check (sidebar_bg_color is null or sidebar_bg_color ~ '^#[0-9A-Fa-f]{6}$') not valid,
  add constraint tenant_sidebar_text_color_hex_chk
  check (sidebar_text_color is null or sidebar_text_color ~ '^#[0-9A-Fa-f]{6}$') not valid;
