/**
 * Telas 07/08 — Calculadora com preview AO VIVO (motor puro no cliente) e
 * explicação de cada valor (transparência = diferencial). Gerar orçamento
 * chama a Edge Function autoritativa, que recalcula no servidor e congela o
 * snapshot.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import {
  custoMaterial, entradasDoProduto, SELECAO_COMPOSICAO,
  type ImpressoraRef, type ItemComposicao, type MaterialRef,
} from '@/lib/composicao';
import { calcular, entradasVazias, VERSAO_MOTOR, type EntradasCalculo } from '@/core/calculo';
import { percentual } from '@/lib/formato';
import {
  Acordeao, Botao, CabecalhoPagina, Campo, Cartao, Dinheiro, Entrada,
  EstadoVazio, Etiqueta, Selecao,
} from '@/components/ui';
import { GraficoBarrasH } from '@/components/graficos';
import { useAuth } from '@/auth/AuthProvider';
import type { Modelo3D } from '../modelos/PaginaModelos';

interface Canal { id: string; nome: string; taxa_marketplace: number; taxa_pagamento: number; comissao: number }
interface PerfilFiscal { id: string; nome: string; aliquota_efetiva: number; padrao: boolean }

export function PaginaCalculadora() {
  const { t } = useTranslation();
  const { ativa, flag, pode, formato } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const produtoParam = params.get('produto');
  const modeloParam = params.get('modelo');

  // ---- cadastros de apoio ----
  const produtos = useLista<{ id: string; nome: string }>('v_produto', { ordem: 'nome', desc: false, selecao: 'id, nome' });
  const modelos = useLista<Modelo3D>('modelo_3d', { ordem: 'nome', desc: false });
  const materiais = useLista<MaterialRef>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<ImpressoraRef & { nome: string; perfil_energia_id: string | null }>('impressora', { ordem: 'nome', desc: false });
  const energias = useLista<{ id: string; tarifa_kwh: number }>('perfil_energia', { ordem: 'nome', desc: false });
  const canais = useLista<Canal>('canal_venda', { ordem: 'nome', desc: false });
  const fiscais = useLista<PerfilFiscal>('perfil_fiscal', { ordem: 'nome', desc: false });
  const custosFixos = useLista<{ id: string; valor_mensal: number; ativo: boolean }>('custo_fixo', { ordem: 'nome', desc: false });
  const clientes = useLista<{ id: string; nome: string }>('v_cliente', { ordem: 'nome', desc: false, selecao: 'id, nome' });

  // ---- estado da simulação ----
  const [nome, setNome] = useState('');
  const [produtoId, setProdutoId] = useState(produtoParam ?? '');
  const [modeloId, setModeloId] = useState(modeloParam ?? '');
  const [impressoraId, setImpressoraId] = useState('');
  const [canalId, setCanalId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [qtdProduzida, setQtdProduzida] = useState(1);
  const [qtdVendavel, setQtdVendavel] = useState(1);
  const [cenarioIdx, setCenarioIdx] = useState(1); // Padrão
  const [margem, setMargem] = useState<number | null>(null); // null = do cenário
  const [probFalha, setProbFalha] = useState<number | null>(null);
  const [provisao, setProvisao] = useState<number | null>(null);
  const [descAtacado, setDescAtacado] = useState<number | null>(null);
  const [avancado, setAvancado] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // composição do produto selecionado
  const composicao = useQuery({
    queryKey: ['composicao_item', produtoId],
    enabled: !!produtoId && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composicao_item')
        .select(SELECAO_COMPOSICAO)
        .eq('produto_id', produtoId)
        .is('deleted_at', null);
      if (error) throw error;
      return data as unknown as ItemComposicao[];
    },
  });

  // pré-seleção de impressora recomendada quando vier de um modelo
  useEffect(() => {
    if (modeloParam && modelos.data) {
      const mo = modelos.data.find((m) => m.id === modeloParam);
      if (mo?.impressora_recomendada_id) setImpressoraId(mo.impressora_recomendada_id);
    }
  }, [modeloParam, modelos.data]);

  const cenarios = ativa?.tenant.cenarios_precificacao ?? [];
  const cenario = cenarios[cenarioIdx] ?? { nome: 'Padrão', probabilidade_falha: 0.05, margem: 0.35, provisao: 0.03 };

  // ---- montar entradas ----
  const entradas: EntradasCalculo = useMemo(() => {
    const matsPorId = new Map((materiais.data ?? []).map((m) => [m.id, m]));
    const imp = (impressoras.data ?? []).find((i) => i.id === impressoraId) ?? null;
    const tarifa = imp?.perfil_energia_id
      ? Number((energias.data ?? []).find((e2) => e2.id === imp.perfil_energia_id)?.tarifa_kwh ?? 0)
      : Number((energias.data ?? [])[0]?.tarifa_kwh ?? 0);

    let e: EntradasCalculo;
    if (produtoId && composicao.data) {
      e = entradasDoProduto(composicao.data, qtdProduzida, matsPorId, imp, tarifa);
    } else if (modeloId && modelos.data) {
      e = entradasVazias();
      e.qtdProduzida = qtdProduzida;
      const mo = modelos.data.find((m) => m.id === modeloId);
      if (mo) {
        const mat = mo.material_recomendado_id ? matsPorId.get(mo.material_recomendado_id) : undefined;
        e.materiais.push({
          descricao: `${mo.nome}${mat ? ` — ${mat.nome}` : ''}`,
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

    // cenário + overrides do "Avançado"
    e.margemDesejada = margem ?? cenario.margem;
    e.probabilidadeFalha = probFalha ?? (e.probabilidadeFalha || cenario.probabilidade_falha);
    e.provisao = provisao ?? cenario.provisao;
    e.descontoAtacado = descAtacado ?? 0.1;

    // taxas do canal + alíquota do perfil fiscal padrão
    const canal = (canais.data ?? []).find((c) => c.id === canalId);
    const fiscal = (fiscais.data ?? []).find((p) => p.padrao) ?? (fiscais.data ?? [])[0];
    e.taxas = {
      canal: Number(canal?.taxa_marketplace ?? 0),
      pagamento: Number(canal?.taxa_pagamento ?? 0),
      comissao: Number(canal?.comissao ?? 0),
      aliquota: Number(fiscal?.aliquota_efetiva ?? 0),
    };

    // custos fixos conforme config do tenant (decisão §7.4)
    const totalFixo = (custosFixos.data ?? [])
      .filter((c) => c.ativo)
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
      // hora_maquina/hora_trabalho precisam de capacidade mensal — pendência
    }

    return e;
  }, [produtoId, modeloId, composicao.data, modelos.data, materiais.data,
      impressoras.data, energias.data, canais.data, fiscais.data, custosFixos.data,
      impressoraId, canalId, qtdProduzida, qtdVendavel, margem, probFalha,
      provisao, cenario, ativa]);

  const resultado = useMemo(() => calcular(entradas), [entradas]);
  const temItens = resultado.itens.length > 0;

  async function salvarSimulacao() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from('simulacao').insert({
      tenant_id: ativa?.tenant_id,
      nome: nome || t('calculadora.titulo'),
      produto_id: produtoId || null,
      modelo_id: modeloId || null,
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
    setGerando(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke('gerar-orcamento', {
      body: {
        entradas,
        nome: nome || undefined,
        produto_id: produtoId || null,
        cliente_id: clienteId || null,
        canal_id: canalId || null,
        // refs para o servidor re-resolver custos do banco (anti-adulteração)
        refs: {
          materiais: (composicao.data ?? [])
            .filter((i) => i.material_id)
            .map((i) => i.material_id),
        },
      },
    });
    setGerando(false);
    if (error) setErro(mensagemErro(error));
    else if (data?.orcamento_id) navigate(`/orcamentos/${data.orcamento_id}`);
  }

  return (
    <div className="pb-28 lg:pb-0">
      <CabecalhoPagina titulo={t('calculadora.titulo')} subtitulo={t('calculadora.subtitulo')} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* coluna de configuração */}
        <div className="space-y-4">
          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">
              <span className="grad-texto">1.</span> {t('calculadora.secaoConfig')}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Campo rotulo={t('calculadora.projeto')} className="col-span-2 sm:col-span-3">
                <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Luminária Lua 20cm" />
              </Campo>
              <Campo rotulo={t('calculadora.produto')}>
                <Selecao value={produtoId} onChange={(e) => { setProdutoId(e.target.value); if (e.target.value) setModeloId(''); }}>
                  <option value="">{t('calculadora.produtoPlaceholder')}</option>
                  {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={t('nav.modelos')}>
                <Selecao value={modeloId} onChange={(e) => { setModeloId(e.target.value); if (e.target.value) setProdutoId(''); }}>
                  <option value="">—</option>
                  {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={t('calculadora.adicionarMaquina')}>
                <Selecao value={impressoraId} onChange={(e) => setImpressoraId(e.target.value)}>
                  <option value="">—</option>
                  {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={t('calculadora.qtdProduzida')}>
                <Entrada type="number" min="1" value={qtdProduzida}
                  onChange={(e) => { const v = Math.max(1, Number(e.target.value)); setQtdProduzida(v); setQtdVendavel((q) => Math.min(q, v) || v); }} />
              </Campo>
              <Campo rotulo={t('calculadora.qtdVendavel')} dica="Desconta o refugo esperado">
                <Entrada type="number" min="1" max={qtdProduzida} value={qtdVendavel}
                  onChange={(e) => setQtdVendavel(Number(e.target.value))} />
              </Campo>
              <Campo rotulo={t('calculadora.canal')}>
                <Selecao value={canalId} onChange={(e) => setCanalId(e.target.value)}>
                  <option value="">—</option>
                  {(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={t('orcamento.cliente')}>
                <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">—</option>
                  {(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={t('calculadora.cenario')}>
                <Selecao value={cenarioIdx} onChange={(e) => { setCenarioIdx(Number(e.target.value)); setMargem(null); setProbFalha(null); setProvisao(null); }}>
                  {cenarios.map((c, i) => <option key={i} value={i}>{c.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={`${t('calculadora.margem')} (%)`}>
                <Entrada type="number" min="0" max="95" step="1"
                  value={Math.round((margem ?? cenario.margem) * 100)}
                  onChange={(e) => setMargem(Number(e.target.value) / 100)} />
              </Campo>
            </div>

            <button
              className="mt-3 text-xs font-bold text-brand-roxo hover:underline"
              onClick={() => setAvancado((v) => !v)}
            >
              {avancado ? '−' : '+'} {t('calculadora.avancado')}
            </button>
            {avancado && (
              <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-3">
                <Campo rotulo={`${t('calculadora.probFalha')} (%)`}>
                  <Entrada type="number" min="0" max="100" step="0.5"
                    value={((probFalha ?? entradas.probabilidadeFalha) * 100).toFixed(1)}
                    onChange={(e) => setProbFalha(Number(e.target.value) / 100)} />
                </Campo>
                <Campo rotulo={`${t('calculadora.provisao')} (%)`}>
                  <Entrada type="number" min="0" max="100" step="0.5"
                    value={((provisao ?? cenario.provisao) * 100).toFixed(1)}
                    onChange={(e) => setProvisao(Number(e.target.value) / 100)} />
                </Campo>
                <Campo rotulo={t('calculadora.descontoAtacado')}>
                  <Entrada type="number" min="0" max="90" step="1"
                    value={Math.round((descAtacado ?? 0.1) * 100)}
                    onChange={(e) => setDescAtacado(Number(e.target.value) / 100)} />
                </Campo>
                <Campo rotulo={t('calculadora.aliquota')}>
                  <Entrada disabled value={percentual(entradas.taxas.aliquota, formato)} />
                </Campo>
              </div>
            )}
          </Cartao>

          {/* 2. itens de custo — tabela com linha de total destacada (v2) */}
          <Cartao>
            <h2 className="mb-2 text-sm font-bold text-ink">
              <span className="grad-texto">2.</span> {t('calculadora.itensCusto')}
            </h2>
            {!temItens ? (
              <EstadoVazio mensagem={t('calculadora.semItens')} />
            ) : (
              <div>
                <div className="divide-y divide-borda/70">
                  {resultado.itens.map((item, idx) => (
                    <div key={`${item.chave}-${idx}`}>
                      <button
                        className="flex min-h-11 w-full items-center justify-between py-2 text-left"
                        onClick={() => setAberto(aberto === `${item.chave}-${idx}` ? null : `${item.chave}-${idx}`)}
                      >
                        <span className="text-sm font-semibold text-ink">{item.descricao}</span>
                        <span className="flex items-center gap-2">
                          <Dinheiro centavos={item.total} className="text-sm font-bold" />
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            className={`text-texto-2 transition-transform ${aberto === `${item.chave}-${idx}` ? 'rotate-180' : ''}`}>
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </span>
                      </button>
                      {aberto === `${item.chave}-${idx}` && (
                        <div className="mb-2.5 rounded-lg bg-surface-2 p-3 text-xs text-texto-2">
                          <p className="mb-1 font-semibold text-ink">{t('calculadora.explicacao')}:</p>
                          <p>{item.explicacao}</p>
                          {item.detalhes?.map((d, i) => (
                            <p key={i} className="mt-1.5 border-l-2 border-brand-roxo/40 pl-2">
                              <span className="font-semibold">{d.descricao}:</span> {d.explicacao}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {flag('ver_custos') && (
                  <div className="mt-1 flex items-center justify-between rounded-lg bg-ink px-3 py-2.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-white/75">
                      {t('calculadora.custoTotal')}
                    </span>
                    <Dinheiro centavos={resultado.custoTotal} className="text-base font-extrabold text-white" />
                  </div>
                )}
              </div>
            )}
          </Cartao>

          {/* 4. fórmulas e explicações — acordeão recolhido (transparência sem poluir) */}
          {temItens && flag('ver_custos') && (
            <Acordeao titulo={<span><span className="grad-texto">4.</span> {t('calculadora.formulas')}</span>}>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase text-texto-2">{t('calculadora.deOndeVemCusto')}</h3>
                  <GraficoBarrasH itens={resultado.itens.map((i) => ({ rotulo: i.descricao, valor: i.total }))} />
                </div>
                <div className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs text-texto-2">
                  <p>{t('calculadora.formulaPreco')}</p>
                  <p className="font-mono text-[11px]">
                    preço = custo ÷ (1 − margem) ÷ (1 − taxas − % custo fixo)
                  </p>
                  <p className="pt-1">
                    <Dinheiro centavos={resultado.custoTotal} /> ÷ (1 − {percentual(entradas.margemDesejada, formato)})
                    {' '}÷ divisor de taxas = <Dinheiro centavos={resultado.precoFinal} className="font-bold text-ink" />
                  </p>
                </div>
              </div>
            </Acordeao>
          )}
        </div>

        {/* 3. resultados — painel fixo com 4 números-herói (v2) */}
        <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit">
          <h2 className="text-sm font-bold text-ink lg:px-1">
            <span className="grad-texto">3.</span> {t('calculadora.resultados')}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 rounded-xl border-2 border-ink bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-texto-2">{t('calculadora.precoSugerido')}</p>
              <p className="text-2xl font-extrabold grad-texto tabular-nums">
                <Dinheiro centavos={temItens ? resultado.precoFinal : 0} />
              </p>
              <p className="text-[11px] text-texto-2">
                {t('calculadora.precoUnitario')}: <Dinheiro centavos={temItens ? resultado.precoUnitario : 0} className="font-bold text-ink" />
              </p>
            </div>
            {/* 2º herói: preço de atacado (v2) */}
            <div className="col-span-2 rounded-xl border border-brand-roxo/40 bg-brand-roxo/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-roxo">
                {t('calculadora.precoAtacado')}
                <span className="ml-1 font-semibold normal-case text-texto-2">
                  (−{Math.round((entradas.descontoAtacado ?? 0.1) * 100)}%)
                </span>
              </p>
              <p className="text-lg font-extrabold tabular-nums text-ink">
                <Dinheiro centavos={temItens ? resultado.precoAtacado : 0} />
              </p>
              <p className="text-[11px] text-texto-2">
                {t('calculadora.precoUnitario')}: <Dinheiro centavos={temItens ? resultado.precoAtacadoUnitario : 0} className="font-bold text-ink" />
              </p>
            </div>
            {flag('ver_custos') && (
              <>
                <div className="rounded-xl border border-borda bg-white p-3">
                  <p className="text-[10px] font-bold uppercase text-texto-2">{t('calculadora.custoUnitario')}</p>
                  <p className="text-lg font-extrabold tabular-nums text-ink">
                    <Dinheiro centavos={temItens ? resultado.custoUnitario : 0} />
                  </p>
                </div>
                <div className="rounded-xl border border-borda bg-white p-3">
                  <p className="text-[10px] font-bold uppercase text-texto-2">{t('calculadora.lucro')}</p>
                  <p className={`text-lg font-extrabold tabular-nums ${resultado.lucro >= 0 ? 'text-ok' : 'text-erro'}`}>
                    <Dinheiro centavos={temItens ? resultado.lucro : 0} />
                  </p>
                  <p className="text-[11px] font-semibold text-texto-2">
                    {t('calculadora.margemReal')}: {temItens ? percentual(resultado.margem, formato) : '—'}
                  </p>
                </div>
              </>
            )}
          </div>

          {flag('ver_custos') && (
            <Cartao>
              <dl className="space-y-1.5 text-sm">
                <Linha rotulo={t('calculadora.custoTotal')}><Dinheiro centavos={resultado.custoTotal} /></Linha>
                <Linha rotulo={t('calculadora.taxasPagas')}><Dinheiro centavos={resultado.valorTaxas + resultado.rateioCustoFixoValor} /></Linha>
                <Linha rotulo={t('calculadora.markup')}>{resultado.markup.toFixed(2)}×</Linha>
                <Linha rotulo={t('calculadora.precoMinimo')}>
                  <Dinheiro centavos={resultado.precoMinimoUnitario} className="text-alerta font-semibold" />
                </Linha>
              </dl>
            </Cartao>
          )}

          {resultado.alertas.length > 0 && temItens && (
            <div className="rounded-xl border border-alerta/40 bg-alerta/5 p-3 text-xs text-alerta">
              {resultado.alertas.map((a, i) => <p key={i} className="mb-1 last:mb-0">⚠ {a}</p>)}
            </div>
          )}

          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          {msg && <p className="text-xs font-semibold text-ok">{msg}</p>}

          {/* ações primárias fixas no rodapé do painel (v2) */}
          <div className="flex flex-col gap-2">
            <Botao variante="secundario" disabled={!temItens || salvando} onClick={salvarSimulacao}>
              {t('calculadora.salvarSimulacao')}
            </Botao>
            {pode('orcamentos', 'criar') && (
              <Botao variante="acento" disabled={!temItens || gerando} onClick={gerarOrcamento}>
                {gerando ? t('estados.salvando') : t('calculadora.gerarOrcamento')}
              </Botao>
            )}
            <p className="text-center text-[10px] text-texto-2">
              <Etiqueta>motor v{VERSAO_MOTOR}</Etiqueta>
            </p>
          </div>
        </div>
      </div>

      {/* mobile: faixa fixa com os 4 resultados acima da bottom nav (v2) */}
      {temItens && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-borda bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2 text-center">
            <ResultadoMini rotulo={t('calculadora.preco')} destaque>
              <Dinheiro centavos={resultado.precoFinal} />
            </ResultadoMini>
            <ResultadoMini rotulo={t('calculadora.atacadoCurto')}>
              <Dinheiro centavos={resultado.precoAtacado} />
            </ResultadoMini>
            {flag('ver_custos') ? (
              <>
                <ResultadoMini rotulo={t('calculadora.custoCurto')}>
                  <Dinheiro centavos={resultado.custoUnitario} />
                </ResultadoMini>
                <ResultadoMini rotulo={t('calculadora.margemReal')}>
                  {percentual(resultado.margem, formato)}
                </ResultadoMini>
              </>
            ) : (
              <ResultadoMini rotulo={t('calculadora.precoMinimo')}>
                <Dinheiro centavos={resultado.precoMinimoUnitario} />
              </ResultadoMini>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-texto-2">{rotulo}</dt>
      <dd className="font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function ResultadoMini({ rotulo, children, destaque = false }: {
  rotulo: string; children: React.ReactNode; destaque?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-bold uppercase text-texto-2">{rotulo}</p>
      <p className={`truncate text-xs font-extrabold tabular-nums ${destaque ? 'grad-texto' : 'text-ink'}`}>
        {children}
      </p>
    </div>
  );
}
