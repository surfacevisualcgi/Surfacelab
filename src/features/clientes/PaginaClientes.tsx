/**
 * Tela 15 - Clientes. Mantem LGPD/PII, mas apresenta uma central operacional:
 * KPIs, filtros, lista de relacionamento e painel de detalhes do cliente.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { supabase } from '@/lib/supabase';
import { VERSAO_TERMOS } from '@/auth/AuthProvider';
import { moeda, type FormatoTenant } from '@/lib/formato';
import { enviarFoto } from '@/lib/fotos';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import {
  Botao, Campo, Carregando, Entrada, EstadoErro, EstadoVazio,
  Etiqueta, Modal, Selecao,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface ClienteView {
  id: string;
  tenant_id?: string;
  tipo: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone_whatsapp: string | null;
  foto: string | null;
  cep: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  canal_origem: string | null;
  indicacao: string | null;
  observacoes: string | null;
  consentimento_marketing: boolean;
  consentimento_em?: string | null;
  consentimento_versao?: string | null;
  anonimizado: boolean;
  pii_visivel: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

interface PedidoCliente {
  id: string;
  numero: string;
  cliente_id: string | null;
  total: number;
  status: string;
  prazo_entrega: string | null;
  aprovado_em: string | null;
  concluido_em: string | null;
  entregue_em: string | null;
  created_at: string;
  updated_at: string;
}

interface ResumoCliente {
  totalPedidos: number;
  pedidosAbertos: number;
  totalComprado: number;
  ultimoPedido: string | null;
  ticketMedio: number;
  recentes: PedidoCliente[];
}

type FiltroChip = 'todos' | 'pf' | 'pj' | 'recorrentes' | 'sem_recente';

export function PaginaClientes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pode, flag, formato, ativa } = useAuth();
  const lista = useLista<ClienteView>('v_cliente', { ordem: 'nome', desc: false });
  const pedidos = useLista<PedidoCliente>('v_pedido', {
    selecao: 'id, numero, cliente_id, total, status, prazo_entrega, aprovado_em, concluido_em, entregue_em, created_at, updated_at',
    ordem: 'updated_at',
    desc: true,
  });
  const crud = useCrud('cliente', ['v_cliente']);

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [chip, setChip] = useState<FiltroChip>('todos');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<ClienteView> | null>(null);
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [confirmaAnonimizar, setConfirmaAnonimizar] = useState<ClienteView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podePii = flag('ver_pii_cliente');

  const clientes = useMemo(
    () => (lista.data ?? []).filter((c) => !c.deleted_at),
    [lista.data],
  );

  const resumoPorCliente = useMemo(() => {
    const mapa = new Map<string, ResumoCliente>();
    for (const c of clientes) {
      mapa.set(c.id, { totalPedidos: 0, pedidosAbertos: 0, totalComprado: 0, ultimoPedido: null, ticketMedio: 0, recentes: [] });
    }

    for (const p of pedidos.data ?? []) {
      if (!p.cliente_id || p.status === 'cancelado') continue;
      const atual = mapa.get(p.cliente_id);
      if (!atual) continue;
      const data = p.entregue_em ?? p.concluido_em ?? p.aprovado_em ?? p.updated_at ?? p.created_at;
      atual.totalPedidos += 1;
      atual.totalComprado += Number(p.total ?? 0);
      if (!['concluido', 'cancelado'].includes(p.status) && !p.entregue_em) atual.pedidosAbertos += 1;
      if (!atual.ultimoPedido || new Date(data).getTime() > new Date(atual.ultimoPedido).getTime()) atual.ultimoPedido = data;
      atual.recentes.push(p);
    }

    for (const resumo of mapa.values()) {
      resumo.ticketMedio = resumo.totalPedidos ? Math.round(resumo.totalComprado / resumo.totalPedidos) : 0;
      resumo.recentes = resumo.recentes
        .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
        .slice(0, 4);
    }
    return mapa;
  }, [clientes, pedidos.data]);

  const kpis = useMemo(() => {
    const ativos = clientes.filter((c) => !c.anonimizado).length;
    const pedidosValidos = (pedidos.data ?? []).filter((p) => p.status !== 'cancelado');
    const emProducao = pedidosValidos.filter((p) => !['concluido'].includes(p.status) && !p.entregue_em).length;
    const receita = pedidosValidos.reduce((s, p) => s + Number(p.total ?? 0), 0);
    const limite = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const semPedido60 = clientes.filter((c) => {
      const ultimo = resumoPorCliente.get(c.id)?.ultimoPedido;
      return !ultimo || new Date(ultimo).getTime() < limite;
    }).length;
    return { ativos, emProducao, receita, semPedido60 };
  }, [clientes, pedidos.data, resumoPorCliente]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const limite = Date.now() - 60 * 24 * 60 * 60 * 1000;
    return clientes.filter((c) => {
      const resumo = resumoPorCliente.get(c.id);
      const ultimo = resumo?.ultimoPedido ? new Date(resumo.ultimoPedido).getTime() : 0;
      const texto = [
        c.nome, c.email, c.telefone_whatsapp, c.cidade, c.estado, c.canal_origem, c.indicacao,
      ].filter(Boolean).join(' ').toLowerCase();
      const bateBusca = !termo || texto.includes(termo);
      const bateTipo = filtroTipo === 'todos' || c.tipo === filtroTipo;
      const bateStatus = filtroStatus === 'todos'
        || (filtroStatus === 'ativo' ? !c.anonimizado : c.anonimizado)
        || (filtroStatus === 'com_pedido_aberto' && (resumo?.pedidosAbertos ?? 0) > 0);
      const bateOrigem = filtroOrigem === 'todos' || c.canal_origem === filtroOrigem;
      const bateChip =
        chip === 'todos'
        || (chip === 'pf' && c.tipo === 'pf')
        || (chip === 'pj' && c.tipo === 'pj')
        || (chip === 'recorrentes' && (resumo?.totalPedidos ?? 0) >= 2)
        || (chip === 'sem_recente' && (!ultimo || ultimo < limite));
      return bateBusca && bateTipo && bateStatus && bateOrigem && bateChip;
    });
  }, [busca, chip, clientes, filtroOrigem, filtroStatus, filtroTipo, resumoPorCliente]);

  const selecionado = filtrados.find((c) => c.id === selecionadoId) ?? filtrados[0] ?? null;
  const resumoSelecionado = selecionado ? resumoPorCliente.get(selecionado.id) : null;

  function abrirFicha(c: ClienteView) {
    setEditando(c);
    setFotoNova(null);
    if (podePii) supabase.rpc('registrar_acesso_pii', { p_entidade: 'cliente', p_id: c.id });
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const consentiu = f.get('consentimento_marketing') === 'on';
    const valores: Record<string, unknown> = {
      nome: f.get('nome') as string,
      tipo: f.get('tipo') as string,
      cidade: (f.get('cidade') as string) || null,
      estado: (f.get('estado') as string) || null,
      canal_origem: (f.get('canal_origem') as string) || null,
      indicacao: (f.get('indicacao') as string) || null,
    };
    if (podePii) {
      let foto = editando.foto ?? null;
      if (fotoNova && ativa) foto = await enviarFoto(ativa.tenant_id, 'clientes', fotoNova);
      Object.assign(valores, {
        cpf_cnpj: (f.get('cpf_cnpj') as string) || null,
        email: (f.get('email') as string) || null,
        telefone_whatsapp: (f.get('telefone_whatsapp') as string) || null,
        foto,
        endereco: (f.get('endereco') as string) || null,
        cep: (f.get('cep') as string) || null,
        observacoes: (f.get('observacoes') as string) || null,
      });
    }
    if (consentiu !== !!editando.consentimento_marketing) {
      valores.consentimento_marketing = consentiu;
      valores.consentimento_em = consentiu ? new Date().toISOString() : null;
      valores.consentimento_versao = consentiu ? VERSAO_TERMOS : null;
    }
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setFotoNova(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function anonimizar() {
    if (!confirmaAnonimizar) return;
    const { error } = await supabase.rpc('anonimizar_cliente', { p_cliente: confirmaAnonimizar.id });
    if (error) setErro(mensagemErro(error));
    else {
      setConfirmaAnonimizar(null);
      setEditando(null);
      crud.invalidar();
    }
  }

  async function exportarDados(c: ClienteView) {
    const { data, error } = await supabase.rpc('exportar_dados_cliente', { p_cliente: c.id });
    if (error) { setErro(mensagemErro(error)); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cliente-${c.nome.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function limparFiltros() {
    setBusca('');
    setFiltroTipo('todos');
    setFiltroStatus('todos');
    setFiltroOrigem('todos');
    setChip('todos');
  }

  if (lista.isLoading || pedidos.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div className="mx-auto flex w-full flex-col gap-4 lg:h-[calc(100dvh-112px)] lg:min-h-0 lg:overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('cliente.titulo')}</h1>
          <p className="mt-1 text-sm text-texto-2">Organize clientes, historico, pedidos e relacionamento.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Botao variante="secundario" className="h-11 sm:min-w-40">Importar contatos</Botao>
          {pode('clientes', 'criar') && (
            <Botao className="h-11 sm:min-w-44 shadow-lg shadow-ink/10" onClick={() => setEditando({ tipo: 'pf' })}>
              + Novo cliente
            </Botao>
          )}
        </div>
      </div>

      {erro && <p className="rounded-xl border border-erro/30 bg-erro/5 px-3 py-2 text-xs font-semibold text-erro">{erro}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCliente icone="clientes" rotulo="Clientes ativos" valor={kpis.ativos} apoio="Base atual" destaque />
        <KpiCliente icone="producao" rotulo="Em producao" valor={kpis.emProducao} apoio="Pedidos abertos" />
        <KpiCliente icone="receita" rotulo="Receita dos clientes" valor={moeda(kpis.receita, formato)} apoio="Historico de pedidos" />
        <KpiCliente icone="alerta" rotulo="Sem pedido ha 60 dias" valor={kpis.semPedido60} apoio="Reativacao sugerida" alerta={kpis.semPedido60 > 0} />
      </div>

      <div className="grid flex-1 gap-4 lg:min-h-0 min-[1500px]:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-borda bg-white">
          <div className="border-b border-borda p-4">
            <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_160px_150px_160px_auto]">
              <Entrada
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente, empresa, telefone..."
              />
              <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="todos">Todos os tipos</option>
                <option value="pf">Pessoa fisica</option>
                <option value="pj">Empresa</option>
              </Selecao>
              <Selecao value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="todos">Status</option>
                <option value="ativo">Ativo</option>
                <option value="anonimizado">LGPD</option>
                <option value="com_pedido_aberto">Com pedido aberto</option>
              </Selecao>
              <Selecao value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
                <option value="todos">Origem</option>
                {(['instagram', 'whatsapp', 'marketplace', 'feira', 'indicacao', 'site', 'outro'] as const).map((origem) => (
                  <option key={origem} value={origem}>{rotuloOrigem(origem)}</option>
                ))}
              </Selecao>
              <Botao variante="secundario" onClick={limparFiltros}>Limpar filtros</Botao>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['todos', 'Todos'],
                ['pf', 'Pessoa fisica'],
                ['pj', 'Empresa'],
                ['recorrentes', 'Recorrentes'],
                ['sem_recente', 'Sem pedido recente'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => setChip(id as FiltroChip)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    chip === id ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {!podePii && (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2">
                Dados sensiveis mascarados por LGPD.
              </p>
            )}
          </div>

          {filtrados.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-8">
              <EstadoVazio acao={pode('clientes', 'criar') ? <Botao onClick={() => setEditando({ tipo: 'pf' })}>+ Novo cliente</Botao> : undefined} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="min-w-[1040px]">
                <div className="grid grid-cols-[minmax(280px,1.5fr)_130px_150px_140px_120px_120px_86px] border-b border-borda bg-surface-2/40 px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide text-texto-2">
                  <span>Cliente</span>
                  <span>Tipo</span>
                  <span>Ultimo pedido</span>
                  <span>Abertos</span>
                  <span>Total gasto</span>
                  <span>Status</span>
                  <span className="text-right">Acoes</span>
                </div>
                {filtrados.map((c) => {
                  const resumo = resumoPorCliente.get(c.id);
                  const ativo = selecionado?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelecionadoId(c.id)}
                      className={`grid w-full grid-cols-[minmax(280px,1.5fr)_130px_150px_140px_120px_120px_86px] items-center border-b border-borda px-4 py-3 text-left text-sm transition ${
                        ativo ? 'bg-brand-roxo/7 ring-1 ring-inset ring-brand-roxo/25' : 'bg-white hover:bg-surface-2/60'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AvatarCliente cliente={c} />
                        <span className="min-w-0">
                          <span className="truncate font-extrabold text-ink">{c.nome}</span>
                          <span className="block truncate text-xs text-texto-2">
                            {subtituloCliente(c, podePii)}
                          </span>
                        </span>
                      </span>
                      <span><Etiqueta cor={c.tipo === 'pj' ? 'azul' : 'cinza'}>{c.tipo === 'pj' ? 'Empresa' : 'Pessoa fisica'}</Etiqueta></span>
                      <span className="text-texto-2">{formatarDataCurta(resumo?.ultimoPedido)}</span>
                      <span className="font-bold tabular-nums text-ink">{resumo?.pedidosAbertos ?? 0} pedidos</span>
                      <span className="font-bold tabular-nums text-ink">{moeda(resumo?.totalComprado ?? 0, formato)}</span>
                      <span><Etiqueta cor={c.anonimizado ? 'cinza' : 'verde'}>{c.anonimizado ? 'LGPD' : 'Ativo'}</Etiqueta></span>
                      <span className="flex justify-end gap-1">
                        {!c.anonimizado && pode('clientes', 'editar') && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); abrirFicha(c); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') abrirFicha(c); }}
                            className="rounded-lg border border-borda bg-white px-2 py-1 text-xs font-bold text-texto-2 hover:text-ink"
                          >
                            Editar
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-borda px-4 py-3 text-xs text-texto-2">
            <span>Mostrando 1 a {filtrados.length} de {clientes.length} clientes</span>
            <span>{filtrados.length} registros</span>
          </div>
        </section>

        <aside className="hidden min-h-0 overflow-y-auto rounded-xl border border-borda bg-white shadow-sm min-[1500px]:block">
          {selecionado ? (
            <PainelCliente
              cliente={selecionado}
              resumo={resumoSelecionado}
              formato={formato}
              podePii={podePii}
              onEditar={() => abrirFicha(selecionado)}
              onNovoPedido={() => navigate('/pedidos')}
            />
          ) : (
            <div className="p-6 text-sm text-texto-2">Selecione um cliente.</div>
          )}
        </aside>
      </div>

      {selecionado && (
        <div className="min-[1500px]:hidden">
          <PainelCliente
            cliente={selecionado}
            resumo={resumoSelecionado}
            formato={formato}
            podePii={podePii}
            onEditar={() => abrirFicha(selecionado)}
            onNovoPedido={() => navigate('/pedidos')}
          />
        </div>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? (editando.nome ?? '') : t('cliente.novo')} onFechar={() => setEditando(null)} largura="max-w-xl">
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            {podePii && (
              <Campo rotulo="Foto do contato" className="col-span-2">
                <div className="flex items-center gap-3">
                  {fotoNova ? (
                    <img src={URL.createObjectURL(fotoNova)} alt="" className="size-16 rounded-2xl object-cover" />
                  ) : (
                    <FotoOuPlaceholder path={editando.foto} alt={editando.nome ?? ''} className="size-16 rounded-2xl object-cover" />
                  )}
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-borda bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface-2">
                    {editando.foto || fotoNova ? 'Alterar foto' : '+ Adicionar foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setFotoNova(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </Campo>
            )}
            <div className="col-span-2 flex gap-1.5" role="tablist">
              {([['pf', 'Pessoa fisica'], ['pj', 'Pessoa juridica']] as const).map(([tipo, rotulo]) => (
                <button key={tipo} type="button" role="tab"
                  aria-selected={(editando.tipo ?? 'pf') === tipo}
                  onClick={() => setEditando({ ...editando, tipo })}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                    (editando.tipo ?? 'pf') === tipo
                      ? 'bg-ink text-white' : 'bg-surface-2 text-texto-2 hover:text-ink'
                  }`}>
                  {rotulo}
                </button>
              ))}
              <input type="hidden" name="tipo" value={editando.tipo ?? 'pf'} />
            </div>
            <Campo rotulo={(editando.tipo ?? 'pf') === 'pj' ? 'Razao social' : t('cliente.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            {podePii && (
              <>
                <Campo rotulo={t('cliente.cpfCnpj')} dica={t('cliente.opcionalLgpd')}>
                  <Entrada name="cpf_cnpj" defaultValue={editando.cpf_cnpj ?? ''} />
                </Campo>
                <Campo rotulo="WhatsApp">
                  <Entrada name="telefone_whatsapp" defaultValue={editando.telefone_whatsapp ?? ''} />
                </Campo>
                <Campo rotulo="E-mail" className="col-span-2 sm:col-span-1">
                  <Entrada name="email" type="email" defaultValue={editando.email ?? ''} />
                </Campo>
                <Campo rotulo="CEP">
                  <Entrada name="cep" defaultValue={editando.cep ?? ''} />
                </Campo>
                <Campo rotulo="Endereco" className="col-span-2" dica={t('cliente.opcionalLgpd')}>
                  <Entrada name="endereco" defaultValue={editando.endereco ?? ''} />
                </Campo>
              </>
            )}
            <Campo rotulo={t('cliente.cidade')}>
              <Entrada name="cidade" defaultValue={editando.cidade ?? ''} />
            </Campo>
            <Campo rotulo="UF">
              <Entrada name="estado" maxLength={2} defaultValue={editando.estado ?? ''} />
            </Campo>
            <Campo rotulo={t('cliente.canalOrigem')}>
              <Selecao name="canal_origem" defaultValue={editando.canal_origem ?? ''}>
                <option value="">-</option>
                {(['instagram', 'whatsapp', 'marketplace', 'feira', 'indicacao', 'site', 'outro'] as const).map((c) => (
                  <option key={c} value={c}>{t(`cliente.canalOrigemLabel.${c}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('cliente.indicacao')}>
              <Entrada name="indicacao" placeholder="Quem indicou?" defaultValue={editando.indicacao ?? ''} />
            </Campo>
            {podePii && (
              <Campo rotulo="Observacoes" className="col-span-2">
                <Entrada name="observacoes" defaultValue={editando.observacoes ?? ''} />
              </Campo>
            )}
            <label className="col-span-2 flex items-start gap-2 text-xs text-texto-2">
              <input type="checkbox" name="consentimento_marketing" defaultChecked={!!editando.consentimento_marketing} className="mt-0.5 accent-brand-azul" />
              {t('cliente.consentimentoMarketing')}
            </label>
            {erro && <p className="col-span-2 text-xs font-semibold text-erro">{erro}</p>}
            <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {editando.id && flag('exportar') && podePii && (
                  <Botao type="button" variante="fantasma" onClick={() => exportarDados(editando as ClienteView)}>
                    {t('cliente.exportarDados')}
                  </Botao>
                )}
                {editando.id && pode('clientes', 'excluir') && podePii && (
                  <Botao type="button" variante="perigo" onClick={() => setConfirmaAnonimizar(editando as ClienteView)}>
                    {t('cliente.anonimizar')}
                  </Botao>
                )}
              </div>
              <div className="flex gap-2">
                <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
                <Botao type="submit">{t('acoes.salvar')}</Botao>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={!!confirmaAnonimizar} titulo={t('cliente.anonimizar')} onFechar={() => setConfirmaAnonimizar(null)}>
        <p className="mb-4 text-sm text-texto">{t('cliente.anonimizarAviso')}</p>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setConfirmaAnonimizar(null)}>{t('acoes.cancelar')}</Botao>
          <Botao variante="perigo" onClick={anonimizar}>{t('acoes.confirmar')}</Botao>
        </div>
      </Modal>
    </div>
  );
}

function KpiCliente({
  icone,
  rotulo,
  valor,
  apoio,
  destaque = false,
  alerta = false,
}: {
  icone: 'clientes' | 'producao' | 'receita' | 'alerta';
  rotulo: string;
  valor: string | number;
  apoio: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <MiniIconeCliente tipo={icone} alerta={alerta} />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink">{rotulo}</p>
          <p className="mt-0.5 truncate text-2xl font-extrabold leading-none tabular-nums text-ink">{valor}</p>
          <p className="text-xs text-texto-2">{apoio}</p>
        </div>
      </div>
      {destaque && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-brand-azul via-brand-roxo to-brand-magenta" />
        </div>
      )}
    </div>
  );
}

function MiniIconeCliente({ tipo, alerta = false }: { tipo: 'clientes' | 'producao' | 'receita' | 'alerta'; alerta?: boolean }) {
  const paths = {
    clientes: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8c0-3 3-5 7-5s7 2 7 5H5Z',
    producao: 'M4 7h16v10H4V7Zm3 3h4v4H7v-4Zm6 0h4v4h-4v-4Z',
    receita: 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm1 14h-2v-1.4a4 4 0 0 1-2.6-1.1l1.2-1.5a3 3 0 0 0 2.2.9c.8 0 1.3-.3 1.3-.9s-.5-.8-1.7-1.2c-1.7-.5-2.7-1.2-2.7-2.8 0-1.3.9-2.3 2.3-2.6V5h2v1.3a4 4 0 0 1 2.1.9L14 8.7a3 3 0 0 0-1.9-.7c-.7 0-1.1.3-1.1.8s.5.7 1.8 1.1c1.8.6 2.6 1.4 2.6 2.9s-.9 2.4-2.4 2.8V17Z',
    alerta: 'M12 3 2 20h20L12 3Zm1 13h-2v2h2v-2Zm0-7h-2v5h2V9Z',
  };
  return (
    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${alerta ? 'bg-erro/10 text-erro' : 'bg-brand-roxo/10 text-brand-roxo'}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={paths[tipo]} />
      </svg>
    </span>
  );
}

function PainelCliente({
  cliente,
  resumo,
  formato,
  podePii,
  onEditar,
  onNovoPedido,
}: {
  cliente: ClienteView;
  resumo: ResumoCliente | null | undefined;
  formato: FormatoTenant;
  podePii: boolean;
  onEditar: () => void;
  onNovoPedido: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-borda p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-ink">Cliente selecionado</h2>
          <Etiqueta cor={cliente.anonimizado ? 'cinza' : 'verde'}>{cliente.anonimizado ? 'LGPD' : 'Ativo'}</Etiqueta>
        </div>
        <div className="flex items-center gap-4">
          <AvatarCliente cliente={cliente} grande />
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold leading-tight text-ink">{cliente.nome}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Etiqueta cor={cliente.tipo === 'pj' ? 'azul' : 'cinza'}>{cliente.tipo === 'pj' ? 'Empresa' : 'Pessoa fisica'}</Etiqueta>
              {cliente.canal_origem && <Etiqueta>{rotuloOrigem(cliente.canal_origem)}</Etiqueta>}
            </div>
            <p className="mt-1 text-xs text-texto-2">Codigo: {codigoCliente(cliente.id)}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        <div className="rounded-xl border border-borda p-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-texto-2">Contato</h4>
          <div className="mt-2 space-y-1 text-sm text-ink">
            <p>WhatsApp: <span className="font-semibold">{podePii ? (cliente.telefone_whatsapp ?? '-') : 'mascarado'}</span></p>
            <p>Email: <span className="font-semibold">{podePii ? (cliente.email ?? '-') : 'mascarado'}</span></p>
            <p>Cidade: <span className="font-semibold">{[cliente.cidade, cliente.estado].filter(Boolean).join(' / ') || '-'}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ResumoMini rotulo="Pedidos totais" valor={resumo?.totalPedidos ?? 0} />
          <ResumoMini rotulo="Em aberto" valor={resumo?.pedidosAbertos ?? 0} />
          <ResumoMini rotulo="Ticket medio" valor={moeda(resumo?.ticketMedio ?? 0, formato)} />
        </div>

        <div className="rounded-xl border border-borda p-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-texto-2">Atividade recente</h4>
          <div className="mt-2 space-y-2">
            {(resumo?.recentes ?? []).length === 0 ? (
              <p className="text-xs text-texto-2">Nenhum pedido registrado.</p>
            ) : (
              resumo!.recentes.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <div>
                    <p className="font-bold text-ink">{rotuloStatusPedido(p.status)}</p>
                    <p className="text-texto-2">{p.numero} · {formatarDataCurta(p.updated_at ?? p.created_at)}</p>
                  </div>
                  <span className="font-bold text-ink">{moeda(p.total ?? 0, formato)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {cliente.observacoes && podePii && (
          <div className="rounded-xl border border-borda p-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-texto-2">Observacoes</h4>
            <p className="mt-2 text-sm text-texto">{cliente.observacoes}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-borda p-4">
        <Botao onClick={onNovoPedido}>Novo pedido</Botao>
        <Botao variante="secundario" onClick={onEditar}>Ver historico</Botao>
        <Botao variante="secundario" onClick={() => abrirWhatsapp(cliente.telefone_whatsapp)}>WhatsApp</Botao>
      </div>
    </div>
  );
}

function ResumoMini({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <p className="mt-1 text-sm font-extrabold text-ink">{valor}</p>
    </div>
  );
}

function AvatarCliente({ cliente, grande = false }: { cliente: ClienteView; grande?: boolean }) {
  if (cliente.foto) {
    return (
      <span className={`block shrink-0 overflow-hidden rounded-2xl bg-surface-2 shadow-sm ${grande ? 'size-20' : 'size-12'}`}>
        <FotoOuPlaceholder path={cliente.foto} alt={cliente.nome} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-azul via-brand-roxo to-brand-magenta font-extrabold text-white shadow-sm ${
      grande ? 'size-20 text-2xl' : 'size-12 text-sm'
    }`}>
      {iniciais(cliente.nome)}
    </span>
  );
}

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'CL';
}

function subtituloCliente(c: ClienteView, podePii: boolean) {
  const contato = podePii ? (c.telefone_whatsapp ?? c.email) : null;
  return [c.tipo === 'pj' ? 'Empresa' : 'Pessoa fisica', contato, [c.cidade, c.estado].filter(Boolean).join(' / ')]
    .filter(Boolean)
    .join(' · ');
}

function rotuloOrigem(origem: string) {
  const mapa: Record<string, string> = {
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    marketplace: 'Marketplace',
    feira: 'Feira',
    indicacao: 'Indicacao',
    site: 'Site',
    outro: 'Outro',
  };
  return mapa[origem] ?? origem;
}

function rotuloStatusPedido(status: string) {
  const mapa: Record<string, string> = {
    criado: 'Pedido criado',
    aprovado: 'Orcamento aprovado',
    em_producao: 'Pedido em producao',
    concluido: 'Pedido concluido',
    cancelado: 'Pedido cancelado',
  };
  return mapa[status] ?? status.replaceAll('_', ' ');
}

function formatarDataCurta(valor?: string | null) {
  if (!valor) return '-';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(valor));
}

function codigoCliente(id: string) {
  return `CLI-${id.slice(0, 4).toUpperCase()}`;
}

function abrirWhatsapp(telefone?: string | null) {
  if (!telefone) return;
  const numero = telefone.replace(/\D/g, '');
  if (!numero) return;
  window.open(`https://wa.me/${numero}`, '_blank', 'noopener,noreferrer');
}
