-- ============================================================================
-- Surface Labs — 0002 Planos/entitlements + cadastros de apoio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Entitlements: limites por plano (null = ilimitado). Números são placeholders
-- configuráveis (pendência registrada) — a ESTRUTURA é o que importa no MVP.
-- ----------------------------------------------------------------------------
create table public.plano_limite (
  plano    public.plano_tenant not null,
  recurso  text not null,
  limite   integer, -- null = ilimitado
  primary key (plano, recurso)
);

insert into public.plano_limite (plano, recurso, limite) values
  ('gratuito',     'usuarios',     1),
  ('gratuito',     'modelos',      15),
  ('gratuito',     'produtos',     10),
  ('gratuito',     'pedidos_mes',  20),
  ('gratuito',     'impressoras',  1),
  ('gratuito',     'storage_mb',   512),
  ('profissional', 'usuarios',     3),
  ('profissional', 'modelos',      null),
  ('profissional', 'produtos',     null),
  ('profissional', 'pedidos_mes',  null),
  ('profissional', 'impressoras',  5),
  ('profissional', 'storage_mb',   5120),
  ('studio',       'usuarios',     10),
  ('studio',       'modelos',      null),
  ('studio',       'produtos',     null),
  ('studio',       'pedidos_mes',  null),
  ('studio',       'impressoras',  null),
  ('studio',       'storage_mb',   20480);

alter table public.plano_limite enable row level security;
create policy plano_limite_select on public.plano_limite for select
  to authenticated using (true);

-- Plano efetivo do tenant: cancelada/expirada degrada para gratuito (soft cap —
-- nada é apagado; excedente fica só-leitura porque o INSERT é barrado).
create or replace function app.plano_efetivo(p_tenant uuid)
returns public.plano_tenant
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.status_assinatura = 'cancelada' then 'gratuito'::public.plano_tenant
    when t.status_assinatura = 'trial' and t.trial_ate is not null and t.trial_ate < now()
      then 'gratuito'::public.plano_tenant
    else t.plano
  end
  from public.tenant t where t.id = p_tenant
$$;

