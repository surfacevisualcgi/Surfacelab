/**
 * Formulário completo do Modelo 3D — seções Identificação / Licença /
 * Configuração de impressão. Cobre TODOS os campos do modelo (antes só
 * editáveis em parte). Usado tanto para CRIAR (catálogo) quanto para EDITAR
 * (ficha). Persiste direto; a galeria de fotos e o G-code ficam na ficha.
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, paraCentavos } from '@/lib/formato';
import { Acordeao, Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui';
import { SelecaoCategoria } from '@/components/SelecaoCategoria';

export interface ModeloEdit {
  id?: string;
  nome?: string;
  codigo_interno?: string | null;
  categoria_id?: string | null;
  descricao?: string | null;
  tecnologia?: 'fdm' | 'resina';
  origem?: string;
  autor?: string | null;
  tipo_licenca?: string | null;
  custo_aquisicao?: number;
  licenca_validade?: string | null;
  direitos_uso?: string | null;
  tempo_impressao_min?: number;
  peso_peca_g?: number;
  peso_suporte_g?: number;
  peso_purga_g?: number;
  peso_desperdicio_g?: number;
  probabilidade_falha?: number;
  material_recomendado_id?: string | null;
  impressora_recomendada_id?: string | null;
  perfil_fatiamento?: string | null;
  cor?: string | null;
  bico?: string | null;
  altura_camada_mm?: number | null;
  preenchimento?: number | null;
  paredes?: number | null;
  suportes?: boolean;
}

export function FormularioModelo({ modelo, aberto, onFechar, onSalvo }: {
  modelo: ModeloEdit | null; // null = fechado; {} = novo; {id,...} = editar
  aberto: boolean;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}) {
  const { t } = useTranslation();
  const crud = useCrud('modelo_3d');
  const materiais = useLista<{ id: string; nome: string; tipo: string }>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<{ id: string; nome: string }>('impressora', { ordem: 'nome', desc: false });
  const [categoriaId, setCategoriaId] = useState(modelo?.categoria_id ?? '');
  const [erro, setErro] = useState<string | null>(null);

  // re-sincroniza a categoria quando abre para um modelo diferente
  const chave = modelo?.id ?? 'novo';

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const valores = {
      nome: f.get('nome') as string,
      codigo_interno: (f.get('codigo_interno') as string) || null,
      categoria_id: categoriaId || null,
      descricao: (f.get('descricao') as string) || null,
      tecnologia: f.get('tecnologia') as string,
      origem: f.get('origem') as string,
      autor: (f.get('autor') as string) || null,
      tipo_licenca: (f.get('tipo_licenca') as string) || null,
      custo_aquisicao: paraCentavos((f.get('custo_aquisicao') as string) || '0'),
      licenca_validade: (f.get('licenca_validade') as string) || null,
      direitos_uso: (f.get('direitos_uso') as string) || null,
      tempo_impressao_min: Number(f.get('tempo_impressao_min') || 0),
      peso_peca_g: Number(f.get('peso_peca_g') || 0),
      peso_suporte_g: Number(f.get('peso_suporte_g') || 0),
      peso_purga_g: Number(f.get('peso_purga_g') || 0),
      peso_desperdicio_g: Number(f.get('peso_desperdicio_g') || 0),
      probabilidade_falha: Number(f.get('probabilidade_falha') || 0) / 100,
      material_recomendado_id: (f.get('material_recomendado_id') as string) || null,
      impressora_recomendada_id: (f.get('impressora_recomendada_id') as string) || null,
      perfil_fatiamento: (f.get('perfil_fatiamento') as string) || null,
      cor: (f.get('cor') as string) || null,
      bico: (f.get('bico') as string) || null,
      altura_camada_mm: num('altura_camada_mm'),
      preenchimento: f.get('preenchimento') ? Number(f.get('preenchimento')) / 100 : null,
      paredes: num('paredes'),
      suportes: f.get('suportes') === 'on',
    };
    try {
      if (modelo?.id) {
        await crud.atualizar.mutateAsync({ id: modelo.id, ...valores });
        onSalvo(modelo.id);
      } else {
        const { id } = await crud.criar.mutateAsync(valores);
        onSalvo(id);
      }
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (!modelo) return null;
  const un = (modelo.tecnologia ?? 'fdm') === 'resina' ? 'ml' : 'g';

  return (
    <Modal aberto={aberto} titulo={modelo.id ? t('formModelo.editar') : t('modelo.novo')} onFechar={onFechar} largura="max-w-2xl">
      <form onSubmit={salvar} className="space-y-4" key={chave}>
        {/* Identificação */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('formModelo.secaoIdentificacao')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.nome')} className="col-span-2 sm:col-span-3">
              <Entrada name="nome" required defaultValue={modelo.nome ?? ''} />
            </Campo>
            <Campo rotulo="Código"><Entrada name="codigo_interno" defaultValue={modelo.codigo_interno ?? ''} /></Campo>
            <Campo rotulo={t('modelo.tecnologia')}>
              <Selecao name="tecnologia" defaultValue={modelo.tecnologia ?? 'fdm'}>
                <option value="fdm">FDM</option><option value="resina">Resina</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('categoria.rotulo')} className="col-span-2 sm:col-span-3">
              <SelecaoCategoria escopo="modelo" valor={categoriaId} onChange={setCategoriaId} />
            </Campo>
            <Campo rotulo={t('formModelo.descricao')} className="col-span-full">
              <textarea name="descricao" rows={2} defaultValue={modelo.descricao ?? ''}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
          </div>
        </section>

        {/* Estimativas do fatiador (essencial p/ o cálculo) */}
        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('modelo.estimativasFatiador')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo={t('modelo.tempoImpressao')}>
              <Entrada name="tempo_impressao_min" type="number" min="0" required defaultValue={modelo.tempo_impressao_min ?? 60} />
            </Campo>
            <Campo rotulo={t('modelo.probFalha')}>
              <Entrada name="probabilidade_falha" type="number" min="0" max="100" step="0.5"
                defaultValue={modelo.probabilidade_falha != null ? Number(modelo.probabilidade_falha) * 100 : 5} />
            </Campo>
            <Campo rotulo={`${t('modelo.pesoPeca')}`}>
              <Entrada name="peso_peca_g" type="number" min="0" step="any" required defaultValue={modelo.peso_peca_g ?? 0} />
            </Campo>
            <Campo rotulo={`Suporte (${un})`}>
              <Entrada name="peso_suporte_g" type="number" min="0" step="any" defaultValue={modelo.peso_suporte_g ?? 0} />
            </Campo>
            <Campo rotulo={`Purga (${un})`}>
              <Entrada name="peso_purga_g" type="number" min="0" step="any" defaultValue={modelo.peso_purga_g ?? 0} />
            </Campo>
            <Campo rotulo={`Desperdício (${un})`}>
              <Entrada name="peso_desperdicio_g" type="number" min="0" step="any" defaultValue={modelo.peso_desperdicio_g ?? 0} />
            </Campo>
          </div>
        </section>

        {/* Configuração de impressão (recolhível) */}
        <Acordeao titulo={t('formModelo.secaoImpressao')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo={t('modelo.impressoraRecomendada')} className="col-span-2 sm:col-span-1">
              <Selecao name="impressora_recomendada_id" defaultValue={modelo.impressora_recomendada_id ?? ''}>
                <option value="">—</option>
                {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.materialRecomendado')} className="col-span-2 sm:col-span-1">
              <Selecao name="material_recomendado_id" defaultValue={modelo.material_recomendado_id ?? ''}>
                <option value="">—</option>
                {(materiais.data ?? []).filter((m) => m.tipo === 'filamento' || m.tipo === 'resina')
                  .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('formModelo.perfilFatiamento')}><Entrada name="perfil_fatiamento" defaultValue={modelo.perfil_fatiamento ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.cor')}><Entrada name="cor" defaultValue={modelo.cor ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.bico')}><Entrada name="bico" placeholder="0.4 mm" defaultValue={modelo.bico ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.alturaCamada')}><Entrada name="altura_camada_mm" type="number" step="0.01" min="0" defaultValue={modelo.altura_camada_mm ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.preenchimento')}><Entrada name="preenchimento" type="number" min="0" max="100" defaultValue={modelo.preenchimento != null ? Math.round(Number(modelo.preenchimento) * 100) : ''} /></Campo>
            <Campo rotulo={t('formModelo.paredes')}><Entrada name="paredes" type="number" min="0" defaultValue={modelo.paredes ?? ''} /></Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-texto">
              <input type="checkbox" name="suportes" defaultChecked={!!modelo.suportes} className="accent-brand-azul" />
              {t('formModelo.suportes')}
            </label>
          </div>
        </Acordeao>

        {/* Licença comercial (recolhível) */}
        <Acordeao titulo={t('formModelo.secaoLicenca')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.origem')}>
              <Selecao name="origem" defaultValue={modelo.origem ?? 'proprio'}>
                {['proprio', 'comprado', 'gratuito'].map((o) => (
                  <option key={o} value={o}>{t(`modelo.origemLabel.${o}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('formModelo.autor')}><Entrada name="autor" defaultValue={modelo.autor ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.tipoLicenca')}><Entrada name="tipo_licenca" placeholder="CC-BY, comercial…" defaultValue={modelo.tipo_licenca ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.custoAquisicao')}><Entrada name="custo_aquisicao" inputMode="decimal" defaultValue={deCentavos(modelo.custo_aquisicao ?? 0)} /></Campo>
            <Campo rotulo={t('formModelo.validade')}><Entrada name="licenca_validade" type="date" defaultValue={modelo.licenca_validade ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.direitos')} className="col-span-2 sm:col-span-3">
              <Entrada name="direitos_uso" defaultValue={modelo.direitos_uso ?? ''} />
            </Campo>
          </div>
        </Acordeao>

        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{t('acoes.salvar')}</Botao>
        </div>
      </form>
    </Modal>
  );
}
