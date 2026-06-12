-- ============================================================================
-- Surface Labs — 0014 Orçamento manual + recálculo de rascunho
-- Permite montar um orçamento direto (cliente + produtos), sem passar pela
-- calculadora item-a-item, e recalcular os totais ao editar um rascunho.
-- Custo SEMPRE resolvido no servidor a partir do cadastro (anti-adulteração);
-- preço é negociável. Itens só mudam enquanto rascunho (trigger de imutabilidade).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- criar_orcamento_manual — cria um RASCUNHO com itens de produto.
-- p_itens: [{produto_id?, descricao?, quantidade, valor_unit?}]
-- ----------------------------------------------------------------------------
create or replace function public.criar_orcamento_manual(
  p_itens jsonb,
  p_cliente uuid default null,
  p_canal uuid default null,
  p_validade date default null,
  p_prazo_entrega text default null,
  p_condicoes text default null,
  p_frete bigint default 0,
  p_desconto bigint default 0,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_item jsonb;
  v_orc uuid;
  v_cli record;
  v_prod record;
  v_cliente_snapshot jsonb := '{}'::jsonb;
  v_empresa_snapshot jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_custo bigint := 0;
  v_qtd numeric;
  v_valor_unit bigint;
  v_custo_unit bigint;
  v_descricao text;
  v_produto uuid;
  v_ordem int := 0;
  v_emp record;
begin
  if v_tenant is null then raise exception 'nenhuma empresa ativa'; end if;
  if not app.tem_permissao('orcamentos', 'criar') then
    raise exception 'sem permissão para criar orçamentos';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'o orçamento precisa de pelo menos um item';
  end if;
  if coalesce(p_frete,0) < 0 or coalesce(p_desconto,0) < 0 then
    raise exception 'frete e desconto não podem ser negativos';
  end if;

  if p_cliente is not null then
    select nome, cidade, estado into v_cli from public.cliente
      where id = p_cliente and tenant_id = v_tenant and deleted_at is null and not anonimizado;
    if not found then raise exception 'cliente não encontrado'; end if;
    v_cliente_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'nome', v_cli.nome, 'cidade', v_cli.cidade, 'estado', v_cli.estado));
  end if;

  select razao_social, nome_fantasia, cnpj into v_emp
    from public.empresa where tenant_id = v_tenant and deleted_at is null limit 1;
  if found then
    v_empresa_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'razao_social', v_emp.razao_social, 'nome_fantasia', v_emp.nome_fantasia, 'cnpj', v_emp.cnpj));
  end if;

  insert into public.orcamento
    (tenant_id, numero, status, cliente_id, cliente_snapshot, empresa_snapshot,
     canal_id, validade, prazo_entrega, condicoes_pagamento, frete, desconto,
     total, custo_total, lucro_estimado, margem_estimada, observacoes, created_by)
  values
    (v_tenant, '', 'rascunho', p_cliente, v_cliente_snapshot, v_empresa_snapshot,
     p_canal, p_validade, p_prazo_entrega, p_condicoes, coalesce(p_frete,0), coalesce(p_desconto,0),
     0, 0, 0, 0, p_observacoes, (select auth.uid()))
  returning id into v_orc;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce(nullif(v_item->>'quantidade','')::numeric, 1);
    if v_qtd <= 0 then raise exception 'quantidade deve ser maior que zero'; end if;
    v_produto := nullif(v_item->>'produto_id','')::uuid;

    if v_produto is not null then
      select nome, preco_praticado, preco_sugerido, custo_atual into v_prod
        from public.produto where id = v_produto and tenant_id = v_tenant and deleted_at is null;
      if not found then raise exception 'produto não encontrado'; end if;
      v_descricao := coalesce(nullif(v_item->>'descricao',''), v_prod.nome);
      v_valor_unit := coalesce(nullif(v_item->>'valor_unit','')::bigint,
        case when v_prod.preco_praticado > 0 then v_prod.preco_praticado else v_prod.preco_sugerido end);
      v_custo_unit := v_prod.custo_atual;
    else
      v_descricao := nullif(v_item->>'descricao','');
      if v_descricao is null then raise exception 'item avulso precisa de descrição'; end if;
      v_valor_unit := coalesce(nullif(v_item->>'valor_unit','')::bigint, 0);
      v_custo_unit := 0;
    end if;
    if v_valor_unit < 0 then raise exception 'valor unitário não pode ser negativo'; end if;

    v_ordem := v_ordem + 1;
    insert into public.orcamento_item
      (tenant_id, orcamento_id, produto_id, descricao, quantidade, valor_unit, valor_total, custo_unit, ordem, created_by)
    values
      (v_tenant, v_orc, v_produto, v_descricao, v_qtd, v_valor_unit,
       round(v_valor_unit*v_qtd)::bigint, v_custo_unit, v_ordem, (select auth.uid()));

    v_total := v_total + round(v_valor_unit*v_qtd)::bigint;
    v_custo := v_custo + round(v_custo_unit*v_qtd)::bigint;
  end loop;

  v_total := v_total + coalesce(p_frete,0) - coalesce(p_desconto,0);
  update public.orcamento
    set total = v_total, custo_total = v_custo,
        lucro_estimado = v_total - v_custo,
        margem_estimada = round((v_total - v_custo)::numeric / nullif(v_total,0), 4),
        calculo_snapshot = jsonb_build_object('origem','orcamento_manual'),
        updated_at = now()
    where id = v_orc;

  return v_orc;
end;
$$;
revoke all on function public.criar_orcamento_manual from public, anon;
grant execute on function public.criar_orcamento_manual to authenticated;

-- ----------------------------------------------------------------------------
-- recalcular_orcamento — após editar itens de um RASCUNHO, re-resolve o custo
-- de cada item pelo cadastro e recompõe os totais. Só funciona em rascunho.
-- ----------------------------------------------------------------------------
create or replace function public.recalcular_orcamento(p_orcamento uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_orc record;
  v_total bigint := 0;
  v_custo bigint := 0;
begin
  if not app.tem_permissao('orcamentos', 'editar') then
    raise exception 'sem permissão para editar orçamentos';
  end if;
  select * into v_orc from public.orcamento
    where id = p_orcamento and tenant_id = v_tenant for update;
  if not found then raise exception 'orçamento não encontrado'; end if;
  if v_orc.status <> 'rascunho' then
    raise exception 'só é possível recalcular um orçamento em rascunho';
  end if;

  -- re-resolve custo do cadastro e o valor_total de cada item
  update public.orcamento_item i
    set custo_unit = case when i.produto_id is not null
                          then coalesce((select custo_atual from public.produto p where p.id = i.produto_id), i.custo_unit)
                          else i.custo_unit end,
        valor_total = round(i.valor_unit * i.quantidade)::bigint,
        updated_at = now()
    where i.orcamento_id = p_orcamento and i.deleted_at is null;

  select coalesce(sum(valor_total),0), coalesce(sum(round(custo_unit*quantidade)),0)
    into v_total, v_custo
    from public.orcamento_item where orcamento_id = p_orcamento and deleted_at is null;

  v_total := v_total + v_orc.frete - v_orc.desconto;
  update public.orcamento
    set total = v_total, custo_total = v_custo,
        lucro_estimado = v_total - v_custo,
        margem_estimada = round((v_total - v_custo)::numeric / nullif(v_total,0), 4),
        updated_at = now()
    where id = p_orcamento;
end;
$$;
revoke all on function public.recalcular_orcamento(uuid) from public, anon;
grant execute on function public.recalcular_orcamento(uuid) to authenticated;
