/**
 * Edge Function: gerar-orcamento — o cálculo AUTORITATIVO.
 *
 * O cliente faz preview ao vivo com o mesmo motor, mas o orçamento só nasce
 * aqui: o servidor re-resolve os custos referenciados no banco (anti-
 * adulteração), re-executa o motor puro e grava o snapshot imutável.
 * Roda com o JWT do usuário → RLS e permissões valem normalmente.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { calcular, entradasVazias, VERSAO_MOTOR } from '../_shared/calculo/motor.ts';
import type { EntradasCalculo } from '../_shared/calculo/tipos.ts';

interface Payload {
  entradas: EntradasCalculo;
  nome?: string;
  produto_id?: string | null;
  impressora_id?: string | null;
  cliente_id?: string | null;
  canal_id?: string | null;
  validade?: string | null;
  refs?: { materiais?: (string | null)[] };
}

interface MaterialRef {
  id: string;
  nome: string;
  tipo: string;
  unidade_consumo: string;
  custo_medio: number;
  custo_unitario: number;
}

interface ModeloRef {
  id: string;
  nome: string;
  tecnologia: 'fdm' | 'resina';
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
  probabilidade_falha: number;
  material_recomendado_id: string | null;
  impressora_recomendada_id: string | null;
}

interface TarefaRef {
  id: string;
  nome: string;
  valor_hora: number;
}

interface ItemComposicao {
  id: string;
  tipo: 'modelo_impresso' | 'componente' | 'embalagem' | 'servico' | 'mao_de_obra';
  modelo_id: string | null;
  material_id: string | null;
  tarefa_id: string | null;
  descricao: string | null;
  quantidade: number;
  unidade: string;
  custo_manual: number | null;
  tempo_min: number | null;
  modelo?: ModeloRef | null;
  material?: MaterialRef | null;
  tarefa?: TarefaRef | null;
}

interface ImpressoraRef {
  id: string;
  nome: string;
  valor_aquisicao: number;
  vida_util_horas: number;
  consumo_w: number;
  manutencao_hora: number;
}

interface ProdutoCalc {
  custo_desenvolvimento: number | null;
  qtd_planejada_rateio: number;
}

function custoMaterial(m: MaterialRef | null | undefined): number {
  if (!m) return 0;
  const medio = Number(m.custo_medio);
  return medio > 0 ? medio : Number(m.custo_unitario);
}

function clonarParametrosComerciais(base: EntradasCalculo): EntradasCalculo {
  const e = entradasVazias();
  const qtdProduzida = Math.max(1, Number(base.qtdProduzida || 1));
  const qtdVendavelBase = Number(base.qtdVendavel || qtdProduzida);
  e.qtdProduzida = qtdProduzida;
  e.qtdVendavel = Math.max(1, Math.min(qtdVendavelBase, qtdProduzida));
  e.margemDesejada = Math.min(0.95, Math.max(0, Number(base.margemDesejada ?? e.margemDesejada)));
  e.margemMinima = Math.min(0.95, Math.max(0, Number(base.margemMinima ?? e.margemMinima)));
  e.probabilidadeFalha = Math.min(0.95, Math.max(0, Number(base.probabilidadeFalha ?? e.probabilidadeFalha)));
  e.provisao = Math.min(0.95, Math.max(0, Number(base.provisao ?? e.provisao)));
  e.descontoAtacado = Math.min(0.9, Math.max(0, Number(base.descontoAtacado ?? e.descontoAtacado)));
  e.desconto = Math.max(0, Number(base.desconto ?? 0));
  e.taxas = { ...e.taxas, ...(base.taxas ?? {}) };
  return e;
}

function montarEntradasProduto(args: {
  base: EntradasCalculo;
  itens: ItemComposicao[];
  materiaisPorId: Map<string, MaterialRef>;
  impressora: ImpressoraRef | null;
  tarifaKwh: number;
  produto: ProdutoCalc | null;
}): { entradas: EntradasCalculo; problemas: string[] } {
  const e = clonarParametrosComerciais(args.base);
  const problemas: string[] = [];
  let tempoTotalMin = 0;
  let probFalhaMax = 0;

  if (args.itens.length === 0) problemas.push('O produto não tem composição cadastrada.');

  for (const item of args.itens) {
    const q = Number(item.quantidade);
    const nomeItem = item.modelo?.nome ?? item.material?.nome ?? item.tarefa?.nome ?? item.descricao ?? 'Item';

    if (item.tipo === 'modelo_impresso') {
      const mo = item.modelo;
      if (!mo) {
        problemas.push(`${nomeItem} não tem modelo 3D vinculado.`);
        continue;
      }

      const peso =
        Number(mo.peso_peca_g) + Number(mo.peso_suporte_g) +
        Number(mo.peso_purga_g) + Number(mo.peso_desperdicio_g);
      const mat = item.material
        ?? (mo.material_recomendado_id ? args.materiaisPorId.get(mo.material_recomendado_id) : undefined);
      const custo = custoMaterial(mat ?? null);

      if (peso <= 0) problemas.push(`${mo.nome} está com peso zerado no modelo 3D.`);
      if (!mat) problemas.push(`${mo.nome} não tem material recomendado ou material na composição.`);
      else if (custo <= 0) problemas.push(`${mat.nome} está sem custo médio ou custo de compra.`);
      if (Number(mo.tempo_impressao_min) <= 0) problemas.push(`${mo.nome} está com tempo de impressão zerado.`);

      e.materiais.push({
        descricao: `${mo.nome}${mat ? ` - ${mat.nome}` : ''}`,
        tecnologia: mo.tecnologia,
        pesoPecaG: Number(mo.peso_peca_g) * q * e.qtdProduzida,
        pesoSuporteG: Number(mo.peso_suporte_g) * q * e.qtdProduzida,
        pesoPurgaG: Number(mo.peso_purga_g) * q * e.qtdProduzida,
        pesoDesperdicioG: Number(mo.peso_desperdicio_g) * q * e.qtdProduzida,
        custoUnitario: custo,
      });
      tempoTotalMin += Number(mo.tempo_impressao_min) * q * e.qtdProduzida;
      probFalhaMax = Math.max(probFalhaMax, Number(mo.probabilidade_falha));
    } else if (item.tipo === 'componente' || item.tipo === 'embalagem') {
      const custo = custoMaterial(item.material ?? null);
      if (!item.material || custo <= 0) problemas.push(`${nomeItem} está sem custo de material.`);
      const destino = item.tipo === 'componente' ? e.componentes : e.embalagens;
      destino.push({
        descricao: item.material?.nome ?? nomeItem,
        quantidade: q * e.qtdProduzida,
        unidade: item.unidade,
        custoUnitario: Math.round(custo),
      });
    } else if (item.tipo === 'mao_de_obra') {
      if (!item.tarefa || !item.tempo_min || Number(item.tarefa.valor_hora) <= 0) {
        problemas.push(`${nomeItem} está com mão de obra incompleta.`);
      }
      e.maoDeObra.push({
        descricao: item.tarefa?.nome ?? nomeItem,
        tempoMin: Number(item.tempo_min ?? 0) * q * e.qtdProduzida,
        valorHora: Number(item.tarefa?.valor_hora ?? 0),
      });
    } else if (item.tipo === 'servico') {
      if (Number(item.custo_manual ?? 0) <= 0) problemas.push(`${nomeItem} está sem custo de serviço.`);
      e.servicos.push({
        descricao: item.descricao ?? 'Serviço',
        quantidade: q * e.qtdProduzida,
        unidade: item.unidade,
        custoUnitario: Number(item.custo_manual ?? 0),
      });
    }
  }

  if (probFalhaMax > 0) e.probabilidadeFalha = Math.max(e.probabilidadeFalha, probFalhaMax);
  if (tempoTotalMin > 0) {
    if (!args.impressora) {
      problemas.push('Produto com impressão precisa de uma impressora selecionada ou recomendada.');
    } else {
      const amortizacao = Number(args.impressora.vida_util_horas) > 0
        ? Number(args.impressora.valor_aquisicao) / Number(args.impressora.vida_util_horas)
        : 0;
      e.maquinas.push({
        descricao: args.impressora.nome,
        tempoImpressaoMin: tempoTotalMin,
        custoHora: Math.round(amortizacao + Number(args.impressora.manutencao_hora)),
        consumoW: Number(args.impressora.consumo_w),
        tarifaKwh: Number(args.tarifaKwh),
      });
    }
  }

  if (
    args.produto &&
    Number(args.produto.custo_desenvolvimento ?? 0) > 0 &&
    Number(args.produto.qtd_planejada_rateio) > 0
  ) {
    e.desenvolvimento = {
      custoTotal: Number(args.produto.custo_desenvolvimento),
      qtdPlanejadaRateio: Number(args.produto.qtd_planejada_rateio),
    };
  }

  return { entradas: e, problemas };
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
    let entradas = payload.entradas;
    if (!entradas || typeof entradas !== 'object') {
      return new Response(JSON.stringify({ error: 'entradas ausentes' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ---- re-resolução server-side de custos referenciados (anti-tampering) ----
    // Produto sempre é reconstruído do banco quando produto_id é informado.
    if (payload.produto_id) {
      const { data: produto } = await supabase
        .from('v_produto')
        .select('custo_desenvolvimento, qtd_planejada_rateio')
        .eq('id', payload.produto_id)
        .maybeSingle();

      const { data: itens, error: itensErro } = await supabase
        .from('composicao_item')
        .select(
          'id, tipo, modelo_id, material_id, tarefa_id, descricao, quantidade, unidade, custo_manual, tempo_min, ordem, ' +
          'modelo:modelo_id (id, nome, tecnologia, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g, probabilidade_falha, material_recomendado_id, impressora_recomendada_id), ' +
          'material:material_id (id, nome, tipo, unidade_consumo, custo_medio, custo_unitario), ' +
          'tarefa:tarefa_id (id, nome, valor_hora)',
        )
        .eq('produto_id', payload.produto_id)
        .is('deleted_at', null)
        .order('ordem', { ascending: true });
      if (itensErro) throw itensErro;

      const { data: materiais } = await supabase
        .from('material')
        .select('id, nome, tipo, unidade_consumo, custo_medio, custo_unitario')
        .is('deleted_at', null);
      const materiaisPorId = new Map((materiais ?? []).map((m) => [m.id, m as MaterialRef]));
      const composicao = (itens ?? []) as unknown as ItemComposicao[];

      const impressoraId =
        payload.impressora_id ??
        composicao.find((item) => item.modelo?.impressora_recomendada_id)?.modelo?.impressora_recomendada_id ??
        null;
      let impressora: ImpressoraRef | null = null;
      let tarifaKwh = 0;
      if (impressoraId) {
        const { data: imp } = await supabase
          .from('impressora')
          .select('id, nome, valor_aquisicao, vida_util_horas, consumo_w, manutencao_hora, perfil_energia_id')
          .eq('id', impressoraId)
          .is('deleted_at', null)
          .maybeSingle();
        if (imp) {
          impressora = imp as ImpressoraRef;
          if (imp.perfil_energia_id) {
            const { data: energia } = await supabase
              .from('perfil_energia')
              .select('tarifa_kwh')
              .eq('id', imp.perfil_energia_id)
              .maybeSingle();
            tarifaKwh = Number(energia?.tarifa_kwh ?? 0);
          }
        }
      }

      const reconstruido = montarEntradasProduto({
        base: entradas,
        itens: composicao,
        materiaisPorId,
        impressora,
        tarifaKwh,
        produto: produto as ProdutoCalc | null,
      });
      if (reconstruido.problemas.length > 0) {
        return new Response(JSON.stringify({
          error: 'produto incompleto para cálculo',
          problemas: reconstruido.problemas,
        }), {
          status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      entradas = reconstruido.entradas;
    }

    // Taxas do canal sempre vêm do banco quando canal_id é informado.
    if (payload.canal_id) {
      const { data: canal } = await supabase
        .from('canal_venda')
        .select('nome, taxa_marketplace, taxa_pagamento, comissao, custo_fixo_pedido')
        .eq('id', payload.canal_id)
        .single();
      if (canal) {
        entradas.taxas.canal = Number(canal.taxa_marketplace);
        entradas.taxas.pagamento = Number(canal.taxa_pagamento);
        entradas.taxas.comissao = Number(canal.comissao);
        entradas.custosExtras = entradas.custosExtras
          .filter((c) => !c.descricao.toLowerCase().includes('custo fixo por pedido'));
        if (Number(canal.custo_fixo_pedido) > 0) {
          entradas.custosExtras.push({
            descricao: `${canal.nome} - custo fixo por pedido`,
            quantidade: 1,
            unidade: 'pedido',
            custoUnitario: Number(canal.custo_fixo_pedido),
          });
        }
      }
    } else {
      entradas.taxas.canal = 0;
      entradas.taxas.pagamento = 0;
      entradas.taxas.comissao = 0;
      entradas.custosExtras = entradas.custosExtras
        .filter((c) => !c.descricao.toLowerCase().includes('custo fixo por pedido'));
    }
    // Alíquota do perfil fiscal padrão do tenant:
    {
      const { data: fiscais } = await supabase
        .from('perfil_fiscal')
        .select('aliquota_efetiva, padrao')
        .is('deleted_at', null);
      const fiscal = (fiscais ?? []).find((f) => f.padrao) ?? (fiscais ?? [])[0];
      entradas.taxas.aliquota = fiscal ? Number(fiscal.aliquota_efetiva) : 0;
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
        .select('valor_mensal, ativo, ratear')
        .is('deleted_at', null);
      const totalFixo = (fixos ?? []).filter((f) => f.ativo && f.ratear !== false)
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
