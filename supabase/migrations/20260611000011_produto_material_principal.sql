-- ============================================================================
-- Surface Labs — 0011 produto.material_principal
-- Campo previsto em LOGICA_E_MODELAGEM (§2.2) e exibido na tela 05 do v2,
-- mas faltava na migration 0003. Adiciona a coluna e recria a view v_produto
-- incluindo-a (mantendo o masking de custos).
-- ============================================================================

alter table public.produto
  add column material_principal text;

drop view public.v_produto;
create view public.v_produto
with (security_invoker = false, security_barrier = true) as
select
  p.id, p.tenant_id, p.sku, p.nome, p.categoria_id, p.descricao, p.tags, p.fotos,
  p.dimensoes, p.peso_g, p.material_principal, p.status, p.disponibilidade,
  case when app.tem_flag('ver_custos') then p.custo_atual end as custo_atual,
  case when app.tem_flag('ver_custos') then p.preco_sugerido end as preco_sugerido,
  p.preco_praticado,
  case when app.tem_flag('ver_custos') then p.custo_desenvolvimento end as custo_desenvolvimento,
  p.qtd_planejada_rateio, p.estoque_pronto,
  p.created_at, p.updated_at, p.created_by, p.deleted_at,
  app.tem_flag('ver_custos') as custos_visiveis
from public.produto p
where p.tenant_id = app.current_tenant_id()
  and app.tem_permissao('produtos', 'ver');

revoke all on public.v_produto from public, anon;
grant select on public.v_produto to authenticated;
