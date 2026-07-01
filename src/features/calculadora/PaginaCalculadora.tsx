/**
 * Calculadora operacional.
 * Preview ao vivo no cliente com o mesmo motor puro usado pela Edge Function
 * autoritativa ao gerar orçamento.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro, useLista } from '@/lib/dados';
import {
  custoMaterial,
  entradasDoProduto,
  SELECAO_COMPOSICAO,
  type ImpressoraRef,
  type ItemComposicao,
  type MaterialRef,
} from '@/lib/composicao';
import { calcular, entradasVazias, VERSAO_MOTOR, type EntradasCalculo } from '@/core/calculo';
import { duracao, moeda, percentual } from '@/lib/formato';
import { Botao, Campo, Entrada, EstadoVazio, Selecao } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import type { Modelo3D } from '../modelos/PaginaModelos';

interface Canal {
  id: string;
  nome: string;
  taxa_marketplace: number;
  taxa_pagamento: number;
  comissao: number;
  custo_fixo_pedido: number | null;
}

interface PerfilFiscal {
  id: string;
  nome: string;
  aliquota_efetiva: number;
  padrao: boolean;
}

interface ProdutoCalc {
  id: string;
  nome: string;
  preco_praticado: number;
  preco_sugerido: number | null;
  custo_atual: number | null;
  custo_desenvolvimento: number | null;
  qtd_planejada_rateio: number;
  custos_visiveis: boolean;
}

interface ProdutoCanalCalc {
  id: string;
  preco_praticado: number;
}

type ModoCalculo = 'rapido' | 'produto' | 'orcamento' | 'canal' | 'lote' | 'comparar';
type CenarioUi = 'economico' | 'padrao' | 'premium';

const modos: { id: ModoCalculo; chave: string }[] = [
  { id: 'rapido', chave: 'rapido' },
  { id: 'produto', chave: 'produto' },
  { id: 'orcamento', chave: 'orcamento' },
  { id: 'canal', chave: 'canal' },
  { id: 'lote', chave: 'lote' },
  { id: 'comparar', chave: 'comparar' },
];

const cenariosUi: { id: CenarioUi; ajuste: number; provisao: number; falha: number }[] = [
  { id: 'economico', ajuste: -0.08, provisao: -0.01, falha: -0.01 },
  { id: 'padrao', ajuste: 0, provisao: 0, falha: 0 },
  { id: 'premium', ajuste: 0.12, provisao: 0.015, falha: 0.015 },
];

const icones = {
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Zm2.5 0A2.5 2.5 0 0 0 4 10h16V7.5H6.5ZM16 13h4v3h-4a1.5 1.5 0 0 1 0-3Z',
  arrow: 'M7 17 17 7M9 7h8v8',
  target: 'M12 22a10 10 0 1 1 10-10h-2a8 8 0 1 0-8 8v2Zm1-5v-4h4v-2h-4V7h-2v4H7v2h4v4h2Z',
  percent: 'M7.5 8.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm9 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM6 19 18 5',
  cube: 'M12 2 3.5 6.8v10.4L12 22l8.5-4.8V6.8L12 2Zm0 2.3 5.9 3.3L12 10.9 6.1 7.6 12 4.3ZM5.5 9.4l5.5 3.1v6.4l-5.5-3.1V9.4Zm7.5 9.5v-6.4l5.5-3.1v6.4L13 18.9Z',
  box: 'M4 7h16v13H4V7Zm2 2v9h12V9H6Zm3-5h6v2H9V4Z',
  clock: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v5l4 2-.9 1.8L11 13V7h2Z',
  check: 'M9.5 16.5 5.5 12.5 7 11l2.5 2.5L17 6l1.5 1.5-9 9Z',
  bolt: 'M13 2 4 14h7l-1 8 10-13h-7l1-7Z',
  chart: 'M4 19h16v2H4V3h2v16Zm4-2V9h3v8H8Zm5 0V5h3v12h-3Zm5 0v-6h3v6h-3Z',
  send: 'M21 3 3 10.5l7 3L13 21 21 3Zm-5.2 5.2-4.5 4.5-3.6-1.5 8.1-3Z',
  save: 'M5 3h12l2 2v16H5V3Zm2 2v5h9V5H7Zm0 14h10v-6H7v6Z',
};

export function PaginaCalculadora() {
  const { t } = useTranslation();
  const { ativa, flag, pode, formato } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const produtoParam = params.get('produto');
  const modeloParam = params.get('modelo');

  const produtos = useLista<{ id: string; nome: string }>('v_produto', { ordem: 'nome', desc: false, selecao: 'id, nome' });
  const modelos = useLista<Modelo3D>('modelo_3d', { ordem: 'nome', desc: false });
  const materiais = useLista<MaterialRef>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<ImpressoraRef & { nome: string; perfil_energia_id: string | null }>('impressora', { ordem: 'nome', desc: false });
  const energias = useLista<{ id: string; tarifa_kwh: number }>('perfil_energia', { ordem: 'nome', desc: false });
  const canais = useLista<Canal>('canal_venda', { ordem: 'nome', desc: false });
  const fiscais = useLista<PerfilFiscal>('perfil_fiscal', { ordem: 'nome', desc: false });
  const custosFixos = useLista<{ id: string; valor_mensal: number; ativo: boolean; ratear?: boolean }>('custo_fixo', { ordem: 'nome', desc: false });
  const clientes = useLista<{ id: string; nome: string }>('v_cliente', { ordem: 'nome', desc: false, selecao: 'id, nome' });

  const [modo, setModo] = useState<ModoCalculo>(produtoParam ? 'produto' : modeloParam ? 'rapido' : 'produto');
  const [cenarioAtivo, setCenarioAtivo] = useState<CenarioUi>('padrao');
  const [nome] = useState('');
  const [produtoId, setProdutoId] = useState(produtoParam ?? '');
  const [modeloId, setModeloId] = useState(modeloParam ?? '');
  const [impressoraId, setImpressoraId] = useState('');
  const [canalId, setCanalId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [qtdProduzida, setQtdProduzida] = useState(1);
  const [qtdVendavel, setQtdVendavel] = useState(1);
  const [margem, setMargem] = useState<number | null>(null);
  const [probFalha, setProbFalha] = useState<number | null>(null);
  const [provisao, setProvisao] = useState<number | null>(null);
  const [descAtacado, setDescAtacado] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const composicao = useQuery({
    queryKey: ['composicao_item', produtoId],
    enabled: !!produtoId && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composicao_item')
        .select(SELECAO_COMPOSICAO)
        .eq('produto_id', produtoId)
        .is('deleted_at', null)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return data as unknown as ItemComposicao[];
    },
  });

  const produtoDetalhe = useQuery({
    queryKey: ['produto_calc', produtoId],
    enabled: !!produtoId && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_produto')
        .select('id, nome, preco_praticado, preco_sugerido, custo_atual, custo_desenvolvimento, qtd_planejada_rateio, custos_visiveis')
        .eq('id', produtoId)
        .single();
      if (error) throw error;
      return data as ProdutoCalc;
    },
  });

  const produtoCanal = useQuery({
    queryKey: ['produto_canal_calc', produtoId, canalId],
    enabled: !!produtoId && !!canalId && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produto_canal')
        .select('id, preco_praticado')
        .eq('produto_id', produtoId)
        .eq('canal_id', canalId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data as ProdutoCanalCalc | null;
    },
  });

  useEffect(() => {
    if (modeloParam && modelos.data) {
      const mo = modelos.data.find((m) => m.id === modeloParam);
      if (mo?.impressora_recomendada_id) setImpressoraId(mo.impressora_recomendada_id);
    }
  }, [modeloParam, modelos.data]);

  useEffect(() => {
    if (impressoraId || !composicao.data) return;
    const recomendada = composicao.data.find((item) => item.modelo?.impressora_recomendada_id)?.modelo?.impressora_recomendada_id;
    if (recomendada) setImpressoraId(recomendada);
  }, [composicao.data, impressoraId]);

  useEffect(() => {
    if (modo === 'rapido') setProdutoId('');
    if (modo === 'lote' && qtdProduzida < 5) {
      setQtdProduzida(10);
      setQtdVendavel(10);
    }
  }, [modo]);

  const tenantCenarios = ativa?.tenant.cenarios_precificacao ?? [];
  const tenantPadrao = tenantCenarios[1] ?? tenantCenarios[0] ?? {
    nome: 'Padrao',
    probabilidade_falha: 0.05,
    margem: 0.35,
    provisao: 0.03,
  };
  const ajusteCenario = cenariosUi.find((c) => c.id === cenarioAtivo) ?? cenariosUi[1];
  const margemBase = Math.min(0.95, Math.max(0, Number(tenantPadrao.margem ?? 0.35) + ajusteCenario.ajuste));
  const falhaBase = Math.min(0.95, Math.max(0, Number(tenantPadrao.probabilidade_falha ?? 0.05) + ajusteCenario.falha));
  const provisaoBase = Math.min(0.95, Math.max(0, Number(tenantPadrao.provisao ?? 0.03) + ajusteCenario.provisao));

  const usarProduto = modo !== 'rapido' && !!produtoId;

  const entradas: EntradasCalculo = useMemo(() => {
    const matsPorId = new Map((materiais.data ?? []).map((m) => [m.id, m]));
    const imp = (impressoras.data ?? []).find((i) => i.id === impressoraId) ?? null;
    const tarifa = imp?.perfil_energia_id
      ? Number((energias.data ?? []).find((e) => e.id === imp.perfil_energia_id)?.tarifa_kwh ?? 0)
      : Number((energias.data ?? [])[0]?.tarifa_kwh ?? 0);

    let e: EntradasCalculo;
    if (usarProduto && composicao.data) {
      e = entradasDoProduto(composicao.data, qtdProduzida, matsPorId, imp, tarifa);
    } else if (modeloId && modelos.data) {
      e = entradasVazias();
      e.qtdProduzida = qtdProduzida;
      const mo = modelos.data.find((m) => m.id === modeloId);
      if (mo) {
        const mat = mo.material_recomendado_id ? matsPorId.get(mo.material_recomendado_id) : undefined;
        e.materiais.push({
          descricao: `${mo.nome}${mat ? ` - ${mat.nome}` : ''}`,
          tecnologia: mo.tecnologia,
          pesoPecaG: Number(mo.peso_peca_g) * qtdProduzida,
          pesoSuporteG: Number(mo.peso_suporte_g) * qtdProduzida,
          pesoPurgaG: Number(mo.peso_purga_g) * qtdProduzida,
          pesoDesperdicioG: Number(mo.peso_desperdicio_g) * qtdProduzida,
          custoUnitario: custoMaterial(mat ?? null),
        });
        e.probabilidadeFalha = Number(mo.probabilidade_falha);
        if (imp) {
          const amort = imp.vida_util_horas > 0 ? Number(imp.valor_aquisicao) / Number(imp.vida_util_horas) : 0;
          e.maquinas.push({
            descricao: imp.nome,
            tempoImpressaoMin: Number(mo.tempo_impressao_min) * qtdProduzida,
            custoHora: Math.round(amort + Number(imp.manutencao_hora)),
            consumoW: Number(imp.consumo_w),
            tarifaKwh: tarifa,
          });
        }
      }
    } else {
      e = entradasVazias();
      e.qtdProduzida = qtdProduzida;
    }

    e.qtdVendavel = Math.min(qtdVendavel, qtdProduzida) || qtdProduzida;
    e.margemDesejada = margem ?? margemBase;
    e.probabilidadeFalha = probFalha ?? (e.probabilidadeFalha || falhaBase);
    e.provisao = provisao ?? provisaoBase;
    e.descontoAtacado = descAtacado ?? (modo === 'lote' ? 0.14 : 0.1);

    if (usarProduto && produtoDetalhe.data && Number(produtoDetalhe.data.custo_desenvolvimento ?? 0) > 0 && Number(produtoDetalhe.data.qtd_planejada_rateio) > 0) {
      e.desenvolvimento = {
        custoTotal: Number(produtoDetalhe.data.custo_desenvolvimento),
        qtdPlanejadaRateio: Number(produtoDetalhe.data.qtd_planejada_rateio),
      };
    }

    const canal = (canais.data ?? []).find((c) => c.id === canalId);
    const fiscal = (fiscais.data ?? []).find((p) => p.padrao) ?? (fiscais.data ?? [])[0];
    const usarTaxaCanal = modo === 'canal' || modo === 'orcamento' || modo === 'comparar' || !!canalId;
    e.taxas = {
      canal: usarTaxaCanal ? Number(canal?.taxa_marketplace ?? 0) : 0,
      pagamento: usarTaxaCanal ? Number(canal?.taxa_pagamento ?? 0) : 0,
      comissao: usarTaxaCanal ? Number(canal?.comissao ?? 0) : 0,
      aliquota: Number(fiscal?.aliquota_efetiva ?? 0),
    };
    if (usarTaxaCanal && canal && Number(canal.custo_fixo_pedido) > 0) {
      e.custosExtras.push({
        descricao: `${canal.nome} - custo fixo por pedido`,
        quantidade: 1,
        unidade: 'pedido',
        custoUnitario: Number(canal.custo_fixo_pedido),
      });
    }

    const totalFixo = (custosFixos.data ?? [])
      .filter((c) => c.ativo && c.ratear !== false)
      .reduce((s, c) => s + Number(c.valor_mensal), 0);
    if (totalFixo > 0 && ativa) {
      const criterio = ativa.tenant.criterio_rateio_custo_fixo;
      if (criterio === 'faturamento') {
        e.custosFixos = {
          criterio: 'faturamento',
          custoFixoMensal: totalFixo,
          faturamentoMensalEsperado: Number(ativa.tenant.faturamento_mensal_esperado),
        };
      } else if (criterio === 'pedido') {
        e.custosFixos = { criterio: 'pedido', custoPorPedido: Math.round(totalFixo / 30) };
      }
    }

    return e;
  }, [
    usarProduto,
    composicao.data,
    qtdProduzida,
    qtdVendavel,
    materiais.data,
    impressoras.data,
    energias.data,
    impressoraId,
    modeloId,
    modelos.data,
    margem,
    margemBase,
    probFalha,
    falhaBase,
    provisao,
    provisaoBase,
    descAtacado,
    modo,
    canais.data,
    canalId,
    fiscais.data,
    custosFixos.data,
    ativa,
    produtoDetalhe.data,
  ]);

  const resultado = useMemo(() => calcular(entradas), [entradas]);
  const temItens = resultado.itens.length > 0;
  const tempoTotalMin = entradas.maquinas.reduce((s, m) => s + Number(m.tempoImpressaoMin), 0);
  const materialTotal = entradas.materiais.reduce((s, m) => s + m.pesoPecaG + m.pesoSuporteG + m.pesoPurgaG + m.pesoDesperdicioG, 0);
  const composicaoVisual = useMemo(() => montarComposicaoVisual(composicao.data ?? [], entradas), [composicao.data, entradas]);
  const precoCadastrado = produtoDetalhe.data
    ? (Number(produtoDetalhe.data.preco_praticado) > 0 ? Number(produtoDetalhe.data.preco_praticado) : Number(produtoDetalhe.data.preco_sugerido ?? 0))
    : 0;
  const precoCanalAtual = produtoCanal.data?.preco_praticado ?? 0;
  const diferencaPreco = resultado.precoUnitario - precoCadastrado;

  const diagnosticoProduto = useMemo(() => {
    const problemas: string[] = [];
    if (!usarProduto) return { confiavel: temItens, problemas };
    const itens = composicao.data ?? [];
    const matsPorId = new Map((materiais.data ?? []).map((m) => [m.id, m]));

    if (itens.length === 0) {
      problemas.push(t('calculadora.diagnostico.semComposicao'));
    }

    for (const item of itens) {
      const nomeItem = item.modelo?.nome ?? item.material?.nome ?? item.tarefa?.nome ?? item.descricao ?? t('calculadora.item');
      if (item.tipo === 'modelo_impresso') {
        const modelo = item.modelo;
        if (!modelo) {
          problemas.push(t('calculadora.diagnostico.modeloAusente', { item: nomeItem }));
          continue;
        }
        const peso = Number(modelo.peso_peca_g) + Number(modelo.peso_suporte_g) + Number(modelo.peso_purga_g) + Number(modelo.peso_desperdicio_g);
        const material = item.material ?? (modelo.material_recomendado_id ? matsPorId.get(modelo.material_recomendado_id) : undefined);
        if (peso <= 0) problemas.push(t('calculadora.diagnostico.pesoZerado', { item: modelo.nome }));
        if (!material) problemas.push(t('calculadora.diagnostico.semMaterial', { item: modelo.nome }));
        else if (custoMaterial(material) <= 0) problemas.push(t('calculadora.diagnostico.materialSemCusto', { item: material.nome }));
        if (Number(modelo.tempo_impressao_min) <= 0) problemas.push(t('calculadora.diagnostico.tempoZerado', { item: modelo.nome }));
        if (!impressoraId && !modelo.impressora_recomendada_id) problemas.push(t('calculadora.diagnostico.semImpressora', { item: modelo.nome }));
      } else if ((item.tipo === 'componente' || item.tipo === 'embalagem') && (!item.material || custoMaterial(item.material) <= 0)) {
        problemas.push(t('calculadora.diagnostico.itemSemCusto', { item: nomeItem }));
      } else if (item.tipo === 'mao_de_obra' && (!item.tarefa || !item.tempo_min || Number(item.tarefa.valor_hora) <= 0)) {
        problemas.push(t('calculadora.diagnostico.maoObraIncompleta', { item: nomeItem }));
      } else if (item.tipo === 'servico' && Number(item.custo_manual ?? 0) <= 0) {
        problemas.push(t('calculadora.diagnostico.servicoSemCusto', { item: nomeItem }));
      }
    }

    return { confiavel: problemas.length === 0 && temItens, problemas };
  }, [usarProduto, composicao.data, materiais.data, produtoDetalhe.data, t, temItens, impressoraId]);
  const calculoPronto = temItens && (!usarProduto || diagnosticoProduto.confiavel);

  const resultadosCenarios = useMemo(() => (
    cenariosUi.map((c) => {
      const margemCenario = Math.min(0.95, Math.max(0, Number(tenantPadrao.margem ?? 0.35) + c.ajuste));
      const res = calcular({ ...entradas, margemDesejada: margemCenario });
      return { ...c, resultado: res, margem: margemCenario };
    })
  ), [entradas, tenantPadrao.margem]);

  async function salvarSimulacao() {
    if (!calculoPronto) {
      setErro(t('calculadora.diagnostico.bloqueioAtualizacao'));
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from('simulacao').insert({
      tenant_id: ativa?.tenant_id,
      nome: nome || t('calculadora.titulo'),
      produto_id: usarProduto ? produtoId || null : null,
      modelo_id: !usarProduto ? modeloId || null : null,
      cliente_id: clienteId || null,
      canal_id: canalId || null,
      calculo: resultado,
      versao_motor: VERSAO_MOTOR,
    });
    setSalvando(false);
    if (error) setErro(mensagemErro(error));
    else {
      setMsg(t('calculadora.simulacaoSalva'));
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function gerarOrcamento() {
    if (!calculoPronto) {
      setErro(t('calculadora.diagnostico.bloqueioAtualizacao'));
      return;
    }
    setGerando(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke('gerar-orcamento', {
      body: {
        entradas,
        nome: nome || undefined,
        produto_id: usarProduto ? produtoId || null : null,
        impressora_id: impressoraId || null,
        cliente_id: clienteId || null,
        canal_id: canalId || null,
        refs: {
          materiais: (composicao.data ?? []).filter((i) => i.material_id).map((i) => i.material_id),
        },
      },
    });
    setGerando(false);
    if (error) setErro(mensagemErro(error));
    else if (data?.orcamento_id) navigate(`/orcamentos/${data.orcamento_id}`);
  }

  async function atualizarProdutoCalculado() {
    if (!produtoId || !diagnosticoProduto.confiavel) {
      setErro(t('calculadora.diagnostico.bloqueioAtualizacao'));
      return;
    }
    const { error } = await supabase
      .from('produto')
      .update({
        custo_atual: resultado.custoUnitario,
        preco_sugerido: resultado.precoUnitario,
      })
      .eq('id', produtoId);
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    setErro(null);
    setMsg(t('calculadora.produtoAtualizado'));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['v_produto'] }),
      qc.invalidateQueries({ queryKey: ['produto_calc', produtoId] }),
    ]);
    setTimeout(() => setMsg(null), 2500);
  }

  async function atualizarCanalCalculado() {
    if (!produtoId || !canalId || !diagnosticoProduto.confiavel) {
      setErro(t('calculadora.diagnostico.bloqueioAtualizacao'));
      return;
    }
    const atual = produtoCanal.data;
    const payload = {
      tenant_id: ativa?.tenant_id,
      produto_id: produtoId,
      canal_id: canalId,
      preco_praticado: resultado.precoUnitario,
    };
    const { error } = atual
      ? await supabase.from('produto_canal').update({ preco_praticado: resultado.precoUnitario }).eq('id', atual.id)
      : await supabase.from('produto_canal').insert(payload);
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    setErro(null);
    setMsg(t('calculadora.canalAtualizado'));
    await qc.invalidateQueries({ queryKey: ['produto_canal_calc', produtoId, canalId] });
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <div className="flex min-h-0 flex-col text-[13px] xl:h-[calc(100dvh-112px)] xl:overflow-hidden">
      <section className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('calculadora.titulo')}</h1>
          <p className="mt-1 text-sm text-texto-2">{t('calculadora.v2Subtitulo')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" disabled={!calculoPronto || salvando} onClick={salvarSimulacao}>
            <Icone d={icones.save} /> {t('calculadora.salvarSimulacao')}
          </Botao>
          {pode('orcamentos', 'criar') && (
            <Botao variante="acento" disabled={!calculoPronto || gerando} onClick={gerarOrcamento}>
              <Icone d={icones.send} /> {gerando ? t('estados.salvando') : t('calculadora.gerarOrcamento')}
            </Botao>
          )}
        </div>
      </section>

      <section className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-borda bg-white p-1.5 shadow-sm">
          {modos.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModo(m.id)}
              className={`rounded-xl px-3 py-2 text-xs font-extrabold transition-colors ${
                modo === m.id ? 'grad-acento text-white shadow-sm' : 'text-texto-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {t(`calculadora.modos.${m.chave}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-2xl border border-borda bg-white p-1.5 shadow-sm">
          {cenariosUi.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setCenarioAtivo(c.id); setMargem(null); setProbFalha(null); setProvisao(null); }}
              className={`rounded-xl px-3 py-2 text-xs font-extrabold transition-colors ${
                cenarioAtivo === c.id ? 'border border-brand-roxo/40 bg-brand-roxo/10 text-brand-roxo' : 'text-texto-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {t(`calculadora.cenarios.${c.id}`)}
            </button>
          ))}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icone={icones.wallet} tom="blue" rotulo={t('calculadora.custoTotalCurto')} valor={temItens ? moeda(resultado.custoTotal, formato) : moeda(0, formato)} detalhe={t('calculadora.disponivelAgora')} />
            <KpiCard icone={icones.arrow} tom="green" rotulo={t('calculadora.precoSugeridoCurto')} valor={temItens ? moeda(resultado.precoFinal, formato) : moeda(0, formato)} detalhe={t('calculadora.precoUnitario') + ': ' + moeda(resultado.precoUnitario, formato)} />
            <KpiCard icone={icones.target} tom={resultado.lucro >= 0 ? 'green' : 'red'} rotulo={t('calculadora.lucroEstimado')} valor={temItens ? moeda(resultado.lucro, formato) : moeda(0, formato)} detalhe={t('calculadora.liquidoTaxas')} />
            <KpiCard icone={icones.percent} tom="purple" rotulo={t('calculadora.margem')} valor={temItens ? percentual(resultado.margem, formato) : '0%'} detalhe={t('calculadora.sobreEntradas')} />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
              <Card titulo={t('calculadora.configuracaoCalculo')} icone={icones.chart}>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {modo !== 'rapido' && (
                    <Campo rotulo={t('calculadora.produto')}>
                      <Selecao value={produtoId} onChange={(e) => { setProdutoId(e.target.value); if (e.target.value) setModeloId(''); }}>
                        <option value="">{t('calculadora.produtoPlaceholder')}</option>
                        {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </Selecao>
                    </Campo>
                  )}
                  <Campo rotulo={t('nav.modelos')}>
                    <Selecao value={modeloId} onChange={(e) => { setModeloId(e.target.value); if (e.target.value && modo === 'rapido') setProdutoId(''); }}>
                      <option value="">-</option>
                      {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </Selecao>
                  </Campo>
                  <Campo rotulo={t('orcamento.cliente')}>
                    <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                      <option value="">-</option>
                      {(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </Selecao>
                  </Campo>
                  <Campo rotulo={t('calculadora.canal')}>
                    <Selecao value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                      <option value="">-</option>
                      {(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </Selecao>
                  </Campo>
                  <Campo rotulo={t('calculadora.adicionarMaquina')}>
                    <Selecao value={impressoraId} onChange={(e) => setImpressoraId(e.target.value)}>
                      <option value="">-</option>
                      {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                    </Selecao>
                  </Campo>
                  <Campo rotulo={t('calculadora.qtdProduzida')}>
                    <Entrada
                      type="number"
                      min="1"
                      value={qtdProduzida}
                      onChange={(e) => {
                        const v = Math.max(1, Number(e.target.value));
                        setQtdProduzida(v);
                        setQtdVendavel((q) => Math.min(q, v) || v);
                      }}
                    />
                  </Campo>
                  <Campo rotulo={t('calculadora.qtdVendavel')}>
                    <Entrada type="number" min="1" max={qtdProduzida} value={qtdVendavel} onChange={(e) => setQtdVendavel(Number(e.target.value))} />
                  </Campo>
                  <Campo rotulo={`${t('calculadora.margem')} (%)`}>
                    <Entrada type="number" min="0" max="95" step="1" value={Math.round((margem ?? margemBase) * 100)} onChange={(e) => setMargem(Number(e.target.value) / 100)} />
                  </Campo>
                  {(modo === 'lote' || modo === 'comparar' || modo === 'canal') && (
                    <>
                      <Campo rotulo={`${t('calculadora.probFalha')} (%)`}>
                        <Entrada type="number" min="0" max="100" step="0.5" value={((probFalha ?? entradas.probabilidadeFalha) * 100).toFixed(1)} onChange={(e) => setProbFalha(Number(e.target.value) / 100)} />
                      </Campo>
                      <Campo rotulo={`${t('calculadora.provisao')} (%)`}>
                        <Entrada type="number" min="0" max="100" step="0.5" value={((provisao ?? provisaoBase) * 100).toFixed(1)} onChange={(e) => setProvisao(Number(e.target.value) / 100)} />
                      </Campo>
                      <Campo rotulo={t('calculadora.descontoAtacado')}>
                        <Entrada type="number" min="0" max="90" step="1" value={Math.round((descAtacado ?? entradas.descontoAtacado ?? 0.1) * 100)} onChange={(e) => setDescAtacado(Number(e.target.value) / 100)} />
                      </Campo>
                    </>
                  )}
                </div>
              </Card>

              <Card titulo={t('calculadora.composicaoProduto')} icone={icones.cube}>
                {!temItens ? (
                  <EstadoVazio mensagem={t('calculadora.semItens')} />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-borda">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-2/70 text-left">
                        <tr>
                          {[t('calculadora.item'), t('calculadora.quantidade'), t('calculadora.custoUnit'), t('calculadora.total')].map((h) => (
                            <th key={h} className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borda/70">
                        {composicaoVisual.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className={`flex size-7 items-center justify-center rounded-lg ${item.bg} ${item.cor}`}><Icone d={item.icone} /></span>
                                <span>
                                  <span className="block font-extrabold text-ink">{item.nome}</span>
                                  <span className="text-[10px] text-texto-2">{item.tipo}</span>
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-texto-2">{item.quantidade}</td>
                            <td className="px-3 py-2 font-semibold tabular-nums text-ink">{moeda(item.custoUnitario, formato)}</td>
                            <td className="px-3 py-2 font-extrabold tabular-nums text-ink">{moeda(item.total, formato)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card titulo={t('calculadora.cenariosPreco')} icone={icones.target}>
                <div className="grid gap-3 md:grid-cols-3">
                  {resultadosCenarios.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCenarioAtivo(c.id); setMargem(null); }}
                      className={`rounded-2xl border p-3 text-left transition-colors ${
                        cenarioAtivo === c.id ? 'border-brand-roxo bg-brand-roxo/5 shadow-sm' : 'border-borda bg-white hover:bg-surface-2'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-extrabold text-ink">{t(`calculadora.cenarios.${c.id}`)}</span>
                        {cenarioAtivo === c.id && <span className="rounded-full bg-brand-roxo/10 px-2 py-0.5 text-[10px] font-extrabold text-brand-roxo">OK</span>}
                      </div>
                      <p className="text-xl font-extrabold tabular-nums grad-texto">{moeda(c.resultado.precoFinal, formato)}</p>
                      <p className="mt-1 text-[11px] text-texto-2">{percentual(c.margem, formato)} {t('calculadora.margem').toLowerCase()}</p>
                      <p className={`mt-1 text-xs font-bold ${c.resultado.lucro >= 0 ? 'text-ok' : 'text-erro'}`}>{moeda(c.resultado.lucro, formato)} {t('calculadora.lucro').toLowerCase()}</p>
                    </button>
                  ))}
                </div>
              </Card>

              <Card titulo={t('calculadora.quebraCusto')} icone={icones.chart} className="min-h-[260px]">
                <div className="space-y-3">
                  {resultado.itens.length === 0 ? (
                    <EstadoVazio mensagem={t('calculadora.semItens')} />
                  ) : resultado.itens.slice(0, 8).map((item, idx) => (
                    <BarraCusto
                      key={`${item.chave}-${idx}`}
                      rotulo={item.descricao}
                      valor={item.total}
                      total={Math.max(...resultado.itens.map((i) => i.total), 1)}
                      cor={idx}
                      formato={formato}
                    />
                  ))}
                </div>
              </Card>
            </div>
        </section>

        <aside className="min-h-0 space-y-3 overflow-auto pr-1">
          <section className="overflow-hidden rounded-2xl border border-borda bg-white shadow-sm">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">{t('calculadora.resultado')}</p>
                  <h2 className="text-lg font-extrabold text-ink">{t(`calculadora.modos.${modo}`)}</h2>
                </div>
                <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-extrabold text-ok">v{VERSAO_MOTOR}</span>
              </div>
              <div className="rounded-2xl bg-ink p-4 text-white">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-white/55">{t('calculadora.precoSugerido')}</p>
                <p className="mt-1 text-3xl font-black tabular-nums">{temItens ? moeda(resultado.precoFinal, formato) : moeda(0, formato)}</p>
                <p className="mt-1 text-xs text-white/65">{t('calculadora.precoUnitario')}: {moeda(resultado.precoUnitario, formato)}</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <ResumoBox rotulo={t('calculadora.custoTotalCurto')} valor={flag('ver_custos') ? moeda(resultado.custoTotal, formato) : '---'} />
                <ResumoBox rotulo={t('calculadora.lucro')} valor={flag('ver_custos') ? moeda(resultado.lucro, formato) : '---'} destaque={resultado.lucro >= 0 ? 'ok' : 'erro'} />
                <ResumoBox rotulo={t('calculadora.margemReal')} valor={percentual(resultado.margem, formato)} destaque="roxo" />
                <ResumoBox rotulo={t('calculadora.tempo')} valor={duracao(tempoTotalMin)} />
                <ResumoBox rotulo={t('calculadora.material')} valor={`${Math.round(materialTotal).toLocaleString(formato.locale)} g`} destaque="ok" />
                <ResumoBox rotulo={t('calculadora.taxasPagas')} valor={moeda(resultado.valorTaxas + resultado.rateioCustoFixoValor, formato)} />
              </div>

              {usarProduto && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ResumoBox rotulo={t('calculadora.precoCadastrado')} valor={moeda(precoCadastrado, formato)} />
                  <ResumoBox
                    rotulo={t('calculadora.diferencaPreco')}
                    valor={`${diferencaPreco >= 0 ? '+' : ''}${moeda(diferencaPreco, formato)}`}
                    destaque={diferencaPreco >= 0 ? 'ok' : 'erro'}
                  />
                  {canalId && (
                    <ResumoBox
                      rotulo={t('calculadora.precoCanalAtual')}
                      valor={precoCanalAtual > 0 ? moeda(precoCanalAtual, formato) : '-'}
                      destaque="roxo"
                    />
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge ok={diagnosticoProduto.confiavel}>{diagnosticoProduto.confiavel ? t('calculadora.precoSaudavel') : t('calculadora.cadastroIncompleto')}</Badge>
                <Badge ok={materialTotal > 0}>{materialTotal > 0 ? t('calculadora.estoqueSuficiente') : t('calculadora.materialPendente')}</Badge>
                <Badge ok>{t('calculadora.taxasIncluidas')}</Badge>
              </div>

              {usarProduto && diagnosticoProduto.problemas.length > 0 && (
                <div className="mt-3 rounded-xl border border-alerta/30 bg-alerta/5 p-3 text-xs font-semibold text-alerta">
                  {diagnosticoProduto.problemas.slice(0, 5).map((p, i) => <p key={i}>• {p}</p>)}
                </div>
              )}

              {resultado.alertas.length > 0 && temItens && (
                <div className="mt-3 rounded-xl border border-alerta/30 bg-alerta/5 p-3 text-xs font-semibold text-alerta">
                  {resultado.alertas.slice(0, 3).map((a, i) => <p key={i}>{a}</p>)}
                </div>
              )}

              {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
              {msg && <p className="mt-3 text-xs font-semibold text-ok">{msg}</p>}

              <div className="mt-4 grid gap-2">
                {usarProduto && pode('produtos', 'editar') && (
                  <Botao variante="secundario" disabled={!diagnosticoProduto.confiavel} onClick={atualizarProdutoCalculado}>
                    <Icone d={icones.save} /> {t('calculadora.atualizarProduto')}
                  </Botao>
                )}
                {modo === 'canal' && produtoId && canalId && pode('produtos', 'editar') && (
                  <Botao variante="secundario" disabled={!diagnosticoProduto.confiavel} onClick={atualizarCanalCalculado}>
                    <Icone d={icones.save} /> {t('calculadora.atualizarCanal')}
                  </Botao>
                )}
                <Botao variante="secundario" onClick={() => produtoId ? navigate(`/produtos/${produtoId}`) : navigate('/produtos')} disabled={!produtoId}>
                  <Icone d={icones.box} /> {t('calculadora.criarProduto')}
                </Botao>
                {pode('orcamentos', 'criar') && (
                  <Botao variante="acento" disabled={!calculoPronto || gerando} onClick={gerarOrcamento}>
                    <Icone d={icones.send} /> {gerando ? t('estados.salvando') : t('calculadora.gerarOrcamento')}
                  </Botao>
                )}
                <Botao variante="secundario" disabled={!calculoPronto || salvando} onClick={salvarSimulacao}>
                  <Icone d={icones.save} /> {t('calculadora.salvarSimulacao')}
                </Botao>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function montarComposicaoVisual(itens: ItemComposicao[], entradas: EntradasCalculo) {
  if (itens.length > 0) {
    return itens.slice(0, 8).map((item, idx) => {
      const total = item.tipo === 'modelo_impresso'
        ? entradas.materiais[idx]?.custoUnitario
          ? Math.round((entradas.materiais[idx].pesoPecaG + entradas.materiais[idx].pesoSuporteG + entradas.materiais[idx].pesoPurgaG + entradas.materiais[idx].pesoDesperdicioG) * entradas.materiais[idx].custoUnitario)
          : 0
        : item.tipo === 'mao_de_obra'
          ? Math.round(((item.tempo_min ?? 0) / 60) * Number(item.tarefa?.valor_hora ?? 0))
          : item.tipo === 'servico'
            ? Number(item.custo_manual ?? 0) * Number(item.quantidade)
            : Math.round(Number(item.quantidade) * custoMaterial(item.material));
      return {
        id: item.id,
        nome: item.modelo?.nome ?? item.material?.nome ?? item.tarefa?.nome ?? item.descricao ?? 'Item',
        tipo: item.tipo.replaceAll('_', ' '),
        quantidade: `${Number(item.quantidade).toLocaleString()} ${item.unidade}`,
        custoUnitario: Number(item.quantidade) > 0 ? Math.round(total / Number(item.quantidade)) : total,
        total,
        ...visualDoTipo(item.tipo),
      };
    });
  }
  return [
    ...entradas.materiais.map((m, idx) => {
      const total = Math.round((m.pesoPecaG + m.pesoSuporteG + m.pesoPurgaG + m.pesoDesperdicioG) * m.custoUnitario);
      return {
        id: `material-${idx}`,
        nome: m.descricao,
        tipo: 'modelo impresso',
        quantidade: `${Math.round(m.pesoPecaG + m.pesoSuporteG + m.pesoPurgaG + m.pesoDesperdicioG).toLocaleString()} g`,
        custoUnitario: Math.round(m.custoUnitario),
        total,
        ...visualDoTipo('modelo_impresso'),
      };
    }),
    ...entradas.maoDeObra.map((m, idx) => ({
      id: `mao-${idx}`,
      nome: m.descricao,
      tipo: 'mao de obra',
      quantidade: `${m.tempoMin} min`,
      custoUnitario: m.valorHora,
      total: Math.round((m.tempoMin / 60) * m.valorHora),
      ...visualDoTipo('mao_de_obra'),
    })),
  ];
}

function visualDoTipo(tipo: string) {
  if (tipo === 'modelo_impresso') return { icone: icones.cube, bg: 'bg-brand-azul/10', cor: 'text-brand-azul' };
  if (tipo === 'mao_de_obra') return { icone: icones.clock, bg: 'bg-brand-roxo/10', cor: 'text-brand-roxo' };
  if (tipo === 'embalagem') return { icone: icones.box, bg: 'bg-alerta/10', cor: 'text-alerta' };
  if (tipo === 'servico') return { icone: icones.bolt, bg: 'bg-erro/10', cor: 'text-erro' };
  return { icone: icones.check, bg: 'bg-ok/10', cor: 'text-ok' };
}

function Card({ titulo, icone, children, className = '' }: { titulo: string; icone: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-borda bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-brand-roxo/10 text-brand-roxo"><Icone d={icone} /></span>
        <h2 className="text-sm font-extrabold text-ink">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

function KpiCard({ icone, rotulo, valor, detalhe, tom }: { icone: string; rotulo: string; valor: string; detalhe: string; tom: 'blue' | 'green' | 'red' | 'purple' }) {
  const estilos = {
    blue: ['bg-brand-azul/10 text-brand-azul', 'text-brand-azul'],
    green: ['bg-ok/10 text-ok', 'text-ok'],
    red: ['bg-erro/10 text-erro', 'text-erro'],
    purple: ['bg-brand-roxo/10 text-brand-roxo', 'text-brand-roxo'],
  }[tom];
  return (
    <div className="rounded-2xl border border-borda bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${estilos[0]}`}><Icone d={icone} /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
          <p className={`truncate text-xl font-black tabular-nums ${estilos[1]}`}>{valor}</p>
          <p className="truncate text-[11px] text-texto-2">{detalhe}</p>
        </div>
      </div>
    </div>
  );
}

function BarraCusto({ rotulo, valor, total, cor, formato }: { rotulo: string; valor: number; total: number; cor: number; formato: ReturnType<typeof useAuth>['formato'] }) {
  const cores = ['from-brand-azul to-brand-roxo', 'from-ok to-emerald-400', 'from-erro to-red-400', 'from-alerta to-yellow-400', 'from-brand-roxo to-brand-rosa'];
  const pct = Math.max(3, Math.min(100, (valor / total) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-bold text-ink">{rotulo}</span>
        <span className="shrink-0 font-extrabold tabular-nums text-ink">{moeda(valor, formato)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full bg-gradient-to-r ${cores[cor % cores.length]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ResumoBox({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: 'ok' | 'erro' | 'roxo' }) {
  const cls = destaque === 'ok' ? 'text-ok' : destaque === 'erro' ? 'text-erro' : destaque === 'roxo' ? 'text-brand-roxo' : 'text-ink';
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-[10px] font-extrabold uppercase text-texto-2">{rotulo}</p>
      <p className={`mt-1 truncate text-sm font-black tabular-nums ${cls}`}>{valor}</p>
    </div>
  );
}

function Badge({ children, ok = false }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${ok ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-texto-2'}`}>
      {children}
    </span>
  );
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}
