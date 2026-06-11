/**
 * Composição (BOM): resolução do custo "vivo" de cada item a partir dos
 * cadastros, e montagem das entradas da Calculadora a partir de um produto.
 * O congelamento (snapshot) só acontece ao gerar orçamento/pedido.
 */
import type { EntradasCalculo } from '@/core/calculo';
import { entradasVazias } from '@/core/calculo';

export interface ItemComposicao {
  id: string;
  produto_id: string;
  tipo: 'modelo_impresso' | 'componente' | 'embalagem' | 'servico' | 'mao_de_obra';
  modelo_id: string | null;
  material_id: string | null;
  tarefa_id: string | null;
  descricao: string | null;
  quantidade: number;
  unidade: string;
  custo_manual: number | null;
  tempo_min: number | null;
  // joins
  modelo?: ModeloRef | null;
  material?: MaterialRef | null;
  tarefa?: TarefaRef | null;
}

export interface ModeloRef {
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

export interface MaterialRef {
  id: string;
  nome: string;
  tipo: string;
  unidade_consumo: string;
  custo_medio: number; // centavos/un consumo (méd. ponderada)
  custo_unitario: number; // centavos/un consumo (última compra)
}

export interface TarefaRef {
  id: string;
  nome: string;
  valor_hora: number;
}

/** custo de referência do material: custo médio do estoque, senão última compra */
export function custoMaterial(m: MaterialRef | null | undefined): number {
  if (!m) return 0;
  const medio = Number(m.custo_medio);
  return medio > 0 ? medio : Number(m.custo_unitario);
}

/** custo vivo de UMA unidade do item de composição (centavos) */
export function custoItemComposicao(item: ItemComposicao): number {
  switch (item.tipo) {
    case 'modelo_impresso': {
      const mo = item.modelo;
      if (!mo) return 0;
      const peso =
        Number(mo.peso_peca_g) + Number(mo.peso_suporte_g) +
        Number(mo.peso_purga_g) + Number(mo.peso_desperdicio_g);
      return Math.round(peso * custoMaterial(item.material));
    }
    case 'componente':
    case 'embalagem':
      return Math.round(custoMaterial(item.material));
    case 'mao_de_obra': {
      if (!item.tarefa || !item.tempo_min) return 0;
      return Math.round((item.tempo_min / 60) * Number(item.tarefa.valor_hora));
    }
    case 'servico':
      return Number(item.custo_manual ?? 0);
  }
}

export const SELECAO_COMPOSICAO =
  'id, produto_id, tipo, modelo_id, material_id, tarefa_id, descricao, quantidade, unidade, custo_manual, tempo_min, ordem, ' +
  'modelo:modelo_id (id, nome, tecnologia, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g, probabilidade_falha, material_recomendado_id, impressora_recomendada_id), ' +
  'material:material_id (id, nome, tipo, unidade_consumo, custo_medio, custo_unitario), ' +
  'tarefa:tarefa_id (id, nome, valor_hora)';

interface ImpressoraRef {
  id: string;
  nome: string;
  valor_aquisicao: number;
  vida_util_horas: number;
  consumo_w: number;
  manutencao_hora: number;
  tarifa_kwh?: number;
}

/** Monta as entradas da Calculadora a partir da composição de um produto. */
export function entradasDoProduto(
  itens: ItemComposicao[],
  qtd: number,
  materiaisPorId: Map<string, MaterialRef>,
  impressora?: ImpressoraRef | null,
  tarifaKwh = 0,
): EntradasCalculo {
  const e = entradasVazias();
  e.qtdProduzida = qtd;
  e.qtdVendavel = qtd;

  let tempoTotalMin = 0;
  let probFalhaMax = 0;

  for (const item of itens) {
    const q = Number(item.quantidade);
    if (item.tipo === 'modelo_impresso' && item.modelo) {
      const mo = item.modelo;
      const mat = item.material
        ?? (mo.material_recomendado_id ? materiaisPorId.get(mo.material_recomendado_id) : undefined);
      e.materiais.push({
        descricao: `${mo.nome}${mat ? ` — ${mat.nome}` : ''}`,
        tecnologia: mo.tecnologia,
        pesoPecaG: Number(mo.peso_peca_g) * q * qtd,
        pesoSuporteG: Number(mo.peso_suporte_g) * q * qtd,
        pesoPurgaG: Number(mo.peso_purga_g) * q * qtd,
        pesoDesperdicioG: Number(mo.peso_desperdicio_g) * q * qtd,
        custoUnitario: custoMaterial(mat ?? null),
      });
      tempoTotalMin += Number(mo.tempo_impressao_min) * q * qtd;
      probFalhaMax = Math.max(probFalhaMax, Number(mo.probabilidade_falha));
    } else if (item.tipo === 'componente' && item.material) {
      e.componentes.push({
        descricao: item.material.nome,
        quantidade: q * qtd,
        unidade: item.unidade,
        custoUnitario: Math.round(custoMaterial(item.material)),
      });
    } else if (item.tipo === 'embalagem' && item.material) {
      e.embalagens.push({
        descricao: item.material.nome,
        quantidade: q * qtd,
        unidade: item.unidade,
        custoUnitario: Math.round(custoMaterial(item.material)),
      });
    } else if (item.tipo === 'mao_de_obra' && item.tarefa) {
      e.maoDeObra.push({
        descricao: item.tarefa.nome,
        tempoMin: (item.tempo_min ?? 0) * q * qtd,
        valorHora: Number(item.tarefa.valor_hora),
      });
    } else if (item.tipo === 'servico') {
      e.servicos.push({
        descricao: item.descricao ?? 'Serviço',
        quantidade: q * qtd,
        unidade: item.unidade,
        custoUnitario: Number(item.custo_manual ?? 0),
      });
    }
  }

  if (probFalhaMax > 0) e.probabilidadeFalha = probFalhaMax;

  if (impressora && tempoTotalMin > 0) {
    const amortizacao = impressora.vida_util_horas > 0
      ? Number(impressora.valor_aquisicao) / Number(impressora.vida_util_horas)
      : 0;
    e.maquinas.push({
      descricao: impressora.nome,
      tempoImpressaoMin: tempoTotalMin,
      custoHora: Math.round(amortizacao + Number(impressora.manutencao_hora)),
      consumoW: Number(impressora.consumo_w),
      tarifaKwh: tarifaKwh,
    });
  }

  return e;
}

export type { ImpressoraRef };
