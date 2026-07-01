import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, duracao, moeda } from '@/lib/formato';
import { useTenantId } from '@/lib/fotos';
import {
  BarraProgresso,
  Botao,
  Campo,
  Carregando,
  Dinheiro,
  Entrada,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  Modal,
  Selecao,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { ModalFalha } from './ModalFalha';
import { ModalNovoPedido } from './ModalNovoPedido';

interface PedidoView {
  id: string;
  numero: string;
  status: string;
  cliente_snapshot: { nome?: string } | null;
  total: number;
  prazo_entrega: string | null;
  created_at: string;
}

interface ProdutoResumo {
  id: string;
  nome: string;
  fotos?: string[] | null;
}

interface ModeloResumo {
  id: string;
  nome: string;
  tecnologia: string;
  tempo_impressao_min: number;
  peso_peca_g: number;
  peso_suporte_g: number;
  peso_purga_g: number;
  peso_desperdicio_g: number;
}

interface ImpressoraResumo {
  id: string;
  nome: string;
  status: string;
}

interface OpView {
  id: string;
  numero: string;
  pedido_id: string | null;
  produto_id: string | null;
  modelo_id: string | null;
  responsavel_id: string | null;
  impressora_id: string | null;
  quantidade: number;
  status: string;
  prazo: string | null;
  tempo_estimado_min: number;
  tempo_real_min: number | null;
  material_estimado_g: number;
  material_real_g: number | null;
  progresso_pct: number;
  custo_estimado: number | null;
  custo_real: number | null;
  checklist: { item: string; feito: boolean; hora?: string }[] | null;
  config_impressao_snapshot: Record<string, unknown> | null;
  created_at: string;
  pedido: { numero: string; cliente_snapshot: { nome?: string } | null } | null;
  produto: { nome: string; fotos?: string[] | null } | null;
  modelo: { nome: string; tecnologia?: string | null } | null;
  impressora: { nome: string } | null;
}

const COLUNAS_KANBAN = ['aguardando_aprovacao', 'preparar', 'imprimindo', 'acabamento', 'concluido'] as const;
type Coluna = (typeof COLUNAS_KANBAN)[number];

const ROTULO_STATUS: Record<Coluna, string> = {
  aguardando_aprovacao: 'Aguardando',
  preparar: 'Preparar',
  imprimindo: 'Imprimindo',
  acabamento: 'Acabamento',
  concluido: 'Concluido',
};

const SUBTITULO_STATUS: Record<Coluna, string> = {
  aguardando_aprovacao: 'Pedidos aprovados e fila local',
  preparar: 'Separar material e fatiar',
  imprimindo: 'Na maquina agora',
  acabamento: 'Limpeza, pintura e revisao',
  concluido: 'Pronto para entrega/uso',
};

const COR_OP: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho' | 'roxo'> = {
  aguardando_aprovacao: 'cinza',
  preparar: 'azul',
  imprimindo: 'roxo',
  acabamento: 'amarelo',
  concluido: 'verde',
  cancelado: 'vermelho',
};

const COR_PEDIDO: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho'> = {
  criado: 'cinza',
  aprovado: 'azul',
  em_producao: 'amarelo',
  concluido: 'verde',
  cancelado: 'vermelho',
};

type FiltroOrigem = 'todos' | 'cliente' | 'local';
type FiltroPrazo = 'todos' | 'hoje' | 'atrasado' | 'sem_prazo';

function tituloOp(op: OpView): string {
  const snap = op.config_impressao_snapshot ?? {};
  return (
    (typeof snap.titulo === 'string' && snap.titulo.trim()) ||
    op.produto?.nome ||
    op.modelo?.nome ||
    op.pedido?.numero ||
    op.numero
  );
}

