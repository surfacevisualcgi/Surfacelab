/**
 * Tela 09 — Orçamento com cara de DOCUMENTO (estrutura v2): empresa à
 * esquerda, cliente à direita, metadados em faixa de chips, itens, painel
 * lateral "Interno" recolhível (mascarado sem ver_custos), TOTAL grande e
 * 3 ações no rodapé (PDF via impressão, WhatsApp, Aprovar → pedido).
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/dados';
import { dataCurta, moeda, percentual } from '@/lib/formato';
import {
  Acordeao, Botao, Carregando, Cartao, Dinheiro, EstadoErro, Etiqueta,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { COR_STATUS_ORC, type OrcamentoView } from './PaginaOrcamentos';
import { ModalEditarOrcamento } from './ModalEditarOrcamento';
import type { ResultadoCalculo } from '@/core/calculo';

interface ItemView {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unit: number;
  valor_total: number;
  custo_unit: number | null;
}

function Chip({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-borda bg-white px-3 py-1.5 text-xs">
      <span className="font-bold uppercase tracking-wide text-texto-2">{rotulo}:</span>
      <span className="font-semibold text-ink">{children}</span>
    </span>
  );
}

export function PaginaOrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, pode, flag, formato } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [editando, setEditando] = useState(false);

  const orc = useQuery({
    queryKey: ['v_orcamento', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_orcamento').select('*').eq('id', id).single();
      if (error) throw error;
      return data as OrcamentoView & {
        observacoes: string | null;
        prazo_entrega: string | null;
        condicoes_pagamento: string | null;
        frete: number;
        empresa_snapshot: Record<string, string> | null;
      };
    },
  });

  const itens = useQuery({
    queryKey: ['v_orcamento_item', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_orcamento_item').select('*').eq('orcamento_id', id).is('deleted_at', null).order('ordem');
      if (error) throw error;
      return data as ItemView[];
    },
  });

  async function mudarStatus(status: string) {
    setAgindo(true);
    setErro(null);
    const patch: Record<string, unknown> = { status };
    if (status === 'enviado') patch.enviado_em = new Date().toISOString();
    const { error } = await supabase.from('orcamento').update(patch).eq('id', id);
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries({ queryKey: ['v_orcamento'] });
      orc.refetch();
    }
  }

  async function aprovar() {
    setAgindo(true);
    setErro(null);
    const { data, error } = await supabase.rpc('aprovar_orcamento', { p_orcamento: id });
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries();
      navigate('/pedidos', { state: { pedido: data } });
    }
  }

  function enviarWhatsApp() {
    if (!o) return;
    const linhas = [
      `*${t('orcamento.tituloDoc')} ${o.numero}* — ${ativa?.tenant.nome}`,
      '',
      ...(itens.data ?? []).map(
        (i) => `• ${i.descricao} — ${Number(i.quantidade)}× ${moeda(i.valor_unit, formato)} = ${moeda(i.valor_total, formato)}`,
      ),
      '',
      `*${t('orcamento.total')}: ${moeda(o.total, formato)}*`,
      o.validade ? `${t('orcamento.validade')}: ${dataCurta(o.validade, formato)}` : '',
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank');
  }

  if (orc.isLoading || itens.isLoading) return <Carregando />;
  if (orc.isError || !orc.data) return <EstadoErro onRetry={() => orc.refetch()} />;

  const o = orc.data;
  const snapshot = (flag('ver_custos') ? o.calculo_snapshot : null) as ResultadoCalculo | null;
  const empresa = o.empresa_snapshot ?? {};
  const podeAgir = ['rascunho', 'enviado', 'aguardando_resposta'].includes(o.status);
  const hoje = new Date().toISOString().slice(0, 10);
  const vencido = !!o.validade && o.validade < hoje;

  return (
    <div className="pb-20 lg:pb-0">
      {/* cabeçalho do documento */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            {t('orcamento.tituloDoc')} {o.numero}
          </h1>
          <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>{t(`orcamento.statusLabel.${o.status}`)}</Etiqueta>
        </div>
        <p className="text-xs text-texto-2">
          {t('orcamento.criadoEm')} {dataCurta(o.created_at, formato)}
        </p>
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}
      {o.status !== 'rascunho' && (
        <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2 print:hidden">
          🔒 {t('orcamento.snapshotAviso')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        <div className="space-y-4">
          {/* empresa à esquerda · cliente à direita (v2) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Cartao>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                {t('orcamento.dadosEmpresa')}
              </p>
              <p className="text-sm font-bold text-ink">
                {empresa.nome_fantasia || empresa.razao_social || ativa?.tenant.nome}
              </p>
              {empresa.cnpj && <p className="text-xs text-texto-2">CNPJ {empresa.cnpj}</p>}
            </Cartao>
            <Cartao>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                {t('orcamento.dadosCliente')}
              </p>
              <p className="text-sm font-bold text-ink">{o.cliente_snapshot?.nome ?? '—'}</p>
            </Cartao>
          </div>

          {/* metadados em faixa de chips compacta (v2) */}
          <div className="flex flex-wrap gap-2">
            <Chip rotulo={t('orcamento.validade')}>{dataCurta(o.validade, formato)}</Chip>
            {o.prazo_entrega && <Chip rotulo={t('orcamento.prazoEntrega')}>{o.prazo_entrega}</Chip>}
            {o.condicoes_pagamento && <Chip rotulo={t('orcamento.condicoes')}>{o.condicoes_pagamento}</Chip>}
            {o.frete > 0 && <Chip rotulo={t('orcamento.frete')}>{moeda(o.frete, formato)}</Chip>}
          </div>

          {/* itens */}
          <div className="overflow-x-auto rounded-xl border border-borda bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda bg-surface-2/60 text-left">
                  {['Item', t('produto.quantidade'), 'Valor unit.', 'Total'].map((c, i) => (
                    <th key={i} className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-texto-2 ${i >= 2 ? 'text-right' : ''}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda/70">
                {(itens.data ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2.5 font-semibold text-ink">{item.descricao}</td>
                    <td className="px-3 py-2.5 tabular-nums">{Number(item.quantidade)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums"><Dinheiro centavos={item.valor_unit} /></td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums"><Dinheiro centavos={item.valor_total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {o.observacoes && (
            <Acordeao titulo={t('orcamento.observacoes')}>
              <p className="text-sm text-texto-2">{o.observacoes}</p>
            </Acordeao>
          )}
        </div>

        {/* painel lateral: Interno (recolhível) + TOTAL + ações */}
        <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit print:hidden">
          {flag('ver_custos') && (
            <Acordeao abertoInicial titulo={<span>{t('orcamento.resumoInterno')} <Etiqueta>🔒 {t('orcamento.interno')}</Etiqueta></span>}>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.custoInterno')}</dt>
                  <dd className="font-semibold tabular-nums"><Dinheiro centavos={o.custo_total} /></dd></div>
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.lucroInterno')}</dt>
                  <dd className="font-semibold tabular-nums text-ok"><Dinheiro centavos={o.lucro_estimado} /></dd></div>
                <div className="flex justify-between"><dt className="text-texto-2">{t('orcamento.margemInterna')}</dt>
                  <dd className="font-semibold tabular-nums">
                    {o.margem_estimada != null ? percentual(Number(o.margem_estimada), formato) : '•••'}
                  </dd></div>
                {snapshot && Array.isArray(snapshot.itens) && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-xs font-bold text-brand-azul">
                      {t('calculadora.itensCusto')}
                    </summary>
                    <div className="mt-1.5 space-y-1">
                      {snapshot.itens.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-texto-2">{item.descricao}</span>
                          <Dinheiro centavos={item.total} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </dl>
            </Acordeao>
          )}

          {/* total grande (v2) */}
          <div className="rounded-xl bg-ink p-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">
              {t('orcamento.totalDoc')}
            </p>
            <p className="text-3xl font-extrabold tabular-nums">
              <Dinheiro centavos={o.total} />
            </p>
          </div>

          {/* 3 ações (v2) */}
          <div className="flex flex-col gap-2">
            <Botao variante="secundario" onClick={() => window.print()}>
              ⤓ {t('orcamento.gerarPdf')}
            </Botao>
            <Botao variante="secundario" onClick={enviarWhatsApp}>
              💬 {t('orcamento.enviarWhatsApp')}
            </Botao>
            {o.status === 'rascunho' && pode('orcamentos', 'editar') && (
              <>
                <Botao variante="secundario" disabled={agindo} onClick={() => setEditando(true)}>
                  ✎ {t('orcamento.editar')}
                </Botao>
                <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('enviado')}>
                  {t('orcamento.marcarEnviado')}
                </Botao>
              </>
            )}
            {o.status === 'enviado' && pode('orcamentos', 'editar') && (
              <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('aguardando_resposta')}>
                {t('orcamento.marcarAguardando')}
              </Botao>
            )}
            {['enviado', 'aguardando_resposta'].includes(o.status) && vencido && pode('orcamentos', 'editar') && (
              <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('expirado')}>
                {t('orcamento.marcarExpirado')}
              </Botao>
            )}
            {podeAgir && pode('orcamentos', 'aprovar') && (
              <>
                <Botao variante="acento" disabled={agindo} onClick={aprovar}>
                  {t('orcamento.aprovarGerarPedido')}
                </Botao>
                <Botao variante="perigo" disabled={agindo} onClick={() => mudarStatus('recusado')}>
                  {t('orcamento.recusar')}
                </Botao>
              </>
            )}
          </div>
        </div>
      </div>

      {id && (
        <ModalEditarOrcamento
          orcamentoId={id}
          aberto={editando}
          onFechar={() => setEditando(false)}
          onSalvo={() => { setEditando(false); orc.refetch(); itens.refetch(); }}
        />
      )}
    </div>
  );
}
