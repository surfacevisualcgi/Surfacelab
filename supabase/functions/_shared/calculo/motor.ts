/**
 * Motor de cálculo Surface Labs — módulo PURO.
 *
 * Sem dependência de UI, banco ou rede: recebe entradas, devolve o
 * detalhamento completo com explicação de cada valor. A MESMA lógica roda no
 * cliente (preview ao vivo da Calculadora) e no servidor (Edge Function
 * autoritativa ao gerar orçamento/pedido).
 *
 * Fórmulas: LOGICA_E_MODELAGEM.md §5 / PLANO_DO_PRODUTO.md.
 */

import type {
  Centavos,
  EntradasCalculo,
  ItemCusto,
  ResultadoCalculo,
} from './tipos.ts';

export const VERSAO_MOTOR = '1.0.0';

const r = Math.round;

function reais(c: Centavos): string {
  // formatação neutra para EXPLICAÇÕES internas (UI formata com o locale do tenant)
  return (c / 100).toFixed(2);
}

function pct(f: number): string {
  return `${(f * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** Soma de taxas que incidem sobre o preço (frações) */
function somaTaxas(e: EntradasCalculo): number {
  const { canal, pagamento, comissao, aliquota } = e.taxas;
  return canal + pagamento + comissao + aliquota;
}

/** Percentual de custo fixo no critério "faturamento" (decisão §7.4) */
function pctCustoFixo(e: EntradasCalculo): number {
  const cf = e.custosFixos;
  if (!cf || cf.criterio !== 'faturamento') return 0;
  if (cf.faturamentoMensalEsperado <= 0) return 0;
  return cf.custoFixoMensal / cf.faturamentoMensalEsperado;
}

function validar(e: EntradasCalculo): string[] {
  const alertas: string[] = [];
  if (e.qtdProduzida <= 0) alertas.push('Quantidade produzida deve ser maior que zero.');
  if (e.qtdVendavel <= 0) alertas.push('Quantidade vendável deve ser maior que zero.');
  if (e.qtdVendavel > e.qtdProduzida)
    alertas.push('Quantidade vendável maior que a produzida — confira o refugo esperado.');
  if (e.margemDesejada >= 1 || e.margemDesejada < 0)
    alertas.push('Margem desejada deve estar entre 0% e 99%.');
  const taxasTotais = somaTaxas(e) + pctCustoFixo(e);
  if (taxasTotais >= 1)
    alertas.push('Taxas + impostos + rateio fixo somam 100% ou mais — preço impossível.');
  if (e.probabilidadeFalha > 0.5)
    alertas.push('Probabilidade de falha acima de 50% — confira o valor.');
  return alertas;
}

export function calcular(e: EntradasCalculo): ResultadoCalculo {
  const alertas = validar(e);
  const itens: ItemCusto[] = [];

  // ---- 1. Materiais de impressão (peça + suporte + purga + desperdício) ----
  let custoMateriais = 0;
  const detMateriais = e.materiais.map((m) => {
    const pesoTotal = m.pesoPecaG + m.pesoSuporteG + m.pesoPurgaG + m.pesoDesperdicioG;
    const total = r(pesoTotal * m.custoUnitario);
    custoMateriais += total;
    const un = m.tecnologia === 'resina' ? 'ml' : 'g';
    return {
      descricao: m.descricao,
      total,
      explicacao:
        `(${m.pesoPecaG}${un} peça + ${m.pesoSuporteG}${un} suporte + ` +
        `${m.pesoPurgaG}${un} purga + ${m.pesoDesperdicioG}${un} desperdício) ` +
        `× R$ ${reais(m.custoUnitario)}/${un} = R$ ${reais(total)}`,
    };
  });
  if (e.materiais.length > 0) {
    itens.push({
      chave: 'materiais',
      descricao: 'Materiais de impressão',
      explicacao: 'Peso total consumido (peça + suporte + purga + desperdício) × custo médio por unidade.',
      total: custoMateriais,
      detalhes: detMateriais,
    });
  }

  // ---- 2. Componentes comprados ----
  const calcAvulsos = (lista: typeof e.componentes) =>
    lista.map((c) => {
      const total = r(c.quantidade * c.custoUnitario);
      return {
        descricao: c.descricao,
        total,
        explicacao: `${c.quantidade} ${c.unidade ?? 'un'} × R$ ${reais(c.custoUnitario)} = R$ ${reais(total)}`,
      };
    });

  const detComponentes = calcAvulsos(e.componentes);
  const custoComponentes = detComponentes.reduce((s, d) => s + d.total, 0);
  if (e.componentes.length > 0) {
    itens.push({
      chave: 'componentes',
      descricao: 'Componentes',
      explicacao: 'Quantidade × custo unitário de cada componente da composição.',
      total: custoComponentes,
      detalhes: detComponentes,
    });
  }

  // ---- 3. Energia ----
  let custoEnergia = 0;
  const detEnergia = e.maquinas
    .filter((m) => m.consumoW > 0 && m.tarifaKwh > 0)
    .map((m) => {
      const horas = m.tempoImpressaoMin / 60;
      const kwh = (m.consumoW / 1000) * horas;
      const total = r(kwh * m.tarifaKwh);
      custoEnergia += total;
      return {
        descricao: `Energia — ${m.descricao}`,
        total,
        explicacao:
          `${horas.toFixed(2)}h × ${m.consumoW}W = ${kwh.toFixed(3)} kWh ` +
          `× R$ ${reais(m.tarifaKwh)}/kWh = R$ ${reais(total)}`,
      };
    });
  if (detEnergia.length > 0) {
    itens.push({
      chave: 'energia',
      descricao: 'Energia elétrica',
      explicacao: 'Tempo de impressão × potência da impressora × tarifa do kWh.',
      total: custoEnergia,
      detalhes: detEnergia,
    });
  }

  // ---- 4. Uso de máquina (amortização + manutenção) ----
  let custoMaquina = 0;
  const detMaquina = e.maquinas
    .filter((m) => m.custoHora > 0)
    .map((m) => {
      const horas = m.tempoImpressaoMin / 60;
      const total = r(horas * m.custoHora);
      custoMaquina += total;
      return {
        descricao: `Uso de máquina — ${m.descricao}`,
        total,
        explicacao: `${horas.toFixed(2)}h × R$ ${reais(m.custoHora)}/h = R$ ${reais(total)}`,
      };
    });
  if (detMaquina.length > 0) {
    itens.push({
      chave: 'maquina',
      descricao: 'Uso de máquina',
      explicacao: 'Tempo de impressão × custo/hora (amortização da impressora + reserva de manutenção).',
      total: custoMaquina,
      detalhes: detMaquina,
    });
  }

  // ---- 5. Mão de obra ----
  let custoMaoDeObra = 0;
  const detMO = e.maoDeObra.map((t) => {
    const horas = t.tempoMin / 60;
    const total = r(horas * t.valorHora);
    custoMaoDeObra += total;
    return {
      descricao: t.descricao,
      total,
      explicacao: `${t.tempoMin}min × R$ ${reais(t.valorHora)}/h = R$ ${reais(total)}`,
    };
  });
  if (e.maoDeObra.length > 0) {
    itens.push({
      chave: 'mao_de_obra',
      descricao: 'Mão de obra',
      explicacao: 'Tempo de cada etapa (preparação, pós-processamento, montagem…) × valor/hora da tarefa.',
      total: custoMaoDeObra,
      detalhes: detMO,
    });
  }

  // ---- 6. Embalagem ----
  const detEmb = calcAvulsos(e.embalagens);
  const custoEmbalagem = detEmb.reduce((s, d) => s + d.total, 0);
  if (e.embalagens.length > 0) {
    itens.push({
      chave: 'embalagem',
      descricao: 'Embalagem',
      explicacao: 'Quantidade × custo unitário de embalagens e proteção.',
      total: custoEmbalagem,
      detalhes: detEmb,
    });
  }

  // ---- 7. Serviços terceirizados / custos extras ----
  const detServ = calcAvulsos(e.servicos);
  const custoServicos = detServ.reduce((s, d) => s + d.total, 0);
  if (e.servicos.length > 0) {
    itens.push({
      chave: 'servicos',
      descricao: 'Serviços',
      explicacao: 'Serviços terceirizados incluídos na composição.',
      total: custoServicos,
      detalhes: detServ,
    });
  }
  const detExtras = calcAvulsos(e.custosExtras);
  const custoExtras = detExtras.reduce((s, d) => s + d.total, 0);
  if (e.custosExtras.length > 0) {
    itens.push({
      chave: 'extras',
      descricao: 'Custos extras',
      explicacao: 'Outros custos informados manualmente nesta simulação.',
      total: custoExtras,
      detalhes: detExtras,
    });
  }

  // ---- 8. Amortização do desenvolvimento ----
  let custoDesenvolvimento = 0;
  if (e.desenvolvimento && e.desenvolvimento.qtdPlanejadaRateio > 0) {
    custoDesenvolvimento = r(
      (e.desenvolvimento.custoTotal / e.desenvolvimento.qtdPlanejadaRateio) * e.qtdProduzida,
    );
    itens.push({
      chave: 'desenvolvimento',
      descricao: 'Desenvolvimento (amortização)',
      explicacao:
        `R$ ${reais(e.desenvolvimento.custoTotal)} ÷ ${e.desenvolvimento.qtdPlanejadaRateio} un planejadas ` +
        `× ${e.qtdProduzida} un deste lote = R$ ${reais(custoDesenvolvimento)}`,
      total: custoDesenvolvimento,
    });
  }

  // ---- 9. Custos fixos (critérios diretos; "faturamento" entra como %) ----
  let custoFixoDireto = 0;
  const cf = e.custosFixos;
  if (cf) {
    if (cf.criterio === 'hora_maquina') {
      custoFixoDireto = r(cf.custoPorHora * cf.horasMaquina);
      itens.push({
        chave: 'custos_fixos',
        descricao: 'Custos fixos (rateio por hora-máquina)',
        explicacao: `${cf.horasMaquina}h-máquina × R$ ${reais(cf.custoPorHora)}/h = R$ ${reais(custoFixoDireto)}`,
        total: custoFixoDireto,
      });
    } else if (cf.criterio === 'hora_trabalho') {
      custoFixoDireto = r(cf.custoPorHora * cf.horasTrabalho);
      itens.push({
        chave: 'custos_fixos',
        descricao: 'Custos fixos (rateio por hora trabalhada)',
        explicacao: `${cf.horasTrabalho}h × R$ ${reais(cf.custoPorHora)}/h = R$ ${reais(custoFixoDireto)}`,
        total: custoFixoDireto,
      });
    } else if (cf.criterio === 'pedido') {
      custoFixoDireto = cf.custoPorPedido;
      itens.push({
        chave: 'custos_fixos',
        descricao: 'Custos fixos (rateio por pedido)',
        explicacao: `Valor fixo por pedido: R$ ${reais(custoFixoDireto)}`,
        total: custoFixoDireto,
      });
    }
    // criterio === 'faturamento': tratado como % no preço, item adicionado depois
  }

  // ---- Subtotal direto ----
  const subtotalDireto =
    custoMateriais + custoComponentes + custoEnergia + custoMaquina +
    custoMaoDeObra + custoEmbalagem + custoServicos + custoExtras +
    custoDesenvolvimento + custoFixoDireto;

  // ---- 10. Falhas e provisão (sobre o subtotal direto) ----
  const custoFalhas = r(subtotalDireto * e.probabilidadeFalha);
  if (custoFalhas > 0) {
    itens.push({
      chave: 'falhas',
      descricao: 'Custo esperado de falhas',
      explicacao:
        `R$ ${reais(subtotalDireto)} × ${pct(e.probabilidadeFalha)} de probabilidade de falha ` +
        `= R$ ${reais(custoFalhas)}`,
      total: custoFalhas,
    });
  }
  const provisaoGarantia = r(subtotalDireto * e.provisao);
  if (provisaoGarantia > 0) {
    itens.push({
      chave: 'provisao',
      descricao: 'Provisão de garantia/devoluções',
      explicacao: `R$ ${reais(subtotalDireto)} × ${pct(e.provisao)} = R$ ${reais(provisaoGarantia)}`,
      total: provisaoGarantia,
    });
  }

  const custoTotal = subtotalDireto + custoFalhas + provisaoGarantia;
  const custoUnitario = e.qtdVendavel > 0 ? r(custoTotal / e.qtdVendavel) : 0;

  // ---- 11. Do custo ao preço ----
  // preco_antes_taxas = custo / (1 − margem)
  // preco_final = preco_antes_taxas / (1 − taxas − %fixo_faturamento)
  const taxas = somaTaxas(e);
  const fixoPct = pctCustoFixo(e);
  const divisorMargem = 1 - e.margemDesejada;
  const divisorTaxas = 1 - taxas - fixoPct;

  let precoAntesTaxas = 0;
  let precoFinal = 0;
  if (divisorMargem > 0 && divisorTaxas > 0) {
    precoAntesTaxas = r(custoTotal / divisorMargem);
    precoFinal = r(precoAntesTaxas / divisorTaxas);
  }
  if (e.desconto && e.desconto > 0) {
    precoFinal = Math.max(0, precoFinal - e.desconto);
  }

  const valorTaxas = r(precoFinal * taxas);
  const rateioCustoFixoValor = r(precoFinal * fixoPct);
  if (fixoPct > 0) {
    itens.push({
      chave: 'custos_fixos',
      descricao: 'Custos fixos (rateio por faturamento)',
      explicacao:
        `${pct(fixoPct)} do preço (custo fixo mensal ÷ faturamento esperado) ` +
        `× R$ ${reais(precoFinal)} = R$ ${reais(rateioCustoFixoValor)}`,
      total: rateioCustoFixoValor,
    });
  }

  // ---- 12. Indicadores ----
  // lucro líquido (honesto): preço − taxas pagas − rateio fixo % − custo total
  const lucro = precoFinal - valorTaxas - rateioCustoFixoValor - custoTotal;
  // lucro "bruto" da fórmula clássica (referência/comparação)
  const lucroBruto = precoFinal - custoTotal;
  const margem = precoFinal > 0 ? lucro / precoFinal : 0;
  const markup = custoTotal > 0 ? precoFinal / custoTotal : 0;

  // preço mínimo (piso): margem mínima ao invés da desejada
  const margemMinima = e.margemMinima ?? 0.1;
  let precoMinimo = 0;
  if (1 - margemMinima > 0 && divisorTaxas > 0) {
    precoMinimo = r(custoTotal / (1 - margemMinima) / divisorTaxas);
  }

  const precoUnitario = e.qtdVendavel > 0 ? r(precoFinal / e.qtdVendavel) : 0;
  const precoMinimoUnitario = e.qtdVendavel > 0 ? r(precoMinimo / e.qtdVendavel) : 0;

  if (precoFinal > 0 && precoFinal < precoMinimo) {
    alertas.push(
      `Preço final (R$ ${reais(precoFinal)}) abaixo do preço mínimo recomendado (R$ ${reais(precoMinimo)}) — desconto excessivo.`,
    );
  }

  return {
    versaoMotor: VERSAO_MOTOR,
    entradas: e,
    itens,
    subtotalDireto,
    custoFalhas,
    provisaoGarantia,
    custoTotal,
    custoUnitario,
    precoAntesTaxas,
    precoFinal,
    precoUnitario,
    precoMinimo,
    precoMinimoUnitario,
    valorTaxas,
    rateioCustoFixoValor,
    markup,
    margem,
    lucro,
    lucroBruto,
    alertas,
  };
}

/** Entradas vazias — ponto de partida da Calculadora */
export function entradasVazias(): EntradasCalculo {
  return {
    qtdProduzida: 1,
    qtdVendavel: 1,
    materiais: [],
    componentes: [],
    embalagens: [],
    servicos: [],
    maquinas: [],
    maoDeObra: [],
    custosExtras: [],
    probabilidadeFalha: 0.05,
    provisao: 0.03,
    margemDesejada: 0.35,
    margemMinima: 0.1,
    taxas: { canal: 0, pagamento: 0, comissao: 0, aliquota: 0 },
  };
}
