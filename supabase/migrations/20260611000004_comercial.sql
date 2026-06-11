-- ============================================================================
-- Surface Labs — 0004 Comercial: simulação, orçamento (snapshot), pedido,
-- ordem de produção. Espinha: Calculadora → Orçamento → Pedido → OP.
-- ============================================================================

create type public.status_orcamento as enum
  ('rascunho', 'enviado', 'aguardando_resposta', 'aprovado', 'recusado',
   'cancelado', 'expirado');

create type public.status_pedido as enum
  ('criado', 'aprovado', 'em_producao', 'concluido', 'cancelado');

create type public.status_op as enum
  ('aguardando_aprovacao', 'preparar', 'imprimindo', 'acabamento', 'concluido',
   'cancelado');

-- ----------------------------------------------------------------------------
-- simulacao — a Calculadora salva; pode virar orçamento.
-- entradas/itens/resultados em jsonb: o motor de cálculo (TS puro) é a fonte
-- da estrutura; o banco guarda o documento completo com explicações.
-- ----------------------------------------------------------------------------
create table public.simulacao (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  nome            text not null default 'Nova simulação',
  produto_id      uuid references public.produto (id),
  modelo_id       uuid references public.modelo_3d (id),
  cliente_id      uuid references public.cliente (id),
  canal_id        uuid references public.canal_venda (id),
  -- documento do cálculo: { entradas, itens_custo[], resultados, explicacoes }
  calculo         jsonb not null default '{}'::jsonb,
  versao_motor    text not null default '1',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  deleted_at      timestamptz
);
call app.politicas_padrao('simulacao', 'calculadora');

-- ----------------------------------------------------------------------------
-- orcamento — SNAPSHOT IMUTÁVEL dos valores no momento da geração.
-- Os campos *_snapshot e os itens guardam valores CONGELADOS (não FK viva).
-- ----------------------------------------------------------------------------
create table public.orcamento (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenant (id) on delete cascade,
  numero               text not null,
  status               public.status_orcamento not null default 'rascunho',
  versao               integer not null default 1,
  cliente_id           uuid references public.cliente (id),
  cliente_snapshot     jsonb not null default '{}'::jsonb, -- nome/contato congelados
  empresa_snapshot     jsonb not null default '{}'::jsonb,
  canal_id             uuid references public.canal_venda (id),
  simulacao_id         uuid references public.simulacao (id),
  validade             date,
  prazo_entrega        text,
  condicoes_pagamento  text,
  frete                public.centavos not null default 0,
  desconto             public.centavos not null default 0,
  total                public.centavos not null default 0,
  -- resumo interno (visão da empresa — mascarado sem ver_custos)
  custo_total          public.centavos not null default 0,
  lucro_estimado       public.centavos not null default 0,
  margem_estimada      numeric(6,4) not null default 0,
  -- fotografia completa do cálculo autoritativo (itens, taxas, alíquotas,
  -- explicações, versão do motor e da config usada)
  calculo_snapshot     jsonb not null default '{}'::jsonb,
  versao_motor         text not null default '1',
  observacoes          text,
  anexos               text[] not null default '{}',
  aceite_cliente       jsonb,                          -- {quando, como, por}
  aprovado_em          timestamptz,
  enviado_em           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  deleted_at           timestamptz,
  unique (tenant_id, numero)
);
call app.politicas_padrao('orcamento', 'orcamentos');

create table public.orcamento_item (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant (id) on delete cascade,
  orcamento_id  uuid not null references public.orcamento (id) on delete cascade,
  produto_id    uuid references public.produto (id),   -- referência informativa
  descricao     text not null,                          -- congelado
  quantidade    numeric(12,4) not null default 1,
  valor_unit    public.centavos not null default 0,    -- congelado
  valor_total   public.centavos not null default 0,    -- congelado
  custo_unit    public.centavos not null default 0,    -- congelado (interno)
  ordem         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  deleted_at    timestamptz
);
call app.politicas_padrao('orcamento_item', 'orcamentos');
create index orcamento_item_orc_idx on public.orcamento_item (orcamento_id);

-- Imutabilidade do snapshot: depois de sair de rascunho, o conteúdo congela.
-- Só status/aceite/observações podem mudar (a transição é controlada à parte).
create or replace function app.proteger_orcamento()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'rascunho' then
    if new.calculo_snapshot is distinct from old.calculo_snapshot
       or new.total is distinct from old.total
       or new.custo_total is distinct from old.custo_total
       or new.cliente_snapshot is distinct from old.cliente_snapshot
       or new.empresa_snapshot is distinct from old.empresa_snapshot
       or new.frete is distinct from old.frete
       or new.desconto is distinct from old.desconto then
      raise exception 'orçamento % não está mais em rascunho: valores são imutáveis (gere uma nova versão)', old.numero;
    end if;
  end if;
  return new;
end;
$$;
create trigger proteger_orcamento before update on public.orcamento
  for each row execute function app.proteger_orcamento();

create or replace function app.proteger_orcamento_item()
returns trigger
language plpgsql
as $$
declare
  v_status public.status_orcamento;
