/**
 * Tela 17 — Cadastros de apoio em abas: impressoras, materiais, canais,
 * custos fixos, mão de obra, energia. (Estrutura do protótipo, pele Surface.)
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, moeda, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro, Entrada,
  EstadoErro, EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

type Aba = 'impressoras' | 'materiais' | 'canais' | 'custosFixos' | 'maoDeObra' | 'energia';

/**
 * Estrutura v2 (tela 17): central de cadastros como GRADE DE CARTÕES de
 * atalho agrupados por seção, com anel de progresso de configuração e
 * pendências no painel lateral. Clicar num cartão abre a seção.
 */
export function PaginaCadastros() {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const navigate = useNavigate();
  const [secao, setSecao] = useState<Aba | null>(null);

  const contagens = useQuery({
    queryKey: ['cadastros-contagens', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const tabelas = ['material', 'impressora', 'canal_venda', 'custo_fixo', 'tarefa_mao_obra', 'perfil_energia'] as const;
      const resultados = await Promise.all(
        tabelas.map((tb) =>
          supabase.from(tb).select('id', { count: 'exact', head: true }).is('deleted_at', null),
        ),
      );
      return Object.fromEntries(tabelas.map((tb, i) => [tb, resultados[i].count ?? 0]));
    },
  });

  const c = contagens.data ?? {};
  const cartoes: { id: Aba; tabela: string; rotulo: string; descricao: string; grupo: string; icone: string }[] = [
    { id: 'materiais', tabela: 'material', rotulo: t('cadastros.materiais'), descricao: t('cadastros.descMateriais'), grupo: 'operacao', icone: '🧵' },
    { id: 'impressoras', tabela: 'impressora', rotulo: t('cadastros.impressoras'), descricao: t('cadastros.descImpressoras'), grupo: 'operacao', icone: '🖨' },
    { id: 'energia', tabela: 'perfil_energia', rotulo: t('cadastros.energia'), descricao: t('cadastros.descEnergia'), grupo: 'operacao', icone: '⚡' },
    { id: 'canais', tabela: 'canal_venda', rotulo: t('cadastros.canais'), descricao: t('cadastros.descCanais'), grupo: 'comercial', icone: '🛒' },
    { id: 'custosFixos', tabela: 'custo_fixo', rotulo: t('cadastros.custosFixos'), descricao: t('cadastros.descCustosFixos'), grupo: 'comercial', icone: '📋' },
    { id: 'maoDeObra', tabela: 'tarefa_mao_obra', rotulo: t('cadastros.maoDeObra'), descricao: t('cadastros.descMaoDeObra'), grupo: 'comercial', icone: '👤' },
  ];
  const pendentes = cartoes.filter((card) => (c[card.tabela] ?? 0) === 0);
  const progresso = cartoes.length > 0 ? ((cartoes.length - pendentes.length) / cartoes.length) * 100 : 0;

  if (secao) {
    const card = cartoes.find((x) => x.id === secao)!;
    return (
      <div>
        <button onClick={() => setSecao(null)}
          className="mb-2 text-xs font-bold text-brand-azul hover:underline">
          ← {t('cadastros.titulo')}
        </button>
        <CabecalhoPagina titulo={card.rotulo} subtitulo={card.descricao} />
        {secao === 'materiais' && <AbaMateriais />}
        {secao === 'impressoras' && <AbaImpressoras />}
        {secao === 'canais' && <AbaCanais />}
        {secao === 'custosFixos' && <AbaCustosFixos />}
        {secao === 'maoDeObra' && <AbaMaoDeObra />}
        {secao === 'energia' && <AbaEnergia />}
      </div>
    );
  }

  const grupos: { id: string; rotulo: string }[] = [
    { id: 'operacao', rotulo: t('cadastros.grupoOperacao') },
    { id: 'comercial', rotulo: t('cadastros.grupoComercial') },
  ];

  return (
    <div>
      <CabecalhoPagina titulo={t('cadastros.titulo')} subtitulo={t('cadastros.subtitulo')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.id}>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-2">
                {g.rotulo}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cartoes.filter((card) => card.grupo === g.id).map((card) => (
                  <button key={card.id}
                    onClick={() => card.id === 'impressoras' ? navigate('/impressoras') : setSecao(card.id)}
                    className="flex items-start gap-3 rounded-xl border border-borda bg-white p-3.5 text-left transition-colors hover:border-brand-azul hover:bg-brand-azul/5">
                    <span className="text-xl" aria-hidden>{card.icone}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-bold text-ink">
                        {card.rotulo}
                        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-texto-2">
                          {c[card.tabela] ?? '…'}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-texto-2">{card.descricao}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* painel lateral: anel de progresso + pendências (v2) */}
        <Cartao className="h-fit lg:sticky lg:top-16">
          <h2 className="mb-3 text-sm font-bold text-ink">{t('cadastros.progressoTitulo')}</h2>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 80 80" className="size-20 shrink-0" role="img" aria-label={`${Math.round(progresso)}%`}>
              <defs>
                <linearGradient id="prog-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--color-brand-azul)" />
                  <stop offset="1" stopColor="var(--color-brand-magenta)" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--color-surface-2)" strokeWidth="9" />
              <circle cx="40" cy="40" r="32" fill="none" stroke="url(#prog-g)" strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 32 * (progresso / 100)} ${2 * Math.PI * 32}`}
                transform="rotate(-90 40 40)" />
              <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--color-ink)">
                {Math.round(progresso)}%
              </text>
            </svg>
            <p className="text-xs text-texto-2">{t('cadastros.progressoDica')}</p>
          </div>
          {pendentes.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-borda pt-3">
              {pendentes.map((card) => (
                <li key={card.id}>
                  <button onClick={() => setSecao(card.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-surface-2">
                    {card.rotulo}
                    <span className="text-alerta">{t('cadastros.pendente')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Materiais
interface Material {
  id: string; nome: string; tipo: string; marca: string | null; cor: string | null;
  unidade_compra: string; unidade_consumo: string; fator_conversao: number;
  preco_compra: number; frete: number; custo_unitario: number;
  saldo: number; reservado: number; minimo: number; custo_medio: number;
  valor_estoque: number;
}

export function AbaMateriais() {
  const { t } = useTranslation();
  const { pode, formato } = useAuth();
  const lista = useLista<Material>('material', { ordem: 'nome', desc: false });
  const crud = useCrud('material');
  const [editando, setEditando] = useState<Partial<Material> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // estado "vivo" para o card de custo unitário calculado (modal v2)
  const [vivo, setVivo] = useState({ preco: '', frete: '', fator: 1000 });

  function abrir(m: Partial<Material>) {
    setEditando(m);
    setVivo({
      preco: deCentavos(m.preco_compra ?? 0),
      frete: deCentavos(m.frete ?? 0),
      fator: m.fator_conversao ?? 1000,
    });
  }
  const custoVivo = vivo.fator > 0
    ? Math.round(((paraCentavos(vivo.preco) + paraCentavos(vivo.frete)) / vivo.fator) * 100) / 100
    : 0;

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      tipo: f.get('tipo') as string,
      marca: (f.get('marca') as string) || null,
      cor: (f.get('cor') as string) || null,
      unidade_compra: f.get('unidade_compra') as string,
      unidade_consumo: f.get('unidade_consumo') as string,
      fator_conversao: Number(f.get('fator_conversao')),
      preco_compra: paraCentavos(f.get('preco_compra') as string),
      frete: paraCentavos(f.get('frete') as string),
      minimo: Number(f.get('minimo') || 0),
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

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {pode('estoque', 'criar') && (
          <Botao onClick={() => abrir({})}>+ {t('acoes.novo')}</Botao>
        )}
      </div>
      {lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('estoque', 'criar') ? <Botao onClick={() => abrir({})}>+ {t('acoes.novo')}</Botao> : undefined} />
      ) : (
        <Tabela cabecalhos={[
          t('cadastros.material.nome'), t('cadastros.material.tipo'),
          t('cadastros.material.custoUnitario'), t('estoque.saldo'), '',
        ]}>
          {lista.data!.map((m) => (
            <tr key={m.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">
                {m.nome}
                {m.marca && <span className="ml-1 text-xs font-normal text-texto-2">{m.marca}</span>}
              </td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={m.tipo === 'filamento' || m.tipo === 'resina' ? 'azul' : 'cinza'}>
                  {t(`cadastros.material.tipoLabel.${m.tipo}`)}
                </Etiqueta>
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                <Dinheiro centavos={Math.round(m.custo_unitario)} />/{m.unidade_consumo}
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {Number(m.saldo).toLocaleString()} {m.unidade_consumo}
                {Number(m.saldo) - Number(m.reservado) <= Number(m.minimo) && Number(m.minimo) > 0 && (
                  <Etiqueta cor="vermelho">{t('estoque.estoqueBaixo')}</Etiqueta>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                {pode('estoque', 'editar') && (
                  <Botao variante="fantasma" onClick={() => abrir(m)}>{t('acoes.editar')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.novo')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            {/* abas por tipo no topo do modal (modal 03 do v2) */}
            <div className="col-span-2 flex flex-wrap gap-1.5" role="tablist">
              {(['filamento', 'resina', 'componente', 'consumivel', 'embalagem'] as const).map((tp) => (
                <button key={tp} type="button" role="tab"
                  aria-selected={(editando.tipo ?? 'filamento') === tp}
                  onClick={() => setEditando({ ...editando, tipo: tp })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    (editando.tipo ?? 'filamento') === tp
                      ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}>
                  {t(`cadastros.material.tipoLabel.${tp}`)}
                </button>
              ))}
              <input type="hidden" name="tipo" value={editando.tipo ?? 'filamento'} />
            </div>
            <Campo rotulo={t('cadastros.material.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo="Marca">
              <Entrada name="marca" defaultValue={editando.marca ?? ''} />
            </Campo>
            <Campo rotulo="Cor">
              <Entrada name="cor" defaultValue={editando.cor ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.material.unidadeCompra')}>
              <Entrada name="unidade_compra" required defaultValue={editando.unidade_compra ?? 'kg'} />
            </Campo>
            <Campo rotulo={t('cadastros.material.unidadeConsumo')}>
              <Entrada name="unidade_consumo" required defaultValue={editando.unidade_consumo ?? 'g'} />
            </Campo>
            <Campo rotulo={t('cadastros.material.fatorConversao')} dica="Ex.: 1 kg = 1000 g → 1000">
              <Entrada name="fator_conversao" type="number" step="any" min="0.0001" required
                defaultValue={editando.fator_conversao ?? 1000}
                onChange={(e) => setVivo({ ...vivo, fator: Number(e.target.value) || 0 })} />
            </Campo>
            <Campo rotulo={t('estoque.minimo')}>
              <Entrada name="minimo" type="number" step="any" min="0" defaultValue={editando.minimo ?? 0} />
            </Campo>
            <Campo rotulo={t('cadastros.material.precoCompra')}>
              <Entrada name="preco_compra" inputMode="decimal" defaultValue={deCentavos(editando.preco_compra ?? 0)}
                onChange={(e) => setVivo({ ...vivo, preco: e.target.value })} />
            </Campo>
            <Campo rotulo={t('cadastros.material.frete')}>
              <Entrada name="frete" inputMode="decimal" defaultValue={deCentavos(editando.frete ?? 0)}
                onChange={(e) => setVivo({ ...vivo, frete: e.target.value })} />
            </Campo>
            {/* custo unitário calculado AO VIVO (v2 — acento da marca, não teal) */}
            <div className="col-span-2 rounded-xl border border-brand-roxo/30 bg-brand-roxo/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-roxo">
                {t('cadastros.material.custoUnitario')}
              </p>
              <p className="text-lg font-extrabold tabular-nums grad-texto">
                {moeda(custoVivo, formato)}
                <span className="ml-1 text-xs font-semibold text-texto-2">
                  / {editando.unidade_consumo ?? 'unid. de consumo'}
                </span>
              </p>
              <p className="text-[11px] text-texto-2">(preço + frete) ÷ fator de conversão</p>
            </div>
            {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-2 flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// -------------------------------------------------------------- Impressoras
interface Impressora {
  id: string; nome: string; tecnologia: string; fabricante: string | null;
  valor_aquisicao: number; vida_util_horas: number; consumo_w: number;
  manutencao_hora: number; perfil_energia_id: string | null; status: string;
  agente_id: string | null;
}

function custoHoraImpressora(i: Impressora): number {
  const amortizacao = i.vida_util_horas > 0 ? i.valor_aquisicao / i.vida_util_horas : 0;
  return Math.round(amortizacao + Number(i.manutencao_hora));
}

export function AbaImpressoras() {
  const { t } = useTranslation();
  const { pode, formato } = useAuth();
  const lista = useLista<Impressora>('impressora', { ordem: 'nome', desc: false });
  const agentes = useLista<{ id: string; nome: string }>('agente_impressao', { ordem: 'nome', desc: false });
  const crud = useCrud('impressora');
  const [editando, setEditando] = useState<Partial<Impressora> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // estado vivo para o card "custo por hora calculado" (modal 04 do v2)
  const [vivoImp, setVivoImp] = useState({ valor: '', vida: 5000, manutencao: '' });

  function abrirImp(i: Partial<Impressora>) {
    setEditando(i);
    setVivoImp({
      valor: deCentavos(i.valor_aquisicao ?? 0),
      vida: i.vida_util_horas ?? 5000,
      manutencao: deCentavos(i.manutencao_hora ?? 0),
    });
  }
  const custoHoraVivo =
    (vivoImp.vida > 0 ? paraCentavos(vivoImp.valor) / vivoImp.vida : 0) + paraCentavos(vivoImp.manutencao);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      tecnologia: f.get('tecnologia') as string,
      fabricante: (f.get('fabricante') as string) || null,
      valor_aquisicao: paraCentavos(f.get('valor_aquisicao') as string),
      vida_util_horas: Number(f.get('vida_util_horas')),
      consumo_w: Number(f.get('consumo_w')),
      manutencao_hora: paraCentavos(f.get('manutencao_hora') as string),
      agente_id: (f.get('agente_id') as string) || null,
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

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {pode('configuracoes', 'criar') && <Botao onClick={() => abrirImp({})}>+ {t('acoes.nova')}</Botao>}
      </div>
      {lista.data!.length === 0 ? (
        <EstadoVazio />
      ) : (
        <Tabela cabecalhos={[
          t('cadastros.impressora.nome'), t('cadastros.impressora.tecnologia'),
          t('cadastros.impressora.consumo'), t('cadastros.impressora.custoHora'), '',
        ]}>
          {lista.data!.map((i) => (
            <tr key={i.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{i.nome}
                {i.fabricante && <span className="ml-1 text-xs font-normal text-texto-2">{i.fabricante}</span>}
              </td>
              <td className="px-3 py-2.5"><Etiqueta cor="roxo">{i.tecnologia.toUpperCase()}</Etiqueta></td>
              <td className="px-3 py-2.5 tabular-nums">{i.consumo_w} W</td>
              <td className="px-3 py-2.5 font-semibold tabular-nums grad-texto"><Dinheiro centavos={custoHoraImpressora(i)} />/h</td>
              <td className="px-3 py-2.5 text-right">
                {pode('configuracoes', 'editar') && (
                  <Botao variante="fantasma" onClick={() => abrirImp(i)}>{t('acoes.editar')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.nova')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('cadastros.impressora.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.tecnologia')}>
              <Selecao name="tecnologia" defaultValue={editando.tecnologia ?? 'fdm'}>
                <option value="fdm">FDM</option>
                <option value="resina">Resina</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Fabricante">
              <Entrada name="fabricante" defaultValue={editando.fabricante ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.valorAquisicao')}>
              <Entrada name="valor_aquisicao" inputMode="decimal" defaultValue={deCentavos(editando.valor_aquisicao ?? 0)}
                onChange={(e) => setVivoImp({ ...vivoImp, valor: e.target.value })} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.vidaUtil')}>
              <Entrada name="vida_util_horas" type="number" min="1" required defaultValue={editando.vida_util_horas ?? 5000}
                onChange={(e) => setVivoImp({ ...vivoImp, vida: Number(e.target.value) || 0 })} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.consumo')}>
              <Entrada name="consumo_w" type="number" min="0" defaultValue={editando.consumo_w ?? 150} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.manutencaoHora')}>
              <Entrada name="manutencao_hora" inputMode="decimal" defaultValue={deCentavos(editando.manutencao_hora ?? 0)}
                onChange={(e) => setVivoImp({ ...vivoImp, manutencao: e.target.value })} />
            </Campo>
            {/* vínculo com o agente de impressão (impressão remota) */}
            <Campo rotulo={t('agente.aba')} className="col-span-2"
              dica={(agentes.data ?? []).length === 0 ? t('impressao.semAgente') : undefined}>
              <Selecao name="agente_id" defaultValue={editando.agente_id ?? ''}>
                <option value="">— {t('agente.offline')}</option>
                {(agentes.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </Selecao>
            </Campo>
            {/* o número que importa: custo por hora, calculado ao vivo (v2) */}
            <div className="col-span-2 rounded-xl border border-brand-roxo/30 bg-brand-roxo/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-roxo">
                {t('cadastros.impressora.custoHora')}
              </p>
              <p className="text-lg font-extrabold tabular-nums grad-texto">
                {moeda(Math.round(custoHoraVivo), formato)}/h
              </p>
              <p className="text-[11px] text-texto-2">
                amortização (valor ÷ vida útil) + manutenção/h — alimenta a Calculadora
              </p>
            </div>
            {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-2 flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------- Cadastros simples
function CrudSimples({
  tabela,
  colunas,
  formulario,
  paraValores,
}: {
  tabela: string;
  colunas: { titulo: string; render: (linha: Record<string, unknown>) => React.ReactNode }[];
  formulario: (linha: Partial<Record<string, unknown>>) => React.ReactNode;
  paraValores: (f: FormData) => Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const lista = useLista(tabela, { ordem: 'nome', desc: false });
  const crud = useCrud(tabela);
  const [editando, setEditando] = useState<Partial<Record<string, unknown>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const valores = paraValores(new FormData(e.currentTarget));
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
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {pode('configuracoes', 'criar') && <Botao onClick={() => setEditando({})}>+ {t('acoes.novo')}</Botao>}
      </div>
      {lista.data!.length === 0 ? (
        <EstadoVazio />
      ) : (
        <Tabela cabecalhos={[...colunas.map((c) => c.titulo), '']}>
          {lista.data!.map((linha) => (
            <tr key={linha.id as string} className="hover:bg-surface-2/50">
              {colunas.map((c, i) => (
                <td key={i} className="px-3 py-2.5">{c.render(linha)}</td>
              ))}
              <td className="px-3 py-2.5 text-right">
                {pode('configuracoes', 'editar') && (
                  <Botao variante="fantasma" onClick={() => setEditando(linha)}>{t('acoes.editar')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.novo')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="space-y-3">
            {formulario(editando)}
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

function AbaCanais() {
  const { t } = useTranslation();
  const pctTxt = (v: unknown) => `${(Number(v) * 100).toFixed(1).replace('.', ',')}%`;
  return (
    <CrudSimples
      tabela="canal_venda"
      colunas={[
        { titulo: t('cadastros.canal.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.canal.taxaMarketplace'), render: (l) => pctTxt(l.taxa_marketplace) },
        { titulo: t('cadastros.canal.taxaPagamento'), render: (l) => pctTxt(l.taxa_pagamento) },
        { titulo: t('cadastros.canal.comissao'), render: (l) => pctTxt(l.comissao) },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.canal.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo={t('cadastros.canal.taxaMarketplace')}>
              <Entrada name="taxa_marketplace" type="number" step="0.1" min="0" max="99" defaultValue={l.taxa_marketplace != null ? Number(l.taxa_marketplace) * 100 : 0} />
            </Campo>
            <Campo rotulo={t('cadastros.canal.taxaPagamento')}>
              <Entrada name="taxa_pagamento" type="number" step="0.1" min="0" max="99" defaultValue={l.taxa_pagamento != null ? Number(l.taxa_pagamento) * 100 : 0} />
            </Campo>
            <Campo rotulo={t('cadastros.canal.comissao')}>
              <Entrada name="comissao" type="number" step="0.1" min="0" max="99" defaultValue={l.comissao != null ? Number(l.comissao) * 100 : 0} />
            </Campo>
          </div>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        taxa_marketplace: Number(f.get('taxa_marketplace')) / 100,
        taxa_pagamento: Number(f.get('taxa_pagamento')) / 100,
        comissao: Number(f.get('comissao')) / 100,
      })}
    />
  );
}

function AbaCustosFixos() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="custo_fixo"
      colunas={[
        { titulo: t('cadastros.custoFixo.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.custoFixo.valorMensal'), render: (l) => <Dinheiro centavos={Number(l.valor_mensal)} /> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.custoFixo.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.custoFixo.valorMensal')}>
            <Entrada name="valor_mensal" inputMode="decimal" defaultValue={deCentavos(Number(l.valor_mensal ?? 0))} />
          </Campo>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        valor_mensal: paraCentavos(f.get('valor_mensal') as string),
      })}
    />
  );
}

function AbaMaoDeObra() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="tarefa_mao_obra"
      colunas={[
        { titulo: t('cadastros.tarefa.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.tarefa.valorHora'), render: (l) => <Dinheiro centavos={Number(l.valor_hora)} /> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.tarefa.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.tarefa.valorHora')}>
            <Entrada name="valor_hora" inputMode="decimal" defaultValue={deCentavos(Number(l.valor_hora ?? 0))} />
          </Campo>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        valor_hora: paraCentavos(f.get('valor_hora') as string),
      })}
    />
  );
}

function AbaEnergia() {
  const { t } = useTranslation();
  return (
    <CrudSimples
      tabela="perfil_energia"
      colunas={[
        { titulo: t('cadastros.energia2.nome'), render: (l) => <span className="font-semibold text-ink">{String(l.nome)}</span> },
        { titulo: t('cadastros.energia2.tarifaKwh'), render: (l) => <><Dinheiro centavos={Number(l.tarifa_kwh)} />/kWh</> },
      ]}
      formulario={(l) => (
        <>
          <Campo rotulo={t('cadastros.energia2.nome')}>
            <Entrada name="nome" required defaultValue={(l.nome as string) ?? ''} />
          </Campo>
          <Campo rotulo={t('cadastros.energia2.tarifaKwh')}>
            <Entrada name="tarifa_kwh" inputMode="decimal" defaultValue={deCentavos(Number(l.tarifa_kwh ?? 0))} />
          </Campo>
        </>
      )}
      paraValores={(f) => ({
        nome: f.get('nome'),
        tarifa_kwh: paraCentavos(f.get('tarifa_kwh') as string),
      })}
    />
  );
}

export { custoHoraImpressora };
export type { Impressora, Material };
