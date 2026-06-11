-- ============================================================================
-- Surface Labs — 0007 LGPD (auditoria, compartilhamento, anonimização),
-- masking de dados sensíveis (views) e Storage com RLS por tenant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- log_auditoria — quem criou/alterou/visualizou PII e ações sensíveis
-- ----------------------------------------------------------------------------
create table public.log_auditoria (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant (id) on delete cascade,
  usuario_id  uuid,
  acao        text not null, -- criar | editar | excluir | visualizar_pii | anonimizar | exportar
  entidade    text not null,
  entidade_id uuid,
  detalhes    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.log_auditoria enable row level security;
create policy auditoria_select on public.log_auditoria for select
  using (tenant_id = app.current_tenant_id() and app.eh_admin());
-- escrita só via funções security definer
create index auditoria_tenant_idx on public.log_auditoria (tenant_id, created_at);

create or replace function app.auditar(
  p_acao text, p_entidade text, p_entidade_id uuid, p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.log_auditoria (tenant_id, usuario_id, acao, entidade, entidade_id, detalhes)
  values (app.current_tenant_id(), (select auth.uid()), p_acao, p_entidade, p_entidade_id, p_detalhes);
exception when others then
  null; -- auditoria nunca derruba a operação principal
end;
$$;

-- trigger de auditoria nas alterações de cliente (PII)
create or replace function app.auditar_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.auditar(lower(tg_op), 'cliente', coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;
create trigger auditar_cliente after insert or update or delete on public.cliente
  for each row execute function app.auditar_cliente();

-- registro de visualização de PII (chamado pela ficha do cliente no front)
create or replace function public.registrar_acesso_pii(p_entidade text, p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.auditar('visualizar_pii', p_entidade, p_id);
$$;
revoke all on function public.registrar_acesso_pii(text, uuid) from public, anon;
grant execute on function public.registrar_acesso_pii(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- registro_compartilhamento — terceiros para quem dados saem (LGPD)
-- ----------------------------------------------------------------------------
create table public.registro_compartilhamento (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant (id) on delete cascade,
  destinatario text not null, -- contador, marketplace, gateway, transportadora…
  finalidade   text not null,
  dados        text not null, -- descrição dos dados compartilhados
  base_legal   text not null default 'execucao_de_contrato',
  cliente_id   uuid references public.cliente (id),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);
alter table public.registro_compartilhamento enable row level security;
create policy compartilhamento_select on public.registro_compartilhamento for select
  using (tenant_id = app.current_tenant_id() and app.eh_admin());
create policy compartilhamento_insert on public.registro_compartilhamento for insert
  with check (tenant_id = app.current_tenant_id() and app.tem_flag('exportar'));

-- ----------------------------------------------------------------------------
-- Anonimização (direito de eliminação) — PRESERVA o registro fiscal/financeiro.
-- Mascara PII no cadastro E nos snapshots; valores e números fiscais intactos.
-- ----------------------------------------------------------------------------
create or replace function public.anonimizar_cliente(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente record;
begin
  if not (app.tem_permissao('clientes', 'excluir') and app.tem_flag('ver_pii_cliente')) then
    raise exception 'sem permissão para anonimizar clientes';
  end if;

  select * into v_cliente from public.cliente
  where id = p_cliente and tenant_id = app.current_tenant_id()
  for update;
  if not found then
    raise exception 'cliente não encontrado';
  end if;

  update public.cliente set
    nome = 'Cliente anonimizado',
    cpf_cnpj = null, email = null, telefone_whatsapp = null,
    cep = null, endereco = null, cidade = null, estado = null,
    canal_origem = null, indicacao = null, observacoes = null,
    consentimento_marketing = false,
    anonimizado = true,
    deleted_at = now(),
    updated_at = now()
  where id = p_cliente;

  -- snapshots de orçamento/pedido: mascara o nome preservando valores (a flag
  -- de sessão libera a passagem pelo trigger de imutabilidade)
  perform set_config('app.anonimizando', 'on', true);
  update public.orcamento
    set cliente_snapshot = jsonb_build_object('nome', 'Cliente anonimizado', 'anonimizado', true)
    where cliente_id = p_cliente and tenant_id = app.current_tenant_id();
  update public.pedido
    set cliente_snapshot = jsonb_build_object('nome', 'Cliente anonimizado', 'anonimizado', true)
    where cliente_id = p_cliente and tenant_id = app.current_tenant_id();
  perform set_config('app.anonimizando', '', true);

  perform app.auditar('anonimizar', 'cliente', p_cliente);
end;
$$;
revoke all on function public.anonimizar_cliente(uuid) from public, anon;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;

-- o trigger de imutabilidade do orçamento respeita a anonimização LGPD
create or replace function app.proteger_orcamento()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.anonimizando', true), '') = 'on' then
    return new;
  end if;
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

-- exportação dos dados de um cliente (acesso + portabilidade LGPD)
create or replace function public.exportar_dados_cliente(p_cliente uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if not (app.tem_flag('exportar') and app.tem_flag('ver_pii_cliente')) then
    raise exception 'sem permissão para exportar dados de clientes';
  end if;

  select jsonb_build_object(
    'cliente', to_jsonb(c) - 'tenant_id',
    'orcamentos', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', o.numero, 'status', o.status, 'total', o.total,
        'created_at', o.created_at))
      from public.orcamento o where o.cliente_id = c.id), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', p.numero, 'status', p.status, 'total', p.total,
        'created_at', p.created_at))
      from public.pedido p where p.cliente_id = c.id), '[]'::jsonb),
    'exportado_em', now()
  ) into resultado
  from public.cliente c
  where c.id = p_cliente and c.tenant_id = app.current_tenant_id();

  if resultado is null then
    raise exception 'cliente não encontrado';
  end if;

  perform app.auditar('exportar', 'cliente', p_cliente);
  insert into public.registro_compartilhamento
    (tenant_id, destinatario, finalidade, dados, base_legal, cliente_id, created_by)
  values
    (app.current_tenant_id(), 'titular/exportação', 'direito de acesso e portabilidade (LGPD)',
     'cadastro + histórico de orçamentos e pedidos', 'obrigacao_legal', p_cliente,
     (select auth.uid()));

  return resultado;
