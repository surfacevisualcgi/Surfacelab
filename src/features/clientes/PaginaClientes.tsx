/**
 * Tela 15 — Clientes. PII sob masking (v_cliente) e direitos LGPD:
 * consentimento de marketing auditável, exportar dados, anonimizar
 * preservando o registro fiscal. Abrir a ficha registra acesso à PII.
 */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { supabase } from '@/lib/supabase';
import { VERSAO_TERMOS } from '@/auth/AuthProvider';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Entrada, EstadoErro, EstadoVazio,
  Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface ClienteView {
  id: string; tipo: string; nome: string;
  cpf_cnpj: string | null; email: string | null; telefone_whatsapp: string | null;
  cep: string | null; endereco: string | null; cidade: string | null; estado: string | null;
  observacoes: string | null;
  consentimento_marketing: boolean; anonimizado: boolean; pii_visivel: boolean;
}

export function PaginaClientes() {
  const { t } = useTranslation();
  const { pode, flag } = useAuth();
  const lista = useLista<ClienteView>('v_cliente', { ordem: 'nome', desc: false });
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

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <CabecalhoPagina
        titulo={t('cliente.titulo')}
        acoes={pode('clientes', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('cliente.novo')}</Botao> : undefined}
      />
      {!podePii && (
        <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-texto-2">
          🔒 {t('cliente.piiMascarada')}
        </p>
      )}
      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      {lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('clientes', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('cliente.novo')}</Botao> : undefined} />
      ) : (
        <Tabela cabecalhos={[t('cliente.nome'), t('cliente.contato'), t('cliente.cidade'), 'Marketing', '']}>
          {lista.data!.map((c) => (
            <tr key={c.id} className={`hover:bg-surface-2/50 ${c.anonimizado ? 'opacity-50' : ''}`}>
              <td className="px-3 py-2.5 font-semibold text-ink">
                {c.nome} {c.anonimizado && <Etiqueta>LGPD</Etiqueta>}
              </td>
              <td className="px-3 py-2.5 text-texto-2">
                {podePii ? (c.telefone_whatsapp ?? c.email ?? '—') : '•••'}
              </td>
              <td className="px-3 py-2.5 text-texto-2">{c.cidade ?? '—'}</td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={c.consentimento_marketing ? 'verde' : 'cinza'}>
                  {c.consentimento_marketing ? 'Sim' : 'Não'}
                </Etiqueta>
              </td>
              <td className="px-3 py-2.5 text-right">
                {!c.anonimizado && pode('clientes', 'editar') && (
                  <Botao variante="fantasma" onClick={() => abrirFicha(c)}>{t('acoes.editar')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? (editando.nome ?? '') : t('cliente.novo')} onFechar={() => setEditando(null)} largura="max-w-xl">
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('cliente.nome')} className="col-span-2 sm:col-span-1">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo={t('cliente.tipo')}>
              <Selecao name="tipo" defaultValue={editando.tipo ?? 'pf'}>
                <option value="pf">Pessoa física</option>
                <option value="pj">Pessoa jurídica</option>
              </Selecao>
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
