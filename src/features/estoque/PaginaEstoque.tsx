/**
 * Estoque & Compras.
 * Tela operacional para um studio solo: decide o que comprar, o que ajustar,
 * o que chegou e consulta o historico sem editar o ledger.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro, useLista } from '@/lib/dados';
import { dataCurta, deCentavos, moeda, paraCentavos } from '@/lib/formato';
import {
  Abas,
  Botao,
  Campo,
  Carregando,
  Dinheiro,
  Entrada,
  EntradaDinheiro,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  Modal,
  Selecao,
  TabelaDados,
} from '@/components/ui';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import { useAuth } from '@/auth/AuthProvider';
import type { Material } from '../cadastros/PaginaCadastros';

interface Mov {
  id: string;
  material_id: string;
  tipo: string;
  quantidade: number;
  custo_unitario: number;
  motivo: string | null;
  referencia_tipo?: string | null;
  created_at: string;
}

interface Compra {
  id: string;
  numero: string;
  status: string;
  previsao: string | null;
  total: number;
  frete: number;
  fornecedor_id: string | null;
  observacoes: string | null;
  fornecedor: { nome: string; prazo_entrega_dias?: number | null; pedido_minimo?: number | null } | null;
}

interface CompraItem {
  id: string;
  material_id: string;
  quantidade: number;
  custo_unit: number;
  recebido: boolean;
}

type Aba = 'materiais' | 'compras' | 'ajustes' | 'historico';
type ModalMovState = { tipo: 'entrada' | 'saida'; materialId?: string } | null;
type ModalAjusteState = { materialId?: string } | null;
type ItemCompraDraft = { material_id: string; quantidade: number; custo: string };
type ModalCompraState = { compra?: Compra; itens?: ItemCompraDraft[] } | null;

export function PaginaEstoque() {
  const { ativa, pode, formato } = useAuth();
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>('materiais');
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [materialSelecionadoId, setMaterialSelecionadoId] = useState('');
  const [modalMov, setModalMov] = useState<ModalMovState>(null);
  const [modalAjuste, setModalAjuste] = useState<ModalAjusteState>(null);
  const [modalCompra, setModalCompra] = useState<ModalCompraState>(null);
  const [erro, setErro] = useState<string | null>(null);

  const materiais = useLista<Material>('material', {
    ordem: 'nome',
    desc: false,
    selecao: '*, fornecedor:fornecedor_id (nome, prazo_entrega_dias, pedido_minimo)',
  });
  const movs = useLista<Mov>('movimentacao_estoque', {
    ordem: 'created_at',
    desc: true,
    incluirExcluidos: true,
  });
  const compras = useLista<Compra>('compra', {
    ordem: 'created_at',
    desc: true,
    selecao: '*, fornecedor:fornecedor_id (nome, prazo_entrega_dias, pedido_minimo)',
  });

  const listaMateriais = materiais.data ?? [];
  const listaMovs = movs.data ?? [];
  const listaCompras = compras.data ?? [];

  const disponivel = (m: Material) => Number(m.saldo) - Number(m.reservado);
  const minimo = (m: Material) => Number(m.minimo);
  const fator = (m: Material) => Number(m.fator_conversao) > 0 ? Number(m.fator_conversao) : 1;
  const alertaAtivo = (m: Material) => m.alerta_estoque !== false;
  const comprarQtdConsumo = (m: Material) => alertaAtivo(m) ? Math.max(0, minimo(m) - disponivel(m)) : 0;
  const compraSugerida = (m: Material): ItemCompraDraft => ({
    material_id: m.id,
    quantidade: Math.max(1, Math.ceil(comprarQtdConsumo(m) / fator(m))),
    custo: '',
  });

  const kpis = useMemo(() => {
    const criticos = listaMateriais.filter((m) => alertaAtivo(m) && minimo(m) > 0 && disponivel(m) <= minimo(m));
    const pendentes = listaCompras.filter((c) => !['recebido', 'cancelado'].includes(c.status));
    const proximos7 = pendentes.filter((c) => {
      if (!c.previsao) return false;
      const diff = new Date(c.previsao).getTime() - Date.now();
      return diff >= -86400000 && diff <= 7 * 86400000;
    });
    return {
      criticos,
      pendentes,
      proximos7,
      valorTotal: listaMateriais.reduce((s, m) => s + Number(m.valor_estoque), 0),
      itens: listaMateriais.length,
    };
  }, [listaMateriais, listaCompras]);

  const categorias = useMemo(() => (
    Array.from(new Set(listaMateriais.map((m) => m.subtipo || m.tipo).filter(Boolean))).sort()
  ), [listaMateriais]);

  const materiaisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return listaMateriais
      .filter((m) => tipoFiltro === 'todos' || m.tipo === tipoFiltro)
      .filter((m) => categoriaFiltro === 'todas' || m.subtipo === categoriaFiltro || m.tipo === categoriaFiltro)
      .filter((m) => !termo || [m.nome, m.marca, m.cor, m.subtipo, m.acabamento].some((v) => String(v ?? '').toLowerCase().includes(termo)))
      .sort((a, b) => prioridadeMaterial(a) - prioridadeMaterial(b) || a.nome.localeCompare(b.nome));
  }, [listaMateriais, busca, tipoFiltro, categoriaFiltro]);

  const materialSelecionado = listaMateriais.find((m) => m.id === materialSelecionadoId)
    ?? materiaisFiltrados[0]
    ?? listaMateriais[0]
    ?? null;

  const ultimosMovsMaterial = materialSelecionado
    ? listaMovs.filter((mv) => mv.material_id === materialSelecionado.id).slice(0, 7)
    : [];

  function prioridadeMaterial(m: Material) {
    if (!alertaAtivo(m)) return 3;
    if (disponivel(m) <= 0) return 0;
    if (minimo(m) > 0 && disponivel(m) <= minimo(m)) return 1;
    return 2;
  }

  function statusMaterial(m: Material) {
    if (!alertaAtivo(m)) return { cor: 'cinza' as const, texto: 'Sem alerta' };
    if (Number(m.saldo) <= 0) return { cor: 'vermelho' as const, texto: 'Sem estoque' };
    if (minimo(m) > 0 && disponivel(m) <= 0) return { cor: 'vermelho' as const, texto: 'Indisponivel' };
    if (minimo(m) > 0 && disponivel(m) <= minimo(m)) return { cor: 'amarelo' as const, texto: 'Baixo' };
    return { cor: 'verde' as const, texto: 'OK' };
  }

  function acaoRecomendada(m: Material) {
    if (!alertaAtivo(m)) return { urgente: false, texto: 'Sem alerta', detalhe: 'Material registrado sem alerta de compra' };
    const falta = comprarQtdConsumo(m);
    if (falta <= 0) return { urgente: false, texto: 'OK', detalhe: 'Estoque adequado' };
    const qtdCompra = Math.max(1, Math.ceil(falta / fator(m)));
    return { urgente: true, texto: `Comprar ${qtdCompra} ${m.unidade_compra}`, detalhe: `${falta.toLocaleString()} ${m.unidade_consumo} abaixo do minimo` };
  }

  function nomeMaterial(id: string) {
    return listaMateriais.find((m) => m.id === id)?.nome ?? '-';
  }

  function abrirCompraMaterial(m: Material) {
    setErro(null);
    setAba('compras');
    setModalCompra({ itens: [compraSugerida(m)] });
  }

  function abrirMov(tipo: 'entrada' | 'saida', materialId = '') {
    setErro(null);
    setModalMov({ tipo, materialId });
  }

  function abrirAjuste(materialId = '') {
    setErro(null);
    setModalAjuste({ materialId });
  }

  async function lancar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modalMov) return;
    const f = new FormData(e.currentTarget);
    const quantidade = Number(f.get('quantidade'));
    const custoTotal = modalMov.tipo === 'entrada' ? paraCentavos((f.get('custo_total') as string) || '0') : 0;
    const { error } = await supabase.from('movimentacao_estoque').insert({
      tenant_id: ativa?.tenant_id,
      material_id: f.get('material_id') as string,
      tipo: modalMov.tipo,
      quantidade,
      custo_unitario: modalMov.tipo === 'entrada' && quantidade > 0 ? custoTotal / quantidade : 0,
      motivo: (f.get('motivo') as string) || (modalMov.tipo === 'entrada' ? 'entrada manual' : 'saida manual'),
      referencia_tipo: 'manual',
    });
    if (error) setErro(mensagemErro(error));
    else {
      setModalMov(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['material'] });
      qc.invalidateQueries({ queryKey: ['movimentacao_estoque'] });
    }
  }

  async function ajustarSaldo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const materialId = f.get('material_id') as string;
    const material = listaMateriais.find((m) => m.id === materialId);
    if (!material) return;

    const saldoFisico = Number(f.get('saldo_fisico'));
    const diferenca = saldoFisico - Number(material.saldo);
    if (Math.abs(diferenca) < 0.0001) {
      setModalAjuste(null);
      setErro(null);
      return;
    }

    const tipo = diferenca > 0 ? 'ajuste' : 'saida';
    const quantidade = Math.abs(diferenca);
    const motivoLivre = String(f.get('motivo') ?? '').trim();
    const { error } = await supabase.from('movimentacao_estoque').insert({
      tenant_id: ativa?.tenant_id,
      material_id: materialId,
      tipo,
      quantidade,
      custo_unitario: 0,
      motivo: motivoLivre || `ajuste de inventario: fisico ${saldoFisico} ${material.unidade_consumo}`,
      referencia_tipo: 'inventario',
    });
    if (error) setErro(mensagemErro(error));
    else {
      setModalAjuste(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['material'] });
      qc.invalidateQueries({ queryKey: ['movimentacao_estoque'] });
    }
  }

  async function receber(compraId: string) {
    setErro(null);
    const { error } = await supabase.rpc('receber_compra', { p_compra: compraId });
    if (error) setErro(mensagemErro(error));
    qc.invalidateQueries();
  }

  async function cancelarCompra(compraId: string) {
    setErro(null);
    const { error } = await supabase.from('compra').update({ status: 'cancelado' }).eq('id', compraId);
    if (error) setErro(mensagemErro(error));
    else qc.invalidateQueries();
  }

  if (materiais.isLoading) return <Carregando />;
  if (materiais.isError) return <EstadoErro onRetry={() => materiais.refetch()} />;

  return (
    <div className="flex min-h-0 flex-col text-[13px] xl:h-[calc(100dvh-112px)] xl:overflow-hidden">
      <section className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Estoque & Compras</h1>
          <p className="mt-1 text-sm text-texto-2">Controle o que acaba, o que chega e o que precisa ser comprado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pode('compras', 'criar') && <Botao onClick={() => setModalCompra({})}>+ Nova compra</Botao>}
          {pode('estoque', 'criar') && <Botao variante="secundario" onClick={() => abrirAjuste(materialSelecionado?.id)}>Ajustar saldo</Botao>}
          {pode('estoque', 'criar') && <Botao variante="secundario" onClick={() => abrirMov('entrada', materialSelecionado?.id)}>Entrada rapida</Botao>}
        </div>
      </section>

      {erro && <p className="mb-4 rounded-xl border border-erro/20 bg-erro/5 px-3 py-2 text-xs font-semibold text-erro">{erro}</p>}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard tom="red" rotulo="Itens criticos" valor={kpis.criticos.length.toLocaleString()} detalhe="materiais abaixo do minimo" />
            <KpiCard tom="blue" rotulo="Compras chegando" valor={kpis.pendentes.length.toLocaleString()} detalhe={`${kpis.proximos7.length} ate os proximos 7 dias`} />
            <KpiCard tom="green" rotulo="Valor em estoque" valor={moeda(kpis.valorTotal, formato)} detalhe="Ver relatorio" spark />
            <KpiCard tom="plain" rotulo="Itens em estoque" valor={kpis.itens.toLocaleString()} detalhe="materiais cadastrados" />
          </div>

          <section className="mb-4 rounded-2xl border border-borda bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <Abas<Aba>
                abas={[
                  { id: 'materiais', rotulo: 'Materiais' },
                  { id: 'compras', rotulo: 'Compras' },
                  { id: 'ajustes', rotulo: 'Ajustes' },
                  { id: 'historico', rotulo: 'Historico' },
                ]}
                ativa={aba}
                onTrocar={setAba}
              />
              {aba === 'materiais' && (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_170px_auto]">
                  <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar material..." />
                  <Selecao value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
                    <option value="todos">Todos os tipos</option>
                    <option value="filamento">Filamentos</option>
                    <option value="resina">Resinas</option>
                    <option value="componente">Componentes</option>
                    <option value="consumivel">Consumiveis</option>
                    <option value="embalagem">Embalagens</option>
                  </Selecao>
                  <Selecao value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                    <option value="todas">Todas categorias</option>
                    {categorias.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </Selecao>
                  <Botao variante="secundario" className="whitespace-nowrap">Exportar</Botao>
                </div>
              )}
            </div>
          </section>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {aba === 'materiais' && (
            materiaisFiltrados.length === 0 ? <EstadoVazio /> : (
              <TabelaMateriais
                materiais={materiaisFiltrados}
                selecionadoId={materialSelecionado?.id}
                disponivel={disponivel}
                minimo={minimo}
                fator={fator}
                statusMaterial={statusMaterial}
                acaoRecomendada={acaoRecomendada}
                onSelecionar={(m) => setMaterialSelecionadoId(m.id)}
                onComprar={abrirCompraMaterial}
              />
            )
          )}

          {aba === 'compras' && (
            <ComprasTabela
              compras={listaCompras}
              carregando={compras.isLoading}
              formato={formato}
              podeEditar={pode('compras', 'editar')}
              onNova={() => setModalCompra({})}
              onEditar={(c) => setModalCompra({ compra: c })}
              onReceber={receber}
              onCancelar={cancelarCompra}
            />
          )}

          {aba === 'ajustes' && (
            <AjustesView
              material={materialSelecionado}
              materiais={listaMateriais}
              onAjustar={(m) => abrirAjuste(m.id)}
              onEntrada={(m) => abrirMov('entrada', m.id)}
              onSaida={(m) => abrirMov('saida', m.id)}
            />
          )}

          {aba === 'historico' && (
            <HistoricoTabela
              movs={listaMovs}
              carregando={movs.isLoading}
              formato={formato}
              nomeMaterial={nomeMaterial}
            />
          )}
          </main>
        </section>

        <aside className="min-h-0 space-y-3 xl:h-full xl:overflow-y-auto xl:pr-1">
          <PainelMaterial
            material={materialSelecionado}
            ultimosMovs={ultimosMovsMaterial}
            disponivel={disponivel}
            minimo={minimo}
            fator={fator}
            statusMaterial={statusMaterial}
            podeComprar={pode('compras', 'criar')}
            podeEstoque={pode('estoque', 'criar')}
            onComprar={abrirCompraMaterial}
            onAjustar={(m) => abrirAjuste(m.id)}
            onEntrada={(m) => abrirMov('entrada', m.id)}
            onSaida={(m) => abrirMov('saida', m.id)}
            formato={formato}
          />

          <SideCard titulo="Alertas" contador={kpis.criticos.length} cor={kpis.criticos.length ? 'amarelo' : 'verde'}>
            {kpis.criticos.length === 0 ? (
              <p className="text-xs text-texto-2">Sem alertas de estoque</p>
            ) : (
              <div className="space-y-2">
                {kpis.criticos.slice(0, 5).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMaterialSelecionadoId(m.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-left text-xs"
                  >
                    <span className="min-w-0 truncate font-semibold text-ink">{m.nome}</span>
                    <span className="shrink-0 text-alerta">{comprarQtdConsumo(m).toLocaleString()} {m.unidade_consumo}</span>
                  </button>
                ))}
              </div>
            )}
          </SideCard>

          <SideCard titulo="Proximas entregas" contador={kpis.pendentes.length} cor={kpis.pendentes.length ? 'azul' : 'cinza'}>
            {kpis.pendentes.length === 0 ? (
              <p className="text-xs text-texto-2">Nada por aqui ainda</p>
            ) : (
              <div className="space-y-2">
                {kpis.pendentes.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-ink">{c.numero}</span>
                    <span className="text-texto-2">{dataCurta(c.previsao, formato)}</span>
                  </div>
                ))}
              </div>
            )}
          </SideCard>
        </aside>
      </div>

      <ModalMovimentacao estado={modalMov} materiais={listaMateriais} disponivel={disponivel} erro={erro} onSubmit={lancar} onFechar={() => setModalMov(null)} />
      <ModalAjuste estado={modalAjuste} materiais={listaMateriais} erro={erro} onSubmit={ajustarSaldo} onFechar={() => setModalAjuste(null)} />
      <ModalNovaCompra estado={modalCompra} materiais={listaMateriais} onFechar={() => setModalCompra(null)} onSucesso={() => { setModalCompra(null); qc.invalidateQueries(); }} />
    </div>
  );
}

function KpiCard({ rotulo, valor, detalhe, tom, spark = false }: {
  rotulo: string;
  valor: string;
  detalhe: string;
  tom: 'red' | 'blue' | 'green' | 'plain';
  spark?: boolean;
}) {
  const estilos = {
    red: 'border-erro/10 bg-erro/5',
    blue: 'border-brand-azul/10 bg-brand-azul/5',
    green: 'border-ok/10 bg-ok/5',
    plain: 'border-borda bg-white',
  }[tom];
  const valorCls = tom === 'green' ? 'text-ok' : tom === 'blue' ? 'text-brand-azul' : tom === 'red' ? 'text-erro' : 'text-ink';
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${estilos}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className={`mt-2 text-2xl font-extrabold tabular-nums ${valorCls}`}>{valor}</p>
      <p className="mt-1 text-[11px] font-medium text-texto-2">{detalhe}</p>
      {spark && (
        <svg className="absolute bottom-3 right-3 h-12 w-24 text-ok/70" viewBox="0 0 96 48" fill="none" aria-hidden>
          <path d="M3 35 18 31 29 36 41 22 52 27 65 12 75 18 92 5" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      )}
    </div>
  );
}

function MaterialThumb({ material, className = 'size-11' }: { material: Material; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-borda bg-white ${className}`}>
      <FotoOuPlaceholder path={material.foto} alt={material.nome} className="size-full object-cover" />
    </div>
  );
}

function EstoqueBarra({ atual, minimo, unidade }: { atual: number; minimo: number; unidade: string }) {
  const base = Math.max(minimo * 1.6, atual, 1);
  const pct = Math.min(100, Math.max(0, (atual / base) * 100));
  const cor = minimo > 0 && atual <= minimo ? 'bg-alerta' : 'bg-ok';
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <strong className="text-ink">{atual.toLocaleString()}</strong>
        <span className="text-[11px] text-texto-2">{unidade}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      {minimo > 0 && <p className="mt-0.5 text-[10px] text-texto-2">Min. {minimo.toLocaleString()}</p>}
    </div>
  );
}

function TabelaMateriais({
  materiais,
  selecionadoId,
  disponivel,
  minimo,
  fator,
  statusMaterial,
  acaoRecomendada,
  onSelecionar,
  onComprar,
}: {
  materiais: Material[];
  selecionadoId?: string;
  disponivel: (m: Material) => number;
  minimo: (m: Material) => number;
  fator: (m: Material) => number;
  statusMaterial: (m: Material) => { cor: 'verde' | 'amarelo' | 'vermelho' | 'cinza'; texto: string };
  acaoRecomendada: (m: Material) => { urgente: boolean; texto: string; detalhe: string };
  onSelecionar: (m: Material) => void;
  onComprar: (m: Material) => void;
}) {
  const [pagina, setPagina] = useState(1);
  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(materiais.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * porPagina;
  const fim = Math.min(materiais.length, inicio + porPagina);
  const materiaisPagina = materiais.slice(inicio, fim);

  useEffect(() => {
    setPagina(1);
  }, [materiais.length]);

  return (
    <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-borda bg-white shadow-sm xl:min-h-0">
      <div className="hidden min-h-0 flex-1 overflow-auto lg:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-borda bg-surface-2/70 text-left">
              {['Material', 'Status', 'Disponivel', 'Reservado', 'Minimo', 'Custo medio', 'Acao recomendada', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide text-texto-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/70">
            {materiaisPagina.map((m) => {
              const st = statusMaterial(m);
              const acao = acaoRecomendada(m);
              const ativo = m.id === selecionadoId;
              return (
                <tr
                  key={m.id}
                  onClick={() => onSelecionar(m)}
                  className={`cursor-pointer transition-colors hover:bg-brand-roxo/5 ${ativo ? 'bg-brand-roxo/5 ring-1 ring-inset ring-brand-roxo/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <MaterialThumb material={m} />
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-ink">{m.nome}</p>
                        <p className="text-[10px] text-texto-2">{m.unidade_compra} = {fator(m).toLocaleString()} {m.unidade_consumo}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Etiqueta cor={st.cor}>{st.texto}</Etiqueta></td>
                  <td className="px-4 py-3 min-w-36"><EstoqueBarra atual={disponivel(m)} minimo={minimo(m)} unidade={m.unidade_consumo} /></td>
                  <td className="px-4 py-3 tabular-nums">{Number(m.reservado).toLocaleString()} {m.unidade_consumo}</td>
                  <td className="px-4 py-3 tabular-nums">{minimo(m).toLocaleString()} {m.unidade_consumo}</td>
                  <td className="px-4 py-3 tabular-nums"><Dinheiro centavos={Math.round(Number(m.custo_medio) || Number(m.custo_unitario))} />/{m.unidade_consumo}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); acao.urgente ? onComprar(m) : onSelecionar(m); }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${acao.urgente ? 'bg-alerta text-white' : 'bg-ok/10 text-ok'}`}
                    >
                      {acao.texto}
                    </button>
                    <p className="mt-1 text-[10px] text-texto-2">{acao.detalhe}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-texto-2">...</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 lg:hidden">
        {materiaisPagina.map((m) => {
          const st = statusMaterial(m);
          const acao = acaoRecomendada(m);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelecionar(m)}
              className={`block w-full rounded-2xl border p-4 text-left ${m.id === selecionadoId ? 'border-brand-roxo bg-brand-roxo/5' : 'border-borda bg-white'}`}
            >
              <div className="flex items-start gap-3">
                <MaterialThumb material={m} className="size-14" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-extrabold text-ink">{m.nome}</p>
                    <Etiqueta cor={st.cor}>{st.texto}</Etiqueta>
                  </div>
                  <p className="text-[11px] text-texto-2">{m.unidade_compra} = {fator(m).toLocaleString()} {m.unidade_consumo}</p>
                  <div className="mt-3">
                    <EstoqueBarra atual={disponivel(m)} minimo={minimo(m)} unidade={m.unidade_consumo} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-texto-2">Reservado {Number(m.reservado).toLocaleString()} {m.unidade_consumo}</span>
                    <span className={`text-xs font-bold ${acao.urgente ? 'text-alerta' : 'text-ok'}`}>{acao.texto}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-borda px-4 py-3 text-xs text-texto-2 sm:flex-row sm:items-center sm:justify-between">
        <span>Mostrando {materiais.length === 0 ? 0 : inicio + 1} a {fim} de {materiais.length} materiais</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={paginaSegura <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="rounded-md border border-borda px-2 py-1 disabled:opacity-40"
          >
            {'<'}
          </button>
          <button className="rounded-md bg-brand-roxo px-2 py-1 font-bold text-white">{paginaSegura}</button>
          <button
            type="button"
            disabled={paginaSegura >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            className="rounded-md border border-borda px-2 py-1 disabled:opacity-40"
          >
            {'>'}
          </button>
          <span className="ml-2">{porPagina} por pagina</span>
          <span className="hidden">
          <button className="rounded-md border border-borda px-2 py-1">‹</button>
          <button className="rounded-md bg-brand-roxo px-2 py-1 font-bold text-white">{paginaSegura}</button>
          <button className="rounded-md border border-borda px-2 py-1">›</button>
          <span className="ml-2">{porPagina} por pagina</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function PainelMaterial({
  material,
  ultimosMovs,
  disponivel,
  minimo,
  fator,
  statusMaterial,
  podeComprar,
  podeEstoque,
  onComprar,
  onAjustar,
  onEntrada,
  onSaida,
  formato,
}: {
  material: Material | null;
  ultimosMovs: Mov[];
  disponivel: (m: Material) => number;
  minimo: (m: Material) => number;
  fator: (m: Material) => number;
  statusMaterial: (m: Material) => { cor: 'verde' | 'amarelo' | 'vermelho' | 'cinza'; texto: string };
  podeComprar: boolean;
  podeEstoque: boolean;
  onComprar: (m: Material) => void;
  onAjustar: (m: Material) => void;
  onEntrada: (m: Material) => void;
  onSaida: (m: Material) => void;
  formato: ReturnType<typeof useAuth>['formato'];
}) {
  if (!material) {
    return <SideCard titulo="Material selecionado" contador={0}><p className="text-xs text-texto-2">Selecione um material</p></SideCard>;
  }
  const st = statusMaterial(material);
  return (
    <section className="rounded-2xl border border-borda bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MaterialThumb material={material} className="size-16" />
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Material selecionado</p>
            <h2 className="mt-1 text-xl font-extrabold leading-tight text-ink">{material.nome}</h2>
            <p className="text-xs text-texto-2">Codigo: MAT-{material.id.slice(0, 4).toUpperCase()}</p>
          </div>
        </div>
        <Etiqueta cor={st.cor}>{st.texto}</Etiqueta>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BoxInfo rotulo="Disponivel" valor={`${disponivel(material).toLocaleString()} ${material.unidade_consumo}`} destaque />
        <BoxInfo rotulo="Reservado" valor={`${Number(material.reservado).toLocaleString()} ${material.unidade_consumo}`} />
        <BoxInfo rotulo="Minimo" valor={`${minimo(material).toLocaleString()} ${material.unidade_consumo}`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <BoxInfo rotulo="Conversao" valor={`1 ${material.unidade_compra} = ${fator(material).toLocaleString()} ${material.unidade_consumo}`} destaque />
        <BoxInfo rotulo="Custo medio" valor={`${moeda(Math.round(Number(material.custo_medio) || Number(material.custo_unitario)), formato)}/${material.unidade_consumo}`} />
      </div>

      <div className="mt-4 rounded-xl bg-surface-2 p-3">
        <p className="text-[11px] font-extrabold uppercase text-texto-2">Fornecedor principal</p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-ink">{material.fornecedor?.nome ?? 'Nao definido'}</span>
          <button className="rounded-lg bg-white px-2 py-1 font-bold text-brand-roxo">Ver fornecedor</button>
        </div>
        <p className="mt-2 text-[11px] text-texto-2">
          Prazo medio: {material.fornecedor?.prazo_entrega_dias ?? '-'} dias uteis
        </p>
        <p className="text-[11px] text-texto-2">
          Pedido minimo: {material.fornecedor?.pedido_minimo != null ? moeda(Number(material.fornecedor.pedido_minimo), formato) : '-'}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-extrabold uppercase text-texto-2">Informacoes</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <InfoLinha rotulo="Categoria" valor={material.subtipo || material.tipo} />
          <InfoLinha rotulo="Unidade de compra" valor={material.unidade_compra} />
          <InfoLinha rotulo="Unidade de consumo" valor={material.unidade_consumo} />
          <InfoLinha rotulo="Observacao" valor={material.observacao || '-'} />
        </dl>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase text-texto-2">Ultimas movimentacoes</p>
          <span className="text-[11px] font-bold text-brand-roxo">Ver historico</span>
        </div>
        {ultimosMovs.length === 0 ? (
          <p className="text-xs text-texto-2">Nada por aqui ainda</p>
        ) : (
          <div className="space-y-2">
            {ultimosMovs.map((mv) => {
              const entrada = mv.tipo === 'entrada' || mv.tipo === 'ajuste' || mv.tipo === 'estorno_reserva';
              return (
                <div key={mv.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate text-texto-2">{mv.motivo ?? mv.tipo}</p>
                    <p className="text-[10px] text-texto-2/70">{dataCurta(mv.created_at)}</p>
                  </div>
                  <span className={`shrink-0 font-extrabold tabular-nums ${entrada ? 'text-ok' : 'text-erro'}`}>
                    {entrada ? '+' : '-'}{Number(mv.quantidade).toLocaleString()} {material.unidade_consumo}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {podeComprar && <Botao onClick={() => onComprar(material)}>Comprar</Botao>}
        {podeEstoque && <Botao variante="secundario" onClick={() => onAjustar(material)}>Ajustar saldo</Botao>}
        {podeEstoque && <Botao variante="fantasma" onClick={() => onEntrada(material)}>+ Entrada rapida</Botao>}
        {podeEstoque && <Botao variante="fantasma" onClick={() => onSaida(material)}>- Saida rapida</Botao>}
      </div>
    </section>
  );
}

function BoxInfo({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-[10px] font-extrabold uppercase text-texto-2">{rotulo}</p>
      <p className={`mt-1 truncate text-sm font-extrabold tabular-nums ${destaque ? 'text-ok' : 'text-ink'}`}>{valor}</p>
    </div>
  );
}

function InfoLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="font-semibold text-texto-2">{rotulo}</dt>
      <dd className="mt-0.5 truncate font-bold text-ink">{valor}</dd>
    </div>
  );
}

function SideCard({ titulo, contador, cor = 'cinza', children }: {
  titulo: string;
  contador?: number;
  cor?: 'cinza' | 'verde' | 'amarelo' | 'azul';
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-borda bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-ink">{titulo}</h2>
        {contador != null && <Etiqueta cor={cor}>{contador}</Etiqueta>}
      </div>
      {children}
    </section>
  );
}

function ComprasTabela({
  compras,
  carregando,
  formato,
  podeEditar,
  onNova,
  onEditar,
  onReceber,
  onCancelar,
}: {
  compras: Compra[];
  carregando: boolean;
  formato: ReturnType<typeof useAuth>['formato'];
  podeEditar: boolean;
  onNova: () => void;
  onEditar: (c: Compra) => void;
  onReceber: (id: string) => void;
  onCancelar: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (carregando) return <Carregando />;
  if (compras.length === 0) return <EstadoVazio mensagem={t('estoque.semCompras')} acao={<Botao onClick={onNova}>+ Nova compra</Botao>} />;
  return (
    <TabelaDados<Compra>
      colunas={[
        { titulo: t('pedido.numero'), principal: true, render: (c) => <span className="font-bold text-ink">{c.numero}</span> },
        { titulo: t('nav.fornecedores'), render: (c) => c.fornecedor?.nome ?? '-' },
        { titulo: t('estoque.previsao'), render: (c) => dataCurta(c.previsao, formato) },
        { titulo: t('orcamento.total'), numerica: true, render: (c) => <Dinheiro centavos={Number(c.total) + Number(c.frete ?? 0)} /> },
        { titulo: t('orcamento.status'), render: (c) => <Etiqueta cor={c.status === 'recebido' ? 'verde' : c.status === 'cancelado' ? 'vermelho' : 'amarelo'}>{t(`estoque.statusCompra.${c.status}`)}</Etiqueta> },
      ]}
      linhas={compras}
      chave={(c) => c.id}
      acoes={(c) => !['recebido', 'cancelado'].includes(c.status) && podeEditar ? (
        <div className="flex flex-wrap justify-end gap-1">
          <Botao variante="fantasma" onClick={() => onEditar(c)}>{t('acoes.editar')}</Botao>
          <Botao variante="secundario" onClick={() => onReceber(c.id)}>{t('estoque.receber')}</Botao>
          <Botao variante="perigo" onClick={() => onCancelar(c.id)}>{t('acoes.cancelar')}</Botao>
        </div>
      ) : null}
    />
  );
}

function HistoricoTabela({ movs, carregando, formato, nomeMaterial }: {
  movs: Mov[];
  carregando: boolean;
  formato: ReturnType<typeof useAuth>['formato'];
  nomeMaterial: (id: string) => string;
}) {
  const { t } = useTranslation();
  if (carregando) return <Carregando />;
  if (movs.length === 0) return <EstadoVazio />;
  return (
    <TabelaDados<Mov>
      colunas={[
        { titulo: 'Material', principal: true, render: (mv) => <span className="font-semibold text-ink">{nomeMaterial(mv.material_id)}</span> },
        { titulo: 'Data', render: (mv) => dataCurta(mv.created_at, formato) },
        { titulo: 'Tipo', render: (mv) => <Etiqueta cor={mv.tipo === 'entrada' ? 'verde' : mv.tipo === 'saida' ? 'vermelho' : mv.tipo === 'reserva' ? 'amarelo' : 'cinza'}>{t(`estoque.tipoMov.${mv.tipo}`)}</Etiqueta> },
        { titulo: 'Qtd.', numerica: true, render: (mv) => Number(mv.quantidade).toLocaleString() },
        { titulo: t('estoque.custoMov'), numerica: true, render: (mv) => <Dinheiro centavos={Math.round(Number(mv.custo_unitario))} /> },
        { titulo: 'Motivo', render: (mv) => <span className="text-texto-2">{mv.motivo ?? '-'}</span> },
      ]}
      linhas={movs}
      chave={(mv) => mv.id}
    />
  );
}

function AjustesView({ material, materiais, onAjustar, onEntrada, onSaida }: {
  material: Material | null;
  materiais: Material[];
  onAjustar: (m: Material) => void;
  onEntrada: (m: Material) => void;
  onSaida: (m: Material) => void;
}) {
  if (!material && materiais.length === 0) return <EstadoVazio />;
  const alvo = material ?? materiais[0];
  return (
    <section className="rounded-2xl border border-borda bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase text-texto-2">Inventario</p>
      <h2 className="mt-1 text-xl font-extrabold text-ink">Corrija o saldo sem editar o historico</h2>
      <p className="mt-1 max-w-2xl text-sm text-texto-2">
        Use ajuste quando contou fisicamente o material. O sistema cria uma movimentacao de correcao e preserva o ledger.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao onClick={() => onAjustar(alvo)}>Ajustar saldo de {alvo.nome}</Botao>
        <Botao variante="secundario" onClick={() => onEntrada(alvo)}>Entrada rapida</Botao>
        <Botao variante="secundario" onClick={() => onSaida(alvo)}>Saida rapida</Botao>
      </div>
    </section>
  );
}

function ModalMovimentacao({
  estado,
  materiais,
  disponivel,
  erro,
  onSubmit,
  onFechar,
}: {
  estado: ModalMovState;
  materiais: Material[];
  disponivel: (m: Material) => number;
  erro: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onFechar: () => void;
}) {
  const { t } = useTranslation();
  const [materialId, setMaterialId] = useState('');

  useEffect(() => {
    setMaterialId(estado?.materialId ?? '');
  }, [estado]);

  return (
    <Modal aberto={!!estado} titulo={estado?.tipo === 'entrada' ? 'Entrada rapida' : 'Saida rapida'} onFechar={onFechar}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Campo rotulo="Material">
          <Selecao name="material_id" required value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">-</option>
            {materiais.map((m) => (
              <option key={m.id} value={m.id}>{m.nome} ({disponivel(m).toLocaleString()} {m.unidade_consumo} disponivel)</option>
            ))}
          </Selecao>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Quantidade (unidade de consumo)">
            <Entrada name="quantidade" type="number" step="any" min="0.0001" required />
          </Campo>
          {estado?.tipo === 'entrada' && (
            <Campo rotulo={t('estoque.custoTotalEntrada')} dica={t('estoque.custoTotalEntradaDica')}>
              <EntradaDinheiro name="custo_total" defaultCentavos={0} />
            </Campo>
          )}
        </div>
        <Campo rotulo="Motivo">
          <Entrada name="motivo" placeholder={estado?.tipo === 'saida' ? 'perda / uso interno / teste...' : 'compra avulsa / sobra / devolucao...'} />
        </Campo>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{t('acoes.confirmar')}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function ModalAjuste({ estado, materiais, erro, onSubmit, onFechar }: {
  estado: ModalAjusteState;
  materiais: Material[];
  erro: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onFechar: () => void;
}) {
  const { t } = useTranslation();
  const [materialId, setMaterialId] = useState('');
  const material = materiais.find((m) => m.id === materialId);

  useEffect(() => {
    setMaterialId(estado?.materialId ?? '');
  }, [estado]);

  return (
    <Modal aberto={!!estado} titulo="Ajustar saldo fisico" onFechar={onFechar}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Campo rotulo="Material">
          <Selecao name="material_id" required value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">-</option>
            {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Selecao>
        </Campo>
        {material && (
          <div className="rounded-xl bg-surface-2 p-3 text-xs text-texto-2">
            Saldo no sistema: <strong className="text-ink">{Number(material.saldo).toLocaleString()} {material.unidade_consumo}</strong>.
            Informe quanto existe fisicamente agora.
          </div>
        )}
        <Campo rotulo={`Saldo contado${material ? ` (${material.unidade_consumo})` : ''}`}>
          <Entrada name="saldo_fisico" type="number" step="any" min="0" required />
        </Campo>
        <Campo rotulo="Motivo">
          <Entrada name="motivo" placeholder="inventario, perda, sobra, correcao..." />
        </Campo>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{t('acoes.confirmar')}</Botao>
        </div>
      </form>
    </Modal>
  );
}

function ModalNovaCompra({ estado, materiais, onFechar, onSucesso }: {
  estado: ModalCompraState;
  materiais: Material[];
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const { t } = useTranslation();
  const { ativa, formato } = useAuth();
  const fornecedores = useLista<{ id: string; nome: string }>('fornecedor', { ordem: 'nome', desc: false });
  const [itens, setItens] = useState<ItemCompraDraft[]>([{ material_id: '', quantidade: 1, custo: '' }]);
  const [frete, setFrete] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const compraEditando = estado?.compra ?? null;

  const itensCompra = useQuery({
    queryKey: ['compra_item', compraEditando?.id],
    enabled: !!compraEditando?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compra_item')
        .select('id, material_id, quantidade, custo_unit, recebido')
        .eq('compra_id', compraEditando!.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as CompraItem[];
    },
  });

  useEffect(() => {
    if (!estado) {
      setItens([{ material_id: '', quantidade: 1, custo: '' }]);
      setFrete('');
      setErro(null);
      return;
    }
    setFrete(deCentavos(estado.compra?.frete ?? 0));
    if (estado.itens) {
      setItens(estado.itens);
      return;
    }
    if (estado.compra && itensCompra.data) {
      setItens(itensCompra.data.map((item) => ({
        material_id: item.material_id,
        quantidade: Number(item.quantidade),
        custo: deCentavos(Number(item.custo_unit)),
      })));
      return;
    }
    if (!estado.compra) setItens([{ material_id: '', quantidade: 1, custo: '' }]);
  }, [estado, itensCompra.data]);

  const totalItens = itens.reduce((s, i) => s + paraCentavos(i.custo || '0') * (i.quantidade || 0), 0);
  const totalCompra = totalItens + paraCentavos(frete || '0');

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const validos = itens.filter((i) => i.material_id && i.quantidade > 0);
    if (validos.length === 0) {
      setErro(t('estoque.compraSemItens'));
      return;
    }
    const payloadCompra = {
      fornecedor_id: (f.get('fornecedor_id') as string) || null,
      previsao: (f.get('previsao') as string) || null,
      frete: paraCentavos(frete || '0'),
      total: totalItens,
      observacoes: ((f.get('observacoes') as string) || '').trim() || null,
    };

    let compraId = compraEditando?.id;
    if (compraEditando) {
      const { error } = await supabase.from('compra').update(payloadCompra).eq('id', compraEditando.id);
      if (error) {
        setErro(mensagemErro(error));
        return;
      }
      const { error: erroLimpar } = await supabase
        .from('compra_item')
        .update({ deleted_at: new Date().toISOString() })
        .eq('compra_id', compraEditando.id)
        .eq('recebido', false);
      if (erroLimpar) {
        setErro(mensagemErro(erroLimpar));
        return;
      }
    } else {
      const { data: compra, error } = await supabase
        .from('compra')
        .insert({ tenant_id: ativa?.tenant_id, numero: '', status: 'enviado', ...payloadCompra })
        .select('id')
        .single();
      if (error) {
        setErro(mensagemErro(error));
        return;
      }
      compraId = compra.id;
    }

    const { error: erroItens } = await supabase.from('compra_item').insert(
      validos.map((i) => ({
        tenant_id: ativa?.tenant_id,
        compra_id: compraId,
        material_id: i.material_id,
        quantidade: i.quantidade,
        custo_unit: paraCentavos(i.custo || '0'),
      })),
    );
    if (erroItens) setErro(mensagemErro(erroItens));
    else {
      setItens([{ material_id: '', quantidade: 1, custo: '' }]);
      setFrete('');
      setErro(null);
      onSucesso();
    }
  }

  return (
    <Modal aberto={!!estado} titulo={compraEditando ? t('estoque.editarCompra') : t('estoque.novaCompra')} onFechar={onFechar} largura="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={t('nav.fornecedores')}>
            <Selecao name="fornecedor_id" defaultValue={compraEditando?.fornecedor_id ?? ''}>
              <option value="">-</option>
              {(fornecedores.data ?? []).map((fo) => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo={t('estoque.previsao')}>
            <Entrada name="previsao" type="date" defaultValue={compraEditando?.previsao ?? ''} />
          </Campo>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold text-texto-2">{t('estoque.itensCompra')}</p>
          {compraEditando && itensCompra.isLoading ? <Carregando /> : (
            <div className="space-y-2">
              {itens.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_72px_88px_28px] items-center gap-1.5">
                  <Selecao value={item.material_id} onChange={(e) => setItens(itens.map((x, j) => j === i ? { ...x, material_id: e.target.value } : x))}>
                    <option value="">-</option>
                    {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.unidade_compra})</option>)}
                  </Selecao>
                  <Entrada type="number" step="any" min="0.01" placeholder="Qtd." value={item.quantidade || ''} onChange={(e) => setItens(itens.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))} />
                  <EntradaDinheiro value={item.custo} onChange={(e) => setItens(itens.map((x, j) => j === i ? { ...x, custo: e.target.value } : x))} />
                  <button type="button" className="text-texto-2 hover:text-erro" onClick={() => setItens(itens.filter((_, j) => j !== i))}>x</button>
                </div>
              ))}
            </div>
          )}
          <Botao type="button" variante="fantasma" className="mt-1.5 !px-2 !py-1 !text-[11px]" onClick={() => setItens([...itens, { material_id: '', quantidade: 1, custo: '' }])}>
            + {t('acoes.adicionar')}
          </Botao>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={t('estoque.freteCompra')}>
            <EntradaDinheiro value={frete} onChange={(e) => setFrete(e.target.value)} />
          </Campo>
          <Campo rotulo={t('estoque.observacoesCompra')}>
            <Entrada name="observacoes" defaultValue={compraEditando?.observacoes ?? ''} />
          </Campo>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
          <span className="text-xs font-bold uppercase text-texto-2">{t('orcamento.total')}</span>
          <span className="font-extrabold tabular-nums text-ink">{moeda(totalCompra, formato)}</span>
        </div>

        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{compraEditando ? t('acoes.salvar') : t('acoes.criar')}</Botao>
        </div>
      </form>
    </Modal>
  );
}