-- Checagem de limite SEMPRE no backend (usada nas políticas de INSERT).
create or replace function app.dentro_do_limite(p_recurso text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_limite integer;
  v_atual bigint;
begin
  if v_tenant is null then
    return false;
  end if;

  select limite into v_limite
  from public.plano_limite
  where plano = app.plano_efetivo(v_tenant) and recurso = p_recurso;

  if not found or v_limite is null then
    return true; -- sem linha ou null = ilimitado
  end if;

  v_atual := case p_recurso
    when 'usuarios' then
      (select count(*) from public.membership where tenant_id = v_tenant and ativo)
    when 'modelos' then
      (select count(*) from public.modelo_3d where tenant_id = v_tenant and deleted_at is null)
    when 'produtos' then
      (select count(*) from public.produto where tenant_id = v_tenant and deleted_at is null)
    when 'impressoras' then
      (select count(*) from public.impressora where tenant_id = v_tenant and deleted_at is null)
    when 'pedidos_mes' then
      (select count(*) from public.pedido where tenant_id = v_tenant
        and created_at >= date_trunc('month', now()))
    else 0
  end;

  return v_atual < v_limite;
end;
$$;

-- Convites também contam para o limite de usuários
create policy convite_limite on public.convite as restrictive for insert
  with check (app.dentro_do_limite('usuarios'));

-- ----------------------------------------------------------------------------
-- Gerador de políticas-padrão por tenant+módulo (mantém as migrations enxutas
-- e o padrão consistente: ver/criar/editar/excluir mapeados em RLS).
-- ----------------------------------------------------------------------------
create or replace procedure app.politicas_padrao(p_tabela text, p_modulo text)
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format(
    'create policy %I on public.%I for select using '
    || '(tenant_id = app.current_tenant_id() and app.tem_permissao(%L, ''ver''))',
    p_tabela || '_select', p_tabela, p_modulo);
  execute format(
    'create policy %I on public.%I for insert with check '
    || '(tenant_id = app.current_tenant_id() and app.tem_permissao(%L, ''criar''))',
    p_tabela || '_insert', p_tabela, p_modulo);
  execute format(
    'create policy %I on public.%I for update using '
    || '(tenant_id = app.current_tenant_id() and app.tem_permissao(%L, ''editar'')) '
    || 'with check (tenant_id = app.current_tenant_id() and app.tem_permissao(%L, ''editar''))',
    p_tabela || '_update', p_tabela, p_modulo, p_modulo);
  execute format(
    'create policy %I on public.%I for delete using '
    || '(tenant_id = app.current_tenant_id() and app.tem_permissao(%L, ''excluir''))',
    p_tabela || '_delete', p_tabela, p_modulo);
  execute format(
    'create trigger set_updated_at before update on public.%I '
    || 'for each row execute function app.set_updated_at()', p_tabela);
  execute format('create index %I on public.%I (tenant_id)',
    p_tabela || '_tenant_idx', p_tabela);
end;
$$;

-- ----------------------------------------------------------------------------
-- Numeração sequencial por tenant (ORC-0001, PED-0001, OP-0001, PC-0001)
-- ----------------------------------------------------------------------------
create table public.contador (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  tipo      text not null,
  valor     integer not null default 0,
  primary key (tenant_id, tipo)
);
alter table public.contador enable row level security;
-- sem políticas: só funções security definer mexem aqui

create or replace function app.proximo_numero(p_tenant uuid, p_tipo text, p_prefixo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  insert into public.contador (tenant_id, tipo, valor)
  values (p_tenant, p_tipo, 1)
  on conflict (tenant_id, tipo) do update set valor = public.contador.valor + 1
  returning valor into v;
  return p_prefixo || '-' || lpad(v::text, 4, '0');
end;
$$;

-- ============================================================================
-- Cadastros de apoio
-- ============================================================================

create type public.tecnologia_impressao as enum ('fdm', 'resina');
create type public.tipo_material as enum
  ('filamento', 'resina', 'componente', 'consumivel', 'embalagem');

-- categorias livres (de modelo, produto ou material)
create table public.categoria (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete cascade,
  nome       text not null,
  escopo     text not null check (escopo in ('modelo', 'produto', 'material')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);
call app.politicas_padrao('categoria', 'configuracoes');

-- perfil de energia (tarifa por kWh)
create table public.perfil_energia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  nome        text not null,
  tarifa_kwh  public.centavos not null default 0, -- centavos por kWh
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  deleted_at  timestamptz
);
call app.politicas_padrao('perfil_energia', 'configuracoes');

-- impressoras
create table public.impressora (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete cascade,
  nome              text not null,
  tecnologia        public.tecnologia_impressao not null default 'fdm',
  fabricante        text,
  modelo            text,
  numero_serie      text,
  foto_url          text,
  status            text not null default 'ativa'
    check (status in ('ativa', 'manutencao', 'inativa')),
  valor_aquisicao   public.centavos not null default 0,
  vida_util_horas   numeric(10,1) not null default 5000,
  data_aquisicao    date,
  consumo_w         numeric(8,1) not null default 0,   -- potência média em watts
  perfil_energia_id uuid references public.perfil_energia (id),
  -- reserva de manutenção por hora de uso (centavos/h)
  manutencao_hora   public.centavos not null default 0,
  horas_acumuladas  numeric(10,1) not null default 0,
  proxima_manutencao date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  deleted_at        timestamptz
);
call app.politicas_padrao('impressora', 'configuracoes');
-- limite de plano para impressoras
create policy impressora_limite on public.impressora as restrictive for insert
  with check (app.dentro_do_limite('impressoras'));

create table public.impressora_manutencao (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant (id) on delete cascade,
  impressora_id uuid not null references public.impressora (id) on delete cascade,
  data          date not null default current_date,
  tipo          text not null default 'preventiva'
    check (tipo in ('preventiva', 'corretiva', 'calibracao')),
  custo         public.centavos not null default 0,
  observacao    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  deleted_at    timestamptz
);
call app.politicas_padrao('impressora_manutencao', 'configuracoes');

-- fornecedores
create table public.fornecedor (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenant (id) on delete cascade,
  nome                text not null,
  cnpj                text,
  categorias          text[] not null default '{}',
  contato_nome        text,
  contato_email       text,
  contato_telefone    text,
  prazo_entrega_dias  integer,
  pedido_minimo       public.centavos,
  condicoes_pagamento text,
  avaliacao           smallint check (avaliacao between 1 and 5),
  observacoes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  deleted_at          timestamptz
);
call app.politicas_padrao('fornecedor', 'fornecedores');

-- materiais / insumos (filamento, resina, componente, consumível, embalagem)
create table public.material (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete cascade,
  nome              text not null,
  tipo              public.tipo_material not null,
  marca             text,
  cor               text,
  categoria_id      uuid references public.categoria (id),
  fornecedor_id     uuid references public.fornecedor (id),
  -- unidade de compra vs. consumo + conversão (obrigatória)
  unidade_compra    text not null default 'kg',   -- ex.: kg, L, pacote, un
  unidade_consumo   text not null default 'g',    -- ex.: g, ml, un
  fator_conversao   numeric(12,4) not null default 1000 check (fator_conversao > 0),
  -- custo da última compra (centavos na unidade de compra)
  preco_compra      public.centavos not null default 0,
  frete             public.centavos not null default 0,
  -- custo por unidade de CONSUMO (centavos, fração permitida) — ex.: 7,6¢/g
  custo_unitario    numeric(16,6) generated always as
    ((preco_compra + frete)::numeric / fator_conversao) stored,
  -- estoque (caches do ledger de movimentações — ver migration de estoque)
  saldo             numeric(14,4) not null default 0,  -- na unidade de consumo
  reservado         numeric(14,4) not null default 0,
  minimo            numeric(14,4) not null default 0,
  custo_medio       numeric(16,6) not null default 0,  -- centavos/unidade consumo (méd. ponderada)
  ultimo_custo      numeric(16,6) not null default 0,
  valor_estoque     public.centavos not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  deleted_at        timestamptz
);
call app.politicas_padrao('material', 'estoque');

-- clientes — PII sob LGPD/masking (leitura mascarada via view v_cliente; a
-- tabela crua exige a flag ver_pii_cliente — ver migration de LGPD)
create table public.cliente (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenant (id) on delete cascade,
  tipo               text not null default 'pf' check (tipo in ('pf', 'pj')),
  nome               text not null,
  cpf_cnpj           text,             -- OPCIONAL por padrão (minimização LGPD)
  email              text,
  telefone_whatsapp  text,
  cep                text,
  endereco           text,
  cidade             text,
  estado             text,
  canal_origem       text,
  indicacao          text,
  observacoes        text,
  -- consentimento de marketing: revogável, com data e versão (LGPD)
  consentimento_marketing boolean not null default false,
  consentimento_em        timestamptz,
  consentimento_versao    text,
  anonimizado        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  deleted_at         timestamptz
);
call app.politicas_padrao('cliente', 'clientes');
-- SELECT cru só com a flag de PII (a view mascarada atende os demais)
drop policy cliente_select on public.cliente;
create policy cliente_select on public.cliente for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('clientes', 'ver')
         and app.tem_flag('ver_pii_cliente'));

-- canais de venda e suas taxas (frações 0–1)
create table public.canal_venda (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant (id) on delete cascade,
  nome             text not null,
  taxa_marketplace numeric(6,4) not null default 0 check (taxa_marketplace between 0 and 1),
  taxa_pagamento   numeric(6,4) not null default 0 check (taxa_pagamento between 0 and 1),
  comissao         numeric(6,4) not null default 0 check (comissao between 0 and 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  deleted_at       timestamptz
);
call app.politicas_padrao('canal_venda', 'configuracoes');

-- custos fixos mensais (rateio conforme config do tenant)
create table public.custo_fixo (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  nome         text not null,
  valor_mensal public.centavos not null default 0,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  deleted_at   timestamptz
);
call app.politicas_padrao('custo_fixo', 'configuracoes');

-- tarefas de mão de obra (valor/hora)
create table public.tarefa_mao_obra (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant (id) on delete cascade,
  nome       text not null,
  valor_hora public.centavos not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);
call app.politicas_padrao('tarefa_mao_obra', 'configuracoes');

-- empresa (dados fiscais do tenant — simulação, não emite NF)
create table public.empresa (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant (id) on delete cascade,
  razao_social      text,
  nome_fantasia     text,
  cnpj              text,
  inscricoes        jsonb not null default '{}'::jsonb,
  regime_tributario text, -- MEI, Simples, etc. — validar com contador
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  deleted_at        timestamptz
);
call app.politicas_padrao('empresa', 'fiscal');

-- perfis fiscais (alíquota efetiva configurável, com vigência/histórico)
create table public.perfil_fiscal (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant (id) on delete cascade,
  nome             text not null,
  tipo             text not null default 'produto'
    check (tipo in ('produto', 'servico', 'misto')),
  aliquota_efetiva numeric(6,4) not null default 0 check (aliquota_efetiva between 0 and 1),
  vigente_desde    date not null default current_date,
  vigente_ate      date,
  campos           jsonb not null default '{}'::jsonb, -- ncm, cest, cfop, cst/csosn, origem
  padrao           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  deleted_at       timestamptz
);
call app.politicas_padrao('perfil_fiscal', 'fiscal');
