-- ============================================================================
-- Surface Labs — 0005 Estoque (ledger imutável) + Compras + Financeiro
-- saldo = projeção do histórico de movimentações; custo médio ponderado.
-- ============================================================================

create type public.tipo_movimentacao as enum
  ('entrada', 'saida', 'ajuste', 'reserva', 'estorno_reserva');

-- ----------------------------------------------------------------------------
-- movimentacao_estoque — o ledger. NUNCA se apaga nem se edita.
-- ----------------------------------------------------------------------------
create table public.movimentacao_estoque (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  material_id     uuid not null references public.material (id),
  tipo            public.tipo_movimentacao not null,
  quantidade      numeric(14,4) not null check (quantidade > 0), -- unid. de consumo
  custo_unitario  numeric(16,6) not null default 0, -- centavos/unid. no momento
  motivo          text,
  -- referência de origem (compra, pedido, OP, inventário, falha…)
  referencia_tipo text,
  referencia_id   uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);

alter table public.movimentacao_estoque enable row level security;
create policy mov_select on public.movimentacao_estoque for select
  using (tenant_id = app.current_tenant_id() and app.tem_permissao('estoque', 'ver'));
create policy mov_insert on public.movimentacao_estoque for insert
  with check (tenant_id = app.current_tenant_id() and app.tem_permissao('estoque', 'criar'));
-- sem políticas de update/delete: ledger imutável (e o trigger reforça)
create index mov_material_idx on public.movimentacao_estoque (material_id, created_at);
create index mov_tenant_idx on public.movimentacao_estoque (tenant_id);

create or replace function app.ledger_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'movimentações de estoque são imutáveis — lance um ajuste/estorno';
end;
$$;
create trigger ledger_imutavel before update or delete on public.movimentacao_estoque
  for each row execute function app.ledger_imutavel();

-- ----------------------------------------------------------------------------
-- Aplicação da movimentação nos caches do material (saldo/reservado/custo médio)
-- Regras (§4.2): entrada recalcula custo_medio ponderado; saída usa o vigente.
-- ----------------------------------------------------------------------------
create or replace function app.aplicar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  novo_saldo numeric;
  novo_custo numeric;
begin
  select saldo, reservado, custo_medio, valor_estoque into m
  from public.material
  where id = new.material_id
  for update;

  if not found then
    raise exception 'material não encontrado';
  end if;

  if new.tipo = 'entrada' then
    novo_saldo := m.saldo + new.quantidade;
    -- custo médio ponderado: (valor_atual + valor_entrada) / (saldo + qtd)
    if novo_saldo > 0 then
      novo_custo := ((m.saldo * m.custo_medio) + (new.quantidade * new.custo_unitario))
                    / novo_saldo;
    else
      novo_custo := new.custo_unitario;
    end if;
    update public.material set
      saldo = novo_saldo,
      custo_medio = novo_custo,
      ultimo_custo = new.custo_unitario,
      valor_estoque = round(novo_saldo * novo_custo)::bigint
    where id = new.material_id;

  elsif new.tipo = 'saida' then
    -- saída usa o custo médio vigente (grava no próprio lançamento p/ histórico)
    new.custo_unitario := m.custo_medio;
    novo_saldo := m.saldo - new.quantidade;
    update public.material set
      saldo = novo_saldo,
      valor_estoque = round(novo_saldo * m.custo_medio)::bigint
    where id = new.material_id;

  elsif new.tipo = 'ajuste' then
    -- ajuste com sinal no motivo? Não: ajuste positivo entra como qtd no custo
    -- médio vigente; para ajuste negativo use tipo=saida motivo=ajuste/perda.
    novo_saldo := m.saldo + new.quantidade;
    new.custo_unitario := m.custo_medio;
    update public.material set
      saldo = novo_saldo,
      valor_estoque = round(novo_saldo * m.custo_medio)::bigint
    where id = new.material_id;

  elsif new.tipo = 'reserva' then
    update public.material set reservado = m.reservado + new.quantidade
    where id = new.material_id;

  elsif new.tipo = 'estorno_reserva' then
    update public.material set reservado = greatest(0, m.reservado - new.quantidade)
    where id = new.material_id;
  end if;

  return new;
end;
$$;
create trigger aplicar_movimentacao before insert on public.movimentacao_estoque
  for each row execute function app.aplicar_movimentacao();

-- ----------------------------------------------------------------------------
-- compra — pedido de compra a fornecedor; receber = entrada no estoque
-- ----------------------------------------------------------------------------
create type public.status_compra as enum
  ('rascunho', 'enviado', 'parcial', 'recebido', 'cancelado');

