-- ============================================================================
-- Surface Labs — 0006 Fluxos transacionais (máquinas de estado §3 + estoque §4)
-- Orçamento aprovado → Pedido (reserva) → OP (baixa estimada/real, reconciliação)
-- ============================================================================

-- Insumos de um produto, já convertidos para unidade de consumo, por 1 unidade
-- de produto: componentes/embalagens (qtd) + material dos modelos (peso total).
create or replace function app.insumos_do_produto(p_produto uuid)
returns table (material_id uuid, quantidade numeric)
language sql
stable
security definer
set search_path = ''
as $$
  -- componentes e embalagens da composição
  select ci.material_id, sum(ci.quantidade)
  from public.composicao_item ci
  where ci.produto_id = p_produto
    and ci.tipo in ('componente', 'embalagem')
    and ci.material_id is not null
    and ci.deleted_at is null
  group by ci.material_id
  union all
  -- material de impressão dos modelos (peça + suporte + purga + desperdício)
  select m.material_recomendado_id,
         sum(ci.quantidade * (m.peso_peca_g + m.peso_suporte_g + m.peso_purga_g + m.peso_desperdicio_g))
  from public.composicao_item ci
  join public.modelo_3d m on m.id = ci.modelo_id
  where ci.produto_id = p_produto
    and ci.tipo = 'modelo_impresso'
    and m.material_recomendado_id is not null
    and ci.deleted_at is null
  group by m.material_recomendado_id
$$;