function origemOp(op: OpView): 'Cliente' | 'Local' {
  return op.pedido_id ? 'Cliente' : 'Local';
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

function diasAte(data: string | null | undefined) {
  if (!data) return null;
  const base = new Date(`${hojeIso()}T00:00:00`);
  const alvo = new Date(`${data}T00:00:00`);
  return Math.ceil((alvo.getTime() - base.getTime()) / 86400000);
}

function atraso(op: OpView) {
  const d = diasAte(op.prazo);
  return d != null && d < 0 && !['concluido', 'cancelado'].includes(op.status);
}

function MiniIcone({ tipo }: { tipo: 'fila' | 'print' | 'alerta' | 'tempo' | 'local' | 'cliente' }) {
  const paths: Record<typeof tipo, string> = {
    fila: 'M4 5h16v3H4V5Zm0 5h16v3H4v-3Zm0 5h10v3H4v-3Z',
    print: 'M7 3h10v5H7V3Zm-2 7h14a3 3 0 0 1 3 3v5h-4v3H6v-3H2v-5a3 3 0 0 1 3-3Zm3 6v3h8v-3H8Z',
    alerta: 'M12 3 2 20h20L12 3Zm1 13h-2v2h2v-2Zm0-7h-2v5h2V9Z',
    tempo: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5h-2v6l5 3 1-1.7-4-2.3V7Z',
    local: 'M4 5h16v14H4V5Zm3 3v8h10V8H7Zm2 2h6v4H9v-4Z',
    cliente: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4Z',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={paths[tipo]} />
    </svg>
  );
}

export function PaginaPedidos() {
  const { t } = useTranslation();
  const { pode, flag, formato } = useAuth();
  const qc = useQueryClient();
  const [novoPedido, setNovoPedido] = useState(false);
  const [localAberto, setLocalAberto] = useState(false);
  const [falhaOp, setFalhaOp] = useState<{ id: string; numero: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todos');
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>('todos');
  const [colunaMobile, setColunaMobile] = useState<Coluna>('preparar');
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [detalheMobile, setDetalheMobile] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<Coluna | null>(null);
  const [menuMover, setMenuMover] = useState<string | null>(null);

  const pedidos = useLista<PedidoView>('v_pedido', { ordem: 'created_at', desc: true });
  const ops = useLista<OpView>('v_ordem_producao', {
    ordem: 'created_at',
    desc: false,
    selecao: '*, pedido:pedido_id (numero, cliente_snapshot), produto:produto_id (nome, fotos), modelo:modelo_id (nome, tecnologia), impressora:impressora_id (nome)',
  });

  const ordens = useMemo(() => (ops.data ?? []).filter((op) => op.status !== 'cancelado'), [ops.data]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ordens.filter((op) => {
      const texto = [
        op.numero,
        tituloOp(op),
        op.pedido?.numero,
        op.pedido?.cliente_snapshot?.nome,
        op.produto?.nome,
        op.modelo?.nome,
        op.impressora?.nome,
      ].filter(Boolean).join(' ').toLowerCase();
      const bateBusca = !termo || texto.includes(termo);
      const bateOrigem = filtroOrigem === 'todos' || (filtroOrigem === 'cliente' ? !!op.pedido_id : !op.pedido_id);
      const d = diasAte(op.prazo);
      const batePrazo =
        filtroPrazo === 'todos' ||
        (filtroPrazo === 'hoje' && d === 0) ||
        (filtroPrazo === 'atrasado' && atraso(op)) ||
        (filtroPrazo === 'sem_prazo' && !op.prazo);
      return bateBusca && bateOrigem && batePrazo;
    });
  }, [busca, filtroOrigem, filtroPrazo, ordens]);

  const selecionada = useMemo(() => {
    if (!filtradas.length) return null;
    return filtradas.find((op) => op.id === selecionadaId) ?? filtradas[0];
  }, [filtradas, selecionadaId]);

  async function mover(op: OpView, status: string) {
    if (op.status === status || op.status === 'concluido') return;
    setErro(null);
    const snapshotAnterior = qc.getQueriesData<OpView[]>({ queryKey: ['v_ordem_producao'] });
    qc.setQueriesData<OpView[]>({ queryKey: ['v_ordem_producao'] }, (atual) =>
      atual?.map((o) => (o.id === op.id ? { ...o, status } : o)),
    );
    const { error } = await supabase.rpc('mover_ordem_producao', { p_op: op.id, p_status: status });
    if (error) {
      for (const [chave, dados] of snapshotAnterior) qc.setQueryData(chave, dados);
      setErro(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['v_ordem_producao'] });
    qc.invalidateQueries({ queryKey: ['v_pedido'] });
    qc.invalidateQueries({ queryKey: ['material'] });
  }

  async function cancelarPedido(id: string) {
    setErro(null);
    const { error } = await supabase.rpc('cancelar_pedido', { p_pedido: id });
    if (error) setErro(mensagemErro(error));
    qc.invalidateQueries();
  }

  if (pedidos.isLoading || ops.isLoading) return <Carregando />;
  if (pedidos.isError || ops.isError) return <EstadoErro onRetry={() => { pedidos.refetch(); ops.refetch(); }} />;

  const totalAtivas = ordens.filter((op) => !['concluido', 'cancelado'].includes(op.status)).length;
  const imprimindo = ordens.filter((op) => op.status === 'imprimindo').length;
  const atrasadas = ordens.filter(atraso).length;
  const minutosFila = ordens
    .filter((op) => !['concluido', 'cancelado'].includes(op.status))
    .reduce((s, op) => s + Number(op.tempo_estimado_min || 0) * Number(op.quantidade || 1), 0);
  const locais = ordens.filter((op) => !op.pedido_id && op.status !== 'concluido').length;

  const cartoesDe = (coluna: Coluna) => filtradas.filter((op) => op.status === coluna);

  return (
    <div className="mx-auto flex w-full flex-col lg:h-[calc(100dvh-112px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Pedidos & Producao</h1>
          <p className="mt-1 text-sm text-texto-2">
            Controle clientes, impressoes locais e fila de maquinas sem misturar as rotinas.
          </p>
        </div>
        {(pode('pedidos', 'criar') || pode('producao', 'criar')) && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {pode('producao', 'criar') && (
              <Botao variante="secundario" className="h-11 sm:min-w-44" onClick={() => setLocalAberto(true)}>
                + Impressao local
              </Botao>
            )}
            {pode('pedidos', 'criar') && (
              <Botao className="h-11 sm:min-w-44 shadow-lg shadow-ink/10" onClick={() => setNovoPedido(true)}>
                + Novo pedido
              </Botao>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiProducao icone="fila" rotulo="Ordens ativas" valor={totalAtivas} apoio="Na fila agora" />
        <KpiProducao icone="print" rotulo="Imprimindo" valor={imprimindo} apoio="Em maquina" />
        <KpiProducao icone="tempo" rotulo="Carga estimada" valor={duracao(minutosFila)} apoio="Tempo pendente" />
        <KpiProducao icone="alerta" rotulo="Atrasadas" valor={atrasadas} apoio="Precisam atencao" alerta={atrasadas > 0} />
        <KpiProducao icone="local" rotulo="Locais" valor={locais} apoio="Sem cliente vinculado" />
      </div>

      {erro && (
        <p className="mb-3 rounded-lg border border-erro/30 bg-erro/5 px-3 py-2 text-xs font-semibold text-erro">
          {erro}
        </p>
      )}

      <div className="grid flex-1 gap-3 lg:min-h-0 min-[2200px]:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-borda bg-white">
          <div className="border-b border-borda p-3">
            <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_160px_160px_120px]">
              <Entrada
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar OP, cliente, produto, modelo ou impressora..."
              />
              <Selecao value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value as FiltroOrigem)}>
                <option value="todos">Todas origens</option>
                <option value="cliente">Cliente</option>
                <option value="local">Impressao local</option>
              </Selecao>
              <Selecao value={filtroPrazo} onChange={(e) => setFiltroPrazo(e.target.value as FiltroPrazo)}>
                <option value="todos">Todos prazos</option>
                <option value="hoje">Vence hoje</option>
                <option value="atrasado">Atrasadas</option>
                <option value="sem_prazo">Sem prazo</option>
              </Selecao>
              <Botao
                variante="secundario"
                onClick={() => { setBusca(''); setFiltroOrigem('todos'); setFiltroPrazo('todos'); }}
              >
                Limpar
              </Botao>
            </div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'todos' as FiltroOrigem, label: 'Todos' },
                { id: 'cliente' as FiltroOrigem, label: 'Clientes' },
                { id: 'local' as FiltroOrigem, label: 'Local' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFiltroOrigem(item.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    filtroOrigem === item.id ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {[
                { id: 'hoje' as FiltroPrazo, label: 'Hoje' },
                { id: 'atrasado' as FiltroPrazo, label: 'Atrasadas' },
                { id: 'sem_prazo' as FiltroPrazo, label: 'Sem prazo' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFiltroPrazo(filtroPrazo === item.id ? 'todos' : item.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    filtroPrazo === item.id ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {filtradas.length === 0 ? (
            <div className="p-4">
              <EstadoVazio mensagem="Nenhuma ordem de producao para os filtros atuais." />
            </div>
          ) : (
            <>
              <div className="md:hidden">
                <div className="flex gap-1.5 overflow-x-auto border-b border-borda p-3">
                  {COLUNAS_KANBAN.map((coluna) => (
                    <button
                      key={coluna}
                      onClick={() => setColunaMobile(coluna)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                        colunaMobile === coluna ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2'
                      }`}
                    >
                      {ROTULO_STATUS[coluna]} ({cartoesDe(coluna).length})
                    </button>
                  ))}
                </div>
                <div className="space-y-2 p-3">
                  {cartoesDe(colunaMobile).map((op) => (
                    <CartaoOp
                      key={op.id}
                      op={op}
                      selecionado={selecionada?.id === op.id}
                      comMenuMover
                      onSelecionar={() => { setSelecionadaId(op.id); setDetalheMobile(true); }}
                      onMover={mover}
                      onFalha={() => setFalhaOp({ id: op.id, numero: op.numero })}
                      arrastando={arrastando}
                      setArrastando={setArrastando}
                      menuMover={menuMover}
                      setMenuMover={setMenuMover}
                    />
                  ))}
                </div>
              </div>

              <div className="hidden min-h-0 flex-1 gap-3 overflow-x-auto p-3 md:grid md:grid-cols-5">
                {COLUNAS_KANBAN.map((coluna) => {
                  const cartoes = cartoesDe(coluna);
                  return (
                    <div
                      key={coluna}
                      onDragOver={(e) => {
                        if (!arrastando) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setColunaAlvo(coluna);
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setColunaAlvo((c) => (c === coluna ? null : c));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain');
                        const op = ordens.find((o) => o.id === id);
                        setArrastando(null);
                        setColunaAlvo(null);
                        if (op) mover(op, coluna);
                      }}
                      className={`flex min-h-0 min-w-[200px] flex-col rounded-xl border transition-colors xl:min-w-0 ${
                        colunaAlvo === coluna && arrastando
                          ? 'border-brand-roxo bg-brand-roxo/5'
                          : 'border-borda bg-surface-2/70'
                      }`}
                    >
                      <div className="border-b border-borda/70 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-extrabold uppercase tracking-wide text-ink">
                              {ROTULO_STATUS[coluna]}
                            </p>
                            <p className="mt-0.5 text-[11px] text-texto-2">{SUBTITULO_STATUS[coluna]}</p>
                          </div>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-ink">
                            {cartoes.length}
                          </span>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                        {cartoes.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-borda bg-white/60 py-8 text-center text-xs text-texto-2">
                            Vazio
                          </p>
                        ) : (
                          cartoes.map((op) => (
                            <CartaoOp
                              key={op.id}
                              op={op}
                              selecionado={selecionada?.id === op.id}
                              onSelecionar={() => {
                                setSelecionadaId(op.id);
                                if (window.innerWidth < 2200) setDetalheMobile(true);
                              }}
                              onMover={mover}
                              onFalha={() => setFalhaOp({ id: op.id, numero: op.numero })}
                              arrastando={arrastando}
                              setArrastando={setArrastando}
                              menuMover={menuMover}
                              setMenuMover={setMenuMover}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <aside className="hidden min-h-0 overflow-hidden rounded-xl border border-borda bg-white min-[2200px]:block">
          <PainelDetalhe
            op={selecionada}
            formato={formato}
            flagVerCustos={flag('ver_custos')}
            podeEditar={pode('producao', 'editar')}
            onMover={mover}
            onFalha={(op) => setFalhaOp({ id: op.id, numero: op.numero })}
          />
        </aside>
      </div>

      <div className="mt-4 hidden rounded-xl border border-borda bg-white p-3 min-[2200px]:block">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-ink">Pedidos recentes</p>
          <span className="text-xs text-texto-2">{pedidos.data?.length ?? 0} registros</span>
        </div>
        {(pedidos.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-xs text-texto-2">Nenhum pedido criado.</p>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2 2xl:grid-cols-4">
            {(pedidos.data ?? []).slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-borda px-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link to={`/pedidos/${p.id}`} className="font-bold text-ink hover:text-brand-azul">{p.numero}</Link>
                  <p className="truncate text-xs text-texto-2">{p.cliente_snapshot?.nome ?? 'Sem cliente'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Etiqueta cor={COR_PEDIDO[p.status] ?? 'cinza'}>{t(`pedido.statusLabel.${p.status}`)}</Etiqueta>
                  <p className="mt-1 text-xs font-bold tabular-nums text-ink"><Dinheiro centavos={p.total} /></p>
                </div>
                {!['concluido', 'cancelado'].includes(p.status) && pode('pedidos', 'editar') && (
                  <button className="text-[11px] font-bold text-erro hover:underline" onClick={() => cancelarPedido(p.id)}>
                    Cancelar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal aberto={detalheMobile} titulo="Detalhes da producao" onFechar={() => setDetalheMobile(false)} largura="max-w-lg">
        <PainelDetalhe
          op={selecionada}
          formato={formato}
          flagVerCustos={flag('ver_custos')}
          podeEditar={pode('producao', 'editar')}
          onMover={mover}
          onFalha={(op) => setFalhaOp({ id: op.id, numero: op.numero })}
          compacto
        />
      </Modal>

      <ModalFalha
        op={falhaOp}
        onFechar={() => setFalhaOp(null)}
        onSucesso={() => { setFalhaOp(null); qc.invalidateQueries(); }}
      />
      <ModalNovoPedido
        aberto={novoPedido}
        onFechar={() => setNovoPedido(false)}
        onCriado={() => setNovoPedido(false)}
      />
      <ModalImpressaoLocal
        aberto={localAberto}
        onFechar={() => setLocalAberto(false)}
        onCriado={(id) => {
          setLocalAberto(false);
          setSelecionadaId(id);
          qc.invalidateQueries({ queryKey: ['v_ordem_producao'] });
        }}
      />
    </div>
  );
}

function KpiProducao({
  icone,
  rotulo,
  valor,
  apoio,
  alerta = false,
}: {
  icone: 'fila' | 'print' | 'alerta' | 'tempo' | 'local';
  rotulo: string;
  valor: string | number;
  apoio: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          alerta ? 'bg-erro/10 text-erro' : 'bg-brand-roxo/10 text-brand-roxo'
        }`}>
          <MiniIcone tipo={icone} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink">{rotulo}</p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-ink">{valor}</p>
          <p className="text-xs text-texto-2">{apoio}</p>
        </div>
      </div>
    </div>
  );
}

function CartaoOp({
  op,
  selecionado,
  comMenuMover = false,
  onSelecionar,
  onMover,
  onFalha,
  arrastando,
  setArrastando,
  menuMover,
  setMenuMover,
}: {
  op: OpView;
  selecionado: boolean;
  comMenuMover?: boolean;
  onSelecionar: () => void;
  onMover: (op: OpView, status: string) => void;
  onFalha: () => void;
  arrastando: string | null;
  setArrastando: (id: string | null) => void;
  menuMover: string | null;
  setMenuMover: (id: string | null) => void;
}) {
  const { pode } = useAuth();
  const podeMover = pode('producao', 'editar') && op.status !== 'concluido' && op.status !== 'cancelado';
  const idx = COLUNAS_KANBAN.indexOf(op.status as Coluna);
  const proxima = idx >= 0 && idx < COLUNAS_KANBAN.length - 1 ? COLUNAS_KANBAN[idx + 1] : null;
  const prazoDias = diasAte(op.prazo);
  const checklist = Array.isArray(op.checklist) ? op.checklist : [];
  const feitos = checklist.filter((c) => c.feito).length;

  return (
    <button
      type="button"
      draggable={podeMover && !comMenuMover}
      onClick={onSelecionar}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', op.id);
        e.dataTransfer.effectAllowed = 'move';
        setArrastando(op.id);
      }}
      onDragEnd={() => setArrastando(null)}
      className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition ${
        selecionado ? 'border-brand-roxo ring-2 ring-brand-roxo/15' : 'border-borda hover:border-brand-roxo/40'
      } ${arrastando === op.id ? 'opacity-40' : ''} ${podeMover && !comMenuMover ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-extrabold text-brand-roxo">{op.numero}</span>
            <Etiqueta cor={op.pedido_id ? 'azul' : 'roxo'}>{origemOp(op)}</Etiqueta>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-extrabold leading-snug text-ink">{tituloOp(op)}</p>
        </div>
        <Etiqueta cor={COR_OP[op.status] ?? 'cinza'}>{ROTULO_STATUS[op.status as Coluna] ?? op.status}</Etiqueta>
      </div>

      <div className="mt-2 space-y-1 text-xs text-texto-2">
        <p className="truncate">
          {op.pedido_id ? (op.pedido?.cliente_snapshot?.nome ?? op.pedido?.numero ?? 'Cliente') : 'Impressao interna'}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-surface-2 px-2 py-0.5">{Number(op.quantidade)} un.</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5">{duracao(Number(op.tempo_estimado_min || 0))}</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${atraso(op) ? 'bg-erro/10 text-erro' : 'bg-surface-2 text-texto-2'}`}>
            {op.prazo ? (prazoDias === 0 ? 'Hoje' : prazoDias != null && prazoDias > 0 ? `${prazoDias}d` : `${Math.abs(prazoDias ?? 0)}d atrasado`) : 'Sem prazo'}
          </span>
        </div>
      </div>

      <BarraProgresso pct={Number(op.progresso_pct)} className="mt-3" />
      <div className="mt-2 flex items-center justify-between text-[11px] text-texto-2">
        <span>{feitos}/{checklist.length || 0} checklist</span>
        <span>{Math.round(Number(op.progresso_pct || 0))}%</span>
      </div>

      {podeMover && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {comMenuMover ? (
            <div className="relative">
              <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]" onClick={() => setMenuMover(menuMover === op.id ? null : op.id)}>
                Mover
              </Botao>
              {menuMover === op.id && (
                <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-xl border border-borda bg-white p-1 shadow-lg">
                  {COLUNAS_KANBAN.filter((c) => c !== op.status).map((c) => (
                    <button
                      key={c}
                      onClick={() => { setMenuMover(null); onMover(op, c); }}
                      className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold text-ink hover:bg-surface-2"
                    >
                      {ROTULO_STATUS[c]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            proxima && (
              <Botao variante="secundario" className="!px-2 !py-1 !text-[11px]" onClick={() => onMover(op, proxima)}>
                Avancar
              </Botao>
            )
          )}
          <Botao variante="fantasma" className="!px-2 !py-1 !text-[11px]" onClick={onFalha}>
            Falha
          </Botao>
        </div>
      )}
    </button>
  );
}

function PainelDetalhe({
  op,
  formato,
  flagVerCustos,
  podeEditar,
  onMover,
  onFalha,
  compacto = false,
}: {
  op: OpView | null;
  formato: { locale: string; moeda: string };
  flagVerCustos: boolean;
  podeEditar: boolean;
  onMover: (op: OpView, status: string) => void;
  onFalha: (op: OpView) => void;
  compacto?: boolean;
}) {
  if (!op) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-texto-2">
        Selecione uma ordem de producao.
      </div>
    );
  }
  const idx = COLUNAS_KANBAN.indexOf(op.status as Coluna);
  const proxima = idx >= 0 && idx < COLUNAS_KANBAN.length - 1 ? COLUNAS_KANBAN[idx + 1] : null;
  const checklist = Array.isArray(op.checklist) ? op.checklist : [];
  const feitos = checklist.filter((c) => c.feito).length;
  const snap = op.config_impressao_snapshot ?? {};
  const observacoes = typeof snap.observacoes === 'string' ? snap.observacoes : '';

  return (
    <div className={`flex h-full min-h-0 flex-col ${compacto ? '' : 'max-h-full'}`}>
      <div className="border-b border-borda p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Ordem selecionada</p>
            <h2 className="mt-1 text-xl font-extrabold leading-tight text-ink">{tituloOp(op)}</h2>
          </div>
          <Etiqueta cor={COR_OP[op.status] ?? 'cinza'}>{ROTULO_STATUS[op.status as Coluna] ?? op.status}</Etiqueta>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Etiqueta cor={op.pedido_id ? 'azul' : 'roxo'}>{origemOp(op)}</Etiqueta>
          {op.produto_id && <Etiqueta cor="cinza">Produto</Etiqueta>}
          {op.modelo_id && <Etiqueta cor="cinza">Modelo 3D</Etiqueta>}
          {atraso(op) && <Etiqueta cor="vermelho">Atrasada</Etiqueta>}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          <MiniBloco rotulo="Quantidade" valor={`${Number(op.quantidade)} un.`} />
          <MiniBloco rotulo="Prazo" valor={op.prazo ? dataCurta(op.prazo, formato) : 'Sem prazo'} />
          <MiniBloco rotulo="Tempo estimado" valor={duracao(Number(op.tempo_estimado_min || 0))} />
          <MiniBloco rotulo="Material" valor={`${Number(op.material_estimado_g || 0).toLocaleString(formato.locale)} g`} />
        </div>

        <div className="rounded-xl border border-borda p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Progresso</p>
            <span className="text-xs font-bold text-ink">{Math.round(Number(op.progresso_pct || 0))}%</span>
          </div>
          <BarraProgresso pct={Number(op.progresso_pct || 0)} />
          <p className="mt-2 text-xs text-texto-2">{feitos}/{checklist.length || 0} itens de checklist concluidos.</p>
        </div>

        <div className="rounded-xl border border-borda p-3">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Origem</p>
          {op.pedido_id ? (
            <div className="space-y-1 text-sm">
              <p className="font-bold text-ink">{op.pedido?.cliente_snapshot?.nome ?? 'Cliente'}</p>
              <Link to={`/pedidos/${op.pedido_id}`} className="text-xs font-bold text-brand-azul hover:underline">
                Abrir pedido {op.pedido?.numero ?? ''}
              </Link>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="font-bold text-ink">Impressao local</p>
              <p className="text-xs text-texto-2">Uso interno, teste, reposicao ou prototipo.</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-borda p-3">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Execucao</p>
          <dl className="space-y-1.5 text-sm">
            <LinhaDetalhe rotulo="Produto" valor={op.produto?.nome ?? '—'} />
            <LinhaDetalhe rotulo="Modelo" valor={op.modelo?.nome ?? '—'} />
            <LinhaDetalhe rotulo="Impressora" valor={op.impressora?.nome ?? 'Nao definida'} />
            {flagVerCustos && <LinhaDetalhe rotulo="Custo estimado" valor={moeda(op.custo_estimado, formato)} />}
            {flagVerCustos && <LinhaDetalhe rotulo="Custo real" valor={moeda(op.custo_real, formato)} />}
          </dl>
        </div>

        <div className="rounded-xl border border-borda p-3">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Checklist</p>
          {checklist.length === 0 ? (
            <p className="text-xs text-texto-2">Nenhum checklist definido.</p>
          ) : (
            <ul className="space-y-1.5">
              {checklist.slice(0, 6).map((item, i) => (
                <li key={`${item.item}-${i}`} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${item.feito ? 'bg-ok text-white' : 'bg-surface-2 text-texto-2'}`}>
                    {item.feito ? '✓' : ''}
                  </span>
                  <span className={item.feito ? 'text-texto-2 line-through' : 'text-ink'}>{item.item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-borda p-3">
          <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Observacoes</p>
          <p className="text-sm text-ink">{observacoes || 'Sem observacoes cadastradas.'}</p>
        </div>
      </div>

      {podeEditar && !['concluido', 'cancelado'].includes(op.status) && (
        <div className="border-t border-borda p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Botao variante="secundario" onClick={() => onFalha(op)}>Registrar falha</Botao>
            {proxima && <Botao onClick={() => onMover(op, proxima)}>Avancar para {ROTULO_STATUS[proxima]}</Botao>}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniBloco({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className="mt-1 font-extrabold text-ink">{valor}</p>
    </div>
  );
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-texto-2">{rotulo}</dt>
      <dd className="text-right font-semibold text-ink">{valor}</dd>
    </div>
  );
}

function ModalImpressaoLocal({
  aberto,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriado: (id: string) => void;
}) {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const produtos = useLista<ProdutoResumo>('v_produto', { ordem: 'nome', desc: false, selecao: 'id, nome, fotos' });
  const modelos = useLista<ModeloResumo>('modelo_3d', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, tecnologia, tempo_impressao_min, peso_peca_g, peso_suporte_g, peso_purga_g, peso_desperdicio_g',
  });
  const impressoras = useLista<ImpressoraResumo>('impressora', {
    ordem: 'nome',
    desc: false,
    selecao: 'id, nome, status',
  });
  const [tipo, setTipo] = useState<'produto' | 'modelo' | 'avulso'>('produto');
  const [produtoId, setProdutoId] = useState('');
  const [modeloId, setModeloId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [prazo, setPrazo] = useState('');
  const [impressoraId, setImpressoraId] = useState('');
  const [tempo, setTempo] = useState('');
  const [material, setMaterial] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const modeloSelecionado = (modelos.data ?? []).find((m) => m.id === modeloId);
  const produtoSelecionado = (produtos.data ?? []).find((p) => p.id === produtoId);

  function fechar() {
    setTipo('produto');
    setProdutoId('');
    setModeloId('');
    setTitulo('');
    setQuantidade(1);
    setPrazo('');
    setImpressoraId('');
    setTempo('');
    setMaterial('');
    setObservacoes('');
    setErro(null);
    onFechar();
  }

  async function criar() {
    const nome =
      tipo === 'produto'
        ? produtoSelecionado?.nome
        : tipo === 'modelo'
          ? modeloSelecionado?.nome
          : titulo.trim();
    if (!tenantId) { setErro('Empresa ativa nao encontrada.'); return; }
    if (!nome) { setErro('Defina o que sera impresso.'); return; }
    if (!quantidade || quantidade <= 0) { setErro('Quantidade invalida.'); return; }

    const tempoEstimado = Number(tempo || modeloSelecionado?.tempo_impressao_min || 0);
    const materialEstimado = Number(
      material ||
      (modeloSelecionado
        ? Number(modeloSelecionado.peso_peca_g || 0) +
          Number(modeloSelecionado.peso_suporte_g || 0) +
          Number(modeloSelecionado.peso_purga_g || 0) +
          Number(modeloSelecionado.peso_desperdicio_g || 0)
        : 0),
    );

    setSalvando(true);
    setErro(null);
    try {
      const { data, error } = await supabase
        .from('ordem_producao')
        .insert({
          tenant_id: tenantId,
          pedido_id: null,
          produto_id: tipo === 'produto' ? produtoId || null : null,
          modelo_id: tipo === 'modelo' ? modeloId || null : null,
          quantidade,
          status: 'preparar',
          prazo: prazo || null,
          impressora_id: impressoraId || null,
          tempo_estimado_min: tempoEstimado,
          material_estimado_g: materialEstimado,
          config_impressao_snapshot: {
            origem: 'impressao_local',
            tipo,
            titulo: nome,
            observacoes: observacoes.trim() || null,
          },
          checklist: [
            { item: 'Separar material', feito: false },
            { item: 'Conferir arquivo/fatiamento', feito: false },
            { item: 'Iniciar impressao', feito: false },
            { item: 'Revisar acabamento', feito: false },
          ],
        })
        .select('id')
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['v_ordem_producao'] });
      fechar();
      onCriado(data.id);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Nova impressao local" onFechar={fechar} largura="max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { id: 'produto' as const, label: 'Produto cadastrado' },
          { id: 'modelo' as const, label: 'Modelo 3D' },
          { id: 'avulso' as const, label: 'Avulso/teste' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTipo(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              tipo === item.id ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tipo === 'produto' && (
          <Campo rotulo="Produto" className="sm:col-span-2">
            <Selecao value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
              <option value="">Selecione...</option>
              {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Selecao>
          </Campo>
        )}
        {tipo === 'modelo' && (
          <Campo rotulo="Modelo 3D" className="sm:col-span-2">
            <Selecao value={modeloId} onChange={(e) => {
              const id = e.target.value;
              const m = (modelos.data ?? []).find((x) => x.id === id);
              setModeloId(id);
              if (m) {
                setTempo(String(m.tempo_impressao_min || ''));
                setMaterial(String(
                  Number(m.peso_peca_g || 0) +
                  Number(m.peso_suporte_g || 0) +
                  Number(m.peso_purga_g || 0) +
                  Number(m.peso_desperdicio_g || 0),
                ));
              }
            }}>
              <option value="">Selecione...</option>
              {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Selecao>
          </Campo>
        )}
        {tipo === 'avulso' && (
          <Campo rotulo="Nome da impressao" className="sm:col-span-2">
            <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: suporte de bancada, teste de encaixe..." autoFocus />
          </Campo>
        )}

        <Campo rotulo="Quantidade">
          <Entrada type="number" min="1" step="1" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
        </Campo>
        <Campo rotulo="Prazo">
          <Entrada type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
        <Campo rotulo="Impressora">
          <Selecao value={impressoraId} onChange={(e) => setImpressoraId(e.target.value)}>
            <option value="">Definir depois</option>
            {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Tempo estimado (min)">
          <Entrada type="number" min="0" step="1" value={tempo} onChange={(e) => setTempo(e.target.value)} />
        </Campo>
        <Campo rotulo="Material estimado (g)">
          <Entrada type="number" min="0" step="0.01" value={material} onChange={(e) => setMaterial(e.target.value)} />
        </Campo>
        <Campo rotulo="Observacoes" className="sm:col-span-2">
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm text-ink placeholder:text-texto-2/60 focus:border-brand-azul focus:outline-none focus:ring-2 focus:ring-brand-azul/20"
            placeholder="Motivo, material desejado, ajustes de fatiamento..."
          />
        </Campo>
      </div>

      <div className="mt-4 rounded-xl border border-brand-roxo/25 bg-brand-roxo/5 p-3">
        <p className="text-xs font-bold text-brand-roxo">Esta opcao cria uma OP sem pedido de cliente.</p>
        <p className="mt-1 text-xs text-texto-2">
          Use para prototipo, reposicao, presente, teste de material ou impressao interna. Ela aparece no Kanban e pode ser movida normalmente.
        </p>
      </div>

      {erro && <p className="mt-3 text-xs font-semibold text-erro">{erro}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Botao variante="secundario" onClick={fechar}>Cancelar</Botao>
        <Botao disabled={salvando} onClick={criar}>{salvando ? 'Salvando...' : 'Criar OP local'}</Botao>
      </div>
    </Modal>
  );
}
