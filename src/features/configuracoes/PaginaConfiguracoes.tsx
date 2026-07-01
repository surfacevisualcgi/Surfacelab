/**
 * Tela 17 — Configurações da EMPRESA (tenant): operacional (decisões §7),
 * fiscal, equipe (papéis + convites por link) e plano/limites.
 */
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { paraCentavos } from '@/lib/formato';
import { enviarFoto, removerFoto, useFotoUrl } from '@/lib/fotos';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Entrada, EntradaDinheiro, EstadoVazio,
  Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { AbaAgente } from './AbaAgente';
import type { Papel } from '@/auth/permissoes';
import { SETUP_PRESETS, type RegiaoSetup } from '../cadastros/setup-presets';
import {
  carregarConfigOpenAI,
  mascararChave,
  MODELO_IMAGEM_PADRAO,
  MODELO_TEXTO_PADRAO,
  removerConfigOpenAI,
  salvarConfigOpenAI,
} from '@/lib/creatorLabOpenAI';

type Aba = 'operacional' | 'equipe' | 'openai' | 'agente' | 'plano';

const SIDEBAR_BG_PADRAO = '#0d0d0d';
const SIDEBAR_TEXTO_PADRAO = '#ffffff';

function corHexValida(cor: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(cor);
}

function luminancia(cor: string) {
  const hex = cor.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contraste(corA: string, corB: string) {
  if (!corHexValida(corA) || !corHexValida(corB)) return 0;
  const [maisClara, maisEscura] = [luminancia(corA), luminancia(corB)].sort((a, b) => b - a);
  return (maisClara + 0.05) / (maisEscura + 0.05);
}

export function PaginaConfiguracoes() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const [aba, setAba] = useState<Aba>('operacional');
  if (!pode('configuracoes')) return <EstadoVazio />;

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'operacional', rotulo: t('config.operacional') },
    { id: 'equipe', rotulo: t('config.equipe') },
    { id: 'openai', rotulo: 'OpenAI' },
    { id: 'agente', rotulo: t('agente.aba') },
    { id: 'plano', rotulo: t('config.plano') },
  ];
  return (
    <div>
      <CabecalhoPagina titulo={t('config.titulo')} />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-borda">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              aba === a.id ? 'border-brand-roxo text-ink' : 'border-transparent text-texto-2 hover:text-ink'}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'operacional' && <AbaOperacional />}
      {aba === 'equipe' && <AbaEquipe />}
      {aba === 'openai' && <AbaOpenAI />}
      {aba === 'agente' && <AbaAgente />}
      {aba === 'plano' && <AbaPlano />}
    </div>
  );
}

function AbaOpenAI() {
  const [apiKey, setApiKey] = useState('');
  const [textModel, setTextModel] = useState(MODELO_TEXTO_PADRAO);
  const [imageModel, setImageModel] = useState(MODELO_IMAGEM_PADRAO);
  const [mascara, setMascara] = useState('Nao configurada');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const cfg = carregarConfigOpenAI();
    if (cfg) {
      setTextModel(cfg.textModel);
      setImageModel(cfg.imageModel);
      setMascara(mascararChave(cfg.apiKey));
    }
  }, []);

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const atual = carregarConfigOpenAI();
    const chave = apiKey.trim() || atual?.apiKey || '';
    if (!chave) {
      setMsg('Cole sua chave da OpenAI para salvar.');
      return;
    }
    salvarConfigOpenAI({ apiKey: chave, textModel, imageModel });
    setApiKey('');
    setMascara(mascararChave(chave));
    setMsg('Chave salva neste navegador. O Creator Lab ja pode usar a OpenAI.');
    setTimeout(() => setMsg(null), 3000);
  }

  function remover() {
    removerConfigOpenAI();
    setApiKey('');
    setTextModel(MODELO_TEXTO_PADRAO);
    setImageModel(MODELO_IMAGEM_PADRAO);
    setMascara('Nao configurada');
    setMsg('Chave removida deste navegador.');
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <Cartao className="max-w-2xl">
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-ink">OpenAI para o Creator Lab</h2>
          <p className="mt-1 text-xs text-texto-2">
            Salva a chave somente neste navegador. Ela nao e enviada para o banco de dados nem gravada no codigo.
          </p>
        </div>
        <div className="rounded-lg border border-borda bg-surface-2 px-3 py-2 text-xs">
          <span className="font-bold text-ink">Status: </span>
          <span className="text-texto-2">{mascara}</span>
        </div>
        <Campo rotulo="API key">
          <Entrada
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole sua chave da OpenAI aqui"
            autoComplete="off"
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Modelo de texto">
            <Entrada value={textModel} onChange={(e) => setTextModel(e.target.value)} />
          </Campo>
          <Campo rotulo="Modelo de imagem">
            <Entrada value={imageModel} onChange={(e) => setImageModel(e.target.value)} />
          </Campo>
        </div>
        {msg && <p className="text-xs font-semibold text-ok">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <Botao type="submit">Salvar chave</Botao>
          <Botao type="button" variante="secundario" onClick={remover}>Remover chave</Botao>
        </div>
      </form>
    </Cartao>
  );
}