create table public.compra (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant (id) on delete cascade,
  numero        text not null,
  fornecedor_id uuid references public.fornecedor (id),
  status        public.status_compra not null default 'rascunho',
  previsao      date,
  frete         public.centavos not null default 0,
  total         public.centavos not null default 0,
  recebido_em   timestamptz,
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  deleted_at    timestamptz,
  unique (tenant_id, numero)
);
call app.politicas_padrao('compra', 'compras');

create table public.compra_item (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  compra_id    uuid not null references public.compra (id) on delete cascade,
  material_id  uuid not null references public.material (id),
  quantidade   numeric(14,4) not null check (quantidade > 0), -- unid. de COMPRA
  custo_unit   public.centavos not null default 0,            -- por unid. de compra
  recebido     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  deleted_at   timestamptz
);
call app.politicas_padrao('compra_item', 'compras');
create index compra_item_compra_idx on public.compra_item (compra_id);

create or replace function app.numerar_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := app.proximo_numero(new.tenant_id, 'compra', 'PC');
  end if;
  return new;
end;
$$;
create trigger numerar_compra before insert on public.compra
  for each row execute function app.numerar_compra();

-- Receber a compra: gera entradas no ledger convertendo p/ unidade de consumo
create or replace function public.receber_compra(p_compra uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra record;
  v_item record;
  v_material record;
  v_qtd_consumo numeric;
  v_custo_consumo numeric;
begin
  if not app.tem_permissao('compras', 'editar') then
    raise exception 'sem permissão para receber compras';
  end if;

  select * into v_compra from public.compra
  where id = p_compra and tenant_id = app.current_tenant_id()
  for update;
  if not found then
    raise exception 'compra não encontrada';
  end if;
  if v_compra.status = 'recebido' then
    raise exception 'compra já recebida';
  end if;

  for v_item in
    select * from public.compra_item
    where compra_id = p_compra and not recebido and deleted_at is null
  loop
    select * into v_material from public.material where id = v_item.material_id;
    v_qtd_consumo := v_item.quantidade * v_material.fator_conversao;
    v_custo_consumo := v_item.custo_unit::numeric / v_material.fator_conversao;

    insert into public.movimentacao_estoque
      (tenant_id, material_id, tipo, quantidade, custo_unitario, motivo,
       referencia_tipo, referencia_id, created_by)
    values
      (v_compra.tenant_id, v_item.material_id, 'entrada', v_qtd_consumo,
       v_custo_consumo, 'recebimento de compra ' || v_compra.numero,
       'compra', p_compra, (select auth.uid()));

    -- atualiza o preço de referência do cadastro (última compra)
    update public.material
      set preco_compra = v_item.custo_unit
      where id = v_item.material_id;

    update public.compra_item set recebido = true, updated_at = now()
      where id = v_item.id;
  end loop;

  update public.compra
    set status = 'recebido', recebido_em = now(), updated_at = now()
    where id = p_compra;

  -- lançamento no contas a pagar
  insert into public.lancamento
    (tenant_id, tipo, descricao, categoria, valor, vencimento, status,
     origem_tipo, origem_id, created_by)
  values
    (v_compra.tenant_id, 'saida', 'Compra ' || v_compra.numero, 'insumos',
     v_compra.total + v_compra.frete, coalesce(v_compra.previsao, current_date),
     'pendente', 'compra', p_compra, (select auth.uid()));
end;
$$;
revoke all on function public.receber_compra(uuid) from public, anon;
grant execute on function public.receber_compra(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- lancamento — financeiro (contas a pagar/receber, fluxo de caixa)
-- ----------------------------------------------------------------------------
create table public.lancamento (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  tipo        text not null check (tipo in ('entrada', 'saida')),
  descricao   text not null,
  categoria   text not null default 'outros',
  -- pró-labore/retiradas dos sócios: visível só com flag ver_prolabore
  cliente_id     uuid references public.cliente (id),
  fornecedor_id  uuid references public.fornecedor (id),
  vencimento  date not null default current_date,
  pago_em     date,
  valor       public.centavos not null default 0,
  status      text not null default 'pendente'
    check (status in ('pago', 'pendente', 'atrasado', 'cancelado')),
  conta       text,
  origem_tipo text, -- pedido | compra | manual | provisao
  origem_id   uuid,
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  deleted_at  timestamptz
);
call app.politicas_padrao('lancamento', 'financeiro');
-- pró-labore: linha restritiva — categoria 'prolabore' exige a flag
create policy lancamento_prolabore on public.lancamento as restrictive for select
  using (categoria <> 'prolabore' or app.tem_flag('ver_prolabore'));