begin
  select status into v_status from public.orcamento
    where id = coalesce(new.orcamento_id, old.orcamento_id);
  if v_status <> 'rascunho' then
    raise exception 'itens de orçamento emitido são imutáveis';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger proteger_orcamento_item
  before insert or update or delete on public.orcamento_item
  for each row execute function app.proteger_orcamento_item();

-- numeração automática por tenant
create or replace function app.numerar_orcamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := app.proximo_numero(new.tenant_id, 'orcamento', 'ORC');
  end if;
  return new;
end;
$$;
create trigger numerar_orcamento before insert on public.orcamento
  for each row execute function app.numerar_orcamento();

-- ----------------------------------------------------------------------------
-- pedido — nasce de orçamento aprovado (ou direto). Itens são snapshot.
-- ----------------------------------------------------------------------------
create table public.pedido (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenant (id) on delete cascade,
  numero               text not null,
  status               public.status_pedido not null default 'criado',
  cliente_id           uuid references public.cliente (id),
  cliente_snapshot     jsonb not null default '{}'::jsonb,
  canal_id             uuid references public.canal_venda (id),
  origem_orcamento_id  uuid references public.orcamento (id),
  total                public.centavos not null default 0,
  custo_estimado       public.centavos not null default 0,
  custo_real           public.centavos,
  calculo_snapshot     jsonb not null default '{}'::jsonb,
  -- pagamento
  entrada              public.centavos not null default 0,
  parcelas             integer not null default 1,
  taxas_pagamento      public.centavos not null default 0,
  data_prevista_recebimento date,
  -- entrega
  frete_cobrado        public.centavos not null default 0,
  frete_pago           public.centavos not null default 0,
  prazo_entrega        date,
  observacoes          text,
  aprovado_em          timestamptz,
  concluido_em         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  deleted_at           timestamptz,
  unique (tenant_id, numero)
);
call app.politicas_padrao('pedido', 'pedidos');
create policy pedido_limite on public.pedido as restrictive for insert
  with check (app.dentro_do_limite('pedidos_mes'));

create table public.pedido_item (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  pedido_id   uuid not null references public.pedido (id) on delete cascade,
  produto_id  uuid references public.produto (id),
  descricao   text not null,
  quantidade  numeric(12,4) not null default 1,
  valor_unit  public.centavos not null default 0,
  valor_total public.centavos not null default 0,
  custo_unit  public.centavos not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  deleted_at  timestamptz
);
call app.politicas_padrao('pedido_item', 'pedidos');
create index pedido_item_pedido_idx on public.pedido_item (pedido_id);

create or replace function app.numerar_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := app.proximo_numero(new.tenant_id, 'pedido', 'PED');
  end if;
  return new;
end;
$$;
create trigger numerar_pedido before insert on public.pedido
  for each row execute function app.numerar_pedido();

-- ----------------------------------------------------------------------------
-- ordem_producao — kanban da produção (estimado × real)
-- ----------------------------------------------------------------------------
create table public.ordem_producao (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenant (id) on delete cascade,
  numero              text not null,
  pedido_id           uuid references public.pedido (id),
  produto_id          uuid references public.produto (id),
  modelo_id           uuid references public.modelo_3d (id),
  quantidade          numeric(12,4) not null default 1,
  responsavel_id      uuid references public.usuario (id),
  impressora_id       uuid references public.impressora (id),
  status              public.status_op not null default 'aguardando_aprovacao',
  prazo               date,
  config_impressao_snapshot jsonb not null default '{}'::jsonb,
  progresso_pct       numeric(5,2) not null default 0,
  checklist           jsonb not null default '[]'::jsonb, -- [{item, feito, hora}]
  -- estimado (congelado na criação) × real (registrado na produção)
  tempo_estimado_min  integer not null default 0,
  tempo_real_min      integer,
  material_estimado_g numeric(12,2) not null default 0,
  material_real_g     numeric(12,2),
  custo_estimado      public.centavos not null default 0,
  custo_real          public.centavos,
  iniciado_em         timestamptz,
  concluido_em        timestamptz,
  baixa_executada     boolean not null default false, -- controle do momento da baixa
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  deleted_at          timestamptz,
  unique (tenant_id, numero)
);
call app.politicas_padrao('ordem_producao', 'producao');

create or replace function app.numerar_op()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := app.proximo_numero(new.tenant_id, 'op', 'OP');
  end if;
  return new;
end;
$$;
create trigger numerar_op before insert on public.ordem_producao
  for each row execute function app.numerar_op();

-- registro de falha de produção (modal 08)
create table public.producao_falha (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant (id) on delete cascade,
  ordem_producao_id     uuid not null references public.ordem_producao (id) on delete cascade,
  etapa                 text,
  motivo                text not null,
  material_id           uuid references public.material (id),
  material_desperdicado_g numeric(12,2) not null default 0,
  tempo_perdido_min     integer not null default 0,
  foto_url              text,
  reimprimir            boolean not null default false,
  impacto_custo         public.centavos not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  deleted_at            timestamptz
);
call app.politicas_padrao('producao_falha', 'producao');
