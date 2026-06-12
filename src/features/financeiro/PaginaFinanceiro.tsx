/**
 * Telas 13/19 — Financeiro: contas a pagar/receber, KPIs e lançamentos.
 * Pró-labore só aparece com a flag (o backend nem envia a linha).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, deCentavos, moeda, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro, Entrada,
  EstadoErro, EstadoVazio, Etiqueta, Kpi, Modal, Selecao, TabelaDados,
} from '@/components/ui';
import { GraficoBarrasDuplas } from '@/components/graficos';
import { useAuth } from '@/auth/AuthProvider';

function ultimos6Meses(): { chave: string; rotulo: string }[] {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const agora = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (5 - i), 1);
    return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: nomes[d.getMonth()] };
  });
}

interface Lancamento {
  id: string; tipo: 'entrada' | 'saida'; descricao: string; categoria: string;
  vencimento: string; pago_em: string | null; valor: number; valor_pago: number;
  conta: string | null; status: string;
}

export function PaginaFinanceiro() {
  const { t } = useTranslation();
  const { pode, flag, formato } = useAuth();
  const lista = useLista<Lancamento>('lancamento', { ordem: 'vencimento', desc: true });
  const crud = useCrud('lancamento');
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [baixa, setBaixa] = useState<Lancamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const kpis = useMemo(() => {
    const validos = (lista.data ?? []).filter((l) => l.status !== 'cancelado');
    const pendentes = validos.filter((l) => l.status !== 'pago');
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const restante = (l: Lancamento) => Number(l.valor) - Number(l.valor_pago);
    return {
      // saldo REALIZADO = o que de fato entrou − o que de fato saiu
      saldo: validos.reduce((s, l) => s + (l.tipo === 'entrada' ? 1 : -1) * Number(l.valor_pago), 0),
      aReceber: pendentes.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + restante(l), 0),
      aPagar: pendentes.filter((l) => l.tipo === 'saida').reduce((s, l) => s + restante(l), 0),
      atrasados: pendentes.filter((l) => l.vencimento < hoje).length,
      proximosPagar: pendentes
        .filter((l) => l.tipo === 'saida' && l.vencimento <= em30)
        .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1))
        .slice(0, 5),
      fluxo6: ultimos6Meses().map((m) => ({
        rotulo: m.rotulo,
        entrada: validos.filter((l) => l.tipo === 'entrada' && l.vencimento.slice(0, 7) === m.chave)
          .reduce((s, l) => s + Number(l.valor), 0),
        saida: validos.filter((l) => l.tipo === 'saida' && l.vencimento.slice(0, 7) === m.chave)
          .reduce((s, l) => s + Number(l.valor), 0),
      })),
    };
  }, [lista.data]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroConta, setFiltroConta] = useState('');
  const contas = useMemo(
    () => [...new Set((lista.data ?? []).map((l) => l.conta).filter(Boolean) as string[])].sort(),
    [lista.data],
  );

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await crud.criar.mutateAsync({
        tipo: f.get('tipo') as string,
        descricao: f.get('descricao') as string,
        categoria: f.get('categoria') as string,
        vencimento: f.get('vencimento') as string,
        valor: paraCentavos(f.get('valor') as string),
        conta: (f.get('conta') as string) || null,
        origem_tipo: 'manual',
      });
      setNovo(false);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function registrarBaixa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!baixa) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('registrar_pagamento', {
      p_lancamento: baixa.id,
      p_valor: paraCentavos(f.get('valor') as string),
      p_conta: (f.get('conta') as string) || null,
    });
    if (error) { setErro(mensagemErro(error)); return; }
    setBaixa(null); setErro(null);
    qc.invalidateQueries({ queryKey: ['lancamento'] });
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const categorias = ['vendas', 'insumos', 'frete', 'energia', 'aluguel', 'software',
    'contador', 'marketing', 'manutencao', ...(flag('ver_prolabore') ? ['prolabore'] : []), 'outros'];

  return (
    <div>
      <CabecalhoPagina
        titulo={t('financeiro.titulo')}
        acoes={pode('financeiro', 'criar') ? <Botao onClick={() => setNovo(true)}>+ {t('financeiro.novoLancamento')}</Botao> : undefined}
      />

      {/* 4 KPIs — saldo realizado como herói (v2) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('financeiro.saldoRealizado')} destaque>
          <span className={kpis.saldo < 0 ? 'text-erro' : ''}>{moeda(kpis.saldo, formato)}</span>
        </Kpi>
        <Kpi rotulo={t('financeiro.aReceber')}>
          <span className="text-ok">{moeda(kpis.aReceber, formato)}</span>
        </Kpi>
        <Kpi rotulo={t('financeiro.aPagar')}>
          <span className="text-erro">{moeda(kpis.aPagar, formato)}</span>
        </Kpi>
        <Kpi rotulo={t('financeiro.atrasados')}>{kpis.atrasados}</Kpi>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Cartao>
          <h2 className="mb-1 text-sm font-bold text-ink">{t('dashboard.fluxoCaixa')}</h2>
          <div className="mb-1 flex gap-3 text-[10px] font-semibold text-texto-2">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> {t('financeiro.tipoLabel.entrada')}s</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-erro/70" /> {t('financeiro.tipoLabel.saida')}s</span>
          </div>
          <GraficoBarrasDuplas meses={kpis.fluxo6} />
        </Cartao>

        {/* próximos pagamentos (contas a pagar vencendo) */}
        <Cartao className="h-fit">
          <h2 className="mb-2 text-sm font-bold text-ink">{t('financeiro.proximosPagamentos')}</h2>
          {kpis.proximosPagar.length === 0 ? (
            <p className="py-3 text-center text-xs text-texto-2">{t('financeiro.semProximos')}</p>
          ) : (
            <ul className="space-y-1.5">
              {kpis.proximosPagar.map((l) => {
                const atrasado = l.vencimento < new Date().toISOString().slice(0, 10);
                return (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{l.descricao}</span>
                      <span className={atrasado ? 'font-bold text-erro' : 'text-texto-2'}>{dataCurta(l.vencimento, formato)}{atrasado ? ' ⚠' : ''}</span>
                    </span>
                    <Dinheiro centavos={Number(l.valor) - Number(l.valor_pago)} className="shrink-0 font-semibold text-erro" />
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="!w-auto">
          <option value="">{t('financeiro.todosTipos')}</option>
          <option value="entrada">{t('financeiro.tipoLabel.entrada')}</option>
          <option value="saida">{t('financeiro.tipoLabel.saida')}</option>
        </Selecao>
        <Selecao value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="!w-auto">
          <option value="">{t('orcamento.todosStatus')}</option>
          {['pendente', 'pago', 'atrasado', 'cancelado'].map((s) => (
            <option key={s} value={s}>{t(`financeiro.statusLabel.${s}`)}</option>
          ))}
        </Selecao>
        {contas.length > 0 && (
          <Selecao value={filtroConta} onChange={(e) => setFiltroConta(e.target.value)} className="!w-auto">
            <option value="">{t('financeiro.todasContas')}</option>
            {contas.map((c) => <option key={c} value={c}>{c}</option>)}
          </Selecao>
        )}
      </div>

      {(() => {
        const filtrados = (lista.data ?? []).filter(
          (l) => (!filtroTipo || l.tipo === filtroTipo) && (!filtroStatus || l.status === filtroStatus)
            && (!filtroConta || l.conta === filtroConta),
        );
        const parcial = (l: Lancamento) => Number(l.valor_pago) > 0 && Number(l.valor_pago) < Number(l.valor);
        return filtrados.length === 0 ? (
          <EstadoVazio />
        ) : (
          <TabelaDados<Lancamento>
            colunas={[
              { titulo: t('financeiro.descricao'), principal: true, render: (l) => <span className="font-semibold text-ink">{l.descricao}</span> },
              { titulo: t('financeiro.categoria'), render: (l) => <span className="text-texto-2">{l.categoria}</span> },
              { titulo: t('financeiro.conta'), render: (l) => <span className="text-texto-2">{l.conta ?? '—'}</span> },
              { titulo: t('financeiro.vencimento'), render: (l) => <span className="text-texto-2">{dataCurta(l.vencimento, formato)}</span> },
              {
                titulo: t('financeiro.valor'),
                numerica: true,
                render: (l) => (
                  <span className="inline-flex flex-col items-end">
                    <span className={`font-semibold ${l.tipo === 'entrada' ? 'text-ok' : 'text-erro'}`}>
                      {l.tipo === 'entrada' ? '+' : '−'}<Dinheiro centavos={Number(l.valor)} />
                    </span>
                    {parcial(l) && <span className="text-[10px] text-texto-2"><Dinheiro centavos={Number(l.valor_pago)} /> {t('financeiro.pagoDe')}</span>}
                  </span>
                ),
              },
              {
                titulo: t('orcamento.status'),
                render: (l) => (
                  <Etiqueta cor={l.status === 'pago' ? 'verde' : l.status === 'cancelado' ? 'cinza' : parcial(l) ? 'azul' : 'amarelo'}>
                    {l.status === 'pago' ? t('financeiro.statusLabel.pago') : parcial(l) ? t('financeiro.parcial') : t(`financeiro.statusLabel.${l.status}`)}
                  </Etiqueta>
                ),
              },
            ]}
            linhas={filtrados}
            chave={(l) => l.id}
            acoes={(l) =>
              l.status !== 'pago' && l.status !== 'cancelado' && pode('financeiro', 'editar') ? (
                <Botao variante="secundario" onClick={() => setBaixa(l)}>
                  {l.tipo === 'entrada' ? t('financeiro.receber') : t('financeiro.pagar')}
                </Botao>
              ) : null
            }
          />
        );
      })()}

      <Modal aberto={novo} titulo={t('financeiro.novoLancamento')} onFechar={() => setNovo(false)}>
        <form onSubmit={salvar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo">
              <Selecao name="tipo" defaultValue="saida">
                <option value="entrada">{t('financeiro.tipoLabel.entrada')}</option>
                <option value="saida">{t('financeiro.tipoLabel.saida')}</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('financeiro.categoria')}>
              <Selecao name="categoria" defaultValue="outros">
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </Selecao>
            </Campo>
          </div>
          <Campo rotulo={t('financeiro.descricao')}>
            <Entrada name="descricao" required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('financeiro.vencimento')}>
              <Entrada name="vencimento" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo rotulo={`${t('financeiro.valor')} (R$)`}>
              <Entrada name="valor" inputMode="decimal" required defaultValue={deCentavos(0)} />
            </Campo>
          </div>
          <Campo rotulo={t('financeiro.conta')} dica={t('financeiro.contaDica')}>
            <Entrada name="conta" placeholder="Ex.: Conta PJ, Pix, Dinheiro" />
          </Campo>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setNovo(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.salvar')}</Botao>
          </div>
        </form>
      </Modal>

      {/* baixa (parcial ou total) de um lançamento numa conta */}
      <Modal aberto={!!baixa} titulo={baixa?.tipo === 'entrada' ? t('financeiro.registrarRecebimento') : t('financeiro.registrarPagamento')} onFechar={() => setBaixa(null)}>
        {baixa && (
          <form onSubmit={registrarBaixa} className="space-y-3">
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="font-semibold text-ink">{baixa.descricao}</p>
              <p className="text-xs text-texto-2">
                {t('financeiro.totalLanc')}: <Dinheiro centavos={Number(baixa.valor)} />
                {Number(baixa.valor_pago) > 0 && <> · {t('financeiro.jaPago')}: <Dinheiro centavos={Number(baixa.valor_pago)} /></>}
                {' · '}{t('financeiro.restante')}: <span className="font-bold"><Dinheiro centavos={Number(baixa.valor) - Number(baixa.valor_pago)} /></span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={`${t('financeiro.valorBaixa')} (R$)`} dica={t('financeiro.valorBaixaDica')}>
                <Entrada name="valor" inputMode="decimal" required defaultValue={deCentavos(Number(baixa.valor) - Number(baixa.valor_pago))} />
              </Campo>
              <Campo rotulo={t('financeiro.conta')}>
                <Entrada name="conta" defaultValue={baixa.conta ?? ''} placeholder="Ex.: Conta PJ, Pix" />
              </Campo>
            </div>
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setBaixa(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit" variante="acento">{t('acoes.confirmar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
