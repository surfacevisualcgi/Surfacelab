/**
 * Aba "Arquivos G-code" da ficha do Modelo 3D: envia G-code fatiado (bucket
 * arquivos-modelos, RLS por tenant), lista com metadados e dispara a impressão
 * (enfileira na fila do agente da impressora escolhida).
 */
import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { enviarArquivo, urlAssinada, useTenantId } from '@/lib/fotos';
import { duracao } from '@/lib/formato';
import {
  Botao, Campo, Carregando, EstadoVazio, Etiqueta, Modal, Selecao, TabelaDados,
} from '@/components/ui';
import { Swatch } from '@/components/Cores';
import { useAuth } from '@/auth/AuthProvider';
import type { ArquivoGcode } from '@/lib/impressao';

interface ImpressoraOpt { id: string; nome: string; agente_id: string | null }

export function AbaGcode({ modeloId }: { modeloId: string }) {
  const { t } = useTranslation();
  const { pode, ativa } = useAuth();
  const qc = useQueryClient();
  const tenantId = useTenantId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [metaArquivo, setMetaArquivo] = useState<{ path: string; nome: string; tamanho: number } | null>(null);
  const [imprimindo, setImprimindo] = useState<ArquivoGcode | null>(null);

  const impressoras = useLista<ImpressoraOpt>('impressora', {
    ordem: 'nome', desc: false, selecao: 'id, nome, agente_id',
  });

  const gcodes = useQuery({
    queryKey: ['arquivo_gcode', modeloId],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arquivo_gcode')
        .select('*')
        .eq('modelo_id', modeloId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ArquivoGcode[];
    },
  });

  // 1. envia o arquivo ao Storage; 2. abre o modal de metadados para salvar a linha
  async function aoEscolherArquivo(lista: FileList | null) {
    if (!lista?.[0] || !tenantId) return;
    const arq = lista[0];
    if (arq.size > 80 * 1024 * 1024) { setErro(t('gcode.grande')); return; }
    setEnviando(true);
    setErro(null);
    try {
      const path = await enviarArquivo(tenantId, `gcode/${modeloId}`, arq, 'arquivos-modelos');
      setMetaArquivo({ path, nome: arq.name, tamanho: arq.size });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function salvarGcode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!metaArquivo) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('arquivo_gcode').insert({
      tenant_id: tenantId,
      modelo_id: modeloId,
      nome: (f.get('nome') as string) || metaArquivo.nome,
      path: metaArquivo.path,
      impressora_id: (f.get('impressora_id') as string) || null,
      cor: (f.get('cor') as string) || null,
      peso_g: f.get('peso_g') ? Number(f.get('peso_g')) : null,
      tempo_min: f.get('tempo_min') ? Number(f.get('tempo_min')) : null,
      tamanho_bytes: metaArquivo.tamanho,
    });
    if (error) setErro(mensagemErro(error));
    else {
      setMetaArquivo(null);
      setErro(null);
      setMsg(t('gcode.enviado'));
      qc.invalidateQueries({ queryKey: ['arquivo_gcode', modeloId] });
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function baixar(g: ArquivoGcode) {
    try { window.open(await urlAssinada(g.path, 'arquivos-modelos'), '_blank'); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  async function enfileirar(g: ArquivoGcode, impressoraId: string) {
    setErro(null);
    const { error } = await supabase.rpc('enfileirar_impressao', {
      p_gcode: g.id, p_impressora: impressoraId,
    });
    if (error) setErro(mensagemErro(error));
    else {
      setImprimindo(null);
      setMsg(t('impressao.enfileirado'));
      qc.invalidateQueries({ queryKey: ['trabalho_impressao'] });
      qc.invalidateQueries({ queryKey: ['impressora'] });
      setTimeout(() => setMsg(null), 2500);
    }
  }

  if (gcodes.isLoading) return <Carregando />;

  const semImpressora = (impressoras.data ?? []).length === 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-texto-2">{t('gcode.subtitulo')}</p>
        {pode('modelos', 'editar') && (
          <Botao disabled={enviando || semImpressora} onClick={() => inputRef.current?.click()}>
            {enviando ? t('estados.salvando') : `+ ${t('gcode.adicionar')}`}
          </Botao>
        )}
      </div>
      {semImpressora && <p className="mb-3 text-xs text-alerta">⚠ {t('gcode.semImpressora')}</p>}
      {msg && <p className="mb-2 text-xs font-semibold text-ok">{msg}</p>}
      {erro && <p className="mb-2 text-xs font-semibold text-erro">{erro}</p>}
      <input ref={inputRef} type="file" accept=".gcode,.gco,.g,.bgcode,text/plain" className="hidden"
        onChange={(e) => aoEscolherArquivo(e.target.files)} />

      {(gcodes.data ?? []).length === 0 ? (
        <EstadoVazio mensagem={t('gcode.nenhum')} />
      ) : (
        <TabelaDados<ArquivoGcode>
          colunas={[
            {
              titulo: t('gcode.titulo'),
              principal: true,
              render: (g) => (
                <span className="flex items-center gap-2 font-semibold text-ink">
                  {g.cor && <Swatch hex={g.cor} nome={g.cor} />}
                  📄 {g.nome}
                </span>
              ),
            },
            {
              titulo: t('gcode.impressora'),
              render: (g) => (impressoras.data ?? []).find((i) => i.id === g.impressora_id)?.nome ?? '—',
            },
            { titulo: t('gcode.peso'), numerica: true, render: (g) => g.peso_g != null ? `${g.peso_g} g` : '—' },
            { titulo: t('gcode.tempo'), numerica: true, render: (g) => g.tempo_min != null ? duracao(g.tempo_min) : '—' },
          ]}
          linhas={gcodes.data!}
          chave={(g) => g.id}
          acoes={(g) => (
            <span className="flex justify-end gap-1 whitespace-nowrap">
              <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]" onClick={() => baixar(g)}>
                ⤓
              </Botao>
              {pode('producao', 'editar') && (
                <Botao variante="acento" className="!px-2.5 !py-1 !text-[11px]"
                  onClick={() => {
                    // se o G-code já tem impressora, imprime direto; senão pergunta
                    if (g.impressora_id) enfileirar(g, g.impressora_id);
                    else setImprimindo(g);
                  }}>
                  🖨 {t('gcode.imprimir')}
                </Botao>
              )}
            </span>
          )}
        />
      )}

      {/* metadados do G-code recém-enviado */}
      <Modal aberto={!!metaArquivo} titulo={t('gcode.adicionar')} onFechar={() => setMetaArquivo(null)}>
        {metaArquivo && (
          <form onSubmit={salvarGcode} className="space-y-3">
            <Campo rotulo="Nome">
              <input name="nome" defaultValue={metaArquivo.nome}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo={t('gcode.impressora')}>
                <Selecao name="impressora_id" defaultValue="">
                  <option value="">—</option>
                  {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo={t('gcode.peso')}>
                <input name="peso_g" type="number" step="any" min="0"
                  className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
              </Campo>
              <Campo rotulo={t('gcode.tempo')}>
                <input name="tempo_min" type="number" min="0"
                  className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
              </Campo>
            </div>
            <Campo rotulo={`${t('gcode.cor')} (hex opcional)`}>
              <input name="cor" placeholder="#1e3a8a"
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setMetaArquivo(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>

      {/* escolher impressora quando o G-code não tem uma fixa */}
      <Modal aberto={!!imprimindo} titulo={t('gcode.escolherImpressora')} onFechar={() => setImprimindo(null)}>
        {imprimindo && (
          <div className="space-y-2">
            {(impressoras.data ?? []).map((i) => (
              <button key={i.id} onClick={() => enfileirar(imprimindo, i.id)}
                className="flex w-full items-center justify-between rounded-lg border border-borda px-3 py-2.5 text-left text-sm font-semibold text-ink hover:border-brand-azul hover:bg-brand-azul/5">
                {i.nome}
                {i.agente_id
                  ? <Etiqueta cor="verde">{t('agente.online')}</Etiqueta>
                  : <Etiqueta cor="amarelo">{t('impressao.semAgente')}</Etiqueta>}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
