/**
 * Tela 04 — Ficha do Modelo 3D em ABAS (estrutura v2):
 * Visão geral (foto + licença + 4 dados-chave + ação primária) ·
 * Impressão (config completa + pesos separados) ·
 * Instruções & Qualidade · Histórico.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { duracao } from '@/lib/formato';
import {
  Abas, Botao, CabecalhoPagina, Carregando, Cartao, Dinheiro, EstadoErro,
  EstadoVazio, Etiqueta,
} from '@/components/ui';
import { GaleriaFotos } from '@/components/GaleriaFotos';
import { EditorCores, type CorDisponivel } from '@/components/Cores';
import { AbaGcode } from './AbaGcode';
import { FormularioModelo, type ModeloEdit } from './FormularioModelo';
import { useAuth } from '@/auth/AuthProvider';

interface ModeloCompleto {
  id: string;
  nome: string;
  fotos: string[];
  cores: CorDisponivel[];
  codigo_interno: string | null;
  descricao: string | null;
  tecnologia: 'fdm' | 'resina';
  origem: string;
  autor: string | null;
  tipo_licenca: string | null;
  custo_aquisicao: number;
  direitos_uso: string | null;
  perfil_fatiamento: string | null;
  cor: string | null;
  bico: string | null;
  altura_camada_mm: number | null;
  preenchimento: number | null;
  paredes: number | null;
  suportes: boolean;
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
  probabilidade_falha: number;
  instrucoes: string[];
  checklist_qualidade: string[];
  versao: string;
  versao_notas: string | null;
  custo_real_medio: number;
  qtd_producoes: number;
  created_at: string;
  material: { nome: string } | null;
  impressora: { nome: string } | null;
}

type Aba = 'geral' | 'impressao' | 'gcode' | 'qualidade' | 'historico';

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-texto-2">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

export function PaginaModeloDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, flag, pode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('geral');
  const [editando, setEditando] = useState(false);

  async function salvarFotos(fotos: string[]) {
    const { error } = await supabase.from('modelo_3d').update({ fotos }).eq('id', id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['modelo_3d'] });
  }

  async function salvarCores(cores: CorDisponivel[]) {
    const { error } = await supabase.from('modelo_3d').update({ cores }).eq('id', id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['modelo_3d'] });
  }

  const modelo = useQuery({
    queryKey: ['modelo_3d', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modelo_3d')
        .select('*, material:material_recomendado_id (nome), impressora:impressora_recomendada_id (nome)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as ModeloCompleto;
    },
  });

  if (modelo.isLoading) return <Carregando />;
  if (modelo.isError || !modelo.data) return <EstadoErro onRetry={() => modelo.refetch()} />;

  const m = modelo.data;
  const un = m.tecnologia === 'resina' ? 'ml' : 'g';
  const pesoTotal = Number(m.peso_peca_g) + Number(m.peso_suporte_g) + Number(m.peso_purga_g) + Number(m.peso_desperdicio_g);

  return (
    <div>
      <CabecalhoPagina
        titulo={m.nome}
        subtitulo={[m.codigo_interno, t(`modelo.origemLabel.${m.origem}`)].filter(Boolean).join(' · ')}
        acoes={
          <div className="flex flex-wrap gap-2">
            {pode('modelos', 'editar') && (
              <Botao variante="secundario" onClick={() => setEditando(true)}>{t('acoes.editar')}</Botao>
            )}
            {pode('producao', 'editar') && (
              <Botao variante="secundario" onClick={() => setAba('gcode')}>
                🖨 {t('gcode.imprimir')}
              </Botao>
            )}
            <Botao variante="acento" onClick={() => navigate(`/calculadora?modelo=${m.id}`)}>
              {t('modelo.usarNoCalculo')}
            </Botao>
          </div>
        }
      />

      <Abas<Aba>
        abas={[
          { id: 'geral', rotulo: t('modelo.abaGeral') },
          { id: 'impressao', rotulo: t('modelo.abaImpressao') },
          { id: 'gcode', rotulo: t('gcode.aba') },
          { id: 'qualidade', rotulo: t('modelo.abaQualidade') },
          { id: 'historico', rotulo: t('modelo.abaHistorico') },
        ]}
        ativa={aba}
        onTrocar={setAba}
      />

      {aba === 'geral' && (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* galeria real (Storage com RLS por tenant) */}
          <div>
            <GaleriaFotos
              fotos={m.fotos ?? []}
              prefixo={`modelos/${m.id}`}
              podeEditar={pode('modelos', 'editar')}
              onChange={salvarFotos}
            />
          </div>
          <div className="space-y-4">
            {/* 4 dados-chave de impressão (v2) */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cartao><Dado rotulo={t('modelo.tempoCurto')}>{duracao(m.tempo_impressao_min)}</Dado></Cartao>
              <Cartao><Dado rotulo={t('modelo.pesoTotal')}>{pesoTotal.toLocaleString()}{un}</Dado></Cartao>
              <Cartao><Dado rotulo={t('modelo.tecnologia')}><Etiqueta cor="roxo">{m.tecnologia.toUpperCase()}</Etiqueta></Dado></Cartao>
              <Cartao><Dado rotulo={t('modelo.probFalhaCurta')}>{(Number(m.probabilidade_falha) * 100).toFixed(0)}%</Dado></Cartao>
            </dl>
            {/* cores disponíveis (decisão do domínio: um modelo imprime em N cores) */}
            <Cartao>
              <h2 className="mb-3 text-sm font-bold text-ink">{t('cores.titulo')}</h2>
              <EditorCores
                cores={m.cores ?? []}
                prefixo={`modelos/${m.id}/cores`}
                podeEditar={pode('modelos', 'editar')}
                onChange={salvarCores}
              />
            </Cartao>
            {/* licença comercial */}
            <Cartao>
              <h2 className="mb-3 text-sm font-bold text-ink">{t('modelo.licenca')}</h2>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Dado rotulo={t('modelo.origem')}>{t(`modelo.origemLabel.${m.origem}`)}</Dado>
                <Dado rotulo={t('modelo.autor')}>{m.autor ?? '—'}</Dado>
                <Dado rotulo={t('modelo.tipoLicenca')}>{m.tipo_licenca ?? '—'}</Dado>
                <Dado rotulo={t('modelo.custoAquisicao')}><Dinheiro centavos={flag('ver_custos') ? m.custo_aquisicao : null} /></Dado>
              </dl>
              {m.direitos_uso && <p className="mt-3 text-xs text-texto-2">{m.direitos_uso}</p>}
            </Cartao>
            {m.descricao && (
              <Cartao>
                <p className="text-sm text-texto-2">{m.descricao}</p>
              </Cartao>
            )}
          </div>
        </div>
      )}

      {aba === 'impressao' && (
        <div className="space-y-4">
          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('modelo.configImpressao')}</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dado rotulo={t('modelo.impressoraRecomendada')}>{m.impressora?.nome ?? '—'}</Dado>
              <Dado rotulo={t('modelo.materialRecomendado')}>{m.material?.nome ?? '—'}</Dado>
              <Dado rotulo={t('modelo.perfilFatiamento')}>{m.perfil_fatiamento ?? '—'}</Dado>
              <Dado rotulo="Cor">{m.cor ?? '—'}</Dado>
              <Dado rotulo={t('formModelo.bico')}>{m.bico ?? '—'}</Dado>
              <Dado rotulo={t('modelo.alturaCamada')}>{m.altura_camada_mm != null ? `${m.altura_camada_mm} mm` : '—'}</Dado>
              <Dado rotulo={t('modelo.preenchimento')}>{m.preenchimento != null ? `${Math.round(Number(m.preenchimento) * 100)}%` : '—'}</Dado>
              <Dado rotulo={t('modelo.paredes')}>{m.paredes ?? '—'}</Dado>
              <Dado rotulo={t('modelo.suportes')}>{m.suportes ? 'Sim' : 'Não'}</Dado>
            </dl>
          </Cartao>
          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('modelo.estimativasFatiador')}</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Dado rotulo={t('modelo.tempoCurto')}>{duracao(m.tempo_impressao_min)}</Dado>
              <Dado rotulo={t('modelo.pesoPeca')}>{Number(m.peso_peca_g).toLocaleString()}{un}</Dado>
              <Dado rotulo={t('modelo.pesoSuporte')}>{Number(m.peso_suporte_g).toLocaleString()}{un}</Dado>
              <Dado rotulo={t('modelo.pesoPurga')}>{Number(m.peso_purga_g).toLocaleString()}{un}</Dado>
              <Dado rotulo={t('modelo.pesoDesperdicio')}>{Number(m.peso_desperdicio_g).toLocaleString()}{un}</Dado>
            </dl>
            <p className="mt-3 text-xs text-texto-2">{t('modelo.pesosSeparadosDica')}</p>
          </Cartao>
        </div>
      )}

      {aba === 'gcode' && <AbaGcode modeloId={m.id} />}

      {aba === 'qualidade' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('modelo.instrucoes')}</h2>
            {(m.instrucoes ?? []).length === 0 ? (
              <EstadoVazio mensagem={t('modelo.semInstrucoes')} />
            ) : (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-texto">
                {m.instrucoes.map((i, idx) => <li key={idx}>{String(i)}</li>)}
              </ol>
            )}
          </Cartao>
          <Cartao>
            <h2 className="mb-3 text-sm font-bold text-ink">{t('modelo.checklist')}</h2>
            {(m.checklist_qualidade ?? []).length === 0 ? (
              <EstadoVazio mensagem={t('modelo.semChecklist')} />
            ) : (
              <ul className="space-y-1.5 text-sm text-texto">
                {m.checklist_qualidade.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-4 items-center justify-center rounded grad-acento text-[9px] font-bold text-white">✓</span>
                    {String(c)}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      )}

      {aba === 'historico' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Cartao><Dado rotulo={t('modelo.versaoAtual')}>{m.versao}{m.versao_notas ? ` — ${m.versao_notas}` : ''}</Dado></Cartao>
          <Cartao><Dado rotulo={t('modelo.producoes')}>{m.qtd_producoes}</Dado></Cartao>
          <Cartao>
            <Dado rotulo={t('modelo.custoRealMedio')}>
              <Dinheiro centavos={flag('ver_custos') ? (m.custo_real_medio || null) : null} />
            </Dado>
          </Cartao>
        </div>
      )}

      <FormularioModelo
        modelo={editando ? (m as ModeloEdit) : null}
        aberto={editando}
        onFechar={() => setEditando(false)}
        onSalvo={() => { setEditando(false); qc.invalidateQueries({ queryKey: ['modelo_3d'] }); }}
      />
    </div>
  );
}