end;
$$;
revoke all on function public.exportar_dados_cliente(uuid) from public, anon;
grant execute on function public.exportar_dados_cliente(uuid) to authenticated;

-- ============================================================================
-- MASKING — RLS é por linha; coluna sensível sai por VIEW mascarada.
-- Padrão: o front LÊ as views v_* e ESCREVE nas tabelas base. As tabelas com
-- coluna sensível exigem a flag no SELECT cru; a view entrega a versão segura.
-- Views são security definer COM filtro próprio de tenant + permissão.
-- ============================================================================

-- cliente: PII mascarada sem a flag ver_pii_cliente
create view public.v_cliente
with (security_invoker = false, security_barrier = true) as
select
  c.id, c.tenant_id, c.tipo, c.nome,
  case when app.tem_flag('ver_pii_cliente') then c.cpf_cnpj end as cpf_cnpj,
  case when app.tem_flag('ver_pii_cliente') then c.email end as email,
  case when app.tem_flag('ver_pii_cliente') then c.telefone_whatsapp end as telefone_whatsapp,
  case when app.tem_flag('ver_pii_cliente') then c.cep end as cep,
  case when app.tem_flag('ver_pii_cliente') then c.endereco end as endereco,
  c.cidade, c.estado, c.canal_origem, c.indicacao,
  case when app.tem_flag('ver_pii_cliente') then c.observacoes end as observacoes,
  c.consentimento_marketing, c.consentimento_em, c.consentimento_versao,
  c.anonimizado, c.created_at, c.updated_at, c.deleted_at,
  app.tem_flag('ver_pii_cliente') as pii_visivel
from public.cliente c
where c.tenant_id = app.current_tenant_id()
  and app.tem_permissao('clientes', 'ver');

-- produto: custos/margens mascarados sem ver_custos
create view public.v_produto
with (security_invoker = false, security_barrier = true) as
select
  p.id, p.tenant_id, p.sku, p.nome, p.categoria_id, p.descricao, p.tags, p.fotos,
  p.dimensoes, p.peso_g, p.status, p.disponibilidade,
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

-- orcamento: resumo interno (custo/margem/lucro/cálculo) mascarado sem ver_custos
create view public.v_orcamento
with (security_invoker = false, security_barrier = true) as
select
  o.id, o.tenant_id, o.numero, o.status, o.versao, o.cliente_id,
  case when app.tem_flag('ver_pii_cliente') then o.cliente_snapshot
       else jsonb_build_object('nome', o.cliente_snapshot ->> 'nome') end as cliente_snapshot,
  o.empresa_snapshot, o.canal_id, o.simulacao_id, o.validade, o.prazo_entrega,
  o.condicoes_pagamento, o.frete, o.desconto, o.total,
  case when app.tem_flag('ver_custos') then o.custo_total end as custo_total,
  case when app.tem_flag('ver_custos') then o.lucro_estimado end as lucro_estimado,
  case when app.tem_flag('ver_custos') then o.margem_estimada end as margem_estimada,
  case when app.tem_flag('ver_custos') then o.calculo_snapshot end as calculo_snapshot,
  o.versao_motor, o.observacoes, o.anexos, o.aceite_cliente,
  o.aprovado_em, o.enviado_em, o.created_at, o.updated_at, o.created_by, o.deleted_at
from public.orcamento o
where o.tenant_id = app.current_tenant_id()
  and app.tem_permissao('orcamentos', 'ver');

