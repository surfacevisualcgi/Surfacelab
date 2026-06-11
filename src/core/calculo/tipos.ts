/**
 * Motor de cálculo Surface Labs — tipos.
 *
 * Convenções (não negociáveis):
 * - Dinheiro SEMPRE em inteiro de centavos (`Centavos`). Nunca float de reais.
 * - Percentuais/taxas SEMPRE em fração 0–1 (`Fracao`). 35% = 0.35.
 * - Pesos em gramas (FDM) ou ml (resina) — mesmo cálculo, unidade no rótulo.
 * - Tempo em minutos.
 */

export type Centavos = number; // inteiro
export type Fracao = number; // 0–1

export type Tecnologia = 'fdm' | 'resina';

/** Consumo de material de impressão (filamento ou resina) */
export interface MaterialImpressao {
  descricao: string;
  tecnologia: Tecnologia;
  /** g (FDM) ou ml (resina) — peça + suporte + purga + desperdício, separados */
  pesoPecaG: number;
  pesoSuporteG: number;
  pesoPurgaG: number;
  pesoDesperdicioG: number;
  /** custo por g/ml em centavos (pode ser fracionário, ex.: 7.6 = R$0,076/g) */
  custoUnitario: number;
}

/** Componente comprado, embalagem ou serviço da composição */
export interface ItemAvulso {
  descricao: string;
  quantidade: number;
  unidade?: string;
  custoUnitario: Centavos;
}

export interface UsoMaquina {
  descricao: string;
  tempoImpressaoMin: number;
  /** amortização + manutenção, em centavos/hora */
  custoHora: Centavos;
  /** potência média em watts (para o item de energia) */
  consumoW: number;
  /** tarifa em centavos por kWh */
  tarifaKwh: Centavos;
}

export interface EtapaMaoDeObra {
  descricao: string;
  tempoMin: number;
  valorHora: Centavos;
}

export interface CustoDesenvolvimento {
  custoTotal: Centavos;
  qtdPlanejadaRateio: number;
}

/**
 * Rateio de custo fixo (decisão §7.4):
 * - 'faturamento' (padrão): aplica-se como PERCENTUAL do preço
 *   (% = custo_fixo_mensal ÷ faturamento_mensal_esperado) — entra no
 *   denominador do preço, não recursivo.
 * - demais critérios: valor direto somado ao custo do lote.
 */
export type RateioCustoFixo =
  | { criterio: 'faturamento'; custoFixoMensal: Centavos; faturamentoMensalEsperado: Centavos }
  | { criterio: 'hora_maquina'; custoPorHora: Centavos; horasMaquina: number }
  | { criterio: 'hora_trabalho'; custoPorHora: Centavos; horasTrabalho: number }
  | { criterio: 'pedido'; custoPorPedido: Centavos };

export interface Taxas {
  canal: Fracao;
  pagamento: Fracao;
  comissao: Fracao;
  /** alíquota tributária efetiva (perfil fiscal) */
  aliquota: Fracao;
}

/** Preset de cenário (rápido/padrão/conservador) — §7.5 */
export interface CenarioPrecificacao {
  nome: string;
  probabilidadeFalha: Fracao;
  margem: Fracao;
  provisao: Fracao;
}

export interface EntradasCalculo {
  /** quantidade colocada na mesa */
  qtdProduzida: number;
  /** quantidade que se espera VENDER (desconta refugo) — divide o custo unitário */
  qtdVendavel: number;

  materiais: MaterialImpressao[];
  componentes: ItemAvulso[];
  embalagens: ItemAvulso[];
  servicos: ItemAvulso[];
  maquinas: UsoMaquina[];
  maoDeObra: EtapaMaoDeObra[];
  desenvolvimento?: CustoDesenvolvimento;
  custosFixos?: RateioCustoFixo;
  custosExtras: ItemAvulso[];

  /** fração 0–1; default vem do modelo 3D, pode ter override */
  probabilidadeFalha: Fracao;
  /** provisão de garantia/devoluções */
  provisao: Fracao;
  margemDesejada: Fracao;
  /** margem mínima aceitável — define o preço-piso */
  margemMinima?: Fracao;
  taxas: Taxas;
  /** desconto comercial aplicado ao preço final do lote */
  desconto?: Centavos;
}

/** Linha do detalhamento — cada valor com explicação visível (transparência) */
export interface ItemCusto {
  chave: string;
  descricao: string;
  /** explicação humana da fórmula, com os números usados */
  explicacao: string;
  total: Centavos;
  detalhes?: { descricao: string; total: Centavos; explicacao: string }[];
}

export interface ResultadoCalculo {
  versaoMotor: string;
  entradas: EntradasCalculo;
  itens: ItemCusto[];

  /** custo direto do lote (antes de falhas/provisão) */
  subtotalDireto: Centavos;
  custoFalhas: Centavos;
  provisaoGarantia: Centavos;
  /** custo total do lote (sem o rateio % de custo fixo por faturamento) */
  custoTotal: Centavos;
  /** custo por unidade VENDÁVEL */
  custoUnitario: Centavos;

  precoAntesTaxas: Centavos;
  /** preço final do lote (após taxas/impostos/rateio % e desconto) */
  precoFinal: Centavos;
  precoUnitario: Centavos;
  /** piso: nunca vender abaixo disso */
  precoMinimo: Centavos;
  precoMinimoUnitario: Centavos;

  /** valor pago em taxas/comissões/impostos sobre o preço final */
  valorTaxas: Centavos;
  /** parcela do custo fixo carregada por esta venda (critério faturamento) */
  rateioCustoFixoValor: Centavos;

  markup: number;
  /** margem líquida: (preço − taxas − fixo% − custo) ÷ preço */
  margem: Fracao;
  /** lucro líquido em centavos (após taxas e rateio %) */
  lucro: Centavos;
  /** lucro "bruto" da fórmula clássica (preço − custo), para referência */
  lucroBruto: Centavos;

  alertas: string[];
}
