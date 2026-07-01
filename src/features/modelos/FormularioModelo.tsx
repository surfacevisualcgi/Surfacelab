import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { paraCentavos } from '@/lib/formato';
import { Botao, Campo, Entrada, EntradaDinheiro, Modal, Selecao } from '@/components/ui';
import { SelecaoCategoria } from '@/components/SelecaoCategoria';

type Passo = 'identificacao' | 'impressao' | 'qualidade' | 'licenca';

function formatarDimensoes(largura: number | null, profundidade: number | null, altura: number | null) {
  if (largura == null || profundidade == null || altura == null) return null;
  if (largura <= 0 || profundidade <= 0 || altura <= 0) return null;
  return `${largura} x ${profundidade} x ${altura} mm`;
}

function linhas(texto: FormDataEntryValue | null) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function tags(texto: FormDataEntryValue | null) {
  return String(texto ?? '')
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export interface ModeloEdit {
  id?: string;
  nome?: string;
  codigo_interno?: string | null;
  categoria_id?: string | null;
  tags?: string[];
  dimensoes?: string | null;
  largura_mm?: number | null;
  profundidade_mm?: number | null;
  altura_mm?: number | null;
  volume_mm3?: number | null;
  arquivo_original?: string | null;
  arquivo_original_nome?: string | null;
  arquivo_original_tamanho_bytes?: number | null;
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
  instrucoes?: string[];
  checklist_qualidade?: string[];
}

export function FormularioModelo({ modelo, aberto, onFechar, onSalvo }: {
  modelo: ModeloEdit | null;
  aberto: boolean;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}) {
  const { t } = useTranslation();
  const crud = useCrud('modelo_3d');
  const materiais = useLista<{ id: string; nome: string; tipo: string }>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<{ id: string; nome: string }>('impressora', { ordem: 'nome', desc: false });
  const [categoriaId, setCategoriaId] = useState(modelo?.categoria_id ?? '');
  const [tecnologia, setTecnologia] = useState<'fdm' | 'resina'>(modelo?.tecnologia ?? 'fdm');
  const [passo, setPasso] = useState<Passo>('identificacao');
  const [erro, setErro] = useState<string | null>(null);
  const chave = modelo?.id ?? 'novo';

  useEffect(() => {
    setCategoriaId(modelo?.categoria_id ?? '');
    setTecnologia(modelo?.tecnologia ?? 'fdm');
    setPasso('identificacao');
    setErro(null);
  }, [chave, modelo?.categoria_id, modelo?.tecnologia]);

  const un = tecnologia === 'resina' ? 'ml' : 'g';
  const dimensoesIniciais = useMemo(() => ({
    largura: modelo?.largura_mm ?? null,
    profundidade: modelo?.profundidade_mm ?? null,
    altura: modelo?.altura_mm ?? null,
  }), [modelo?.altura_mm, modelo?.largura_mm, modelo?.profundidade_mm]);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const largura = num('largura_mm');
    const profundidade = num('profundidade_mm');
    const altura = num('altura_mm');
    const dimensoesEstruturadas = formatarDimensoes(largura, profundidade, altura);
    const nome = String(f.get('nome') ?? '').trim();
    if (!nome) {
      setPasso('identificacao');
      setErro('Informe o nome do modelo.');
      return;
    }
    const valores = {
      nome,
      codigo_interno: (f.get('codigo_interno') as string) || null,
      categoria_id: categoriaId || null,
      tags: tags(f.get('tags')),
      largura_mm: largura,
      profundidade_mm: profundidade,
      altura_mm: altura,
      dimensoes: dimensoesEstruturadas || (f.get('dimensoes') as string) || null,
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
      instrucoes: linhas(f.get('instrucoes')),
      checklist_qualidade: linhas(f.get('checklist_qualidade')),
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

  const passos: { id: Passo; rotulo: string }[] = [
    { id: 'identificacao', rotulo: 'Identificacao' },
    { id: 'impressao', rotulo: 'Impressao' },
    { id: 'qualidade', rotulo: 'Qualidade' },
    { id: 'licenca', rotulo: 'Licenca' },
  ];
  const indicePasso = passos.findIndex((p) => p.id === passo);
  const irPara = (delta: number) => setPasso(passos[Math.min(passos.length - 1, Math.max(0, indicePasso + delta))].id);

  return (
    <Modal aberto={aberto} titulo={modelo.id ? t('formModelo.editar') : t('modelo.novo')} onFechar={onFechar} largura="max-w-4xl">
      <form onSubmit={salvar} className="space-y-4" key={chave}>
        <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-borda bg-surface-2 p-1">
          {passos.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPasso(item.id)}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-extrabold transition ${
                passo === item.id ? 'bg-white text-ink shadow-sm' : 'text-texto-2 hover:text-ink'
              }`}
            >
              <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                passo === item.id ? 'grad-acento text-white' : 'bg-white text-texto-2'
              }`}>
                {idx + 1}
              </span>
              <span className="truncate">{item.rotulo}</span>
            </button>
          ))}
        </div>

        <section className={passo === 'identificacao' ? '' : 'hidden'}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('formModelo.secaoIdentificacao')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.nome')} className="col-span-2 sm:col-span-3">
              <Entrada name="nome" defaultValue={modelo.nome ?? ''} />
            </Campo>
            <Campo rotulo="Codigo"><Entrada name="codigo_interno" defaultValue={modelo.codigo_interno ?? ''} /></Campo>
            <Campo rotulo={t('modelo.tecnologia')}>
              <Selecao name="tecnologia" value={tecnologia} onChange={(e) => setTecnologia(e.target.value as 'fdm' | 'resina')}>
                <option value="fdm">FDM</option><option value="resina">Resina</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('novoProduto.dimensoes')} className="col-span-2 sm:col-span-3" dica="Use milimetros. Se vier de STL, esses campos podem ser preenchidos automaticamente.">
              <div className="grid grid-cols-3 gap-2">
                <Entrada name="largura_mm" type="number" min="0" step="0.01" defaultValue={dimensoesIniciais.largura ?? ''} placeholder="Largura" />
                <Entrada name="profundidade_mm" type="number" min="0" step="0.01" defaultValue={dimensoesIniciais.profundidade ?? ''} placeholder="Profundidade" />
                <Entrada name="altura_mm" type="number" min="0" step="0.01" defaultValue={dimensoesIniciais.altura ?? ''} placeholder="Altura" />
              </div>
              <input type="hidden" name="dimensoes" defaultValue={modelo.dimensoes ?? ''} />
            </Campo>
            <Campo rotulo={t('categoria.rotulo')} className="col-span-2 sm:col-span-3">
              <SelecaoCategoria escopo="modelo" valor={categoriaId} onChange={setCategoriaId} />
            </Campo>
            <Campo rotulo="Tags" className="col-span-full" dica="Separe por virgula ou quebra de linha. Ex.: porta-joia, ondulado, presente.">
              <Entrada name="tags" defaultValue={(modelo.tags ?? []).join(', ')} placeholder="porta-joia, ondulado, presente" />
            </Campo>
            <Campo rotulo={t('formModelo.descricao')} className="col-span-full">
              <textarea name="descricao" rows={3} defaultValue={modelo.descricao ?? ''}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
          </div>
        </section>

        <section className={passo === 'impressao' ? '' : 'hidden'}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('modelo.estimativasFatiador')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo={t('modelo.tempoImpressao')}>
              <Entrada name="tempo_impressao_min" type="number" min="0" defaultValue={modelo.tempo_impressao_min ?? 60} />
            </Campo>
            <Campo rotulo={t('modelo.probFalha')}>
              <Entrada name="probabilidade_falha" type="number" min="0" max="100" step="0.5"
                defaultValue={modelo.probabilidade_falha != null ? Number(modelo.probabilidade_falha) * 100 : 5} />
            </Campo>
            <Campo rotulo={t('modelo.pesoPeca')}>
              <Entrada name="peso_peca_g" type="number" min="0" step="any" defaultValue={modelo.peso_peca_g ?? 0} />
            </Campo>
            <Campo rotulo={`Suporte (${un})`}>
              <Entrada name="peso_suporte_g" type="number" min="0" step="any" defaultValue={modelo.peso_suporte_g ?? 0} />
            </Campo>
            <Campo rotulo={`Purga (${un})`}>
              <Entrada name="peso_purga_g" type="number" min="0" step="any" defaultValue={modelo.peso_purga_g ?? 0} />
            </Campo>
            <Campo rotulo={`Desperdicio (${un})`}>
              <Entrada name="peso_desperdicio_g" type="number" min="0" step="any" defaultValue={modelo.peso_desperdicio_g ?? 0} />
            </Campo>
          </div>

          <h3 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('formModelo.secaoImpressao')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo rotulo={t('modelo.impressoraRecomendada')} className="col-span-2 sm:col-span-1">
              <Selecao name="impressora_recomendada_id" defaultValue={modelo.impressora_recomendada_id ?? ''}>
                <option value="">-</option>
                {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.materialRecomendado')} className="col-span-2 sm:col-span-1">
              <Selecao name="material_recomendado_id" defaultValue={modelo.material_recomendado_id ?? ''}>
                <option value="">-</option>
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
        </section>

        <section className={passo === 'qualidade' ? '' : 'hidden'}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">Instrucoes e qualidade</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo={t('modelo.instrucoes')} dica="Uma instrucao por linha.">
              <textarea name="instrucoes" rows={7} defaultValue={(modelo.instrucoes ?? []).join('\n')}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
            <Campo rotulo={t('modelo.checklist')} dica="Um item de revisao por linha.">
              <textarea name="checklist_qualidade" rows={7} defaultValue={(modelo.checklist_qualidade ?? []).join('\n')}
                className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
          </div>
        </section>

        <section className={passo === 'licenca' ? '' : 'hidden'}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">{t('formModelo.secaoLicenca')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.origem')}>
              <Selecao name="origem" defaultValue={modelo.origem ?? 'proprio'}>
                {['proprio', 'comprado', 'gratuito'].map((o) => (
                  <option key={o} value={o}>{t(`modelo.origemLabel.${o}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('formModelo.autor')}><Entrada name="autor" defaultValue={modelo.autor ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.tipoLicenca')}><Entrada name="tipo_licenca" placeholder="CC-BY, comercial" defaultValue={modelo.tipo_licenca ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.custoAquisicao')}><EntradaDinheiro name="custo_aquisicao" defaultCentavos={modelo.custo_aquisicao ?? 0} /></Campo>
            <Campo rotulo={t('formModelo.validade')}><Entrada name="licenca_validade" type="date" defaultValue={modelo.licenca_validade ?? ''} /></Campo>
            <Campo rotulo={t('formModelo.direitos')} className="col-span-2 sm:col-span-3">
              <Entrada name="direitos_uso" defaultValue={modelo.direitos_uso ?? ''} />
            </Campo>
          </div>
        </section>

        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-between gap-2 border-t border-borda pt-3">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <div className="flex gap-2">
            <Botao type="button" variante="secundario" disabled={indicePasso === 0} onClick={() => irPara(-1)}>Voltar</Botao>
            {indicePasso < passos.length - 1 ? (
              <Botao type="button" onClick={() => irPara(1)}>Continuar</Botao>
            ) : (
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
