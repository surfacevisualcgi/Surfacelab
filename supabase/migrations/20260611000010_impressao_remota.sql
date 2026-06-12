-- ============================================================================
-- Surface Labs — 0010 Impressão remota via AGENTE LOCAL
-- O SaaS não fala direto com a impressora (rede local). Um agente instalado
-- na rede do usuário autentica com um TOKEN, faz "claim" dos trabalhos da
-- fila, baixa o G-code por URL assinada e reporta status. Aqui ficam:
-- · agente_impressao (token guardado só como HASH)
-- · arquivo_gcode (G-code fatiado, por modelo; bucket arquivos-modelos)
-- · trabalho_impressao (fila → enviado → imprimindo → concluido/falha)
-- · colunas de vínculo/saúde do agente em `impressora`
-- Guarda-corpos: RLS por tenant em tudo; segredo (token) nunca em claro no
-- banco; o agente NÃO usa RLS — fala por Edge Function service_role escopada
-- ao tenant que o token resolve (menor privilégio).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- agente_impressao — uma instalação do programinha na rede do usuário
-- ----------------------------------------------------------------------------
create table public.agente_impressao (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant (id) on delete cascade,
  nome            text not null,
  token_hash      text not null unique,           -- sha256 do token (nunca o token)
  status          text not null default 'aguardando'
    check (status in ('aguardando', 'online', 'offline')),
  ultimo_contato  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  deleted_at      timestamptz
);
call app.politicas_padrao('agente_impressao', 'configuracoes');

-- vínculo da impressora ao agente + saúde da conexão
alter table public.impressora
  add column agente_id uuid references public.agente_impressao (id) on delete set null,
  add column status_conexao text not null default 'desconectada'
    check (status_conexao in ('desconectada', 'pronta', 'imprimindo', 'erro'));

-- ----------------------------------------------------------------------------
-- arquivo_gcode — G-code fatiado de um modelo (pronto para imprimir).
-- Mídia no bucket privado `arquivos-modelos` (RLS por tenant já existe).
-- ----------------------------------------------------------------------------
create table public.arquivo_gcode (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant (id) on delete cascade,
  modelo_id        uuid not null references public.modelo_3d (id) on delete cascade,
  nome             text not null,
  path             text not null,                 -- {tenant}/gcode/{modelo}/{uuid}-{nome}.gcode
  impressora_id    uuid references public.impressora (id),  -- compatível/recomendada
  cor              text,
  peso_g           numeric(10,2),
  tempo_min        integer,
  tamanho_bytes    bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  deleted_at       timestamptz
);
call app.politicas_padrao('arquivo_gcode', 'modelos');
create index arquivo_gcode_modelo_idx on public.arquivo_gcode (modelo_id);

-- ----------------------------------------------------------------------------
-- trabalho_impressao — a fila. Nasce 'fila'; o agente puxa e atualiza.
-- ----------------------------------------------------------------------------
create table public.trabalho_impressao (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenant (id) on delete cascade,
  numero             text not null,
  gcode_id           uuid references public.arquivo_gcode (id),
  modelo_id          uuid references public.modelo_3d (id),
  impressora_id      uuid references public.impressora (id),
  agente_id          uuid references public.agente_impressao (id),
  pedido_id          uuid references public.pedido (id),
  ordem_producao_id  uuid references public.ordem_producao (id),
  status             text not null default 'fila'
    check (status in ('fila', 'enviado', 'imprimindo', 'pausado', 'concluido', 'falha', 'cancelado')),
  progresso_pct      numeric(5,2) not null default 0,
  mensagem           text,
  enfileirado_em     timestamptz not null default now(),
  iniciado_em        timestamptz,
  concluido_em       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  deleted_at         timestamptz,
  unique (tenant_id, numero)
);
call app.politicas_padrao('trabalho_impressao', 'producao');
create index trabalho_impressao_fila_idx
  on public.trabalho_impressao (agente_id, status) where deleted_at is null;

create or replace function app.numerar_impressao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := app.proximo_numero(new.tenant_id, 'impressao', 'IMP');
  end if;
  return new;
end;
$$;
create trigger numerar_impressao before insert on public.trabalho_impressao
  for each row execute function app.numerar_impressao();

-- ============================================================================
-- RPCs (UI)
-- ============================================================================

-- Gera o token do agente: retornado UMA vez em claro; só o hash fica no banco.
create or replace function public.gerar_token_agente(p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_token text;
begin
  if not app.tem_permissao('configuracoes', 'criar') then
    raise exception 'sem permissão para criar agente de impressão';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'dê um nome ao agente (ex.: PC da oficina)';
  end if;

  v_token := 'sl_agent_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.agente_impressao (tenant_id, nome, token_hash)
  values (v_tenant, trim(p_nome),
          encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return v_token;  -- mostrar uma vez; não há como recuperar depois
end;
$$;
revoke all on function public.gerar_token_agente(text) from public, anon;
grant execute on function public.gerar_token_agente(text) to authenticated;

-- Enfileira uma impressão. Opcionalmente vincula a uma OP e a avança para
-- "imprimindo" (decisão do usuário: "manda imprimir e avança o card").
create or replace function public.enfileirar_impressao(
  p_gcode uuid,
  p_impressora uuid default null,
  p_ordem_producao uuid default null,
  p_avancar boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_gcode record;
  v_impressora uuid;
  v_agente uuid;
  v_pedido uuid;
  v_trab uuid;
begin
  if not app.tem_permissao('producao', 'editar') then
    raise exception 'sem permissão para enviar impressões';
  end if;

  select * into v_gcode from public.arquivo_gcode
  where id = p_gcode and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'G-code não encontrado';
  end if;

  v_impressora := coalesce(p_impressora, v_gcode.impressora_id);
  if v_impressora is null then
    raise exception 'escolha a impressora para este trabalho';
  end if;
  select agente_id into v_agente from public.impressora where id = v_impressora;

  if p_ordem_producao is not null then
    select pedido_id into v_pedido from public.ordem_producao where id = p_ordem_producao;
  end if;

  insert into public.trabalho_impressao
    (tenant_id, numero, gcode_id, modelo_id, impressora_id, agente_id,
     pedido_id, ordem_producao_id, created_by)
  values
    (v_tenant, '', p_gcode, v_gcode.modelo_id, v_impressora, v_agente,
     v_pedido, p_ordem_producao, (select auth.uid()))
  returning id into v_trab;

  if p_avancar and p_ordem_producao is not null then
    perform public.mover_ordem_producao(p_ordem_producao, 'imprimindo');
  end if;

  return v_trab;
end;
$$;
revoke all on function public.enfileirar_impressao(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.enfileirar_impressao(uuid, uuid, uuid, boolean) to authenticated;

-- Cancelar um trabalho na fila (usuário)
create or replace function public.cancelar_impressao(p_trabalho uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tem_permissao('producao', 'editar') then
    raise exception 'sem permissão';
  end if;
  update public.trabalho_impressao
    set status = 'cancelado', updated_at = now()
    where id = p_trabalho and tenant_id = app.current_tenant_id()
      and status in ('fila', 'enviado', 'pausado');
end;
$$;
revoke all on function public.cancelar_impressao(uuid) from public, anon;
grant execute on function public.cancelar_impressao(uuid) to authenticated;
-- (o trigger set_updated_at de trabalho_impressao já é criado por app.politicas_padrao)
