/**
 * Configurações → Agente de impressão: gera o token (mostrado uma vez),
 * instruções de instalação, lista de agentes com saúde (online/offline pelo
 * último contato) e a fila de impressão (refetch periódico p/ acompanhar).
 */
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { dataCurta } from '@/lib/formato';
import {
  Botao, Campo, Carregando, Cartao, Entrada, EstadoVazio, Etiqueta, Modal,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { COR_STATUS_IMPRESSAO, type TrabalhoImpressao } from '@/lib/impressao';

interface Agente {
  id: string; nome: string; status: string; ultimo_contato: string | null;
}

function saudeAgente(a: Agente): { rotulo: 'online' | 'offline' | 'aguardando'; cor: 'verde' | 'amarelo' | 'cinza' } {
  if (!a.ultimo_contato) return { rotulo: 'aguardando', cor: 'amarelo' };
  const segundos = (Date.now() - new Date(a.ultimo_contato).getTime()) / 1000;
  return segundos < 90 ? { rotulo: 'online', cor: 'verde' } : { rotulo: 'offline', cor: 'cinza' };
}

export function AbaAgente() {
  const { t } = useTranslation();
  const { ativa, pode, formato } = useAuth();
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const agentes = useLista<Agente>('agente_impressao', { ordem: 'created_at', desc: true });

  // fila de impressão — refetch a cada 4s para acompanhar o agente trabalhando
  const fila = useQuery({
    queryKey: ['trabalho_impressao', ativa?.tenant_id],
    enabled: !!ativa,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trabalho_impressao')
        .select('id, numero, status, progresso_pct, mensagem, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as TrabalhoImpressao[];
    },
  });

  async function gerar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setGerando(true);
    setErro(null);
    const { data, error } = await supabase.rpc('gerar_token_agente', { p_nome: f.get('nome') as string });
    setGerando(false);
    if (error) setErro(mensagemErro(error));
    else {
      setTokenNovo(data as string);
      qc.invalidateQueries({ queryKey: ['agente_impressao'] });
    }
  }

  function fecharModal() {
    setModalAberto(false);
    setTokenNovo(null);
    setErro(null);
    setCopiado(false);
  }

  async function cancelar(id: string) {
    await supabase.rpc('cancelar_impressao', { p_trabalho: id });
    qc.invalidateQueries({ queryKey: ['trabalho_impressao'] });
  }

  if (agentes.isLoading) return <Carregando />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Cartao>
          <p className="text-sm text-texto-2">{t('agente.intro')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pode('configuracoes', 'criar') && (
              <Botao onClick={() => { setTokenNovo(null); setErro(null); setModalAberto(true); }}>
                + {t('agente.gerarToken')}
              </Botao>
            )}
            <a href="/agente.mjs" download
              className="inline-flex items-center gap-1.5 rounded-lg border border-borda bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-2">
              ⤓ {t('agente.baixarAgente')}
            </a>
          </div>
        </Cartao>

        <Cartao>
          <h3 className="mb-2 text-sm font-bold text-ink">{t('agente.comoConfigurar')}</h3>
          <ol className="space-y-2">
            {[t('agente.passo1'), t('agente.passo2'), t('agente.passo3'), t('agente.passo4')].map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-texto">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full grad-acento text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink px-3 py-2.5 text-[11px] text-white/90">
{`SL_URL="${(import.meta.env.VITE_SUPABASE_URL as string) ?? 'https://SEU-PROJETO.supabase.co'}" \\
SL_TOKEN="sl_agent_..." \\
node agente.mjs`}
          </pre>
        </Cartao>

        <Cartao>
          <h3 className="mb-2 text-sm font-bold text-ink">{t('agente.agentes')}</h3>
          {(agentes.data ?? []).length === 0 ? (
            <p className="text-xs text-texto-2">{t('agente.semAgentes')}</p>
          ) : (
            <ul className="divide-y divide-borda/70">
              {agentes.data!.map((a) => {
                const saude = saudeAgente(a);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="font-semibold text-ink">{a.nome}</span>
                    <span className="flex items-center gap-2 text-xs text-texto-2">
                      {a.ultimo_contato && <span>{dataCurta(a.ultimo_contato, formato)}</span>}
                      <Etiqueta cor={saude.cor}>{t(`agente.${saude.rotulo}`)}</Etiqueta>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>

      {/* fila de impressão (acompanha o agente em tempo real) */}
      <Cartao className="h-fit lg:sticky lg:top-16">
        <h3 className="mb-2 text-sm font-bold text-ink">{t('impressao.fila')}</h3>
        {fila.isLoading ? (
          <Carregando />
        ) : (fila.data ?? []).length === 0 ? (
          <EstadoVazio mensagem={t('impressao.semTrabalhos')} />
        ) : (
          <ul className="space-y-2">
            {fila.data!.map((tr) => (
              <li key={tr.id} className="rounded-lg border border-borda p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-ink">{tr.numero}</span>
                  <Etiqueta cor={COR_STATUS_IMPRESSAO[tr.status]}>
                    {t(`impressao.statusLabel.${tr.status}`)}
                  </Etiqueta>
                </div>
                {(tr.status === 'imprimindo' || tr.status === 'enviado') && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full grad-acento transition-all"
                      style={{ width: `${Number(tr.progresso_pct)}%` }} />
                  </div>
                )}
                {tr.mensagem && <p className="mt-1 text-texto-2">{tr.mensagem}</p>}
                {['fila', 'enviado', 'pausado'].includes(tr.status) && pode('producao', 'editar') && (
                  <button onClick={() => cancelar(tr.id)}
                    className="mt-1 text-[11px] font-semibold text-erro hover:underline">
                    {t('impressao.cancelar')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Modal aberto={modalAberto} titulo={t('agente.gerarToken')} onFechar={fecharModal}>
        {tokenNovo ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">{t('agente.tokenTitulo')}</p>
            <code className="block break-all rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-ink">{tokenNovo}</code>
            <p className="rounded-lg bg-alerta/5 px-3 py-2 text-xs text-alerta">⚠ {t('agente.tokenAviso')}</p>
            <Botao variante="acento" className="w-full"
              onClick={() => { navigator.clipboard.writeText(tokenNovo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
              {copiado ? `✓ ${t('agente.copiado')}` : t('agente.copiar')}
            </Botao>
          </div>
        ) : (
          <form onSubmit={gerar} className="space-y-3">
            <Campo rotulo={t('agente.nomeAgente')}>
              <Entrada name="nome" required placeholder="PC da oficina" />
            </Campo>
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={fecharModal}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit" disabled={gerando}>{t('agente.gerarToken')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
