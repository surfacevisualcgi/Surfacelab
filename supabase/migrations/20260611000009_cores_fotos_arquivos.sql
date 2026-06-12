-- ============================================================================
-- Surface Labs — 0009 Cores e mídias do catálogo + arquivos da OP
-- · modelo_3d.cores: cores DISPONÍVEIS do modelo [{nome, hex, foto}]
--   (o campo `cor` antigo segue como cor padrão/legado)
-- · variacao.cor_hex + variacao.foto: variação de cor do produto com mídia
-- · ordem_producao.arquivos: paths no Storage (G-code, fotos da produção)
--   → exige recriar a view mascarada v_ordem_producao
-- ============================================================================

alter table public.modelo_3d
  add column cores jsonb not null default '[]'::jsonb;

alter table public.variacao
  add column cor_hex text,
  add column foto text;

alter table public.ordem_producao
  add column arquivos text[] not null default '{}';

-- recria a view mascarada incluindo os arquivos (mesma regra de masking)
drop view public.v_ordem_producao;
create view public.v_ordem_producao
with (security_invoker = false, security_barrier = true) as
select
  op.id, op.tenant_id, op.numero, op.pedido_id, op.produto_id, op.modelo_id,
  op.quantidade, op.responsavel_id, op.impressora_id, op.status, op.prazo,
  op.config_impressao_snapshot, op.progresso_pct, op.checklist, op.arquivos,
  op.tempo_estimado_min, op.tempo_real_min,
  op.material_estimado_g, op.material_real_g,
  case when app.tem_flag('ver_custos') then op.custo_estimado end as custo_estimado,
  case when app.tem_flag('ver_custos') then op.custo_real end as custo_real,
  op.iniciado_em, op.concluido_em, op.baixa_executada,
  op.created_at, op.updated_at, op.created_by, op.deleted_at
from public.ordem_producao op
where op.tenant_id = app.current_tenant_id()
  and app.tem_permissao('producao', 'ver');

revoke all on public.v_ordem_producao from public, anon;
grant select on public.v_ordem_producao to authenticated;
