/**
 * Telas 03/04 — Catálogo de modelos 3D (ficha técnica da peça impressa).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLista } from '@/lib/dados';
import { duracao } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Carregando, Entrada, EstadoErro, EstadoVazio, Etiqueta,
  Selecao,
} from '@/components/ui';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import { LinhaSwatches } from '@/components/Cores';
import { FormularioModelo, type ModeloEdit } from './FormularioModelo';
import { useAuth } from '@/auth/AuthProvider';

export interface Modelo3D {
  id: string;
  nome: string;
  fotos: string[];
  cores: { nome: string; hex: string; foto?: string }[];
  codigo_interno: string | null;
  categoria_id: string | null;
  versao: string;
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
  const categorias = useLista<{ id: string; nome: string; escopo: string }>('categoria', { ordem: 'nome', desc: false });
  const materiais = useLista<{ id: string; nome: string }>('material', { ordem: 'nome', desc: false });
  const [editando, setEditando] = useState<ModeloEdit | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroMaterial, setFiltroMaterial] = useState('');
  const [filtroTec, setFiltroTec] = useState('');

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const categoriasModelo = (categorias.data ?? []).filter((c) => c.escopo === 'modelo');
  const comFiltro = !!(busca || filtroCategoria || filtroMaterial || filtroTec);
  const filtrados = (lista.data ?? []).filter(
    (m) => (!busca || m.nome.toLowerCase().includes(busca.toLowerCase())
      || m.codigo_interno?.toLowerCase().includes(busca.toLowerCase()))
      && (!filtroCategoria || m.categoria_id === filtroCategoria)
      && (!filtroMaterial || m.material_recomendado_id === filtroMaterial)
      && (!filtroTec || m.tecnologia === filtroTec),
  );

  return (
    <div>
      <CabecalhoPagina
        titulo={t('modelo.titulo')}
        subtitulo={t('modelo.subtitulo')}
        acoes={pode('modelos', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('modelo.novo')}</Botao> : undefined}
      />
      {/* busca + filtros numa linha (categoria / material / tecnologia) */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Entrada placeholder={t('acoes.buscar')} value={busca}
          onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        {categoriasModelo.length > 0 && (
          <Selecao value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="!w-auto">
            <option value="">{t('modelo.todasCategorias')}</option>
            {categoriasModelo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        )}
        <Selecao value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} className="!w-auto">
          <option value="">{t('modelo.todosMateriais')}</option>
          {(materiais.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </Selecao>
        <Selecao value={filtroTec} onChange={(e) => setFiltroTec(e.target.value)} className="!w-auto">
          <option value="">{t('modelo.todasTecnologias')}</option>
          <option value="fdm">FDM</option>
          <option value="resina">Resina</option>
        </Selecao>
      </div>

      {filtrados.length === 0 ? (
        <EstadoVazio
          mensagem={comFiltro ? t('estados.semResultados') : undefined}
          acao={pode('modelos', 'criar') && !comFiltro ? <Botao onClick={() => setEditando({})}>+ {t('modelo.novo')}</Botao> : undefined}
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
                <Link to={`/modelos/${m.id}`}>
                  <FotoOuPlaceholder path={m.fotos?.[0]} alt={m.nome} className="aspect-[4/3] w-full object-cover" />
                </Link>
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start justify-between gap-1.5">
                    <Link to={`/modelos/${m.id}`} className="truncate text-sm font-semibold text-ink group-hover:text-brand-azul">
                      {m.nome}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1">
                      {m.versao && <Etiqueta>{m.versao}</Etiqueta>}
                      <Etiqueta cor="roxo">{m.tecnologia.toUpperCase()}</Etiqueta>
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-texto-2">
                    {duracao(m.tempo_impressao_min)} · {pesoTotal.toLocaleString()}{un} · {(Number(m.probabilidade_falha) * 100).toFixed(0)}% falha
                  </p>
                  {(m.cores ?? []).length > 0 && (
                    <div className="mt-1.5"><LinhaSwatches cores={m.cores} /></div>
                  )}
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

      <FormularioModelo
        modelo={editando}
        aberto={!!editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => setEditando(null)}
      />
    </div>
  );
}
