import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { enviarArquivo, useTenantId } from '@/lib/fotos';
import { analisarStl, dimensoesTexto, type StlAnalise } from '@/lib/stl';
import { Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui';
import { SelecaoCategoria } from '@/components/SelecaoCategoria';

interface MaterialOpt { id: string; nome: string; tipo: string }
interface ImpressoraOpt { id: string; nome: string }
type PassoImportacao = 'arquivo' | 'identificacao' | 'impressao';

function nomeDoArquivo(nome: string) {
  return nome.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function tags(texto: FormDataEntryValue | null) {
  return String(texto ?? '')
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function ImportarModeloStl({
  aberto,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}) {
  const { t } = useTranslation();
  const tenantId = useTenantId();
  const crud = useCrud('modelo_3d');
  const materiais = useLista<MaterialOpt>('material', { ordem: 'nome', desc: false });
  const impressoras = useLista<ImpressoraOpt>('impressora', { ordem: 'nome', desc: false });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<StlAnalise | null>(null);
  const [categoriaId, setCategoriaId] = useState('');
  const [passo, setPasso] = useState<PassoImportacao>('arquivo');
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(file: File | null) {
    setArquivo(file);
    setAnalise(null);
    setErro(null);
    if (!file) return;
    if (!/\.(stl)$/i.test(file.name)) {
      setErro('Escolha um arquivo .stl.');
      return;
    }
    setAnalisando(true);
    try {
      setAnalise(await analisarStl(file));
      setPasso('identificacao');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setAnalisando(false);
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenantId || !arquivo || !analise) return;
    const f = new FormData(e.currentTarget);
    const nome = String(f.get('nome') || nomeDoArquivo(arquivo.name)).trim();
    if (!nome) {
      setPasso('identificacao');
      setErro('Informe o nome do modelo.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const arquivoPath = await enviarArquivo(tenantId, 'modelos/originais', arquivo, 'arquivos-modelos');
      const valores = {
        nome,
        codigo_interno: (f.get('codigo_interno') as string) || null,
        categoria_id: categoriaId || null,
        tags: tags(f.get('tags')),
        tecnologia: f.get('tecnologia') as string,
        origem: f.get('origem') as string,
        descricao: (f.get('descricao') as string) || null,
        dimensoes: dimensoesTexto(analise),
        largura_mm: analise.larguraMm,
        profundidade_mm: analise.profundidadeMm,
        altura_mm: analise.alturaMm,
        volume_mm3: analise.volumeMm3,
        arquivo_original: arquivoPath,
        arquivo_original_nome: arquivo.name,
        arquivo_original_tamanho_bytes: arquivo.size,
        tempo_impressao_min: Number(f.get('tempo_impressao_min') || 0),
        peso_peca_g: Number(f.get('peso_peca_g') || 0),
        peso_suporte_g: Number(f.get('peso_suporte_g') || 0),
        peso_purga_g: Number(f.get('peso_purga_g') || 0),
        peso_desperdicio_g: Number(f.get('peso_desperdicio_g') || 0),
        probabilidade_falha: Number(f.get('probabilidade_falha') || 5) / 100,
        material_recomendado_id: (f.get('material_recomendado_id') as string) || null,
        impressora_recomendada_id: (f.get('impressora_recomendada_id') as string) || null,
      };
      const { id } = await crud.criar.mutateAsync(valores);
      setArquivo(null);
      setAnalise(null);
      setCategoriaId('');
      setPasso('arquivo');
      onSalvo(id);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const passos: { id: PassoImportacao; rotulo: string }[] = [
    { id: 'arquivo', rotulo: 'Arquivo' },
    { id: 'identificacao', rotulo: 'Identificacao' },
    { id: 'impressao', rotulo: 'Impressao' },
  ];
  const indicePasso = passos.findIndex((p) => p.id === passo);
  const podeAvancar = passo !== 'arquivo' || !!analise;
  const irPara = (delta: number) => setPasso(passos[Math.min(passos.length - 1, Math.max(0, indicePasso + delta))].id);

  return (
    <Modal aberto={aberto} titulo={t('modelo.importarStl')} onFechar={onFechar} largura="max-w-4xl">
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-borda bg-surface-2 p-1">
          {passos.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.id === 'arquivo' || analise) && setPasso(item.id)}
              disabled={item.id !== 'arquivo' && !analise}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-extrabold transition disabled:opacity-45 ${
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

        <section className={passo === 'arquivo' ? '' : 'hidden'}>
          <Campo rotulo="Arquivo STL" dica="O app calcula as dimensoes pelo bounding box do arquivo. STL nao informa unidade; assumimos milimetros.">
            <input
              type="file"
              accept=".stl,model/stl,application/sla"
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-dashed border-borda bg-white px-3 py-8 text-sm text-texto-2 file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </Campo>
          {analisando && <p className="text-xs font-semibold text-texto-2">{t('estados.carregando')}</p>}
          {analise && (
            <div className="mt-3 grid gap-2 rounded-xl border border-borda bg-surface-2/70 p-3 text-sm sm:grid-cols-4">
              <Resumo rotulo="Dimensoes" valor={dimensoesTexto(analise)} />
              <Resumo rotulo="Triangulos" valor={analise.triangulos.toLocaleString('pt-BR')} />
              <Resumo rotulo="Volume" valor={analise.volumeMm3 ? `${Math.round(analise.volumeMm3).toLocaleString('pt-BR')} mm3` : 'Nao calculado'} />
              <Resumo rotulo="Arquivo" valor={arquivo ? `${(arquivo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : '-'} />
            </div>
          )}
        </section>

        <section className={passo === 'identificacao' ? '' : 'hidden'}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.nome')} className="col-span-2 sm:col-span-3">
              <Entrada name="nome" defaultValue={arquivo ? nomeDoArquivo(arquivo.name) : ''} />
            </Campo>
            <Campo rotulo="Codigo"><Entrada name="codigo_interno" /></Campo>
            <Campo rotulo={t('modelo.tecnologia')}>
              <Selecao name="tecnologia" defaultValue="fdm">
                <option value="fdm">FDM</option>
                <option value="resina">Resina</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('categoria.rotulo')} className="col-span-2">
              <SelecaoCategoria escopo="modelo" valor={categoriaId} onChange={setCategoriaId} />
            </Campo>
            <Campo rotulo={t('modelo.origem')}>
              <Selecao name="origem" defaultValue="proprio">
                {['proprio', 'comprado', 'gratuito'].map((o) => (
                  <option key={o} value={o}>{t(`modelo.origemLabel.${o}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Tags" className="col-span-full" dica="Separe por virgula.">
              <Entrada name="tags" placeholder="porta-joia, ondulado, presente" />
            </Campo>
            <Campo rotulo={t('formModelo.descricao')} className="col-span-full">
              <textarea name="descricao" rows={3} className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm" />
            </Campo>
          </div>
        </section>

        <section className={passo === 'impressao' ? '' : 'hidden'}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo rotulo={t('modelo.impressoraRecomendada')} className="col-span-2">
              <Selecao name="impressora_recomendada_id" defaultValue="">
                <option value="">-</option>
                {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.materialRecomendado')} className="col-span-2">
              <Selecao name="material_recomendado_id" defaultValue="">
                <option value="">-</option>
                {(materiais.data ?? []).filter((m) => m.tipo === 'filamento' || m.tipo === 'resina')
                  .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo={t('modelo.tempoImpressao')}>
              <Entrada name="tempo_impressao_min" type="number" min="0" defaultValue={0} />
            </Campo>
            <Campo rotulo={t('modelo.pesoPeca')}>
              <Entrada name="peso_peca_g" type="number" min="0" step="any" defaultValue={0} />
            </Campo>
            <Campo rotulo="Suporte">
              <Entrada name="peso_suporte_g" type="number" min="0" step="any" defaultValue={0} />
            </Campo>
            <Campo rotulo="Purga">
              <Entrada name="peso_purga_g" type="number" min="0" step="any" defaultValue={0} />
            </Campo>
            <Campo rotulo={t('modelo.probFalha')}>
              <Entrada name="probabilidade_falha" type="number" min="0" max="100" step="0.5" defaultValue={5} />
            </Campo>
            <input type="hidden" name="peso_desperdicio_g" value="0" />
          </div>
        </section>

        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-between gap-2 border-t border-borda pt-3">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <div className="flex gap-2">
            <Botao type="button" variante="secundario" disabled={indicePasso === 0} onClick={() => irPara(-1)}>Voltar</Botao>
            {indicePasso < passos.length - 1 ? (
              <Botao type="button" disabled={!podeAvancar} onClick={() => irPara(1)}>Continuar</Botao>
            ) : (
              <Botao type="submit" disabled={!arquivo || !analise || salvando}>
                {salvando ? t('estados.salvando') : t('acoes.salvar')}
              </Botao>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-extrabold uppercase text-texto-2">{rotulo}</p>
      <p className="truncate font-bold text-ink" title={valor}>{valor}</p>
    </div>
  );
}
