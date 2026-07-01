-- Permite manter um material cadastrado sem gerar alerta/compra sugerida.
alter table public.material
  add column if not exists alerta_estoque boolean not null default true;
