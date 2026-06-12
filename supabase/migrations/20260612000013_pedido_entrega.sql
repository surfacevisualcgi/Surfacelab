-- ============================================================================
-- Surface Labs — 0013 Entrega do pedido
-- Marca quando o pedido foi ENTREGUE ao cliente (pós-produção). Dá controle de
-- ciclo de vida na tela do pedido, separado da produção (OPs) e do recebimento.
-- ============================================================================

alter table public.pedido add column entregue_em timestamptz;

-- recria a view incluindo entregue_em (append no fim mantém compatibilidade)
create or replace view public.v_pedido
with (security_invoker = false, security_barrier = true) as
select
  p.id, p.tenant_id, p.numero, p.status, p.cliente_id,
  case when app.tem_flag('ver_pii_cliente') then p.cliente_snapshot
       else jsonb_build_object('nome', p.cliente_snapshot ->> 'nome') end as cliente_snapshot,
  p.canal_id, p.origem_orcamento_id, p.total,
  case when app.tem_flag('ver_custos') then p.custo_estimado end as custo_estimado,
  case when app.tem_flag('ver_custos') then p.custo_real end as custo_real,
  case when app.tem_flag('ver_custos') then p.calculo_snapshot end as calculo_snapshot,
  p.entrada, p.parcelas, p.taxas_pagamento, p.data_prevista_recebimento,
  p.frete_cobrado, p.frete_pago, p.prazo_entrega, p.observacoes,
  p.aprovado_em, p.concluido_em,
  p.created_at, p.updated_at, p.created_by, p.deleted_at,
  p.entregue_em
from public.pedido p
where p.tenant_id = app.current_tenant_id()
  and app.tem_permissao('pedidos', 'ver');
