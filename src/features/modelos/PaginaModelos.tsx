/**
 * Telas 03/04 — Catálogo de modelos 3D (ficha técnica da peça impressa).
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { duracao } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Entrada, EstadoErro, EstadoVazio,
  Etiqueta, Modal, Selecao,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import type { Material } from '../cadastros/PaginaCadastros';

export interface Modelo3D {
  id: string;
  nome: string;
  codigo_interno: string | null;
  tecnologia: 'fdm' | 'resina';
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
  probabilidade_falha: number;
  material_recomendado_id: string | null;
  impressora_recomendada_id: string | null;
  origem: string;
  qtd_producoes: number;
}

export function PaginaModelos() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const lista = useLista<Modelo3D>('modelo_3d', { ordem: 'nome', desc: false });
  const materiais = useLista<Material>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<{ id: string; nome: string }>('impressora', { ordem: 'nome', desc: false });
  const crud = useCrud('modelo_3d');
  const [editando, setEditando] = useState<Partial<Modelo3D> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      codigo_interno: (f.get('codigo_interno') as string) || null,
      tecnologia: f.get('tecnologia') as string,
      tempo_impressao_min: Number(f.get('tempo_impressao_min')),
      peso_peca_g: Number(f.get('peso_peca_g')),
      peso_suporte_g: Number(f.get('peso_suporte_g')),
      peso_purga_g: Number(f.get('peso_purga_g')),
      peso_desperdicio_g: Number(f.get('peso_desperdicio_g')),
      probabilidade_falha: Number(f.get('probabilidade_falha')) / 100,
      material_recomendado_id: (f.get('material_recomendado_id') as string) || null,
      impressora_recomendada_id: (f.get('impressora_recomendada_id') as string) || null,
      origem: f.get('origem') as string,
    };
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const filtrados = (lista.data ?? []).filter(
    (m) => !busca || m.nome.toLowerCase().includes(busca.toLowerCase())
      || m.codigo_interno?.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div>
      <CabecalhoPagina
        titulo={t('modelo.titulo')}
        subtitulo={t('modelo.subtitulo')}
        acoes={pode('modelos', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('modelo.novo')}</Botao> : undefined}
      />
      <div className="mb-4">
        <Entrada placeholder={t('acoes.buscar')} value={busca}
          onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
      </div>

      {filtrados.length === 0 ? (
        <EstadoVazio
          mensagem={busca ? t('estados.semResultados') : undefined}
          acao={pode('modelos', 'criar') && !busca ? <Botao onClick={() => setEditando({})}>+ {t('modelo.novo')}</Botao> : undefined}
        />
      ) : (
        /* grade de cards (v2): foto, nome, metadados técnicos discretos */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((m) => {
            const pesoTotal =
              Number(m.peso_peca_g) + Number(m.peso_suporte_g) + Number(m.peso_purga_g) + Number(m.peso_desperdicio_g);
            const un = m.tecnologia === 'resina' ? 'ml' : 'g';
            return (
              <div key={m.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-borda bg-white transition-shadow hover:shadow-md">
                <Link to={`/modelos/${m.id}`} className="flex aspect-[4/3] items-center justify-center bg-surface-2">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="url(#gm)" strokeWidth="1.2" className="opacity-50">
                    <defs>
                      <linearGradient id="gm" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#29c2f2" /><stop offset="1" stopColor="#8a3fd1" />
                      </linearGradient>
                    </defs>
                    <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z" />
                  </svg>
                </Link>
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start justify-between gap-1.5">
                    <Link to={`/modelos/${m.id}`} className="truncate text-sm font-semibold text-ink group-hover:text-brand-azul">
                      {m.nome}
                    </Link>
                    <Etiqueta cor="roxo">{m.tecnologia.toUpperCase()}</Etiqueta>
                  </div>
                  <p className="mt-1 text-[11px] text-texto-2">
                    {duracao(m.tempo_impressao_min)} · {pesoTotal.toLocaleString()}{un} · {(Number(m.probabilidade_falha) * 100).toFixed(0)}% falha
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-1 pt-2">
                    <Botao variante="fantasma" className="!px-1.5 !py-1 !text-[11px]"
                      onClick={() => navigate(`/calculadora?modelo=${m.id}`)}>
                      {t('modelo.usarNoCalculo')}
                    </Botao>
                    {pode('modelos', 'editar') && (
                      <Botao variante="fantasma" className="!px-1.5 !py-1 !text-[11px]" onClick={() => setEditando(m)}>
                        {t('acoes.editar')}
                      </Botao>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('modelo.novo')} onFechar={() => setEditando(null)} largura="max-w-xl">
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.nome')} className="col-span-2 sm:col-span-3">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo="Código">
              <Entrada name="codigo_interno" defaultValue={editando.codigo_interno ?? ''} />
            </Campo>
            <Campo rotulo={t('modelo.tecnologia')}>
              <Selecao name="tecnologia" defaultValue={editando.tecnologia ?? 'fdm'}>
                <option value="fdm">FDM</option>
                <option value="resina">Resina</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.origem')}>
              <Selecao name="origem" defaultValue={editando.origem ?? 'proprio'}>
                {['proprio', 'comprado', 'gratuito'].map((o) => (
                  <option key={o} value={o}>{t(`modelo.origemLabel.${o}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.tempoImpressao')}>
              <Entrada name="tempo_impressao_min" type="number" min="0" required defaultValue={editando.tempo_impressao_min ?? 60} />
            </Campo>
            <Campo rotulo={t('modelo.probFalha')}>
              <Entrada name="probabilidade_falha" type="number" min="0" max="100" step="0.5" defaultValue={editando.probabilidade_falha != null ? Number(editando.probabilidade_falha) * 100 : 5} />
            </Campo>
            <Campo rotulo={t('modelo.pesoPeca')}>
              <Entrada name="peso_peca_g" type="number" min="0" step="any" required defaultValue={editando.peso_peca_g ?? 0} />
            </Campo>
            <Campo rotulo={t('modelo.pesoSuporte')}>
              <Entrada name="peso_suporte_g" type="number" min="0" step="any" defaultValue={editando.peso_suporte_g ?? 0} />
            </Campo>
            <Campo rotulo={t('modelo.pesoPurga')}>
              <Entrada name="peso_purga_g" type="number" min="0" step="any" defaultValue={editando.peso_purga_g ?? 0} />
            </Campo>
            <Campo rotulo={t('modelo.pesoDesperdicio')}>
              <Entrada name="peso_desperdicio_g" type="number" min="0" step="any" defaultValue={editando.peso_desperdicio_g ?? 0} />
            </Campo>
            <Campo rotulo={t('modelo.materialRecomendado')} className="col-span-2">
              <Selecao name="material_recomendado_id" defaultValue={editando.material_recomendado_id ?? ''}>
                <option value="">—</option>
                {(materiais.data ?? [])
                  .filter((m) => m.tipo === 'filamento' || m.tipo === 'resina')
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.impressoraRecomendada')} className="col-span-2">
              <Selecao name="impressora_recomendada_id" defaultValue={editando.impressora_recomendada_id ?? ''}>
                <option value="">—</option>
                {(impressoras.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.nome}</option>
                ))}
              </Selecao>
            </Campo>
            {erro && <p className="col-span-full text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-full flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