function AbaOperacional() {
  const { t } = useTranslation();
  const { ativa, recarregar, idioma } = useAuth();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msgSetup, setMsgSetup] = useState<string | null>(null);
  const [erroSetup, setErroSetup] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [salvandoLogo, setSalvandoLogo] = useState(false);
  const [sidebarBg, setSidebarBg] = useState(SIDEBAR_BG_PADRAO);
  const [sidebarTexto, setSidebarTexto] = useState(SIDEBAR_TEXTO_PADRAO);
  const logoUrl = useFotoUrl(ativa?.tenant.logo_path);
  const regiaoSetup: RegiaoSetup = idioma === 'pt-BR' ? 'br' : 'us';
  const contagensSetup = useQuery({
    queryKey: ['config-setup-contagens', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const tabelas = ['fornecedor', 'canal_venda', 'custo_fixo', 'tarefa_mao_obra', 'perfil_energia'] as const;
      const resultados = await Promise.all(
        tabelas.map((tb) =>
          supabase.from(tb).select('id', { count: 'exact', head: true }).is('deleted_at', null),
        ),
      );
      return Object.fromEntries(tabelas.map((tb, i) => [tb, resultados[i].count ?? 0]));
    },
  });
  const cSetup = contagensSetup.data ?? {};
  const setupIncompleto = !contagensSetup.isLoading && (
    Number(cSetup.fornecedor ?? 0) === 0 ||
    Number(cSetup.canal_venda ?? 0) === 0 ||
    Number(cSetup.custo_fixo ?? 0) === 0 ||
    Number(cSetup.tarefa_mao_obra ?? 0) === 0 ||
    Number(cSetup.perfil_energia ?? 0) === 0
  );
  const taxaContraste = contraste(sidebarBg, sidebarTexto);
  const contrasteBom = taxaContraste >= 4.5;
  const contrasteMedio = taxaContraste >= 3;

  useEffect(() => {
    setSidebarBg(ativa?.tenant.sidebar_bg_color ?? SIDEBAR_BG_PADRAO);
    setSidebarTexto(ativa?.tenant.sidebar_text_color ?? SIDEBAR_TEXTO_PADRAO);
  }, [ativa?.tenant.sidebar_bg_color, ativa?.tenant.sidebar_text_color]);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('tenant').update({
      nome: f.get('nome') as string,
      momento_baixa_estoque: f.get('momento_baixa_estoque') as string,
      criterio_rateio_custo_fixo: f.get('criterio_rateio_custo_fixo') as string,
      faturamento_mensal_esperado: paraCentavos(f.get('faturamento_mensal_esperado') as string),
      sidebar_bg_color: sidebarBg === SIDEBAR_BG_PADRAO ? null : sidebarBg,
      sidebar_text_color: sidebarTexto === SIDEBAR_TEXTO_PADRAO ? null : sidebarTexto,
    }).eq('id', ativa?.tenant_id);
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      setMsg(t('estados.salvo'));
      await recarregar();
      await qc.invalidateQueries({ queryKey: ['config-setup-contagens'] });
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function alterarLogo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!arquivo || !ativa) return;
    if (!arquivo.type.startsWith('image/')) {
      setErro(t('config.logoFormatoErro'));
      return;
    }
    setSalvandoLogo(true);
    setErro(null);
    try {
      const path = await enviarFoto(ativa.tenant_id, 'logos', arquivo);
      const anterior = ativa.tenant.logo_path;
      const { error } = await supabase.from('tenant').update({ logo_path: path }).eq('id', ativa.tenant_id);
      if (error) throw error;
      if (anterior) await removerFoto(anterior);
      await recarregar();
      setMsg(t('config.logoSalva'));
      setTimeout(() => setMsg(null), 2500);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvandoLogo(false);
    }
  }

  async function removerLogoEmpresa() {
    if (!ativa?.tenant.logo_path) return;
    setSalvandoLogo(true);
    setErro(null);
    try {
      const anterior = ativa.tenant.logo_path;
      const { error } = await supabase.from('tenant').update({ logo_path: null }).eq('id', ativa.tenant_id);
      if (error) throw error;
      await removerFoto(anterior);
      await recarregar();
      setMsg(t('config.logoRemovida'));
      setTimeout(() => setMsg(null), 2500);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvandoLogo(false);
    }
  }

  async function resetarTemaMenu() {
    if (!ativa) return;
    setSidebarBg(SIDEBAR_BG_PADRAO);
    setSidebarTexto(SIDEBAR_TEXTO_PADRAO);
    const { error } = await supabase
      .from('tenant')
      .update({ sidebar_bg_color: null, sidebar_text_color: null })
      .eq('id', ativa.tenant_id);
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      setMsg(t('config.temaMenuResetado'));
      await recarregar();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function inserirFaltantes(tabela: string, linhas: Record<string, unknown>[]) {
    if (!ativa || linhas.length === 0) return 0;
    const { data, error } = await supabase
      .from(tabela)
      .select('nome')
      .is('deleted_at', null);
    if (error) throw error;
    const existentes = new Set((data ?? []).map((l) => String((l as { nome: string }).nome).toLowerCase()));
    const novas = linhas
      .filter((l) => !existentes.has(String(l.nome).toLowerCase()))
      .map((l) => ({ ...l, tenant_id: ativa.tenant_id, ...(tabela === 'canal_venda' ? { custo_fixo_pedido: Number(l.custo_fixo_pedido ?? 0) } : {}) }));
    if (novas.length === 0) return 0;
    const { error: insertError } = await supabase.from(tabela).insert(novas);
    if (insertError) throw insertError;
    return novas.length;
  }

  async function aplicarSetup() {
    const presets = SETUP_PRESETS[regiaoSetup];
    setAplicando(true);
    setErroSetup(null);
    setMsgSetup(null);
    try {
      const total =
        await inserirFaltantes('fornecedor', presets.fornecedores) +
        await inserirFaltantes('canal_venda', presets.canais) +
        await inserirFaltantes('custo_fixo', presets.custosFixos) +
        await inserirFaltantes('tarefa_mao_obra', presets.tarefas) +
        await inserirFaltantes('perfil_energia', presets.energia);
      await qc.invalidateQueries();
      setMsgSetup(t('cadastros.setupCriado', { n: total }));
    } catch (err) {
      setErroSetup(mensagemErro(err));
    } finally {
      setAplicando(false);
    }
  }

  if (!ativa) return <Carregando />;
  return (
    <div className="max-w-xl space-y-4">
    <Cartao>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-ink">{t('config.logoEmpresa')}</h2>
          <p className="mt-1 text-xs text-texto-2">
            {t('config.logoEmpresaDica')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-36 items-center justify-center rounded-xl border border-borda bg-white p-2">
            {logoUrl ? (
              <img src={logoUrl} alt={t('config.logoEmpresa')} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-center text-xs font-bold text-texto-2">{t('config.semLogo')}</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-borda bg-white px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-2">
              {salvandoLogo ? t('config.enviandoLogo') : t('config.enviarLogo')}
              <input type="file" accept="image/*" className="hidden" disabled={salvandoLogo} onChange={alterarLogo} />
            </label>
            {ativa.tenant.logo_path && (
              <Botao type="button" variante="fantasma" className="!py-1.5 !text-xs" disabled={salvandoLogo} onClick={removerLogoEmpresa}>
                {t('config.removerLogo')}
              </Botao>
            )}
          </div>
        </div>
      </div>
    </Cartao>
    <Cartao>
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo={t('config.nomeEmpresa')}>
          <Entrada name="nome" required defaultValue={ativa.tenant.nome} />
        </Campo>
        <div className="rounded-xl border border-borda bg-surface-2/60 p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{t('config.temaMenu')}</h2>
              <p className="mt-1 text-xs text-texto-2">{t('config.temaMenuDica')}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
            <Campo rotulo={t('config.corMenuLateral')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  name="sidebar_bg_color"
                  value={sidebarBg}
                  onChange={(e) => setSidebarBg(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-borda bg-white p-1"
                />
                <Entrada value={sidebarBg} onChange={(e) => corHexValida(e.target.value) && setSidebarBg(e.target.value)} />
              </div>
            </Campo>
            <Campo rotulo={t('config.corTextoMenu')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  name="sidebar_text_color"
                  value={sidebarTexto}
                  onChange={(e) => setSidebarTexto(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-borda bg-white p-1"
                />
                <Entrada value={sidebarTexto} onChange={(e) => corHexValida(e.target.value) && setSidebarTexto(e.target.value)} />
              </div>
            </Campo>
            <div
              className="flex min-h-20 flex-col justify-between rounded-xl p-3"
              style={{ backgroundColor: sidebarBg, color: sidebarTexto }}
            >
              <span className="text-[11px] font-extrabold uppercase tracking-wide">{t('config.previewMenu')}</span>
              <span className="rounded-lg bg-white/15 px-2 py-1 text-xs font-bold">{t('nav.financeiro')}</span>
            </div>
          </div>
          <p className={`mt-2 text-xs font-semibold ${contrasteBom ? 'text-ok' : contrasteMedio ? 'text-alerta' : 'text-erro'}`}>
            {contrasteBom
              ? t('config.contrasteBom', { valor: taxaContraste.toFixed(1) })
              : contrasteMedio
                ? t('config.contrasteMedio', { valor: taxaContraste.toFixed(1) })
                : t('config.contrasteBaixo', { valor: taxaContraste.toFixed(1) })}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda bg-white px-3 py-2">
            <p className="text-xs text-texto-2">{t('config.temaMenuDica')}</p>
            <Botao type="button" variante="secundario" className="!py-1.5 !text-xs" onClick={resetarTemaMenu}>
              {t('config.restaurarTemaPadrao')}
            </Botao>
          </div>
        </div>
        <Campo rotulo={t('config.momentoBaixa')}>
          <Selecao name="momento_baixa_estoque" defaultValue={ativa.tenant.momento_baixa_estoque}>
            <option value="fim">{t('config.baixaFim')}</option>
            <option value="inicio">{t('config.baixaInicio')}</option>
          </Selecao>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('config.criterioRateio')}>
            <Selecao name="criterio_rateio_custo_fixo" defaultValue={ativa.tenant.criterio_rateio_custo_fixo}>
              {['faturamento', 'hora_maquina', 'hora_trabalho', 'pedido'].map((c) => (
                <option key={c} value={c}>{t(`config.rateioLabel.${c}`)}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo={t('config.faturamentoEsperado')}>
            <EntradaDinheiro name="faturamento_mensal_esperado"
              defaultCentavos={Number(ativa.tenant.faturamento_mensal_esperado)} />
          </Campo>
        </div>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        {msg && <p className="text-xs font-semibold text-ok">{msg}</p>}
        <Botao type="submit">{t('acoes.salvar')}</Botao>
      </form>
    </Cartao>
    {setupIncompleto && (
    <Cartao>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{t('config.setupRegistros')}</h2>
          <p className="mt-1 text-xs text-texto-2">{t('config.setupRegistrosDica')}</p>
        </div>
        <Botao variante="secundario" disabled={aplicando} onClick={aplicarSetup}>
          {aplicando ? t('estados.salvando') : t(`cadastros.setupAplicar.${regiaoSetup}`)}
        </Botao>
      </div>
      {erroSetup && <p className="mt-2 text-xs font-semibold text-erro">{erroSetup}</p>}
      {msgSetup && <p className="mt-2 text-xs font-semibold text-ok">{msgSetup}</p>}
    </Cartao>
    )}
    </div>
  );
}

export function AbaFiscal() {
  const { t } = useTranslation();
  const lista = useLista<{ id: string; nome: string; tipo: string; aliquota_efetiva: number; padrao: boolean }>('perfil_fiscal', { ordem: 'nome', desc: false });
  const crud = useCrud('perfil_fiscal');
  const [editando, setEditando] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      tipo: f.get('tipo') as string,
      aliquota_efetiva: Number(f.get('aliquota_efetiva')) / 100,
      padrao: f.get('padrao') === 'on',
    };
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id as string, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  return (
    <div>
      <p className="mb-3 rounded-lg bg-alerta/5 border border-alerta/30 px-3 py-2 text-xs text-alerta">
        ⚠ {t('config.avisoFiscal')}
      </p>
      <div className="mb-3 flex justify-end">
        <Botao onClick={() => setEditando({})}>+ {t('acoes.novo')}</Botao>
      </div>
      {(lista.data ?? []).length === 0 ? <EstadoVazio /> : (
        <Tabela cabecalhos={['Nome', 'Tipo', t('config.aliquotaEfetiva'), '', '']}>
          {lista.data!.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{p.nome}</td>
              <td className="px-3 py-2.5 text-texto-2">{p.tipo}</td>
              <td className="px-3 py-2.5 tabular-nums">{(Number(p.aliquota_efetiva) * 100).toFixed(2)}%</td>
              <td className="px-3 py-2.5">{p.padrao && <Etiqueta cor="azul">padrão</Etiqueta>}</td>
              <td className="px-3 py-2.5 text-right">
                <Botao variante="fantasma" onClick={() => setEditando(p as unknown as Record<string, unknown>)}>{t('acoes.editar')}</Botao>
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      <Modal aberto={!!editando} titulo={t('config.fiscal')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="space-y-3">
            <Campo rotulo="Nome">
              <Entrada name="nome" required defaultValue={(editando.nome as string) ?? ''} placeholder="Ex.: Simples Nacional Anexo II" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tipo">
                <Selecao name="tipo" defaultValue={(editando.tipo as string) ?? 'produto'}>
                  <option value="produto">Produto</option>
                  <option value="servico">Serviço</option>
                  <option value="misto">Misto</option>
                </Selecao>
              </Campo>
              <Campo rotulo={t('config.aliquotaEfetiva')}>
                <Entrada name="aliquota_efetiva" type="number" step="0.01" min="0" max="60"
                  defaultValue={editando.aliquota_efetiva != null ? Number(editando.aliquota_efetiva) * 100 : 6} />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="padrao" defaultChecked={!!editando.padrao} className="accent-brand-azul" />
              Usar como padrão na calculadora
            </label>
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function AbaEquipe() {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const qc = useQueryClient();
  const [convidando, setConvidando] = useState(false);
  const [linkConvite, setLinkConvite] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const equipe = useQuery({
    queryKey: ['equipe', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership')
        .select('id, papel, ativo, usuario:usuario_id (id, nome_exibicao, email)')
        .eq('tenant_id', ativa!.tenant_id);
      if (error) throw error;
      return data as unknown as { id: string; papel: Papel; ativo: boolean; usuario: { nome_exibicao: string | null; email: string } }[];
    },
  });

  const convites = useQuery({
    queryKey: ['convite', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('convite').select('*').eq('status', 'pendente');
      if (error) throw error;
      return data as { id: string; email: string; papel: Papel; token: string }[];
    },
  });

  async function convidar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data, error } = await supabase
      .from('convite')
      .insert({
        tenant_id: ativa?.tenant_id,
        email: (f.get('email') as string).toLowerCase(),
        papel: f.get('papel') as string,
      })
      .select('token')
      .single();
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      setConvidando(false);
      setLinkConvite(`${window.location.origin}/convite/${data.token}`);
      qc.invalidateQueries({ queryKey: ['convite'] });
    }
  }

  const papeis: Papel[] = ['administrador', 'comercial', 'producao', 'leitura'];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Botao onClick={() => setConvidando(true)}>+ {t('config.convidar')}</Botao>
      </div>
      {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
      {linkConvite && (
        <div className="rounded-xl border border-ok/40 bg-ok/5 p-3 text-xs">
          <p className="mb-1 font-bold text-ok">{t('config.conviteEnviado')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1">{linkConvite}</code>
            <Botao variante="secundario" onClick={() => navigator.clipboard.writeText(linkConvite)}>
              {t('config.copiarLink')}
            </Botao>
          </div>
        </div>
      )}

      {equipe.isLoading ? <Carregando /> : (
        <Tabela cabecalhos={['Pessoa', 'E-mail', t('config.papel')]}>
          {(equipe.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2.5 font-semibold text-ink">{m.usuario?.nome_exibicao ?? '—'}</td>
              <td className="px-3 py-2.5 text-texto-2">{m.usuario?.email}</td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={m.papel === 'dono' ? 'roxo' : 'cinza'}>{t(`config.papelLabel.${m.papel}`)}</Etiqueta>
              </td>
            </tr>
          ))}
          {(convites.data ?? []).map((c) => (
            <tr key={c.id} className="opacity-60">
              <td className="px-3 py-2.5 italic text-texto-2">({t('empresa.convitePendente')})</td>
              <td className="px-3 py-2.5 text-texto-2">{c.email}</td>
              <td className="px-3 py-2.5"><Etiqueta cor="amarelo">{t(`config.papelLabel.${c.papel}`)}</Etiqueta></td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={convidando} titulo={t('config.convidar')} onFechar={() => setConvidando(false)}>
        <form onSubmit={convidar} className="space-y-3">
          <Campo rotulo={t('auth.email')}>
            <Entrada name="email" type="email" required />
          </Campo>
          <Campo rotulo={t('config.papel')}>
            <Selecao name="papel" defaultValue="comercial">
              {papeis.map((p) => <option key={p} value={p}>{t(`config.papelLabel.${p}`)}</option>)}
            </Selecao>
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setConvidando(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.criar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AbaPlano() {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const limites = useQuery({
    queryKey: ['plano_limite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plano_limite').select('*');
      if (error) throw error;
      return data as { plano: string; recurso: string; limite: number | null }[];
    },
  });

  if (!ativa || limites.isLoading) return <Carregando />;
  const plano = ativa.tenant.plano;
  const doPlano = (limites.data ?? []).filter((l) => l.plano === plano);

  return (
    <Cartao className="max-w-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('config.planoAtual')}</p>
          <p className="text-lg font-extrabold grad-texto">{t(`config.planoLabel.${plano}`)}</p>
          <p className="text-xs text-texto-2">{ativa.tenant.status_assinatura}</p>
        </div>
        <Botao variante="acento" disabled title="Stripe — estrutura pronta, cobrança em modo teste (pendência)">
          {t('plano.fazerUpgrade')}
        </Botao>
      </div>
      <dl className="space-y-1.5 text-sm">
        {doPlano.map((l) => (
          <div key={l.recurso} className="flex justify-between">
            <dt className="text-texto-2">{l.recurso}</dt>
            <dd className="font-semibold">{l.limite ?? '∞'}</dd>
          </div>
        ))}
      </dl>
    </Cartao>
  );
}
