-- ============================================================================
-- Surface Labs — 0008 Masking da ordem de produção
-- Produção trabalha no kanban mas NÃO vê custos: leitura via view mascarada;
-- a tabela crua exige ver_custos; escrita/movimentação via RPCs e updates
-- (update não exige select).
-- ============================================================================

create view public.v_ordem_producao
with (security_invoker = false, security_barrier = true) as
select
  op.id, op.tenant_id, op.numero, op.pedido_id, op.produto_id, op.modelo_id,
  op.quantidade, op.responsavel_id, op.impressora_id, op.status, op.prazo,
  op.config_impressao_snapshot, op.progresso_pct, op.checklist,
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

drop policy ordem_producao_select on public.ordem_producao;
create policy ordem_producao_select on public.ordem_producao for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('producao', 'ver')
         and app.tem_flag('ver_custos'));
