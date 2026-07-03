-- ============================================================================
-- Produto operacional: colecoes, cores do produto, status comercial da variacao
-- e unicidade de SKU/codigo por tenant.
-- ============================================================================

create table if not exists public.colecao (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  nome        text not null,
  codigo      text,
  descricao   text,
  fotos       text[] not null default '{}',
  status      text not null default 'ativa'
    check (status in ('ativa', 'rascunho', 'arquivada')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  deleted_at  timestamptz
);

call app.politicas_padrao('colecao', 'produtos');

alter table public.produto
  add column if not exists colecao_id uuid references public.colecao (id),
  add column if not exists cores jsonb not null default '[]'::jsonb;

alter table public.variacao
  add column if not exists venda_status text not null default 'sob_encomenda'
    check (venda_status in ('em_estoque', 'pre_venda', 'sob_encomenda')),
  add column if not exists ordem integer not null default 0;

update public.variacao
set venda_status = case
  when estoque > 0 then 'em_estoque'
  else 'sob_encomenda'
end
where venda_status is null;

with duplicados as (
  select
    id,
    row_number() over (partition by tenant_id, upper(sku) order by created_at, id) as rn
  from public.produto
  where deleted_at is null and sku is not null and btrim(sku) <> ''
)
update public.produto p
set sku = p.sku || '-' || duplicados.rn::text
from duplicados
where duplicados.id = p.id
  and duplicados.rn > 1;

with duplicados as (
  select
    id,
    row_number() over (partition by tenant_id, upper(codigo) order by created_at, id) as rn
  from public.variacao
  where deleted_at is null and codigo is not null and btrim(codigo) <> ''
)
update public.variacao v
set codigo = v.codigo || '-' || duplicados.rn::text
from duplicados
where duplicados.id = v.id
  and duplicados.rn > 1;

create unique index if not exists colecao_tenant_codigo_unq
  on public.colecao (tenant_id, upper(codigo))
  where deleted_at is null and codigo is not null and btrim(codigo) <> '';

create unique index if not exists colecao_tenant_nome_unq
  on public.colecao (tenant_id, upper(nome))
  where deleted_at is null;

create unique index if not exists produto_tenant_sku_unq
  on public.produto (tenant_id, upper(sku))
  where deleted_at is null and sku is not null and btrim(sku) <> '';

create unique index if not exists variacao_tenant_codigo_unq
  on public.variacao (tenant_id, upper(codigo))
  where deleted_at is null and codigo is not null and btrim(codigo) <> '';

create index if not exists produto_tenant_colecao_idx
  on public.produto (tenant_id, colecao_id)
  where deleted_at is null;

create index if not exists variacao_produto_ordem_idx
  on public.variacao (produto_id, ordem, nome)
  where deleted_at is null;

drop view public.v_produto;
create view public.v_produto
with (security_invoker = false, security_barrier = true) as
select
  p.id, p.tenant_id, p.sku, p.nome, p.categoria_id, p.colecao_id,
  c.nome as colecao_nome, c.codigo as colecao_codigo,
  p.descricao, p.tags, p.fotos, p.cores,
  p.dimensoes, p.peso_g, p.material_principal, p.status, p.disponibilidade,
  case when app.tem_flag('ver_custos') then p.custo_atual end as custo_atual,
  case when app.tem_flag('ver_custos') then p.preco_sugerido end as preco_sugerido,
  p.preco_praticado,
  case when app.tem_flag('ver_custos') then p.custo_desenvolvimento end as custo_desenvolvimento,
  p.qtd_planejada_rateio, p.estoque_pronto,
  p.created_at, p.updated_at, p.created_by, p.deleted_at,
  app.tem_flag('ver_custos') as custos_visiveis
from public.produto p
left join public.colecao c
  on c.id = p.colecao_id
 and c.tenant_id = p.tenant_id
 and c.deleted_at is null
where p.tenant_id = app.current_tenant_id()
  and app.tem_permissao('produtos', 'ver');

revoke all on public.v_produto from public, anon;
grant select on public.v_produto to authenticated;
