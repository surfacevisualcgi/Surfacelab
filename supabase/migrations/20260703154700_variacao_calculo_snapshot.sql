-- Campos calculados por variacao vendavel.
-- O preco pode continuar manual, mas o calculo automatico grava custo, lucro,
-- margem e snapshot do motor para auditoria e KPIs.
alter table public.variacao
  add column if not exists custo_atual public.centavos,
  add column if not exists preco_sugerido public.centavos,
  add column if not exists margem_calculada numeric(8,4),
  add column if not exists lucro_calculado public.centavos,
  add column if not exists calculo_snapshot jsonb,
  add column if not exists calculado_em timestamptz;

create index if not exists variacao_produto_calculado_idx
  on public.variacao (produto_id, calculado_em desc)
  where deleted_at is null;

comment on column public.variacao.custo_atual is
  'Custo unitario calculado da variacao, em centavos, usando o motor de calculo Surface Labs.';
comment on column public.variacao.preco_sugerido is
  'Preco unitario sugerido da variacao, em centavos, retornado pelo motor de calculo.';
comment on column public.variacao.margem_calculada is
  'Margem liquida calculada da variacao, como fracao 0-1.';
comment on column public.variacao.lucro_calculado is
  'Lucro liquido unitario calculado da variacao, em centavos.';
comment on column public.variacao.calculo_snapshot is
  'Snapshot JSON do resultado/entradas do motor no momento do calculo da variacao.';
comment on column public.variacao.calculado_em is
  'Data/hora do ultimo calculo automatico da variacao.';
