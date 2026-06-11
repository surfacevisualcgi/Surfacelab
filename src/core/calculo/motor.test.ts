import { describe, expect, it } from 'vitest';
import { calcular, entradasVazias, type EntradasCalculo } from './index';

/**
 * Cenário de referência (números redondos para conferência manual):
 *
 * Lote de 10 peças, 9 vendáveis (1 de refugo esperado).
 * - Material: 100g peça + 10g suporte + 5g purga + 5g desperdício = 120g/peça?
 *   Não: materiais aqui são do LOTE (a calculadora soma o lote inteiro).
 *   120g × 10 peças = 1200g × R$0,10/g (10 centavos) = R$ 120,00
 * - Componentes: 10 × R$ 5,00 = R$ 50,00
 * - Energia: 20h × 200W = 4 kWh × R$ 1,00/kWh = R$ 4,00
 * - Máquina: 20h × R$ 3,00/h = R$ 60,00
 * - Mão de obra: 120min × R$ 30,00/h = R$ 60,00
 * - Embalagem: 10 × R$ 1,50 = R$ 15,00
 * Subtotal direto = 120 + 50 + 4 + 60 + 60 + 15 = R$ 309,00
 * Falhas 5% = R$ 15,45 | Provisão 3% = R$ 9,27
 * Custo total = R$ 333,72 → custo unitário (9 vendáveis) = R$ 37,08
 * Preço antes taxas (margem 35%) = 333,72 / 0,65 = R$ 513,42
 * Taxas 15% → preço final = 513,42 / 0,85 = R$ 604,02
 */
function cenarioReferencia(): EntradasCalculo {
  return {
    ...entradasVazias(),
    qtdProduzida: 10,
    qtdVendavel: 9,
    materiais: [
      {
        descricao: 'PLA Preto',
        tecnologia: 'fdm',
        pesoPecaG: 1000,
        pesoSuporteG: 100,
        pesoPurgaG: 50,
        pesoDesperdicioG: 50,
        custoUnitario: 10, // R$ 0,10/g
      },
    ],
    componentes: [{ descricao: 'Soquete', quantidade: 10, custoUnitario: 500 }],
    embalagens: [{ descricao: 'Caixa', quantidade: 10, custoUnitario: 150 }],
    maquinas: [
      {
        descricao: 'Ender 3',
        tempoImpressaoMin: 1200, // 20h
        custoHora: 300,
        consumoW: 200,
        tarifaKwh: 100,
      },
    ],
    maoDeObra: [{ descricao: 'Acabamento', tempoMin: 120, valorHora: 3000 }],
    probabilidadeFalha: 0.05,
    provisao: 0.03,
    margemDesejada: 0.35,
    taxas: { canal: 0.1, pagamento: 0.03, comissao: 0, aliquota: 0.02 }, // 15%
  };
}

describe('motor de cálculo — componentes do custo (§5.1)', () => {
  it('soma materiais por peso total (peça + suporte + purga + desperdício)', () => {
    const r = calcular(cenarioReferencia());
    const materiais = r.itens.find((i) => i.chave === 'materiais');
    expect(materiais?.total).toBe(12000); // 1200g × 10¢
  });

  it('calcula energia por kWh e uso de máquina por hora', () => {
    const r = calcular(cenarioReferencia());
    expect(r.itens.find((i) => i.chave === 'energia')?.total).toBe(400); // 4 kWh × R$1
    expect(r.itens.find((i) => i.chave === 'maquina')?.total).toBe(6000); // 20h × R$3
  });

  it('calcula mão de obra por minuto trabalhado', () => {
    const r = calcular(cenarioReferencia());
    expect(r.itens.find((i) => i.chave === 'mao_de_obra')?.total).toBe(6000); // 2h × R$30
  });

  it('aplica falhas e provisão sobre o subtotal direto', () => {
    const r = calcular(cenarioReferencia());
    expect(r.subtotalDireto).toBe(30900);
    expect(r.custoFalhas).toBe(1545); // 5%
    expect(r.provisaoGarantia).toBe(927); // 3%
    expect(r.custoTotal).toBe(33372);
  });
});