-- ----------------------------------------------------------------------------
-- Aprovar orçamento → cria pedido (snapshot herdado) + OPs + reserva estoque
-- ----------------------------------------------------------------------------
create or replace function public.aprovar_orcamento(p_orcamento uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orc record;
  v_item record;
  v_insumo record;
  v_pedido uuid;
  v_modelo record;
  v_tempo_total int;
  v_material_total numeric;
begin
  if not app.tem_permissao('orcamentos', 'aprovar') then
    raise exception 'sem permissão para aprovar orçamentos';
  end if;

  select * into v_orc from public.orcamento
  where id = p_orcamento and tenant_id = app.current_tenant_id()
  for update;
  if not found then
    raise exception 'orçamento não encontrado';
  end if;
  if v_orc.status not in ('rascunho', 'enviado', 'aguardando_resposta') then
    raise exception 'orçamento % não pode ser aprovado no status %', v_orc.numero, v_orc.status;
  end if;
  if not app.dentro_do_limite('pedidos_mes') then
    raise exception 'limite de pedidos do plano atingido neste mês';
  end if;

  update public.orcamento
    set status = 'aprovado', aprovado_em = now(), updated_at = now()
    where id = p_orcamento;

  -- pedido herda o snapshot congelado do orçamento
  insert into public.pedido
    (tenant_id, cliente_id, cliente_snapshot, canal_id, origem_orcamento_id,
     total, custo_estimado, calculo_snapshot, status, aprovado_em, numero, created_by)
  values
    (v_orc.tenant_id, v_orc.cliente_id, v_orc.cliente_snapshot, v_orc.canal_id,
     p_orcamento, v_orc.total, v_orc.custo_total, v_orc.calculo_snapshot,
     'aprovado', now(), '', (select auth.uid()))
  returning id into v_pedido;

  for v_item in
    select * from public.orcamento_item
    where orcamento_id = p_orcamento and deleted_at is null
  loop
    insert into public.pedido_item
      (tenant_id, pedido_id, produto_id, descricao, quantidade,
       valor_unit, valor_total, custo_unit, created_by)
    values
      (v_orc.tenant_id, v_pedido, v_item.produto_id, v_item.descricao,
       v_item.quantidade, v_item.valor_unit, v_item.valor_total,
       v_item.custo_unit, (select auth.uid()));

    if v_item.produto_id is not null then
      -- reserva de estoque dos insumos da composição (sempre na aprovação)
      for v_insumo in
        select * from app.insumos_do_produto(v_item.produto_id)
      loop
        insert into public.movimentacao_estoque
          (tenant_id, material_id, tipo, quantidade, motivo,
           referencia_tipo, referencia_id, created_by)
        values
          (v_orc.tenant_id, v_insumo.material_id, 'reserva',
           v_insumo.quantidade * v_item.quantidade,
           'reserva do pedido', 'pedido', v_pedido, (select auth.uid()));
      end loop;

      -- uma OP por item de produto, com estimativas congeladas dos modelos
      select coalesce(sum(ci.quantidade * m.tempo_impressao_min), 0)::int,
             coalesce(sum(ci.quantidade * (m.peso_peca_g + m.peso_suporte_g
                        + m.peso_purga_g + m.peso_desperdicio_g)), 0)
        into v_tempo_total, v_material_total
      from public.composicao_item ci
      join public.modelo_3d m on m.id = ci.modelo_id
      where ci.produto_id = v_item.produto_id
        and ci.tipo = 'modelo_impresso' and ci.deleted_at is null;

      insert into public.ordem_producao
        (tenant_id, pedido_id, produto_id, quantidade, status, numero,
         tempo_estimado_min, material_estimado_g,
         custo_estimado, config_impressao_snapshot, created_by)
      values
        (v_orc.tenant_id, v_pedido, v_item.produto_id, v_item.quantidade,
         'aguardando_aprovacao', '',
         (v_tempo_total * v_item.quantidade)::int,
         v_material_total * v_item.quantidade,
         (v_item.custo_unit * v_item.quantidade)::bigint,
         coalesce((select jsonb_agg(jsonb_build_object(
            'modelo_id', m2.id, 'nome', m2.nome, 'tecnologia', m2.tecnologia,
            'altura_camada_mm', m2.altura_camada_mm, 'preenchimento', m2.preenchimento,
            'paredes', m2.paredes, 'suportes', m2.suportes, 'bico', m2.bico,
            'perfil_fatiamento', m2.perfil_fatiamento, 'versao', m2.versao))
          from public.composicao_item ci2
          join public.modelo_3d m2 on m2.id = ci2.modelo_id
          where ci2.produto_id = v_item.produto_id
            and ci2.tipo = 'modelo_impresso' and ci2.deleted_at is null), '[]'::jsonb),
         (select auth.uid()));
    end if;
  end loop;

  -- contas a receber
  insert into public.lancamento
    (tenant_id, tipo, descricao, categoria, cliente_id, valor, vencimento,
     status, origem_tipo, origem_id, created_by)
  select v_orc.tenant_id, 'entrada', 'Pedido ' || p.numero, 'vendas',
         v_orc.cliente_id, v_orc.total, current_date, 'pendente',
         'pedido', v_pedido, (select auth.uid())
  from public.pedido p where p.id = v_pedido;

  return v_pedido;
end;
$$;
revoke all on function public.aprovar_orcamento(uuid) from public, anon;
grant execute on function public.aprovar_orcamento(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Baixa de material de uma OP (estimada ou real) — consome reservas
-- ----------------------------------------------------------------------------
create or replace function app.baixar_estoque_op(p_op uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op record;
  v_insumo record;
begin
  select * into v_op from public.ordem_producao where id = p_op for update;
  if v_op.baixa_executada then
    return;
  end if;

  if v_op.produto_id is not null then
    for v_insumo in select * from app.insumos_do_produto(v_op.produto_id) loop
      -- baixa de fato
      insert into public.movimentacao_estoque
        (tenant_id, material_id, tipo, quantidade, motivo,
         referencia_tipo, referencia_id, created_by)
      values
        (v_op.tenant_id, v_insumo.material_id, 'saida',
         v_insumo.quantidade * v_op.quantidade, p_motivo, 'ordem_producao', p_op,
         (select auth.uid()));
      -- libera a reserva correspondente
      insert into public.movimentacao_estoque
        (tenant_id, material_id, tipo, quantidade, motivo,
         referencia_tipo, referencia_id, created_by)
      values
        (v_op.tenant_id, v_insumo.material_id, 'estorno_reserva',
         v_insumo.quantidade * v_op.quantidade, 'baixa executada',
         'ordem_producao', p_op, (select auth.uid()));
    end loop;
  end if;

  update public.ordem_producao set baixa_executada = true, updated_at = now()
    where id = p_op;
end;
$$;

-- ----------------------------------------------------------------------------
-- Mover OP no kanban (controla as transições e o momento da baixa)
-- ----------------------------------------------------------------------------
create or replace function public.mover_ordem_producao(p_op uuid, p_status public.status_op)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op record;
  v_momento text;
begin
  if not app.tem_permissao('producao', 'editar') then
    raise exception 'sem permissão para mover ordens de produção';
  end if;

  select * into v_op from public.ordem_producao
  where id = p_op and tenant_id = app.current_tenant_id()
  for update;
  if not found then
    raise exception 'ordem de produção não encontrada';
  end if;
  if v_op.status = 'concluido' then
    raise exception 'OP % já concluída', v_op.numero;
  end if;

  select momento_baixa_estoque into v_momento
  from public.tenant where id = v_op.tenant_id;

  if p_status = 'imprimindo' and v_op.iniciado_em is null then
    update public.ordem_producao set iniciado_em = now() where id = p_op;
    if v_momento = 'inicio' then
      perform app.baixar_estoque_op(p_op, 'baixa estimada no início da produção');
    end if;
  end if;

  if p_status = 'concluido' then
    if v_momento = 'fim' or not v_op.baixa_executada then
      perform app.baixar_estoque_op(p_op, 'baixa na conclusão da produção');
    end if;
    update public.ordem_producao
      set concluido_em = now(), progresso_pct = 100,
          -- custo real default = estimado quando não informado
          custo_real = coalesce(custo_real, custo_estimado)
      where id = p_op;
    -- pedido vai para concluído quando todas as OPs concluírem
    update public.pedido p set status = 'concluido', concluido_em = now(), updated_at = now()
      where p.id = v_op.pedido_id
        and not exists (select 1 from public.ordem_producao o
                        where o.pedido_id = p.id and o.id <> p_op
                          and o.status <> 'concluido' and o.deleted_at is null);
    -- alimenta o custo real médio dos modelos do produto
    update public.modelo_3d m
      set qtd_producoes = m.qtd_producoes + 1
      where m.id in (select ci.modelo_id from public.composicao_item ci
                     where ci.produto_id = v_op.produto_id
                       and ci.tipo = 'modelo_impresso');
  end if;

  if p_status in ('preparar', 'imprimindo', 'acabamento') then
    update public.pedido set status = 'em_producao', updated_at = now()
      where id = v_op.pedido_id and status = 'aprovado';
  end if;

  update public.ordem_producao set status = p_status, updated_at = now()
    where id = p_op;
end;
$$;
revoke all on function public.mover_ordem_producao(uuid, public.status_op) from public, anon;
grant execute on function public.mover_ordem_producao(uuid, public.status_op) to authenticated;

-- ----------------------------------------------------------------------------
-- Registrar falha de produção (modal 08): desperdício + custo + estoque
-- ----------------------------------------------------------------------------
create or replace function public.registrar_falha(
  p_op uuid,
  p_motivo text,
  p_etapa text default null,
  p_material uuid default null,
  p_desperdicio_g numeric default 0,
  p_tempo_perdido_min integer default 0,
  p_reimprimir boolean default false,
  p_foto_url text default null
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
     impacto_custo, created_by)
  values
    (v_op.tenant_id, p_op, p_etapa, p_motivo, p_material,
     coalesce(p_desperdicio_g, 0), coalesce(p_tempo_perdido_min, 0),
     p_reimprimir, p_foto_url, v_impacto, (select auth.uid()))
  returning id into v_falha;

  -- custo real da OP acumula o impacto da falha
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
-- Cancelar pedido → estorna reservas remanescentes e cancela OPs abertas
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_pedido(p_pedido uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_op record;
  v_insumo record;
begin
  if not app.tem_permissao('pedidos', 'editar') then
    raise exception 'sem permissão para cancelar pedidos';
  end if;

  select * into v_pedido from public.pedido
  where id = p_pedido and tenant_id = app.current_tenant_id()
  for update;
  if not found then
    raise exception 'pedido não encontrado';
  end if;
  if v_pedido.status in ('concluido', 'cancelado') then
    raise exception 'pedido % não pode ser cancelado', v_pedido.numero;
  end if;

  for v_op in
    select * from public.ordem_producao
    where pedido_id = p_pedido and status <> 'concluido' and deleted_at is null
  loop
    -- estorna reservas de OPs que ainda não baixaram estoque
    if not v_op.baixa_executada and v_op.produto_id is not null then
      for v_insumo in select * from app.insumos_do_produto(v_op.produto_id) loop
        insert into public.movimentacao_estoque
          (tenant_id, material_id, tipo, quantidade, motivo,
           referencia_tipo, referencia_id, created_by)
        values
          (v_pedido.tenant_id, v_insumo.material_id, 'estorno_reserva',
           v_insumo.quantidade * v_op.quantidade, 'cancelamento do pedido',
           'pedido', p_pedido, (select auth.uid()));
      end loop;
    end if;
    update public.ordem_producao set status = 'cancelado', updated_at = now()
      where id = v_op.id;
  end loop;

  update public.pedido set status = 'cancelado', updated_at = now()
    where id = p_pedido;
  update public.lancamento set status = 'cancelado', updated_at = now()
    where origem_tipo = 'pedido' and origem_id = p_pedido and status = 'pendente';
end;
$$;
revoke all on function public.cancelar_pedido(uuid) from public, anon;
grant execute on function public.cancelar_pedido(uuid) to authenticated;
