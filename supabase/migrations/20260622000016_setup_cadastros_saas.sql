-- ============================================================================
-- Surface Labs — ajustes de cadastros para setup SaaS guiado
-- Corrige colunas já usadas pelo front e adiciona metadados opcionais para
-- presets editáveis de fornecedores, canais, custos e tarefas.
-- ============================================================================

alter table public.fornecedor
  add column if not exists tipo text not null default 'loja_3d'
    check (tipo in ('marketplace', 'loja_3d', 'local', 'atacado', 'outro')),
  add column if not exists pais text,
  add column if not exists site_url text,
  add column if not exists endereco text;

alter table public.impressora
  add column if not exists horas_dia numeric(4,1) not null default 8
    check (horas_dia between 0 and 24);

alter table public.canal_venda
  add column if not exists tipo text not null default 'direto'
    check (tipo in ('direto', 'marketplace', 'loja_online', 'social', 'atacado', 'outro')),
  add column if not exists custo_fixo_pedido public.centavos not null default 0,
  add column if not exists observacoes text;

alter table public.custo_fixo
  add column if not exists categoria text not null default 'outros'
    check (categoria in ('aluguel', 'internet', 'software', 'manutencao', 'contador', 'energia', 'marketing', 'seguro', 'suprimentos', 'outros')),
  add column if not exists ratear boolean not null default true,
  add column if not exists observacao text;

alter table public.tarefa_mao_obra
  add column if not exists tipo text not null default 'producao'
    check (tipo in ('preparacao', 'producao', 'acabamento', 'administrativo', 'embalagem', 'outro')),
  add column if not exists incluir_padrao boolean not null default true,
  add column if not exists observacao text;

-- Guarda contra estoque incoerente: o ledger continua imutável, mas agora não
-- permite saída que deixe saldo negativo nem reserva acima do disponível.
create or replace function app.aplicar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  novo_saldo numeric;
  novo_custo numeric;
  disponivel numeric;
begin
  select saldo, reservado, custo_medio, valor_estoque into m
  from public.material
  where id = new.material_id
  for update;

  if not found then
    raise exception 'material não encontrado';
  end if;

  if new.tipo = 'entrada' then
    novo_saldo := m.saldo + new.quantidade;
    if novo_saldo > 0 then
      novo_custo := ((m.saldo * m.custo_medio) + (new.quantidade * new.custo_unitario))
                    / novo_saldo;
    else
      novo_custo := new.custo_unitario;
    end if;
    update public.material set
      saldo = novo_saldo,
      custo_medio = novo_custo,
      ultimo_custo = new.custo_unitario,
      valor_estoque = greatest(0, round(novo_saldo * novo_custo))::bigint
    where id = new.material_id;

  elsif new.tipo = 'saida' then
    disponivel := m.saldo - m.reservado;
    if new.quantidade > disponivel then
      raise exception 'saldo disponível insuficiente para saída: disponível %, solicitado %', disponivel, new.quantidade;
    end if;
    new.custo_unitario := m.custo_medio;
    novo_saldo := m.saldo - new.quantidade;
    update public.material set
      saldo = novo_saldo,
      valor_estoque = greatest(0, round(novo_saldo * m.custo_medio))::bigint
    where id = new.material_id;

  elsif new.tipo = 'ajuste' then
    novo_saldo := m.saldo + new.quantidade;
    new.custo_unitario := m.custo_medio;
    update public.material set
      saldo = novo_saldo,
      valor_estoque = greatest(0, round(novo_saldo * m.custo_medio))::bigint
    where id = new.material_id;

  elsif new.tipo = 'reserva' then
    disponivel := m.saldo - m.reservado;
    if new.quantidade > disponivel then
      raise exception 'saldo disponível insuficiente para reserva: disponível %, solicitado %', disponivel, new.quantidade;
    end if;
    update public.material set reservado = m.reservado + new.quantidade
    where id = new.material_id;

  elsif new.tipo = 'estorno_reserva' then
    update public.material set reservado = greatest(0, m.reservado - new.quantidade)
    where id = new.material_id;
  end if;

  return new;
end;
$$;
