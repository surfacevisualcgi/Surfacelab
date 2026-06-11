/**
 * Tela 12 — Estoque & Compras (estrutura v2): 4 KPIs no topo, abas
 * Estoque / Movimentações / Compras; em Estoque um seletor
 * (Filamentos & resinas | Componentes & outros) troca a tabela; sugestão de
 * compra como chip; painel lateral único com acordeões Alertas + Próximas
 * entregas. Compras com recebimento (entrada no ledger via RPC).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, deCentavos, moeda, paraCentavos } from '@/lib/formato';
import {
  Abas, Acordeao, Botao, CabecalhoPagina, Campo, Carregando, Dinheiro,
  Entrada, EstadoErro, EstadoVazio, Etiqueta, Kpi, Modal, Selecao, TabelaDados,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import type { Material } from '../cadastros/PaginaCadastros';

interface Mov {
  id: string; material_id: string; tipo: string; quantidade: number;
  custo_unitario: number; motivo: string | null; created_at: string;
}

interface Compra {
  id: string; numero: string; status: string; previsao: string | null;
  total: number; fornecedor: { nome: string } | null;
}

type Aba = 'materiais' | 'movimentacoes' | 'compras';

export function PaginaEstoque() {
  const { t } = useTranslation();
  const { ativa, pode, formato } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('materiais');
  const [grupo, setGrupo] = useState<'impressao' | 'componentes'>('impressao');
  const [lancando, setLancando] = useState<'entrada' | 'saida' | null>(null);
  const [novaCompra, setNovaCompra] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const materiais = useLista<Material>('material', { ordem: 'nome', desc: false });
  const movs = useLista<Mov>('movimentacao_estoque', {
    ordem: 'created_at', desc: true, incluirExcluidos: true,
  });
  const compras = useLista<Compra>('compra', {
    ordem: 'created_at', desc: true, selecao: '*, fornecedor:fornecedor_id (nome)',
  });

  const kpis = useMemo(() => {
    const lista = materiais.data ?? [];
    return {
      itens: lista.length,
      valorTotal: lista.reduce((s, m) => s + Number(m.valor_estoque), 0),
      emAlerta: lista.filter(
        (m) => Number(m.minimo) > 0 && Number(m.saldo) - Number(m.reservado) <= Number(m.minimo),
      ),
      comprasPendentes: (compras.data ?? []).filter((c) => !['recebido', 'cancelado'].includes(c.status)).length,
    };
  }, [materiais.data, compras.data]);

  async function lancar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lancando) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('movimentacao_estoque').insert({
      tenant_id: ativa?.tenant_id,
      material_id: f.get('material_id') as string,
      tipo: lancando,
      quantidade: Number(f.get('quantidade')),
      custo_unitario: lancando === 'entrada' ? paraCentavos(f.get('custo_unitario') as string) : 0,
      motivo: (f.get('motivo') as string) || (lancando === 'entrada' ? 'entrada manual' : 'saída manual'),
      referencia_tipo: 'manual',
    });
    if (error) setErro(mensagemErro(error));
    else {
      setLancando(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['material'] });
      qc.invalidateQueries({ queryKey: ['movimentacao_estoque'] });
    }
  }

  async function receber(compraId: string) {
    setErro(null);
    const { error } = await supabase.rpc('receber_compra', { p_compra: compraId });
    if (error) setErro(mensagemErro(error));
    qc.invalidateQueries();
  }

  if (materiais.isLoading) return <Carregando />;
  if (materiais.isError) return <EstadoErro onRetry={() => materiais.refetch()} />;

  const nomeMaterial = (id: string) => materiais.data?.find((m) => m.id === id)?.nome ?? '—';
  const doGrupo = (materiais.data ?? []).filter((m) =>
    grupo === 'impressao'
      ? m.tipo === 'filamento' || m.tipo === 'resina'
      : m.tipo !== 'filamento' && m.tipo !== 'resina',
  );
  const proximasEntregas = (compras.data ?? []).filter((c) => !['recebido', 'cancelado'].includes(c.status));

  return (
    <div>
      <CabecalhoPagina
        titulo={t('estoque.titulo')}
        acoes={pode('estoque', 'criar') ? (
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={() => setLancando('saida')}>− {t('estoque.novaSaida')}</Botao>
            <Botao onClick={() => setLancando('entrada')}>+ {t('estoque.novaEntrada')}</Botao>
          </div>
        ) : undefined}
      />

      {/* 4 KPIs (v2) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('estoque.kpiItens')}>{kpis.itens}</Kpi>
        <Kpi rotulo={t('estoque.kpiValor')} destaque>{moeda(kpis.valorTotal, formato)}</Kpi>
        <Kpi rotulo={t('estoque.kpiAlerta')}>
          <span className={kpis.emAlerta.length > 0 ? 'text-alerta' : ''}>{kpis.emAlerta.length}</span>
        </Kpi>
        <Kpi rotulo={t('estoque.kpiCompras')}>{kpis.comprasPendentes}</Kpi>
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_270px]">
        <div>
          <Abas<Aba>
            abas={[
              { id: 'materiais', rotulo: t('estoque.materiais') },
              { id: 'movimentacoes', rotulo: t('estoque.movimentacoes') },
              { id: 'compras', rotulo: t('estoque.compras') },
            ]}
            ativa={aba}
            onTrocar={setAba}
          />

          {aba === 'materiais' && (
            <div>
              {/* seletor que troca a tabela (v2) */}
              <div className="mb-3 flex gap-1.5">
                {([['impressao', t('estoque.grupoImpressao')], ['componentes', t('estoque.grupoComponentes')]] as const).map(([g, rotulo]) => (
                  <button key={g} onClick={() => setGrupo(g)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      grupo === g ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                    }`}>
                    {rotulo}
                  </button>
                ))}
              </div>
              {doGrupo.length === 0 ? (
                <EstadoVazio />
              ) : (
                <TabelaDados<Material>
                  colunas={[
                    { titulo: 'Material', principal: true, render: (m) => <span className="font-semibold text-ink">{m.nome}</span> },
                    { titulo: t('estoque.saldo'), numerica: true, render: (m) => `${Number(m.saldo).toLocaleString()} ${m.unidade_consumo}` },
                    {
                      titulo: t('estoque.disponivel'),
                      numerica: true,
                      render: (m) => {
                        const disp = Number(m.saldo) - Number(m.reservado);
                        const baixo = Number(m.minimo) > 0 && disp <= Number(m.minimo);
                        return (
                          <span className="font-semibold">
                            {disp.toLocaleString()}{' '}
                            {baixo && <Etiqueta cor="vermelho">{t('estoque.comprar')}</Etiqueta>}
                          </span>
                        );
                      },
                    },
                    { titulo: t('estoque.custoMedio'), numerica: true, render: (m) => <><Dinheiro centavos={Math.round(Number(m.custo_medio))} />/{m.unidade_consumo}</> },
                    { titulo: t('estoque.valorEstoque'), numerica: true, render: (m) => <span className="font-semibold"><Dinheiro centavos={Number(m.valor_estoque)} /></span> },
                  ]}
                  linhas={doGrupo}
                  chave={(m) => m.id}
                />
              )}
            </div>
          )}

          {aba === 'movimentacoes' && (
            movs.isLoading ? <Carregando /> : (movs.data ?? []).length === 0 ? <EstadoVazio /> : (
              <TabelaDados<Mov>
                colunas={[
                  { titulo: 'Material', principal: true, render: (mv) => <span className="font-semibold text-ink">{nomeMaterial(mv.material_id)}</span> },
                  { titulo: 'Data', render: (mv) => dataCurta(mv.created_at, formato) },
                  {
                    titulo: 'Tipo',
                    render: (mv) => (
                      <Etiqueta cor={mv.tipo === 'entrada' ? 'verde' : mv.tipo === 'saida' ? 'vermelho' : mv.tipo === 'reserva' ? 'amarelo' : 'cinza'}>
                        {t(`estoque.tipoMov.${mv.tipo}`)}
                      </Etiqueta>
                    ),
                  },
                  { titulo: 'Qtd.', numerica: true, render: (mv) => Number(mv.quantidade).toLocaleString() },
                  { titulo: 'Motivo', render: (mv) => <span className="text-texto-2">{mv.motivo ?? '—'}</span> },
                ]}
                linhas={movs.data!}
                chave={(mv) => mv.id}
              />
            )
          )}

          {aba === 'compras' && (
            <div>
              {pode('compras', 'criar') && (
                <div className="mb-3 flex justify-end">
                  <Botao onClick={() => setNovaCompra(true)}>+ {t('estoque.novaCompra')}</Botao>
                </div>
              )}
              {compras.isLoading ? <Carregando /> : (compras.data ?? []).length === 0 ? (
                <EstadoVazio mensagem={t('estoque.semCompras')} />
              ) : (
                <TabelaDados<Compra>
                  colunas={[
                    { titulo: t('pedido.numero'), principal: true, render: (c) => <span className="font-bold text-ink">{c.numero}</span> },
                    { titulo: t('nav.fornecedores'), render: (c) => c.fornecedor?.nome ?? '—' },
                    { titulo: t('estoque.previsao'), render: (c) => dataCurta(c.previsao, formato) },
                    { titulo: t('orcamento.total'), numerica: true, render: (c) => <Dinheiro centavos={c.total} /> },
                    {
                      titulo: t('orcamento.status'),
                      render: (c) => (
                        <Etiqueta cor={c.status === 'recebido' ? 'verde' : c.status === 'cancelado' ? 'vermelho' : 'amarelo'}>
                          {t(`estoque.statusCompra.${c.status}`)}
                        </Etiqueta>
                      ),
                    },
                  ]}
                  linhas={compras.data!}
                  chave={(c) => c.id}
                  acoes={(c) =>
                    !['recebido', 'cancelado'].includes(c.status) && pode('compras', 'editar') ? (
                      <Botao variante="secundario" onClick={() => receber(c.id)}>{t('estoque.receber')}</Botao>
                    ) : null
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* painel lateral único com acordeões (v2) */}
        <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit">
          <Acordeao abertoInicial titulo={<span>⚠ {t('estoque.alertas')} ({kpis.emAlerta.length})</span>}>
            {kpis.emAlerta.length === 0 ? (
              <p className="text-xs text-texto-2">{t('dashboard.semAlertas')} ✓</p>
            ) : (
              <ul className="space-y-1.5">
                {kpis.emAlerta.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-ink">{m.nome}</span>
                    <span className="shrink-0 tabular-nums text-alerta">
                      {(Number(m.saldo) - Number(m.reservado)).toLocaleString()}/{Number(m.minimo).toLocaleString()} {m.unidade_consumo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Acordeao>
          <Acordeao titulo={`🚚 ${t('estoque.proximasEntregas')} (${proximasEntregas.length})`}>
            {proximasEntregas.length === 0 ? (
              <p className="text-xs text-texto-2">{t('estados.vazio')}</p>
            ) : (
              <ul className="space-y-1.5">
                {proximasEntregas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-ink">{c.numero}</span>
                    <span className="text-texto-2">{dataCurta(c.previsao, formato)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Acordeao>
        </div>
      </div>

      {/* lançamento manual */}
      <Modal aberto={!!lancando} titulo={lancando === 'entrada' ? t('estoque.novaEntrada') : t('estoque.novaSaida')} onFechar={() => setLancando(null)}>
        <form onSubmit={lancar} className="space-y-3">
          <Campo rotulo="Material">
            <Selecao name="material_id" required defaultValue="">
              <option value="">—</option>
              {(materiais.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nome} ({m.unidade_consumo})</option>
              ))}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Quantidade (na unidade de consumo)">
              <Entrada name="quantidade" type="number" step="any" min="0.0001" required />
            </Campo>
            {lancando === 'entrada' && (
              <Campo rotulo="Custo por unidade (R$)" dica="Recalcula o custo médio ponderado">
                <Entrada name="custo_unitario" inputMode="decimal" defaultValue={deCentavos(0)} />
              </Campo>
            )}
          </div>
          <Campo rotulo="Motivo">
            <Entrada name="motivo" placeholder={lancando === 'saida' ? 'perda / inventário / uso interno…' : 'compra avulsa / inventário…'} />
          </Campo>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setLancando(null)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.confirmar')}</Botao>
          </div>
        </form>
      </Modal>

      <ModalNovaCompra
        aberto={novaCompra}
        materiais={materiais.data ?? []}
        onFechar={() => setNovaCompra(false)}
        onSucesso={() => { setNovaCompra(false); qc.invalidateQueries(); }}
      />
    </div>
  );
}

// ---------------------------------------------------- Nova compra (PO leve)
function ModalNovaCompra({ aberto, materiais, onFechar, onSucesso }: {
  aberto: boolean;
  materiais: Material[];
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const { t } = useTranslation();
  const { ativa, formato } = useAuth();
  const fornecedores = useLista<{ id: string; nome: string }>('fornecedor', { ordem: 'nome', desc: false });
  const [itens, setItens] = useState<{ material_id: string; quantidade: number; custo: string }[]>([
    { material_id: '', quantidade: 1, custo: '' },
  ]);
  const [erro, setErro] = useState<string | null>(null);

  const total = itens.reduce((s, i) => s + paraCentavos(i.custo || '0') * (i.quantidade || 0), 0);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const validos = itens.filter((i) => i.material_id && i.quantidade > 0);
    if (validos.length === 0) {
      setErro(t('estoque.compraSemItens'));
      return;
    }
    const { data: compra, error } = await supabase
      .from('compra')
      .insert({
        tenant_id: ativa?.tenant_id,
        numero: '',
        fornecedor_id: (f.get('fornecedor_id') as string) || null,
        previsao: (f.get('previsao') as string) || null,
        status: 'enviado',
        total,
      })
      .select('id')
      .single();
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    const { error: erroItens } = await supabase.from('compra_item').insert(
      validos.map((i) => ({
        tenant_id: ativa?.tenant_id,
        compra_id: compra.id,
        material_id: i.material_id,
        quantidade: i.quantidade,
        custo_unit: paraCentavos(i.custo || '0'),
      })),
    );
    if (erroItens) setErro(mensagemErro(erroItens));
    else {
      setItens([{ material_id: '', quantidade: 1, custo: '' }]);
      setErro(null);
      onSucesso();
    }
  }

  return (
    <Modal aberto={aberto} titulo={t('estoque.novaCompra')} onFechar={onFechar} largura="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('nav.fornecedores')}>
            <Selecao name="fornecedor_id" defaultValue="">
              <option value="">—</option>
              {(fornecedores.data ?? []).map((fo) => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo={t('estoque.previsao')}>
            <Entrada name="previsao" type="date" />
          </Campo>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold text-texto-2">{t('estoque.itensCompra')}</p>
          <div className="space-y-2">
            {itens.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_88px_28px] items-center gap-1.5">
                <Selecao value={item.material_id}
                  onChange={(e) => setItens(itens.map((x, j) => j === i ? { ...x, material_id: e.target.value } : x))}>
                  <option value="">—</option>
                  {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.unidade_compra})</option>)}
                </Selecao>
                <Entrada type="number" step="any" min="0.01" placeholder="Qtd." value={item.quantidade || ''}
                  onChange={(e) => setItens(itens.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))} />
                <Entrada inputMode="decimal" placeholder="R$ unit." value={item.custo}
                  onChange={(e) => setItens(itens.map((x, j) => j === i ? { ...x, custo: e.target.value } : x))} />
                <button type="button" className="text-texto-2 hover:text-erro"
                  onClick={() => setItens(itens.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <Botao type="button" variante="fantasma" className="mt-1.5 !px-2 !py-1 !text-[11px]"
            onClick={() => setItens([...itens, { material_id: '', quantidade: 1, custo: '' }])}>
            + {t('acoes.adicionar')}
          </Botao>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
          <span className="text-xs font-bold uppercase text-texto-2">{t('orcamento.total')}</span>
          <span className="font-extrabold tabular-nums text-ink">{moeda(total, formato)}</span>
        </div>

        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{t('acoes.criar')}</Botao>
        </div>
      </form>
    </Modal>
  );
}
