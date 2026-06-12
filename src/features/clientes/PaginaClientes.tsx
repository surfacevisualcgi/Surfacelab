/**
 * Tela 15 — Clientes. PII sob masking (v_cliente) e direitos LGPD:
 * consentimento de marketing auditável, exportar dados, anonimizar
 * preservando o registro fiscal. Abrir a ficha registra acesso à PII.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { supabase } from '@/lib/supabase';
import { VERSAO_TERMOS } from '@/auth/AuthProvider';
import { moeda } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Entrada, EstadoErro, EstadoVazio,
  Etiqueta, Kpi, Modal, Selecao, TabelaDados,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface ClienteView {
  id: string; tipo: string; nome: string;
  cpf_cnpj: string | null; email: string | null; telefone_whatsapp: string | null;
  cep: string | null; endereco: string | null; cidade: string | null; estado: string | null;
  canal_origem: string | null; indicacao: string | null;
  observacoes: string | null;
  consentimento_marketing: boolean; anonimizado: boolean; pii_visivel: boolean;
}

export function PaginaClientes() {
  const { t } = useTranslation();
  const { pode, flag, formato } = useAuth();
  const lista = useLista<ClienteView>('v_cliente', { ordem: 'nome', desc: false });
  const pedidos = useLista<{ cliente_id: string | null; total: number; status: string }>('v_pedido', {
    selecao: 'cliente_id, total, status',
  });
  const [filtroTipo, setFiltroTipo] = useState('');
  const crud = useCrud('cliente', ['v_cliente']);
  const [editando, setEditando] = useState<Partial<ClienteView> | null>(null);
  const [confirmaAnonimizar, setConfirmaAnonimizar] = useState<ClienteView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podePii = flag('ver_pii_cliente');

  function abrirFicha(c: ClienteView) {
    setEditando(c);
    // LGPD: registra quem visualizou PII
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
      Object.assign(valores, {
        cpf_cnpj: (f.get('cpf_cnpj') as string) || null,
        email: (f.get('email') as string) || null,
        telefone_whatsapp: (f.get('telefone_whatsapp') as string) || null,
        endereco: (f.get('endereco') as string) || null,
        cep: (f.get('cep') as string) || null,
        observacoes: (f.get('observacoes') as string) || null,
      });
    }
    // consentimento: registra data e versão; revogação zera
    if (consentiu !== !!editando.consentimento_marketing) {
      valores.consentimento_marketing = consentiu;
      valores.consentimento_em = consentiu ? new Date().toISOString() : null;
      valores.consentimento_versao = consentiu ? VERSAO_TERMOS : null;
    }
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
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

  const kpis = useMemo(() => {
    const cls = (lista.data ?? []).filter((c) => !c.anonimizado);
    const mesAtual = new Date().toISOString().slice(0, 7);
    const peds = (pedidos.data ?? []).filter((p) => p.status !== 'cancelado');
    return {
      ativos: cls.length,
      novosNoMes: cls.filter((c) => (c as unknown as { created_at?: string }).created_at?.slice(0, 7) === mesAtual).length,
      totalComprado: peds.reduce((s, p) => s + Number(p.total), 0),
      comConsentimento: cls.filter((c) => c.consentimento_marketing).length,
    };
  }, [lista.data, pedidos.data]);

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const filtrados = (lista.data ?? []).filter((c) => !filtroTipo || c.tipo === filtroTipo);

  return (
    <div>
      <CabecalhoPagina
        titulo={t('cliente.titulo')}
        acoes={pode('clientes', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('cliente.novo')}</Botao> : undefined}
      />

      {/* 4 KPIs (v2) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('cliente.kpiAtivos')} destaque>{kpis.ativos}</Kpi>
        <Kpi rotulo={t('cliente.kpiNovos')}>{kpis.novosNoMes}</Kpi>
        <Kpi rotulo={t('cliente.kpiTotalComprado')}>{moeda(kpis.totalComprado, formato)}</Kpi>
        <Kpi rotulo={t('cliente.kpiMarketing')}>{kpis.comConsentimento}</Kpi>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Selecao value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="!w-auto">
          <option value="">{t('cliente.todosTipos')}</option>
          <option value="pf">Pessoa física</option>
          <option value="pj">Pessoa jurídica</option>
        </Selecao>
        {!podePii && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2">
            🔒 {t('cliente.piiMascarada')}
          </p>
        )}
      </div>
      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {filtrados.length === 0 ? (
        <EstadoVazio acao={pode('clientes', 'criar') && !filtroTipo ? <Botao onClick={() => setEditando({})}>+ {t('cliente.novo')}</Botao> : undefined} />
      ) : (
        <TabelaDados<ClienteView>
          colunas={[
            {
              titulo: t('cliente.nome'),
              principal: true,
              render: (c) => (
                <span className={`font-semibold text-ink ${c.anonimizado ? 'opacity-50' : ''}`}>
                  {c.nome} {c.anonimizado && <Etiqueta>LGPD</Etiqueta>}
                  {podePii && c.cpf_cnpj && (
                    <span className="block text-[10px] font-normal text-texto-2">{c.cpf_cnpj}</span>
                  )}
                </span>
              ),
            },
            { titulo: t('cliente.contato'), render: (c) => <span className="text-texto-2">{podePii ? (c.telefone_whatsapp ?? c.email ?? '—') : '•••'}</span> },
            { titulo: t('cliente.cidade'), render: (c) => <span className="text-texto-2">{c.cidade ?? '—'}</span> },
            {
              titulo: 'Marketing',
              render: (c) => (
                <Etiqueta cor={c.consentimento_marketing ? 'verde' : 'cinza'}>
                  {c.consentimento_marketing ? 'Sim' : 'Não'}
                </Etiqueta>
              ),
            },
          ]}
          linhas={filtrados}
          chave={(c) => c.id}
          acoes={(c) =>
            !c.anonimizado && pode('clientes', 'editar') ? (
              <Botao variante="fantasma" onClick={() => abrirFicha(c)}>{t('acoes.editar')}</Botao>
            ) : null
          }
        />
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? (editando.nome ?? '') : t('cliente.novo')} onFechar={() => setEditando(null)} largura="max-w-xl">
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            {/* toggle PF | PJ no topo (modal 05 do v2) */}
            <div className="col-span-2 flex gap-1.5" role="tablist">
              {([['pf', 'Pessoa física'], ['pj', 'Pessoa jurídica']] as const).map(([tipo, rotulo]) => (
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
            <Campo rotulo={(editando.tipo ?? 'pf') === 'pj' ? 'Razão social' : t('cliente.nome')} className="col-span-2">
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
                <Campo rotulo="Endereço" className="col-span-2" dica={t('cliente.opcionalLgpd')}>
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
            {/* origem do cliente: alimenta rentabilidade por canal (relatórios) */}
            <Campo rotulo={t('cliente.canalOrigem')}>
              <Selecao name="canal_origem" defaultValue={editando.canal_origem ?? ''}>
                <option value="">—</option>
                {(['instagram', 'whatsapp', 'marketplace', 'feira', 'indicacao', 'site', 'outro'] as const).map((c) => (
                  <option key={c} value={c}>{t(`cliente.canalOrigemLabel.${c}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('cliente.indicacao')}>
              <Entrada name="indicacao" placeholder="Quem indicou?" defaultValue={editando.indicacao ?? ''} />
            </Campo>
            {podePii && (
              <Campo rotulo="Observações" className="col-span-2">
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