create view public.v_orcamento_item
with (security_invoker = false, security_barrier = true) as
select
  i.id, i.tenant_id, i.orcamento_id, i.produto_id, i.descricao, i.quantidade,
  i.valor_unit, i.valor_total,
  case when app.tem_flag('ver_custos') then i.custo_unit end as custo_unit,
  i.ordem, i.created_at, i.deleted_at
from public.orcamento_item i
where i.tenant_id = app.current_tenant_id()
  and app.tem_permissao('orcamentos', 'ver');

-- pedido: custos mascarados; snapshot de cliente reduzido sem flag de PII
create view public.v_pedido
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
  p.aprovado_em, p.concluido_em, p.created_at, p.updated_at, p.created_by, p.deleted_at
from public.pedido p
where p.tenant_id = app.current_tenant_id()
  and app.tem_permissao('pedidos', 'ver');

create view public.v_pedido_item
with (security_invoker = false, security_barrier = true) as
select
  i.id, i.tenant_id, i.pedido_id, i.produto_id, i.descricao, i.quantidade,
  i.valor_unit, i.valor_total,
  case when app.tem_flag('ver_custos') then i.custo_unit end as custo_unit,
  i.created_at, i.deleted_at
from public.pedido_item i
where i.tenant_id = app.current_tenant_id()
  and app.tem_permissao('pedidos', 'ver');

-- simulação: o cálculo inteiro é sensível (contém custos e margens)
create view public.v_simulacao
with (security_invoker = false, security_barrier = true) as
select
  s.id, s.tenant_id, s.nome, s.produto_id, s.modelo_id, s.cliente_id, s.canal_id,
  case when app.tem_flag('ver_custos') then s.calculo end as calculo,
  s.versao_motor, s.created_at, s.updated_at, s.created_by, s.deleted_at
from public.simulacao s
where s.tenant_id = app.current_tenant_id()
  and app.tem_permissao('calculadora', 'ver');

-- acesso: views para usuários logados; nada para anônimo
revoke all on public.v_cliente, public.v_produto, public.v_orcamento,
  public.v_orcamento_item, public.v_pedido, public.v_pedido_item,
  public.v_simulacao from public, anon;
grant select on public.v_cliente, public.v_produto, public.v_orcamento,
  public.v_orcamento_item, public.v_pedido, public.v_pedido_item,
  public.v_simulacao to authenticated;

-- SELECT cru das tabelas com coluna sensível passa a exigir a flag
drop policy produto_select on public.produto;
create policy produto_select on public.produto for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('produtos', 'ver')
         and app.tem_flag('ver_custos'));

drop policy orcamento_select on public.orcamento;
create policy orcamento_select on public.orcamento for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('orcamentos', 'ver')
         and app.tem_flag('ver_custos'));

drop policy orcamento_item_select on public.orcamento_item;
create policy orcamento_item_select on public.orcamento_item for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('orcamentos', 'ver')
         and app.tem_flag('ver_custos'));

drop policy pedido_select on public.pedido;
create policy pedido_select on public.pedido for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('pedidos', 'ver')
         and app.tem_flag('ver_custos'));

drop policy pedido_item_select on public.pedido_item;
create policy pedido_item_select on public.pedido_item for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('pedidos', 'ver')
         and app.tem_flag('ver_custos'));

drop policy simulacao_select on public.simulacao;
create policy simulacao_select on public.simulacao for select
  using (tenant_id = app.current_tenant_id()
         and app.tem_permissao('calculadora', 'ver')
         and app.tem_flag('ver_custos'));

-- ============================================================================
-- STORAGE — buckets privados com política por tenant (1ª pasta = tenant_id)
-- e avatars (1ª pasta = usuario_id)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false),
       ('arquivos-modelos', 'arquivos-modelos', false),
       ('avatars', 'avatars', false)
on conflict (id) do nothing;

create policy storage_tenant_select on storage.objects for select
  to authenticated
  using (bucket_id in ('fotos', 'arquivos-modelos')
         and (storage.foldername(name))[1] = app.current_tenant_id()::text);
create policy storage_tenant_insert on storage.objects for insert
  to authenticated
  with check (bucket_id in ('fotos', 'arquivos-modelos')
              and (storage.foldername(name))[1] = app.current_tenant_id()::text);
create policy storage_tenant_update on storage.objects for update
  to authenticated
  using (bucket_id in ('fotos', 'arquivos-modelos')
         and (storage.foldername(name))[1] = app.current_tenant_id()::text);
create policy storage_tenant_delete on storage.objects for delete
  to authenticated
  using (bucket_id in ('fotos', 'arquivos-modelos')
         and (storage.foldername(name))[1] = app.current_tenant_id()::text);

create policy storage_avatar_select on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');
create policy storage_avatar_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_avatar_update on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_avatar_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
