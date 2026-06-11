/**
 * Edge Function: gerar-orcamento — o cálculo AUTORITATIVO.
 *
 * O cliente faz preview ao vivo com o mesmo motor, mas o orçamento só nasce
 * aqui: o servidor re-resolve os custos referenciados no banco (anti-
 * adulteração), re-executa o motor puro e grava o snapshot imutável.
 * Roda com o JWT do usuário → RLS e permissões valem normalmente.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { calcular, VERSAO_MOTOR } from '../_shared/calculo/motor.ts';
import type { EntradasCalculo } from '../_shared/calculo/tipos.ts';

interface Payload {
  entradas: EntradasCalculo;
  nome?: string;
  produto_id?: string | null;
  cliente_id?: string | null;
  canal_id?: string | null;
  validade?: string | null;
  refs?: { materiais?: (string | null)[] };
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: claims } = await supabase.auth.getUser();
    if (!claims?.user) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await req.json()) as Payload;
    const entradas = payload.entradas;
    if (!entradas || typeof entradas !== 'object') {
      return new Response(JSON.stringify({ error: 'entradas ausentes' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ---- re-resolução server-side de custos referenciados (anti-tampering) ----
    // Taxas do canal sempre do banco quando canal_id informado:
    if (payload.canal_id) {
      const { data: canal } = await supabase
        .from('canal_venda')
        .select('taxa_marketplace, taxa_pagamento, comissao')
        .eq('id', payload.canal_id)
        .single();
      if (canal) {
        entradas.taxas.canal = Number(canal.taxa_marketplace);
        entradas.taxas.pagamento = Number(canal.taxa_pagamento);
        entradas.taxas.comissao = Number(canal.comissao);
      }
    }
    // Alíquota do perfil fiscal padrão do tenant:
    {
      const { data: fiscais } = await supabase
        .from('perfil_fiscal')
        .select('aliquota_efetiva, padrao')
        .is('deleted_at', null);
      const fiscal = (fiscais ?? []).find((f) => f.padrao) ?? (fiscais ?? [])[0];
      if (fiscal) entradas.taxas.aliquota = Number(fiscal.aliquota_efetiva);
    }
    // Config de custo fixo do tenant (critério faturamento):
    {
      const { data: tenantRow } = await supabase
        .from('tenant')
        .select('id, criterio_rateio_custo_fixo, faturamento_mensal_esperado')
        .limit(1)
        .single();
      const { data: fixos } = await supabase
        .from('custo_fixo')
        .select('valor_mensal, ativo')
        .is('deleted_at', null);
      const totalFixo = (fixos ?? []).filter((f) => f.ativo)
        .reduce((s, f) => s + Number(f.valor_mensal), 0);
      if (tenantRow && totalFixo > 0 && tenantRow.criterio_rateio_custo_fixo === 'faturamento') {
        entradas.custosFixos = {
          criterio: 'faturamento',
          custoFixoMensal: totalFixo,
          faturamentoMensalEsperado: Number(tenantRow.faturamento_mensal_esperado),
        };
      }
    }

    // ---- cálculo autoritativo ----
    const resultado = calcular(entradas);
    if (resultado.precoFinal <= 0 || resultado.itens.length === 0) {
      return new Response(JSON.stringify({ error: 'cálculo sem itens ou preço inválido', alertas: resultado.alertas }), {
        status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ---- snapshots congelados ----
    let clienteSnapshot: Record<string, unknown> = {};
    if (payload.cliente_id) {
      const { data: cli } = await supabase
        .from('cliente')
        .select('nome, cidade, estado')
        .eq('id', payload.cliente_id)
        .maybeSingle();
      // minimização LGPD: snapshot guarda só o necessário do documento
      if (cli) clienteSnapshot = { nome: cli.nome, cidade: cli.cidade, estado: cli.estado };
    }
    let empresaSnapshot: Record<string, unknown> = {};
    {
      const { data: emp } = await supabase
        .from('empresa')
        .select('razao_social, nome_fantasia, cnpj')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (emp) empresaSnapshot = emp;
    }

    const { data: tenantAtual } = await supabase
      .from('tenant').select('id').limit(1).single();

    let descricaoItem = payload.nome ?? 'Item calculado';
    if (payload.produto_id) {
      const { data: prod } = await supabase
        .from('v_produto').select('nome').eq('id', payload.produto_id).maybeSingle();
      if (prod) descricaoItem = prod.nome;
    }

    const { data: orc, error: orcErro } = await supabase
      .from('orcamento')
      .insert({
        tenant_id: tenantAtual!.id,
        numero: '',
        status: 'rascunho',
        cliente_id: payload.cliente_id ?? null,
        cliente_snapshot: clienteSnapshot,
        empresa_snapshot: empresaSnapshot,
        canal_id: payload.canal_id ?? null,
        validade: payload.validade ?? null,
        total: resultado.precoFinal,
        custo_total: resultado.custoTotal,
        lucro_estimado: resultado.lucro,
        margem_estimada: Number(resultado.margem.toFixed(4)),
        calculo_snapshot: resultado,
        versao_motor: VERSAO_MOTOR,
      })
      .select('id, numero')
      .single();
    if (orcErro) throw orcErro;

    const { error: itemErro } = await supabase.from('orcamento_item').insert({
      tenant_id: tenantAtual!.id,
      orcamento_id: orc.id,
      produto_id: payload.produto_id ?? null,
      descricao: descricaoItem,
      quantidade: entradas.qtdVendavel,
      valor_unit: resultado.precoUnitario,
      valor_total: resultado.precoFinal,
      custo_unit: resultado.custoUnitario,
    });
    if (itemErro) throw itemErro;

    return new Response(
      JSON.stringify({ orcamento_id: orc.id, numero: orc.numero, total: resultado.precoFinal }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
