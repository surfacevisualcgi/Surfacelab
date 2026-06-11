/**
 * Tela 17 — Cadastros de apoio em abas: impressoras, materiais, canais,
 * custos fixos, mão de obra, energia. (Estrutura do protótipo, pele Surface.)
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

type Aba = 'impressoras' | 'materiais' | 'canais' | 'custosFixos' | 'maoDeObra' | 'energia';

export function PaginaCadastros() {
  const { t } = useTranslation();
  const [aba, setAba] = useState<Aba>('materiais');
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'materiais', rotulo: t('cadastros.materiais') },
    { id: 'impressoras', rotulo: t('cadastros.impressoras') },
    { id: 'canais', rotulo: t('cadastros.canais') },
    { id: 'custosFixos', rotulo: t('cadastros.custosFixos') },
    { id: 'maoDeObra', rotulo: t('cadastros.maoDeObra') },
    { id: 'energia', rotulo: t('cadastros.energia') },
  ];
  return (
    <div>
      <CabecalhoPagina titulo={t('cadastros.titulo')} />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-borda">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              aba === a.id
                ? 'border-brand-roxo text-ink'
                : 'border-transparent text-texto-2 hover:text-ink'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'materiais' && <AbaMateriais />}
      {aba === 'impressoras' && <AbaImpressoras />}
      {aba === 'canais' && <AbaCanais />}
      {aba === 'custosFixos' && <AbaCustosFixos />}
      {aba === 'maoDeObra' && <AbaMaoDeObra />}
      {aba === 'energia' && <AbaEnergia />}
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
  const { pode } = useAuth();
  const lista = useLista<Material>('material', { ordem: 'nome', desc: false });
  const crud = useCrud('material');
  const [editando, setEditando] = useState<Partial<Material> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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
          <Botao onClick={() => setEditando({})}>+ {t('acoes.novo')}</Botao>
        )}
      </div>
      {lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('estoque', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('acoes.novo')}</Botao> : undefined} />
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
                  <Botao variante="fantasma" onClick={() => setEditando(m)}>{t('acoes.editar')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('acoes.novo')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('cadastros.material.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo={t('cadastros.material.tipo')}>
              <Selecao name="tipo" defaultValue={editando.tipo ?? 'filamento'}>
                {['filamento', 'resina', 'componente', 'consumivel', 'embalagem'].map((tp) => (
                  <option key={tp} value={tp}>{t(`cadastros.material.tipoLabel.${tp}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Marca / cor">
              <div className="flex gap-2">
                <Entrada name="marca" placeholder="Marca" defaultValue={editando.marca ?? ''} />
                <Entrada name="cor" placeholder="Cor" defaultValue={editando.cor ?? ''} />
              </div>
            </Campo>
            <Campo rotulo={t('cadastros.material.unidadeCompra')}>
              <Entrada name="unidade_compra" required defaultValue={editando.unidade_compra ?? 'kg'} />
            </Campo>
            <Campo rotulo={t('cadastros.material.unidadeConsumo')}>
              <Entrada name="unidade_consumo" required defaultValue={editando.unidade_consumo ?? 'g'} />
            </Campo>
            <Campo rotulo={t('cadastros.material.fatorConversao')} dica="Ex.: 1 kg = 1000 g → 1000">
              <Entrada name="fator_conversao" type="number" step="any" min="0.0001" required defaultValue={editando.fator_conversao ?? 1000} />
            </Campo>
            <Campo rotulo={t('estoque.minimo')}>
              <Entrada name="minimo" type="number" step="any" min="0" defaultValue={editando.minimo ?? 0} />
            </Campo>
            <Campo rotulo={t('cadastros.material.precoCompra')}>
              <Entrada name="preco_compra" inputMode="decimal" defaultValue={deCentavos(editando.preco_compra ?? 0)} />
            </Campo>
            <Campo rotulo={t('cadastros.material.frete')}>
              <Entrada name="frete" inputMode="decimal" defaultValue={deCentavos(editando.frete ?? 0)} />
            </Campo>
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
}

function custoHoraImpressora(i: Impressora): number {
  const amortizacao = i.vida_util_horas > 0 ? i.valor_aquisicao / i.vida_util_horas : 0;
  return Math.round(amortizacao + Number(i.manutencao_hora));
}

export function AbaImpressoras() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const lista = useLista<Impressora>('impressora', { ordem: 'nome', desc: false });
  const crud = useCrud('impressora');
  const [editando, setEditando] = useState<Partial<Impressora> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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
        {pode('configuracoes', 'criar') && <Botao onClick={() => setEditando({})}>+ {t('acoes.nova')}</Botao>}
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
              <td className="px-3 py-2.5 tabular-nums"><Dinheiro centavos={custoHoraImpressora(i)} />/h</td>
              <td className="px-3 py-2.5 text-right">
                {pode('configuracoes', 'editar') && (
                  <Botao variante="fantasma" onClick={() => setEditando(i)}>{t('acoes.editar')}</Botao>
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
              <Entrada name="valor_aquisicao" inputMode="decimal" defaultValue={deCentavos(editando.valor_aquisicao ?? 0)} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.vidaUtil')}>
              <Entrada name="vida_util_horas" type="number" min="1" required defaultValue={editando.vida_util_horas ?? 5000} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.consumo')}>
              <Entrada name="consumo_w" type="number" min="0" defaultValue={editando.consumo_w ?? 150} />
            </Campo>
            <Campo rotulo={t('cadastros.impressora.manutencaoHora')}>
              <Entrada name="manutencao_hora" inputMode="decimal" defaultValue={deCentavos(editando.manutencao_hora ?? 0)} />
            </Campo>
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
