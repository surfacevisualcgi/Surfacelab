-- ============================================================================
-- Surface Labs — 0015 Financeiro: pagamento parcial + baixa controlada
-- Permite registrar recebimentos/pagamentos PARCIAIS (sinal + saldo), com a
-- conta usada. Saldo realizado = soma do que de fato entrou − do que saiu.
-- ============================================================================

alter table public.lancamento
  add column valor_pago public.centavos not null default 0;

-- baixa já paga: valor_pago = total (mantém histórico consistente)
update public.lancamento set valor_pago = valor where status = 'pago';

-- ----------------------------------------------------------------------------
-- registrar_pagamento — baixa (parcial ou total) de um lançamento numa conta.
-- Soma p_valor ao valor_pago; vira 'pago' quando cobre o total.
-- ----------------------------------------------------------------------------
create or replace function public.registrar_pagamento(
  p_lancamento uuid,
  p_valor bigint default null,   -- null = quita o restante
  p_conta text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_add bigint;
  v_novo bigint;
begin
  if not app.tem_permissao('financeiro', 'editar') then
    raise exception 'sem permissão no financeiro';
  end if;
  select * into v from public.lancamento
    where id = p_lancamento and tenant_id = app.current_tenant_id() for update;
  if not found then raise exception 'lançamento não encontrado'; end if;
  if v.status = 'cancelado' then raise exception 'lançamento cancelado'; end if;

  v_add := coalesce(p_valor, v.valor - v.valor_pago);
  if v_add <= 0 then raise exception 'valor inválido'; end if;
  v_novo := least(v.valor, v.valor_pago + v_add);

  update public.lancamento set
    valor_pago = v_novo,
    conta = coalesce(nullif(p_conta, ''), conta),
    status = case when v_novo >= v.valor then 'pago' else 'pendente' end,
    pago_em = case when v_novo >= v.valor then current_date else pago_em end,
    updated_at = now()
  where id = p_lancamento;
end;
$$;
revoke all on function public.registrar_pagamento(uuid, bigint, text) from public, anon;
grant execute on function public.registrar_pagamento(uuid, bigint, text) to authenticated;
