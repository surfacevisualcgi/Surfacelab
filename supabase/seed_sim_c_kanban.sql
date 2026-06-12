-- ============================================================================
-- SIMULAÇÃO C — pedidos recentes para encher o kanban de produção
-- ~9 pedidos dos últimos dias, distribuídos entre as colunas ativas.
-- Rodar UMA vez (não idempotente). docker cp + psql -f
-- ============================================================================
\set ON_ERROR_STOP on
do $$
declare
  v_tenant uuid := '00486230-3354-4ed8-a7dc-b99bb479f8e9';
  v_user uuid;
  prods uuid[]; precos bigint[]; custos bigint[]; nomes text[];
  clientes uuid[]; cli_nomes text[]; cli_cidades text[]; cli_ufs text[];
  np int; ncli int;
  alvo public.status_op[] := array['aguardando_aprovacao','aguardando_aprovacao','aguardando_aprovacao',
       'preparar','preparar','imprimindo','imprimindo','imprimindo','acabamento','acabamento']::public.status_op[];
  k int; idx int; cidx int; v_qtd numeric;
  v_pedido uuid; ts timestamptz; v_total bigint; v_custo bigint; v_tempo int; v_mat numeric;
  v_op public.status_op; v_pedstatus public.status_pedido;
begin
  select usuario_id into v_user from public.membership where tenant_id=v_tenant and ativo limit 1;
  select array_agg(id order by sku), array_agg(preco_praticado order by sku),
         array_agg(greatest(custo_atual,0) order by sku), array_agg(nome order by sku)
    into prods, precos, custos, nomes
    from public.produto where tenant_id=v_tenant and sku like 'P-%' and deleted_at is null and preco_praticado>0;
  np := array_length(prods,1);
  select array_agg(id), array_agg(nome), array_agg(coalesce(cidade,'')), array_agg(coalesce(estado,''))
    into clientes, cli_nomes, cli_cidades, cli_ufs
    from public.cliente where tenant_id=v_tenant and not anonimizado and deleted_at is null;
  ncli := array_length(clientes,1);

  for k in 1..array_length(alvo,1) loop
    v_op := alvo[k];
    v_pedstatus := case when v_op='aguardando_aprovacao' then 'aprovado' else 'em_producao' end::public.status_pedido;
    ts := now() - ((k*0.7)||' days')::interval;
    cidx := 1+floor(random()*ncli)::int;
    idx := 1+floor(random()*np)::int;
    v_qtd := (array[1,1,2,2,3])[1+floor(random()*5)::int];
    v_total := (precos[idx]*v_qtd)::bigint;
    v_custo := (custos[idx]*v_qtd)::bigint;

    insert into public.pedido
      (tenant_id, numero, status, cliente_id, cliente_snapshot, total, custo_estimado,
       parcelas, prazo_entrega, aprovado_em, created_at, updated_at, created_by)
    values
      (v_tenant, '', v_pedstatus, clientes[cidx],
       jsonb_strip_nulls(jsonb_build_object('nome',cli_nomes[cidx],'cidade',nullif(cli_cidades[cidx],''),'estado',nullif(cli_ufs[cidx],''))),
       v_total, v_custo, 1, current_date + 5, ts, ts, ts, v_user)
    returning id into v_pedido;

    select coalesce(sum(m.tempo_impressao_min*ci.quantidade),120)::int,
           coalesce(sum((m.peso_peca_g+m.peso_suporte_g+m.peso_purga_g+m.peso_desperdicio_g)*ci.quantidade),80)
      into v_tempo, v_mat
      from public.composicao_item ci join public.modelo_3d m on m.id=ci.modelo_id
      where ci.produto_id=prods[idx] and ci.tipo='modelo_impresso' and ci.deleted_at is null;

    insert into public.ordem_producao
      (tenant_id, numero, pedido_id, produto_id, quantidade, status, prazo,
       tempo_estimado_min, material_estimado_g, custo_estimado, progresso_pct,
       baixa_executada, iniciado_em, created_at, updated_at, created_by)
    values
      (v_tenant, '', v_pedido, prods[idx], v_qtd, v_op, current_date+5,
       (v_tempo*v_qtd)::int, v_mat*v_qtd, v_custo,
       case v_op when 'acabamento' then 78 when 'imprimindo' then 48 when 'preparar' then 12 else 0 end,
       false,
       case when v_op in ('imprimindo','acabamento') then ts + interval '6 hours' else null end,
       ts, ts, v_user);

    insert into public.lancamento
      (tenant_id, tipo, descricao, categoria, cliente_id, valor, vencimento, status, origem_tipo, origem_id, created_at, created_by)
    values
      (v_tenant, 'entrada', 'Recebimento pedido', 'vendas', clientes[cidx], v_total, (current_date+7), 'pendente', 'pedido', v_pedido, ts, v_user);
  end loop;
end $$;

select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
select status, count(*) from public.ordem_producao o join public.pedido p on p.id=o.pedido_id
  where p.tenant_id=:'tenant' and o.deleted_at is null group by status order by status;
