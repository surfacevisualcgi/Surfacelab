-- ============================================================================
-- Surface Labs — 0001 Governança: tenant, usuario, membership, convite
-- Multi-tenant shared schema. RLS em TODA tabela. Dinheiro em centavos.
-- ============================================================================

-- Schema privado para helpers (não exposto pelo PostgREST)
create schema if not exists app;

-- Domínio para valores monetários: inteiro de centavos, nunca float.
create domain public.centavos as bigint;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.papel_membership as enum
  ('dono', 'administrador', 'comercial', 'producao', 'leitura');

create type public.status_convite as enum
  ('pendente', 'aceito', 'recusado', 'expirado', 'cancelado');

create type public.plano_tenant as enum ('gratuito', 'profissional', 'studio');

create type public.status_assinatura as enum
  ('trial', 'ativa', 'past_due', 'cancelada');

-- ----------------------------------------------------------------------------
-- tenant — a empresa/oficina (o "espaço" dos dados)
-- ----------------------------------------------------------------------------
create table public.tenant (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cnpj             text,
  -- i18n: moeda/locale/fuso vivem no tenant, nunca hardcoded
  moeda            text not null default 'BRL',
  locale           text not null default 'pt-BR',
  fuso             text not null default 'America/Sao_Paulo',
  -- plano/assinatura (estado comandado pelo webhook do Stripe; placeholders no MVP)
  plano                  public.plano_tenant not null default 'gratuito',
  status_assinatura      public.status_assinatura not null default 'trial',
  trial_ate              timestamptz,
  current_period_end     timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- configurações operacionais (LOGICA_E_MODELAGEM §7)
  momento_baixa_estoque       text not null default 'fim'
    check (momento_baixa_estoque in ('inicio', 'fim')),
  criterio_rateio_custo_fixo  text not null default 'faturamento'
    check (criterio_rateio_custo_fixo in ('faturamento', 'hora_maquina', 'hora_trabalho', 'pedido')),
  faturamento_mensal_esperado public.centavos not null default 1000000, -- R$ 10.000 placeholder
  -- 3 presets de cenário {nome, probabilidade_falha, margem, provisao} (frações 0–1)
  cenarios_precificacao jsonb not null default '[
    {"nome": "Rápido",      "probabilidade_falha": 0.03, "margem": 0.25, "provisao": 0.02},
    {"nome": "Padrão",      "probabilidade_falha": 0.05, "margem": 0.35, "provisao": 0.03},
    {"nome": "Conservador", "probabilidade_falha": 0.10, "margem": 0.45, "provisao": 0.05}
  ]'::jsonb,
  -- LGPD: encarregado/DPO do tenant (controlador)
  dpo_nome         text,
  dpo_email        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- ----------------------------------------------------------------------------
