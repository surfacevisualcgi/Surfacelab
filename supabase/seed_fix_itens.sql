-- Corrige inconsistências do seed de demo: pedidos/orçamentos sem itens.
\set ON_ERROR_STOP on
select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
begin;

-- A) itens dos pedidos do kanban (derivados da OP única de cada pedido)
insert into public.pedido_item
  (tenant_id, pedido_id, produto_id, descricao, quantidade, valor_unit, valor_total, custo_unit, created_at, created_by)
select p.tenant_id, p.id, o.produto_id, pr.nome, o.quantidade,
       round(p.total::numeric / nullif(o.quantidade,0))::bigint, p.total,
       pr.custo_atual, p.created_at, p.created_by
from public.pedido p
join public.ordem_producao o on o.pedido_id=p.id and o.deleted_at is null and o.produto_id is not null
join public.produto pr on pr.id=o.produto_id
where p.tenant_id=:'tenant' and p.deleted_at is null
  and not exists (select 1 from public.pedido_item i where i.pedido_id=p.id and i.deleted_at is null);

-- B) itens dos orçamentos vazios (snapshot tem 1 item) — burla a imutabilidade
alter table public.orcamento_item disable trigger proteger_orcamento_item;
insert into public.orcamento_item
  (tenant_id, orcamento_id, descricao, quantidade, valor_unit, valor_total, custo_unit, ordem, created_at, created_by)
select o.tenant_id, o.id,
       (o.calculo_snapshot->'itens'->0->>'descricao'),
       (o.calculo_snapshot->'itens'->0->>'quantidade')::numeric,
       round(o.total::numeric / nullif((o.calculo_snapshot->'itens'->0->>'quantidade')::numeric,0))::bigint,
       o.total,
       round(o.custo_total::numeric / nullif((o.calculo_snapshot->'itens'->0->>'quantidade')::numeric,0))::bigint,
       0, o.created_at, o.created_by
from public.orcamento o
where o.tenant_id=:'tenant' and o.deleted_at is null
  and o.calculo_snapshot->'itens'->0 is not null
  and not exists (select 1 from public.orcamento_item i where i.orcamento_id=o.id and i.deleted_at is null);
alter table public.orcamento_item enable trigger proteger_orcamento_item;

-- C) contas a receber legíveis (com o número do pedido)
update public.lancamento l set descricao = 'Recebimento ' || p.numero
from public.pedido p
where l.tenant_id=:'tenant' and l.origem_tipo='pedido' and l.origem_id=p.id
  and l.descricao = 'Recebimento pedido';

commit;

select 'pedidos sem item' k, count(*) from public.pedido p where p.tenant_id=:'tenant' and p.deleted_at is null
  and not exists (select 1 from public.pedido_item i where i.pedido_id=p.id and i.deleted_at is null)
union all select 'orçamentos sem item', count(*) from public.orcamento o where o.tenant_id=:'tenant' and o.deleted_at is null
  and not exists (select 1 from public.orcamento_item i where i.orcamento_id=o.id and i.deleted_at is null);