describe('motor de cálculo — do custo ao preço (§5.2)', () => {
  it('divide o custo unitário pela quantidade VENDÁVEL, não produzida', () => {
    const r = calcular(cenarioReferencia());
    expect(r.custoUnitario).toBe(Math.round(33372 / 9)); // 3708
  });

  it('aplica margem sobre o custo e taxas por divisão (não soma)', () => {
    const r = calcular(cenarioReferencia());
    expect(r.precoAntesTaxas).toBe(Math.round(33372 / 0.65)); // 51342
    expect(r.precoFinal).toBe(Math.round(51342 / 0.85)); // 60402
  });

  it('calcula lucro líquido descontando as taxas pagas', () => {
    const r = calcular(cenarioReferencia());
    const taxas = Math.round(60402 * 0.15); // 9060
    expect(r.valorTaxas).toBe(taxas);
    expect(r.lucro).toBe(60402 - taxas - 33372); // 17970 ≈ margem real
    expect(r.lucroBruto).toBe(60402 - 33372);
    expect(r.margem).toBeCloseTo(r.lucro / 60402, 10);
  });

  it('preço mínimo usa a margem mínima como piso', () => {
    const r = calcular(cenarioReferencia());
    expect(r.precoMinimo).toBe(Math.round(33372 / 0.9 / 0.85));
    expect(r.precoMinimo).toBeLessThan(r.precoFinal);
  });

  it('alerta quando o desconto fura o preço mínimo', () => {
    const e = cenarioReferencia();
    e.desconto = 20000; // R$ 200 de desconto
    const r = calcular(e);
    expect(r.precoFinal).toBe(60402 - 20000);
    expect(r.alertas.some((a) => a.includes('abaixo do preço mínimo'))).toBe(true);
  });
});

describe('motor de cálculo — custos fixos (§7.4)', () => {
  it('critério faturamento entra como % no denominador do preço (não recursivo)', () => {
    const e = cenarioReferencia();
    // R$ 1.000 fixos / R$ 10.000 esperados = 10% do preço
    e.custosFixos = {
      criterio: 'faturamento',
      custoFixoMensal: 100000,
      faturamentoMensalEsperado: 1000000,
    };
    const r = calcular(e);
    // divisor agora é 1 − 0,15 − 0,10 = 0,75
    expect(r.precoFinal).toBe(Math.round(51342 / 0.75)); // 68456
    expect(r.rateioCustoFixoValor).toBe(Math.round(r.precoFinal * 0.1));
    // o custo fixo NÃO entra no custo_total do lote (vira % do preço)
    expect(r.custoTotal).toBe(33372);
  });

  it('critério hora_maquina soma valor direto ao custo', () => {
    const e = cenarioReferencia();
    e.custosFixos = { criterio: 'hora_maquina', custoPorHora: 200, horasMaquina: 20 };
    const r = calcular(e);
    expect(r.subtotalDireto).toBe(30900 + 4000);
    expect(r.rateioCustoFixoValor).toBe(0);
  });
});

describe('motor de cálculo — resina e casos de borda', () => {
  it('resina calcula igual, com unidade ml', () => {
    const e = entradasVazias();
    e.materiais = [
      {
        descricao: 'Resina cinza',
        tecnologia: 'resina',
        pesoPecaG: 80,
        pesoSuporteG: 15,
        pesoPurgaG: 0,
        pesoDesperdicioG: 5,
        custoUnitario: 25, // R$0,25/ml
      },
    ];
    const r = calcular(e);
    const item = r.itens.find((i) => i.chave === 'materiais');
    expect(item?.total).toBe(2500); // 100ml × 25¢
    expect(item?.detalhes?.[0].explicacao).toContain('ml');
  });

  it('amortização de desenvolvimento rateia pela quantidade planejada', () => {
    const e = entradasVazias();
    e.qtdProduzida = 5;
    e.qtdVendavel = 5;
    e.desenvolvimento = { custoTotal: 50000, qtdPlanejadaRateio: 100 };
    const r = calcular(e);
    // R$500 ÷ 100 un × 5 un do lote = R$ 25,00
    expect(r.itens.find((i) => i.chave === 'desenvolvimento')?.total).toBe(2500);
  });

  it('taxas ≥ 100% não explodem: preço zera e alerta', () => {
    const e = cenarioReferencia();
    e.taxas = { canal: 0.6, pagamento: 0.3, comissao: 0.1, aliquota: 0.05 };
    const r = calcular(e);
    expect(r.precoFinal).toBe(0);
    expect(r.alertas.some((a) => a.includes('100%'))).toBe(true);
  });

  it('todos os valores monetários do resultado são inteiros (centavos)', () => {
    const r = calcular(cenarioReferencia());
    for (const v of [
      r.subtotalDireto, r.custoFalhas, r.provisaoGarantia, r.custoTotal,
      r.custoUnitario, r.precoAntesTaxas, r.precoFinal, r.precoUnitario,
      r.precoMinimo, r.valorTaxas, r.rateioCustoFixoValor, r.lucro, r.lucroBruto,
    ]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    for (const item of r.itens) {
      expect(Number.isInteger(item.total)).toBe(true);
    }
  });

  it('cada item de custo carrega explicação legível (transparência)', () => {
    const r = calcular(cenarioReferencia());
    for (const item of r.itens) {
      expect(item.explicacao.length).toBeGreaterThan(10);
    }
    const materiais = r.itens.find((i) => i.chave === 'materiais');
    expect(materiais?.detalhes?.[0].explicacao).toMatch(/1000g.*100g.*50g.*50g/);
  });
});