-- usuario — perfil 1:1 com auth.users (a pessoa, vale em todas as empresas)
-- ----------------------------------------------------------------------------
create table public.usuario (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  nome_exibicao  text,
  telefone       text,
  avatar_url     text,
  avatar_origem  text not null default 'iniciais'
    check (avatar_origem in ('google', 'upload', 'iniciais')),
  preferencias   jsonb not null default '{}'::jsonb, -- idioma, tema, fuso, notificações
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- aceite de Termos + Privacidade, versionado (LGPD)
-- ----------------------------------------------------------------------------
create table public.aceite_termos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuario (id) on delete cascade,
  versao      text not null,
  aceito_em   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- membership — liga usuário ↔ tenant com papel + customizações
-- ----------------------------------------------------------------------------
create table public.membership (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references public.usuario (id) on delete cascade,
  tenant_id         uuid not null references public.tenant (id) on delete cascade,
  papel             public.papel_membership not null default 'leitura',
  -- overrides individuais (2ª etapa expõe na UI; estrutura pronta no banco)
  permissoes_extras jsonb not null default '{}'::jsonb,
  -- override das flags sensíveis por pessoa: {"ver_custos": true, ...}
  flags_sensiveis   jsonb not null default '{}'::jsonb,
  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (usuario_id, tenant_id)
);

create index membership_usuario_idx on public.membership (usuario_id) where ativo;
create index membership_tenant_idx on public.membership (tenant_id) where ativo;

-- ----------------------------------------------------------------------------
-- convite — convite por e-mail para entrar num tenant
-- ----------------------------------------------------------------------------
create table public.convite (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  email       text not null,
  papel       public.papel_membership not null default 'leitura',
  token       uuid not null default gen_random_uuid() unique,
  status      public.status_convite not null default 'pendente',
  expira_em   timestamptz not null default now() + interval '7 days',
  criado_por  uuid references public.usuario (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index convite_tenant_idx on public.convite (tenant_id);

-- ----------------------------------------------------------------------------
-- Permissões: matriz papel × módulo × ação (referência global, fixa no código/seed)
-- ----------------------------------------------------------------------------
create table public.papel_permissao (
  papel   public.papel_membership not null,
  modulo  text not null,
  acao    text not null check (acao in ('ver', 'criar', 'editar', 'excluir', 'aprovar', 'exportar')),
  primary key (papel, modulo, acao)
);

-- Seed da matriz. Módulos: modelos, produtos, calculadora, orcamentos, pedidos,
-- producao, estoque, compras, clientes, fornecedores, financeiro, fiscal,
-- relatorios, configuracoes, usuarios.
insert into public.papel_permissao (papel, modulo, acao)
-- dono e administrador: tudo em todos os módulos
select p.papel, m.modulo, a.acao
from (values ('dono'::public.papel_membership), ('administrador')) as p (papel),
     (values ('modelos'), ('produtos'), ('calculadora'), ('orcamentos'), ('pedidos'),
             ('producao'), ('estoque'), ('compras'), ('clientes'), ('fornecedores'),
             ('financeiro'), ('fiscal'), ('relatorios'), ('configuracoes'), ('usuarios')) as m (modulo),
     (values ('ver'), ('criar'), ('editar'), ('excluir'), ('aprovar'), ('exportar')) as a (acao)
union all
-- comercial/gerente: opera o comercial; sem configurações/usuários; sem exportar
select 'comercial', m.modulo, a.acao
from (values ('modelos'), ('produtos'), ('calculadora'), ('orcamentos'), ('pedidos'),
             ('producao'), ('estoque'), ('compras'), ('clientes'), ('fornecedores'),
             ('relatorios')) as m (modulo),
     (values ('ver'), ('criar'), ('editar'), ('aprovar')) as a (acao)
union all
-- produção: vê o operacional, registra produção/estoque; nada comercial/financeiro
select 'producao', m.modulo, 'ver'
from (values ('modelos'), ('produtos'), ('pedidos'), ('producao'), ('estoque')) as m (modulo)
union all
select 'producao', m.modulo, a.acao
from (values ('producao'), ('estoque')) as m (modulo),
     (values ('criar'), ('editar')) as a (acao)
union all
-- somente leitura: ver tudo que não é sensível por flag
select 'leitura', m.modulo, 'ver'
from (values ('modelos'), ('produtos'), ('calculadora'), ('orcamentos'), ('pedidos'),
             ('producao'), ('estoque'), ('compras'), ('clientes'), ('fornecedores'),
             ('relatorios')) as m (modulo);

-- ============================================================================
-- Helpers de autorização (schema app, security definer, fora do PostgREST)
-- ============================================================================

-- Tenant ativo: claim `tenant_ativo` do app_metadata do JWT, validado contra a
-- membership (NUNCA confiar no payload). Sem claim: se o usuário tem exatamente
-- uma membership ativa, usa ela; senão NULL (força escolher empresa).
create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claim_tenant uuid;
  resultado uuid;
  qtd int;
begin
  begin
    claim_tenant := nullif(
      ((select auth.jwt()) -> 'app_metadata' ->> 'tenant_ativo'), ''
    )::uuid;
  exception when others then
    claim_tenant := null;
  end;

  if claim_tenant is not null then
    select m.tenant_id into resultado
    from public.membership m
    where m.usuario_id = (select auth.uid())
      and m.tenant_id = claim_tenant
      and m.ativo;
    return resultado; -- NULL se não é membro: claim inválido não dá acesso
  end if;

  select count(*), min(m.tenant_id::text)::uuid into qtd, resultado
  from public.membership m
  where m.usuario_id = (select auth.uid()) and m.ativo;

  if qtd = 1 then
    return resultado;
  end if;
  return null;
end;
$$;

-- Papel do usuário no tenant ativo
create or replace function app.papel_atual()
returns public.papel_membership
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
  from public.membership m
  where m.usuario_id = (select auth.uid())
    and m.tenant_id = app.current_tenant_id()
    and m.ativo
$$;

-- Permissão por módulo × ação: preset do papel + permissoes_extras da membership
create or replace function app.tem_permissao(p_modulo text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    where m.usuario_id = (select auth.uid())
      and m.tenant_id = app.current_tenant_id()
      and m.ativo
      and (
        exists (
          select 1 from public.papel_permissao pp
          where pp.papel = m.papel and pp.modulo = p_modulo and pp.acao = p_acao
        )
        or coalesce((m.permissoes_extras -> p_modulo ->> p_acao)::boolean, false)
      )
  )
$$;

-- Flags de dados sensíveis: default por papel, com override por membership.
-- Flags: ver_custos, ver_financeiro, ver_prolabore, ver_pii_cliente, exportar.
create or replace function app.tem_flag(p_flag text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m record;
  padrao boolean;
begin
  select papel, flags_sensiveis into m
  from public.membership
  where usuario_id = (select auth.uid())
    and tenant_id = app.current_tenant_id()
    and ativo;

  if not found then
    return false;
  end if;

  -- override explícito por pessoa vence o default do papel
  if m.flags_sensiveis ? p_flag then
    return (m.flags_sensiveis ->> p_flag)::boolean;
  end if;

  padrao := case m.papel
    when 'dono' then true
    when 'administrador' then p_flag <> 'ver_prolabore' -- pró-labore: só Dono
    when 'comercial' then p_flag in ('ver_custos', 'ver_pii_cliente')
    else false -- producao, leitura: nenhum dado sensível
  end;
  return padrao;
end;
$$;

-- É dono ou admin do tenant ativo? (atalho usado em políticas de governança)
create or replace function app.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.papel_atual() in ('dono', 'administrador')
$$;

-- ============================================================================
-- Trigger de signup: cria public.usuario + registra aceite de termos
-- (NÃO cria tenant aqui: convidado entra em tenant existente; o onboarding
--  chama public.criar_tenant() para quem está abrindo a própria empresa.)
-- ============================================================================
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuario (id, email, nome_exibicao, avatar_url, avatar_origem)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'nome_exibicao',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    case when new.raw_user_meta_data ? 'avatar_url' then 'google' else 'iniciais' end
  )
  on conflict (id) do nothing;

  if new.raw_user_meta_data ? 'termos_versao' then
    insert into public.aceite_termos (usuario_id, versao)
    values (new.id, new.raw_user_meta_data ->> 'termos_versao');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ============================================================================
-- RPCs de onboarding/empresa (security definer; expostos via PostgREST)
-- ============================================================================

-- Cria a empresa do usuário logado e o torna Dono; ativa o claim de tenant.
create or replace function public.criar_tenant(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome da empresa é obrigatório';
  end if;

  insert into public.tenant (nome, trial_ate)
  values (trim(p_nome), now() + interval '14 days') -- trial do Profissional (duração placeholder)
  returning id into v_tenant;

  -- trial começa no Profissional (decisão: trial do plano pago no signup)
  update public.tenant
    set plano = 'profissional', status_assinatura = 'trial'
    where id = v_tenant;

  insert into public.membership (usuario_id, tenant_id, papel)
  values (v_uid, v_tenant, 'dono');

  -- grava o claim de tenant ativo no app_metadata (entra no próximo JWT)
  update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_ativo', v_tenant)
    where id = v_uid;

  return v_tenant;
end;
$$;

-- Troca a empresa ativa (valida membership; cliente deve renovar a sessão)
create or replace function public.trocar_tenant(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.membership
    where usuario_id = v_uid and tenant_id = p_tenant and ativo
  ) then
    raise exception 'você não é membro desta empresa';
  end if;

  update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_ativo', p_tenant)
    where id = v_uid;
end;
$$;

-- Aceita um convite pendente (e-mail do convite deve bater com o do usuário)
create or replace function public.aceitar_convite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_convite record;
begin
  select * into v_convite
  from public.convite
  where token = p_token and status = 'pendente'
  for update;

  if not found then
    raise exception 'convite não encontrado ou já utilizado';
  end if;
  if v_convite.expira_em < now() then
    update public.convite set status = 'expirado', updated_at = now()
      where id = v_convite.id;
    raise exception 'convite expirado';
  end if;
  if lower(v_convite.email) <> lower((select email from public.usuario where id = v_uid)) then
    raise exception 'este convite foi enviado para outro e-mail';
  end if;

  insert into public.membership (usuario_id, tenant_id, papel)
  values (v_uid, v_convite.tenant_id, v_convite.papel)
  on conflict (usuario_id, tenant_id)
    do update set ativo = true, papel = excluded.papel, updated_at = now();

  update public.convite set status = 'aceito', updated_at = now()
    where id = v_convite.id;

  -- já ativa a empresa recém-entrada
  update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_ativo', v_convite.tenant_id)
    where id = v_uid;

  return v_convite.tenant_id;
end;
$$;

-- ============================================================================
-- updated_at automático
-- ============================================================================
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.tenant
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.usuario
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.membership
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.convite
  for each row execute function app.set_updated_at();

-- ============================================================================
-- RLS — ativa em TODA tabela, sem exceção
-- ============================================================================
alter table public.tenant         enable row level security;
alter table public.usuario        enable row level security;
alter table public.aceite_termos  enable row level security;
alter table public.membership     enable row level security;
alter table public.convite        enable row level security;
alter table public.papel_permissao enable row level security;

-- tenant: membros leem; só Dono/Admin editam; ninguém insere direto (RPC criar_tenant)
create policy tenant_select on public.tenant for select
  using (id = app.current_tenant_id()
         or id in (select m.tenant_id from public.membership m
                   where m.usuario_id = (select auth.uid()) and m.ativo));
create policy tenant_update on public.tenant for update
  using (id = app.current_tenant_id() and app.eh_admin())
  with check (id = app.current_tenant_id() and app.eh_admin());

-- usuario: cada um vê/edita o próprio perfil; colegas de tenant veem o básico
create policy usuario_select_proprio on public.usuario for select
  using (id = (select auth.uid())
         or id in (select m.usuario_id from public.membership m
                   where m.tenant_id = app.current_tenant_id() and m.ativo));
create policy usuario_update_proprio on public.usuario for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- aceite_termos: o próprio usuário lê e registra os seus aceites
create policy aceite_select on public.aceite_termos for select
  using (usuario_id = (select auth.uid()));
create policy aceite_insert on public.aceite_termos for insert
  with check (usuario_id = (select auth.uid()));

-- membership: ver as próprias + as do tenant ativo; gerir = Dono/Admin
create policy membership_select on public.membership for select
  using (usuario_id = (select auth.uid())
         or tenant_id = app.current_tenant_id());
create policy membership_update on public.membership for update
  using (tenant_id = app.current_tenant_id() and app.eh_admin())
  with check (tenant_id = app.current_tenant_id() and app.eh_admin());
create policy membership_delete on public.membership for delete
  using (tenant_id = app.current_tenant_id() and app.eh_admin()
         and usuario_id <> (select auth.uid())); -- ninguém remove a si mesmo por engano
-- insert de membership só via RPCs security definer (criar_tenant/aceitar_convite)

-- convite: Dono/Admin do tenant gerencia
create policy convite_select on public.convite for select
  using (tenant_id = app.current_tenant_id() and app.eh_admin());
create policy convite_insert on public.convite for insert
  with check (tenant_id = app.current_tenant_id() and app.eh_admin());
create policy convite_update on public.convite for update
  using (tenant_id = app.current_tenant_id() and app.eh_admin())
  with check (tenant_id = app.current_tenant_id() and app.eh_admin());

-- papel_permissao: referência global, somente leitura para autenticados
create policy papel_permissao_select on public.papel_permissao for select
  to authenticated using (true);

-- Permissões de execução das RPCs
revoke all on function public.criar_tenant(text) from public, anon;
grant execute on function public.criar_tenant(text) to authenticated;
revoke all on function public.trocar_tenant(uuid) from public, anon;
grant execute on function public.trocar_tenant(uuid) to authenticated;
revoke all on function public.aceitar_convite(uuid) from public, anon;
grant execute on function public.aceitar_convite(uuid) to authenticated;
