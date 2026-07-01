-- Foto principal do material/insumo no bucket privado `fotos`.
-- O valor guarda o path do Storage, seguindo o padrao usado em produtos,
-- modelos e impressoras.
alter table public.material
  add column if not exists foto text;
