-- ============================================================================
-- Surface Labs — 0012 Pedido manual (P1) + campos de cadastro (P2)
-- Pedido que NÃO nasce de orçamento: venda direta (WhatsApp, balcão, feira).
-- Mesmos efeitos da aprovação de orçamento: snapshot, reserva, OPs, financeiro.
-- ============================================================================

-- ---------------------------------------------------------------- cadastros
alter table public.material   add column observacao text;
alter table public.fornecedor add column endereco text;
-- horas/dia planejadas: alimenta utilização da impressora (relatórios §10)
alter table public.impressora add column horas_dia numeric(4,1) not null default 8
  check (horas_dia >= 0 and horas_dia <= 24);
-- quem registrou/assumiu a falha (responsável da ocorrência)
alter table public.producao_falha add column responsavel_id uuid
  references public.usuario (id);

-- ----------------------------------------------------------------------------
-- registrar_falha ganha o responsável (recriada: assinatura muda)
-- ----------------------------------------------------------------------------
drop function public.registrar_falha(uuid, text, text, uuid, numeric, integer, boolean, text);
create or replace function public.registrar_falha(
  p_op uuid,
  p_motivo text,
  p_etapa text default null,
  p_material uuid default null,
  p_desperdicio_g numeric default 0,
  p_tempo_perdido_min integer default 0,
  p_reimprimir boolean default false,
  p_foto_url text default null,
  p_responsavel uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op record;
  v_falha uuid;
  v_impacto bigint := 0;
  v_custo_medio numeric;
begin
  if not app.tem_permissao('producao', 'editar') then
    raise exception 'sem permissão para registrar falhas';
  end if;

  select * into v_op from public.ordem_producao
  where id = p_op and tenant_id = app.current_tenant_id();
  if not found then
    raise exception 'ordem de produção não encontrada';
  end if;

  -- responsável precisa ser membro ativo do tenant
  if p_responsavel is not null then
    perform 1 from public.membership
      where usuario_id = p_responsavel and tenant_id = v_op.tenant_id and ativo;
    if not found then
      raise exception 'responsável não é membro desta empresa';
    end if;
  end if;

  if p_material is not null and p_desperdicio_g > 0 then
    select custo_medio into v_custo_medio from public.material where id = p_material;
    v_impacto := round(p_desperdicio_g * coalesce(v_custo_medio, 0))::bigint;
    insert into public.movimentacao_estoque
      (tenant_id, material_id, tipo, quantidade, motivo,
       referencia_tipo, referencia_id, created_by)
    values
      (v_op.tenant_id, p_material, 'saida', p_desperdicio_g,
       'falha de produção: ' || p_motivo, 'ordem_producao', p_op,
       (select auth.uid()));
  end if;

  insert into public.producao_falha
    (tenant_id, ordem_producao_id, etapa, motivo, material_id,
     material_desperdicado_g, tempo_perdido_min, reimprimir, foto_url,
     responsavel_id, impacto_custo, created_by)
  values
    (v_op.tenant_id, p_op, p_etapa, p_motivo, p_material,
     coalesce(p_desperdicio_g, 0), coalesce(p_tempo_perdido_min, 0),
     p_reimprimir, p_foto_url, p_responsavel, v_impacto, (select auth.uid()))
  returning id into v_falha;

  update public.ordem_producao
    set custo_real = coalesce(custo_real, custo_estimado) + v_impacto,
        material_real_g = coalesce(material_real_g, material_estimado_g) + coalesce(p_desperdicio_g, 0),
        updated_at = now()
    where id = p_op;

  return v_falha;
end;
$$;
revoke all on function public.registrar_falha from public, anon;
grant execute on function public.registrar_falha to authenticated;

-- ----------------------------------------------------------------------------
-- criar_pedido_manual — venda direta sem orçamento (P1 ⭐).
-- Itens em jsonb: [{produto_id?, descricao?, quantidade, valor_unit?}].
-- Regras do servidor (anti-adulteração):
--   · custo_unit de item de produto SEMPRE vem do cadastro (nunca do payload);
--   · valor_unit default = preço praticado (sugerido como fallback), mas o
--     vendedor pode sobrescrever (negociação) — nunca negativo;
--   · item avulso (sem produto) exige descrição; não gera OP nem reserva.
-- Efeitos: pedido aprovado + snapshot congelado + reserva de estoque + 1 OP por
-- item de produto + contas a receber (entrada à vista + saldo em N parcelas).
-- ----------------------------------------------------------------------------
create or replace function public.criar_pedido_manual(
  p_itens jsonb,
  p_cliente uuid default null,
  p_canal uuid default null,
  p_entrada bigint default 0,
  p_parcelas integer default 1,
  p_prazo_entrega date default null,
  p_frete_cobrado bigint default 0,
  p_data_prevista_recebimento date default null,
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
  v_pedido uuid;
  v_numero text;
  v_cli record;
  v_prod record;
  v_insumo record;
  v_cliente_snapshot jsonb := '{}'::jsonb;
  v_itens_snapshot jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_custo_total bigint := 0;
  v_qtd numeric;
  v_valor_unit bigint;
  v_custo_unit bigint;
  v_descricao text;
  v_produto uuid;
  v_tempo_total int;
  v_material_total numeric;
  v_saldo bigint;
  v_parcela bigint;
  v_venc date;
  i int;
begin
  if v_tenant is null then
    raise exception 'nenhuma empresa ativa';
  end if;
  if not app.tem_permissao('pedidos', 'criar') then
    raise exception 'sem permissão para criar pedidos';
  end if;
  if not app.dentro_do_limite('pedidos_mes') then
    raise exception 'limite de pedidos do plano atingido neste mês';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'o pedido precisa de pelo menos um item';
  end if;
  if coalesce(p_parcelas, 1) < 1 or coalesce(p_parcelas, 1) > 36 then
    raise exception 'número de parcelas inválido (1 a 36)';
  end if;
  if coalesce(p_entrada, 0) < 0 or coalesce(p_frete_cobrado, 0) < 0 then
    raise exception 'valores não podem ser negativos';
  end if;

  -- snapshot mínimo do cliente (minimização LGPD: nome/cidade/estado)
  if p_cliente is not null then
    select nome, cidade, estado into v_cli from public.cliente
      where id = p_cliente and tenant_id = v_tenant
        and deleted_at is null and not anonimizado;
    if not found then
      raise exception 'cliente não encontrado';
    end if;
    v_cliente_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'nome', v_cli.nome, 'cidade', v_cli.cidade, 'estado', v_cli.estado));
  end if;

  if p_canal is not null then
    perform 1 from public.canal_venda
      where id = p_canal and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'canal de venda não encontrado';
    end if;
  end if;

  -- pedido nasce aprovado: venda direta já confirmada pelo cliente
  insert into public.pedido
    (tenant_id, numero, status, cliente_id, cliente_snapshot, canal_id,
     entrada, parcelas, prazo_entrega, frete_cobrado,
     data_prevista_recebimento, observacoes, aprovado_em, created_by)
  values
    (v_tenant, '', 'aprovado', p_cliente, v_cliente_snapshot, p_canal,
     coalesce(p_entrada, 0), coalesce(p_parcelas, 1), p_prazo_entrega,
     coalesce(p_frete_cobrado, 0), p_data_prevista_recebimento,
     p_observacoes, now(), (select auth.uid()))
  returning id, numero into v_pedido, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce(nullif(v_item ->> 'quantidade', '')::numeric, 1);
    if v_qtd <= 0 then
      raise exception 'quantidade deve ser maior que zero';
    end if;

    v_produto := nullif(v_item ->> 'produto_id', '')::uuid;
    if v_produto is not null then
      select id, nome, preco_praticado, preco_sugerido, custo_atual into v_prod
        from public.produto
        where id = v_produto and tenant_id = v_tenant and deleted_at is null;
      if not found then
        raise exception 'produto não encontrado';
      end if;
      v_descricao := coalesce(nullif(v_item ->> 'descricao', ''), v_prod.nome);
      -- preço negociável (payload), default do cadastro; custo NUNCA do payload
      v_valor_unit := coalesce(nullif(v_item ->> 'valor_unit', '')::bigint,
        case when v_prod.preco_praticado > 0 then v_prod.preco_praticado
             else v_prod.preco_sugerido end);
      v_custo_unit := v_prod.custo_atual;
    else
      v_descricao := nullif(v_item ->> 'descricao', '');
      if v_descricao is null then
        raise exception 'item avulso precisa de descrição';
      end if;
      v_valor_unit := coalesce(nullif(v_item ->> 'valor_unit', '')::bigint, 0);
      v_custo_unit := 0;
    end if;
    if v_valor_unit < 0 then
      raise exception 'valor unitário não pode ser negativo';
    end if;

    v_total := v_total + round(v_valor_unit * v_qtd)::bigint;
    v_custo_total := v_custo_total + round(v_custo_unit * v_qtd)::bigint;
    v_itens_snapshot := v_itens_snapshot || jsonb_build_object(
      'produto_id', v_produto, 'descricao', v_descricao, 'quantidade', v_qtd,
      'valor_unit', v_valor_unit, 'custo_unit', v_custo_unit);

    insert into public.pedido_item
      (tenant_id, pedido_id, produto_id, descricao, quantidade,
       valor_unit, valor_total, custo_unit, created_by)
    values
      (v_tenant, v_pedido, v_produto, v_descricao, v_qtd,
       v_valor_unit, round(v_valor_unit * v_qtd)::bigint, v_custo_unit,
       (select auth.uid()));

    if v_produto is not null then
      -- reserva de estoque dos insumos da composição (igual à aprovação)
      for v_insumo in
        select * from app.insumos_do_produto(v_produto)
      loop
        insert into public.movimentacao_estoque
          (tenant_id, material_id, tipo, quantidade, motivo,
           referencia_tipo, referencia_id, created_by)
        values
          (v_tenant, v_insumo.material_id, 'reserva',
           v_insumo.quantidade * v_qtd,
           'reserva do pedido', 'pedido', v_pedido, (select auth.uid()));
      end loop;

      -- uma OP por item de produto, com estimativas congeladas dos modelos
      select coalesce(sum(ci.quantidade * m.tempo_impressao_min), 0)::int,
             coalesce(sum(ci.quantidade * (m.peso_peca_g + m.peso_suporte_g
                        + m.peso_purga_g + m.peso_desperdicio_g)), 0)
        into v_tempo_total, v_material_total
      from public.composicao_item ci
      join public.modelo_3d m on m.id = ci.modelo_id
      where ci.produto_id = v_produto
        and ci.tipo = 'modelo_impresso' and ci.deleted_at is null;

      insert into public.ordem_producao
        (tenant_id, pedido_id, produto_id, quantidade, status, numero, prazo,
         tempo_estimado_min, material_estimado_g,
         custo_estimado, config_impressao_snapshot, created_by)
      values
        (v_tenant, v_pedido, v_produto, v_qtd, 'aguardando_aprovacao', '',
         p_prazo_entrega,
         (v_tempo_total * v_qtd)::int,
         v_material_total * v_qtd,
         round(v_custo_unit * v_qtd)::bigint,
         coalesce((select jsonb_agg(jsonb_build_object(
            'modelo_id', m2.id, 'nome', m2.nome, 'tecnologia', m2.tecnologia,
            'altura_camada_mm', m2.altura_camada_mm, 'preenchimento', m2.preenchimento,
            'paredes', m2.paredes, 'suportes', m2.suportes, 'bico', m2.bico,
            'perfil_fatiamento', m2.perfil_fatiamento, 'versao', m2.versao))
          from public.composicao_item ci2
          join public.modelo_3d m2 on m2.id = ci2.modelo_id
          where ci2.produto_id = v_produto
            and ci2.tipo = 'modelo_impresso' and ci2.deleted_at is null), '[]'::jsonb),
         (select auth.uid()));
    end if;
  end loop;

  v_total := v_total + coalesce(p_frete_cobrado, 0);
  if coalesce(p_entrada, 0) > v_total then
    raise exception 'entrada maior que o total do pedido';
  end if;

  -- congela totais + snapshot (fotografia da venda no momento da criação)
  update public.pedido
    set total = v_total,
        custo_estimado = v_custo_total,
        calculo_snapshot = jsonb_build_object(
          'origem', 'pedido_manual',
          'itens', v_itens_snapshot,
          'frete_cobrado', coalesce(p_frete_cobrado, 0),
          'criado_em', now()),
        updated_at = now()
    where id = v_pedido;

  -- contas a receber: entrada vence hoje; saldo em N parcelas mensais a
  -- partir da data prevista (fallback: prazo de entrega; depois, hoje)
  v_saldo := v_total - coalesce(p_entrada, 0);
  v_venc := coalesce(p_data_prevista_recebimento, p_prazo_entrega, current_date);

  if coalesce(p_entrada, 0) > 0 then
    insert into public.lancamento
      (tenant_id, tipo, descricao, categoria, cliente_id, valor, vencimento,
       status, origem_tipo, origem_id, created_by)
    values
      (v_tenant, 'entrada', 'Entrada — Pedido ' || v_numero, 'vendas',
       p_cliente, p_entrada, current_date, 'pendente',
       'pedido', v_pedido, (select auth.uid()));
  end if;

  if v_saldo > 0 then
    v_parcela := v_saldo / coalesce(p_parcelas, 1); -- piso; resto na 1ª parcela
    for i in 1..coalesce(p_parcelas, 1) loop
      insert into public.lancamento
        (tenant_id, tipo, descricao, categoria, cliente_id, valor, vencimento,
         status, origem_tipo, origem_id, created_by)
      values
        (v_tenant, 'entrada',
         case when coalesce(p_parcelas, 1) > 1
              then format('Pedido %s (%s/%s)', v_numero, i, p_parcelas)
              else 'Pedido ' || v_numero end,
         'vendas', p_cliente,
         case when i = 1 then v_saldo - v_parcela * (coalesce(p_parcelas, 1) - 1)
              else v_parcela end,
         (v_venc + make_interval(months => i - 1))::date,
         'pendente', 'pedido', v_pedido, (select auth.uid()));
    end loop;
  end if;

  return v_pedido;
end;
$$;
revoke all on function public.criar_pedido_manual from public, anon;
grant execute on function public.criar_pedido_manual to authenticated;
