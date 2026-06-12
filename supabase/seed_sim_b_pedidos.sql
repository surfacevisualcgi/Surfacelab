-- ============================================================================
-- SIMULAÇÃO B — pedidos, ordens de produção, orçamentos e financeiro
-- ~34 pedidos espalhados nos últimos ~9 meses, status realistas, com OPs e
-- contas a receber; despesas fixas mensais; orçamentos em aberto.
-- Alimenta o dashboard (faturamento 12m, fluxo de caixa 6m, donut, KPIs).
-- Rodar via: docker cp + psql -f
-- ============================================================================
\set ON_ERROR_STOP on

do $$
declare
  v_tenant uuid := '00486230-3354-4ed8-a7dc-b99bb479f8e9';
  v_user uuid;
  prods uuid[]; precos bigint[]; custos bigint[]; nomes text[];
  clientes uuid[]; cli_nomes text[]; cli_cidades text[]; cli_ufs text[];
  canais uuid[];
  np int; ncli int; ncan int;
  i int; j int; nit int; idx int; cidx int;
  v_pedido uuid; v_status public.status_pedido; v_opstatus public.status_op;
  d date; ts timestamptz; dias_atras int;
  v_total bigint; v_custo bigint; v_frete bigint; v_qtd numeric;
  v_cli uuid; v_canal uuid;
  v_tempo int; v_mat numeric;
  v_pago text; v_venc date;
  meses int; m int; mes_ts timestamptz; pago_st text;
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

  select array_agg(id) into canais from public.canal_venda where tenant_id=v_tenant and deleted_at is null;
  ncan := coalesce(array_length(canais,1),0);

  -- ------------------------------------------------------------- PEDIDOS
  for i in 1..34 loop
    dias_atras := (i-1)*8 + floor(random()*6)::int;   -- ~0..270 dias
    d := current_date - dias_atras;
    ts := d + (random()*interval '10 hours') + interval '9 hours';

    -- status conforme idade
    if dias_atras > 40 then v_status := 'concluido';
    elsif dias_atras > 12 then
      v_status := case when random() < 0.55 then 'concluido' else 'em_producao' end;
    else
      v_status := (array['aprovado','em_producao','concluido'])[1+floor(random()*3)::int]::public.status_pedido;
    end if;

    -- cliente (85% com cliente) + canal
    if random() < 0.85 and ncli > 0 then cidx := 1+floor(random()*ncli)::int; v_cli := clientes[cidx];
    else cidx := 0; v_cli := null; end if;
    if ncan > 0 and random() < 0.7 then v_canal := canais[1+floor(random()*ncan)::int]; else v_canal := null; end if;

    v_frete := (array[0,0,1500,1990,2500])[1+floor(random()*5)::int];

    insert into public.pedido
      (tenant_id, numero, status, cliente_id, cliente_snapshot, canal_id,
       total, custo_estimado, custo_real, entrada, parcelas, frete_cobrado,
       prazo_entrega, aprovado_em, concluido_em, created_at, updated_at, created_by)
    values
      (v_tenant, '', v_status, v_cli,
       case when v_cli is null then '{}'::jsonb
            else jsonb_strip_nulls(jsonb_build_object('nome',cli_nomes[cidx],
                 'cidade',nullif(cli_cidades[cidx],''),'estado',nullif(cli_ufs[cidx],''))) end,
       v_canal, 0, 0, null, 0, 1, v_frete,
       d + 7, ts,
       case when v_status='concluido' then ts + interval '4 days' else null end,
       ts, ts, v_user)
    returning id into v_pedido;

    nit := 1 + floor(random()*2.999)::int;   -- 1..3 itens
    v_total := v_frete; v_custo := 0;
    for j in 1..nit loop
      idx := 1 + floor(random()*np)::int;
      v_qtd := (array[1,1,1,2,2,3])[1+floor(random()*6)::int];

      insert into public.pedido_item
        (tenant_id, pedido_id, produto_id, descricao, quantidade,
         valor_unit, valor_total, custo_unit, created_at, created_by)
      values
        (v_tenant, v_pedido, prods[idx], nomes[idx], v_qtd,
         precos[idx], (precos[idx]*v_qtd)::bigint, custos[idx], ts, v_user);
      v_total := v_total + (precos[idx]*v_qtd)::bigint;
      v_custo := v_custo + (custos[idx]*v_qtd)::bigint;

      -- OP por item (estimativas dos modelos do produto)
      select coalesce(sum(m.tempo_impressao_min*ci.quantidade),60)::int,
             coalesce(sum((m.peso_peca_g+m.peso_suporte_g+m.peso_purga_g+m.peso_desperdicio_g)*ci.quantidade),50)
        into v_tempo, v_mat
        from public.composicao_item ci join public.modelo_3d m on m.id=ci.modelo_id
        where ci.produto_id=prods[idx] and ci.tipo='modelo_impresso' and ci.deleted_at is null;

      if v_status='concluido' then v_opstatus := 'concluido';
      elsif v_status='em_producao' then v_opstatus := (array['preparar','imprimindo','imprimindo','acabamento'])[1+floor(random()*4)::int]::public.status_op;
      else v_opstatus := 'aguardando_aprovacao'; end if;

      insert into public.ordem_producao
        (tenant_id, numero, pedido_id, produto_id, quantidade, status, prazo,
         tempo_estimado_min, material_estimado_g, custo_estimado,
         tempo_real_min, material_real_g, custo_real,
         progresso_pct, baixa_executada, iniciado_em, concluido_em, created_at, updated_at, created_by)
      values
        (v_tenant, '', v_pedido, prods[idx], v_qtd, v_opstatus, d+7,
         (v_tempo*v_qtd)::int, v_mat*v_qtd, (custos[idx]*v_qtd)::bigint,
         case when v_opstatus='concluido' then (v_tempo*v_qtd*(1+random()*0.15))::int else null end,
         case when v_opstatus='concluido' then v_mat*v_qtd else null end,
         case when v_opstatus='concluido' then (custos[idx]*v_qtd)::bigint else null end,
         case v_opstatus when 'concluido' then 100 when 'acabamento' then 80
              when 'imprimindo' then 45 when 'preparar' then 10 else 0 end,
         v_opstatus='concluido',
         case when v_opstatus in ('imprimindo','acabamento','concluido') then ts + interval '1 day' else null end,
         case when v_opstatus='concluido' then ts + interval '3 days' else null end,
         ts, ts, v_user);
    end loop;

    update public.pedido set total=v_total, custo_estimado=v_custo,
       custo_real = case when v_status='concluido' then v_custo else null end
       where id=v_pedido;

    -- contas a receber
    v_venc := d + 7;
    if v_status='concluido' then v_pago := 'pago'; else v_pago := 'pendente'; end if;
    insert into public.lancamento
      (tenant_id, tipo, descricao, categoria, cliente_id, valor, vencimento,
       pago_em, status, origem_tipo, origem_id, created_at, created_by)
    values
      (v_tenant, 'entrada', 'Recebimento pedido', 'vendas', v_cli, v_total, v_venc,
       case when v_pago='pago' then v_venc else null end, v_pago,
       'pedido', v_pedido, ts, v_user);
  end loop;

  -- ------------------------------------------------ DESPESAS FIXAS MENSAIS
  for m in 0..6 loop
    mes_ts := date_trunc('month', now()) - (m||' months')::interval;
    pago_st := case when m=0 then 'pendente' else 'pago' end;
    insert into public.lancamento (tenant_id, tipo, descricao, categoria, valor, vencimento, pago_em, status, origem_tipo, created_at, created_by)
    values
      (v_tenant,'saida','Aluguel do espaço','aluguel',120000,(mes_ts+interval '4 days')::date, case when pago_st='pago' then (mes_ts+interval '4 days')::date else null end, pago_st,'manual',mes_ts,v_user),
      (v_tenant,'saida','Energia elétrica','energia', (38000+floor(random()*12000))::bigint,(mes_ts+interval '9 days')::date, case when pago_st='pago' then (mes_ts+interval '9 days')::date else null end, pago_st,'manual',mes_ts,v_user),
      (v_tenant,'saida','Internet + softwares','servicos',16000,(mes_ts+interval '6 days')::date, case when pago_st='pago' then (mes_ts+interval '6 days')::date else null end, pago_st,'manual',mes_ts,v_user),
      (v_tenant,'saida','Pró-labore sócios','prolabore',250000,(mes_ts+interval '4 days')::date, case when pago_st='pago' then (mes_ts+interval '4 days')::date else null end, pago_st,'manual',mes_ts,v_user);
  end loop;

  -- ------------------------------------------------------------ ORÇAMENTOS
  for i in 1..5 loop
    idx := 1 + floor(random()*np)::int;
    cidx := 1 + floor(random()*ncli)::int;
    v_qtd := (array[2,3,4,5])[1+floor(random()*4)::int];
    v_total := (precos[idx]*v_qtd)::bigint;
    v_custo := (custos[idx]*v_qtd)::bigint;
    dias_atras := 2 + floor(random()*20)::int;
    ts := now() - (dias_atras||' days')::interval;
    insert into public.orcamento
      (tenant_id, numero, status, versao, cliente_id, cliente_snapshot, empresa_snapshot,
       validade, total, custo_total, lucro_estimado, margem_estimada, calculo_snapshot,
       enviado_em, created_at, updated_at, created_by)
    values
      (v_tenant, '',
       (array['rascunho','enviado','enviado','aguardando_resposta','rascunho'])[i]::public.status_orcamento,
       1, clientes[cidx],
       jsonb_build_object('nome',cli_nomes[cidx],'cidade',nullif(cli_cidades[cidx],''),'estado',nullif(cli_ufs[cidx],'')),
       '{}'::jsonb,
       (current_date + (array[10,7,-2,15,20])[i]),  -- 3o vence no passado (alerta)
       v_total, v_custo, v_total-v_custo,
       round((v_total-v_custo)::numeric/nullif(v_total,0),4),
       jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('descricao',nomes[idx],'quantidade',v_qtd,'valor_total',v_total))),
       case when i in (2,3,4) then ts else null end, ts, ts, v_user);
  end loop;
end $$;

-- conferência
select '00486230-3354-4ed8-a7dc-b99bb479f8e9'::uuid as tenant \gset
select status, count(*), to_char(sum(total)/100.0,'FM999G990D00') as soma_reais
  from public.pedido where tenant_id=:'tenant' and deleted_at is null group by status order by status;
select 'orçamentos' k, count(*) c from public.orcamento where tenant_id=:'tenant' and deleted_at is null
union all select 'OPs', count(*) from public.ordem_producao o join public.pedido p on p.id=o.pedido_id where p.tenant_id=:'tenant'
union all select 'lançamentos', count(*) from public.lancamento where tenant_id=:'tenant' and deleted_at is null;
select to_char(date_trunc('month',created_at),'YYYY-MM') mes, count(*) pedidos, to_char(sum(total)/100.0,'FM999G990D00') faturamento
  from public.pedido where tenant_id=:'tenant' and status<>'cancelado' and deleted_at is null
  group by 1 order by 1;
