/**
 * Tela 11 — Ordem de Produção (estrutura v2): abas Resumo / Arquivos /
 * Comunicações. Resumo prioriza 3 blocos: Progresso (rosca % herói),
 * Checklist de produção (interativo) e Estimado × Real (divergências em
 * verde/vermelho). Ações fixas no rodapé: Registrar falha + Avançar ordem.
 */
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/dados';
import { enviarArquivo, removerFoto, urlAssinada, useTenantId } from '@/lib/fotos';
import { duracao, moeda } from '@/lib/formato';
import {
  Abas, Botao, Carregando, Cartao, EstadoErro, EstadoVazio, Etiqueta, Entrada, Modal,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { ModalFalha } from './ModalFalha';

interface OpDetalhe {
  id: string; numero: string; status: string; quantidade: number;
  prazo: string | null; progresso_pct: number;
  arquivos: string[];
  checklist: { item: string; feito: boolean; hora?: string }[];
  tempo_estimado_min: number; tempo_real_min: number | null;
  material_estimado_g: number; material_real_g: number | null;
  custo_estimado: number | null; custo_real: number | null;
  iniciado_em: string | null; concluido_em: string | null;
  config_impressao_snapshot: { nome?: string; tecnologia?: string; versao?: string }[];
  produto_id: string | null;
  impressora_id: string | null;
  produto: { nome: string } | null;
  pedido: { numero: string; cliente_snapshot: { nome?: string } | null } | null;
}

const FLUXO = ['aguardando_aprovacao', 'preparar', 'imprimindo', 'acabamento', 'concluido'] as const;

type Aba = 'resumo' | 'arquivos' | 'comunicacoes';

function Rosca({ pct }: { pct: number }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const frac = Math.min(100, Math.max(0, pct)) / 100;
  return (
    <svg viewBox="0 0 140 140" className="size-36" role="img" aria-label={`${Math.round(pct)}%`}>
      <defs>
        <linearGradient id="rosca-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand-azul)" />
          <stop offset="1" stopColor="var(--color-brand-magenta)" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="14" />
      <circle cx="70" cy="70" r={R} fill="none" stroke="url(#rosca-g)" strokeWidth="14"
        strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 70 70)" />
      <text x="70" y="76" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--color-ink)">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function PaginaOrdemProducao() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, pode, flag, formato } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('resumo');
  const [falhaAberta, setFalhaAberta] = useState(false);
  const [novoItem, setNovoItem] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const op = useQuery({
    queryKey: ['v_ordem_producao', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_ordem_producao')
        .select('*, produto:produto_id (nome), pedido:pedido_id (numero, cliente_snapshot)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as OpDetalhe;
    },
  });

  async function salvarChecklist(lista: OpDetalhe['checklist']) {
    const feitos = lista.filter((c) => c.feito).length;
    const pct = lista.length > 0 ? (feitos / lista.length) * 100 : 0;
    const { error } = await supabase
      .from('ordem_producao')
      .update({ checklist: lista, progresso_pct: pct })
      .eq('id', id);
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries({ queryKey: ['v_ordem_producao'] });
  }

  async function avancar() {
    if (!op.data) return;
    const idx = FLUXO.indexOf(op.data.status as typeof FLUXO[number]);
    if (idx < 0 || idx >= FLUXO.length - 1) return;
    setErro(null);
    const { error } = await supabase.rpc('mover_ordem_producao', {
      p_op: id, p_status: FLUXO[idx + 1],
    });
    if (error) setErro(mensagemErro(error));
    qc.invalidateQueries();
  }

  if (op.isLoading) return <Carregando />;
  if (op.isError || !op.data) return <EstadoErro onRetry={() => op.refetch()} />;

  const o = op.data;
  const proxima = FLUXO[FLUXO.indexOf(o.status as typeof FLUXO[number]) + 1];
  const checklist = Array.isArray(o.checklist) ? o.checklist : [];

  const divergencia = (estimado: number, real: number | null, formatar: (v: number) => string) => {
    if (real == null) return <span className="text-texto-2">—</span>;
    const dif = real - estimado;
    return (
      <span className={`font-bold tabular-nums ${dif <= 0 ? 'text-ok' : 'text-erro'}`}>
        {dif <= 0 ? '' : '+'}{formatar(dif)}
      </span>
    );
  };

  return (
    <div className="pb-20 lg:pb-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            {t('pedido.opTitulo')} {o.numero}
          </h1>
          <Etiqueta cor={o.status === 'concluido' ? 'verde' : o.status === 'cancelado' ? 'vermelho' : 'azul'}>
            {t(`pedido.opStatus.${o.status}`)}
          </Etiqueta>
        </div>
      </div>

      {/* cabeçalho compacto: dados do produto/pedido (v2) */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {[
          { rotulo: t('nav.produtos'), valor: o.produto?.nome },
          { rotulo: t('pedido.numero'), valor: o.pedido?.numero },
          { rotulo: t('orcamento.cliente'), valor: o.pedido?.cliente_snapshot?.nome },
          { rotulo: t('produto.quantidade'), valor: `${Number(o.quantidade)}×` },
          { rotulo: t('pedido.prazo'), valor: o.prazo },
        ].filter((c) => c.valor).map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-borda bg-white px-3 py-1.5">
            <span className="font-bold uppercase tracking-wide text-texto-2">{c.rotulo}:</span>
            <span className="font-semibold text-ink">{c.valor}</span>
          </span>
        ))}
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      <Abas<Aba>
        abas={[
          { id: 'resumo', rotulo: t('pedido.abaResumo') },
          { id: 'arquivos', rotulo: t('pedido.abaArquivos') },
          { id: 'comunicacoes', rotulo: t('pedido.abaComunicacoes') },
        ]}
        ativa={aba}
        onTrocar={setAba}
      />

      {aba === 'resumo' && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* progresso — herói (v2) */}
          <Cartao className="flex flex-col items-center justify-center gap-2">
            <h2 className="text-sm font-bold text-ink">{t('pedido.progresso')}</h2>
            <Rosca pct={Number(o.progresso_pct)} />
            <div className="flex flex-wrap justify-center gap-1">
              {FLUXO.slice(0, 4).map((s) => (
                <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  s === o.status ? 'grad-acento text-white'
                  : FLUXO.indexOf(s) < FLUXO.indexOf(o.status as typeof FLUXO[number])
                    ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-texto-2'
                }`}>
                  {t(`pedido.opStatus.${s}`)}
                </span>
              ))}
            </div>
          </Cartao>

          {/* checklist interativo */}
          <Cartao>
            <h2 className="mb-2 text-sm font-bold text-ink">{t('pedido.checklist')}</h2>
            {checklist.length === 0 && (
              <p className="mb-2 text-xs text-texto-2">{t('pedido.semChecklist')}</p>
            )}
            <ul className="space-y-1.5">
              {checklist.map((item, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.feito}
                      disabled={!pode('producao', 'editar') || o.status === 'concluido'}
                      onChange={(e) => {
                        const lista = checklist.map((c, j) =>
                          j === i ? { ...c, feito: e.target.checked, hora: e.target.checked ? new Date().toISOString() : undefined } : c,
                        );
                        salvarChecklist(lista);
                      }}
                      className="mt-0.5 accent-brand-roxo"
                    />
                    <span className={item.feito ? 'text-texto-2 line-through' : 'text-ink'}>
                      {item.item}
                      {item.feito && item.hora && (
                        <span className="ml-1.5 text-[10px] text-texto-2 no-underline">
                          {new Date(item.hora).toLocaleTimeString(formato.locale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {pode('producao', 'editar') && o.status !== 'concluido' && (
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!novoItem.trim()) return;
                  salvarChecklist([...checklist, { item: novoItem.trim(), feito: false }]);
                  setNovoItem('');
                }}
              >
                <Entrada value={novoItem} onChange={(e) => setNovoItem(e.target.value)}
                  placeholder={t('pedido.novoItemChecklist')} className="!py-1.5 text-xs" />
                <Botao type="submit" variante="secundario" className="!px-2.5 !py-1.5">+</Botao>
              </form>
            )}
          </Cartao>

          {/* estimado × real com divergências (v2) */}
          <Cartao>
            <h2 className="mb-2 text-sm font-bold text-ink">{t('pedido.estimadoVsReal')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase text-texto-2">
                  <th className="py-1" /><th className="py-1">Est.</th><th className="py-1">Real</th><th className="py-1 text-right">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda/60">
                <tr>
                  <td className="py-2 text-texto-2">{t('pedido.tempo')}</td>
                  <td className="py-2 tabular-nums">{duracao(o.tempo_estimado_min)}</td>
                  <td className="py-2 tabular-nums">{duracao(o.tempo_real_min)}</td>
                  <td className="py-2 text-right">{divergencia(o.tempo_estimado_min, o.tempo_real_min, (v) => duracao(Math.abs(v)))}</td>
                </tr>
                <tr>
                  <td className="py-2 text-texto-2">{t('pedido.material')}</td>
                  <td className="py-2 tabular-nums">{Number(o.material_estimado_g).toLocaleString()}g</td>
                  <td className="py-2 tabular-nums">{o.material_real_g != null ? `${Number(o.material_real_g).toLocaleString()}g` : '—'}</td>
                  <td className="py-2 text-right">{divergencia(Number(o.material_estimado_g), o.material_real_g != null ? Number(o.material_real_g) : null, (v) => `${Math.abs(v).toLocaleString()}g`)}</td>
                </tr>
                {flag('ver_custos') && (
                  <tr>
                    <td className="py-2 text-texto-2">{t('pedido.custo')}</td>
                    <td className="py-2 tabular-nums">{o.custo_estimado != null ? moeda(o.custo_estimado, formato) : '•••'}</td>
                    <td className="py-2 tabular-nums">{o.custo_real != null ? moeda(o.custo_real, formato) : '—'}</td>
                    <td className="py-2 text-right">
                      {o.custo_estimado != null
                        ? divergencia(o.custo_estimado, o.custo_real, (v) => moeda(Math.abs(v), formato))
                        : '•••'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Cartao>
        </div>
      )}

      {aba === 'arquivos' && (
        <ArquivosOp
          op={o}
          podeEditar={pode('producao', 'editar')}
          aoMudar={() => qc.invalidateQueries({ queryKey: ['v_ordem_producao'] })}
        />
      )}
      {aba === 'comunicacoes' && (
        <EstadoVazio mensagem={t('pedido.semComunicacoes')} />
      )}

      {/* ações primárias fixas no rodapé (v2) */}
      {pode('producao', 'editar') && !['concluido', 'cancelado'].includes(o.status) && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-borda bg-white/95 px-4 py-2.5 backdrop-blur lg:sticky lg:bottom-0 lg:mt-4 lg:rounded-xl lg:border lg:bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
            <Botao variante="secundario" onClick={() => setFalhaAberta(true)}>
              ⚠ {t('pedido.registrarFalha')}
            </Botao>
            <div className="flex gap-2">
              {/* imprimir direto: envia o G-code do modelo à impressora e avança */}
              {(o.status === 'preparar' || o.status === 'aguardando_aprovacao') && (
                <BotaoImprimirOP op={o} aoEnfileirar={() => qc.invalidateQueries()} />
              )}
              {proxima && (
                <Botao variante="acento" onClick={avancar}>
                  {t('pedido.avancarOrdem')} → {t(`pedido.opStatus.${proxima}`)}
                </Botao>
              )}
            </div>
          </div>
        </div>
      )}

      <ModalFalha
        op={falhaAberta ? { id: o.id, numero: o.numero } : null}
        onFechar={() => setFalhaAberta(false)}
        onSucesso={() => { setFalhaAberta(false); qc.invalidateQueries(); }}
      />
    </div>
  );
}

/** Botão "Imprimir" da OP: acha o G-code do modelo do produto, enfileira na
 *  impressora da OP e avança o card para "Imprimindo" (decisão do usuário). */
function BotaoImprimirOP({ op, aoEnfileirar }: { op: OpDetalhe; aoEnfileirar: () => void }) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gcodes = useQuery({
    queryKey: ['gcode-da-op', op.produto_id],
    enabled: !!op.produto_id,
    queryFn: async () => {
      // modelos da composição do produto → G-codes desses modelos
      const { data: comp } = await supabase
        .from('composicao_item')
        .select('modelo_id')
        .eq('produto_id', op.produto_id)
        .eq('tipo', 'modelo_impresso')
        .is('deleted_at', null);
      const modeloIds = (comp ?? []).map((c) => c.modelo_id).filter(Boolean);
      if (modeloIds.length === 0) return [];
      const { data, error } = await supabase
        .from('arquivo_gcode')
        .select('id, nome, impressora_id, modelo_id')
        .in('modelo_id', modeloIds)
        .is('deleted_at', null);
      if (error) throw error;
      return data as { id: string; nome: string; impressora_id: string | null; modelo_id: string }[];
    },
  });

  async function enfileirar(gcodeId: string) {
    setErro(null);
    const { error } = await supabase.rpc('enfileirar_impressao', {
      p_gcode: gcodeId,
      p_impressora: op.impressora_id,
      p_ordem_producao: op.id,
      p_avancar: true,
    });
    if (error) setErro(mensagemErro(error));
    else { setAberto(false); aoEnfileirar(); }
  }

  const lista = gcodes.data ?? [];

  return (
    <>
      <Botao variante="secundario" onClick={() => {
        if (lista.length === 1) enfileirar(lista[0].id);
        else setAberto(true);
      }}>
        🖨 {t('gcode.imprimir')}
      </Botao>
      <Modal aberto={aberto} titulo={t('gcode.imprimir')} onFechar={() => setAberto(false)}>
        {erro && <p className="mb-2 text-xs font-semibold text-erro">{erro}</p>}
        {lista.length === 0 ? (
          <EstadoVazio mensagem={t('gcode.nenhum')} />
        ) : (
          <div className="space-y-2">
            {lista.map((g) => (
              <button key={g.id} onClick={() => enfileirar(g.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-borda px-3 py-2.5 text-left text-sm font-semibold text-ink hover:border-brand-azul hover:bg-brand-azul/5">
                📄 {g.nome}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Aba Arquivos: upload real (G-code, fotos da produção) com download assinado */
function ArquivosOp({ op, podeEditar, aoMudar }: {
  op: OpDetalhe;
  podeEditar: boolean;
  aoMudar: () => void;
}) {
  const { t } = useTranslation();
  const tenantId = useTenantId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivos = op.arquivos ?? [];

  async function salvar(novaLista: string[]) {
    const { error } = await supabase.from('ordem_producao')
      .update({ arquivos: novaLista }).eq('id', op.id);
    if (error) throw error;
    aoMudar();
  }

  async function adicionar(lista: FileList | null) {
    if (!lista?.length || !tenantId) return;
    setEnviando(true);
    setErro(null);
    try {
      const novos: string[] = [];
      for (const arq of Array.from(lista)) {
        if (arq.size > 50 * 1024 * 1024) throw new Error(t('pedido.arquivoGrande'));
        novos.push(await enviarArquivo(tenantId, `op/${op.id}`, arq));
      }
      await salvar([...arquivos, ...novos]);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function baixar(path: string) {
    try {
      window.open(await urlAssinada(path), '_blank');
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function remover(path: string) {
    try {
      await salvar(arquivos.filter((a) => a !== path));
      await removerFoto(path);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const nomeDe = (path: string) => path.split('/').pop()?.replace(/^[0-9a-f]{8}-/, '') ?? path;

  return (
    <Cartao className="max-w-2xl">
      {podeEditar && (
        <div className="mb-3 flex justify-end">
          <Botao variante="secundario" disabled={enviando} onClick={() => inputRef.current?.click()}>
            {enviando ? t('estados.salvando') : `+ ${t('pedido.adicionarArquivo')}`}
          </Botao>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => adicionar(e.target.files)} />
        </div>
      )}
      {erro && <p className="mb-2 text-xs font-semibold text-erro">{erro}</p>}
      {arquivos.length === 0 ? (
        <EstadoVazio mensagem={t('pedido.semArquivos')} />
      ) : (
        <ul className="divide-y divide-borda/70">
          {arquivos.map((path) => (
            <li key={path} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate font-semibold text-ink">📄 {nomeDe(path)}</span>
              <span className="flex shrink-0 gap-1">
                <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]" onClick={() => baixar(path)}>
                  ⤓ {t('pedido.baixar')}
                </Botao>
                {podeEditar && (
                  <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]" onClick={() => remover(path)}>
                    ✕
                  </Botao>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
