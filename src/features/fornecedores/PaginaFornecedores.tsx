/** Tela 16 — Fornecedores (CRUD). */
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Modal, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface Fornecedor {
  id: string; nome: string; cnpj: string | null;
  contato_nome: string | null; contato_telefone: string | null;
  prazo_entrega_dias: number | null; pedido_minimo: number | null;
  avaliacao: number | null;
}

export function PaginaFornecedores() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const lista = useLista<Fornecedor>('fornecedor', { ordem: 'nome', desc: false });
  const crud = useCrud('fornecedor');
  const [editando, setEditando] = useState<Partial<Fornecedor> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      cnpj: (f.get('cnpj') as string) || null,
      contato_nome: (f.get('contato_nome') as string) || null,
      contato_telefone: (f.get('contato_telefone') as string) || null,
      prazo_entrega_dias: f.get('prazo_entrega_dias') ? Number(f.get('prazo_entrega_dias')) : null,
      pedido_minimo: f.get('pedido_minimo') ? paraCentavos(f.get('pedido_minimo') as string) : null,
      avaliacao: f.get('avaliacao') ? Number(f.get('avaliacao')) : null,
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
      <CabecalhoPagina
        titulo={t('fornecedor.titulo')}
        acoes={pode('fornecedores', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('fornecedor.novo')}</Botao> : undefined}
      />
      {lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('fornecedores', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('fornecedor.novo')}</Botao> : undefined} />
      ) : (
        <Tabela cabecalhos={[
          t('fornecedor.nome'), 'Contato', t('fornecedor.prazoEntrega'),
          t('fornecedor.pedidoMinimo'), t('fornecedor.avaliacao'), '',
        ]}>
          {lista.data!.map((fo) => (
            <tr key={fo.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{fo.nome}</td>
              <td className="px-3 py-2.5 text-texto-2">{fo.contato_nome ?? fo.contato_telefone ?? '—'}</td>
              <td className="px-3 py-2.5 tabular-nums">{fo.prazo_entrega_dias != null ? `${fo.prazo_entrega_dias}d` : '—'}</td>
              <td className="px-3 py-2.5"><Dinheiro centavos={fo.pedido_minimo} /></td>
              <td className="px-3 py-2.5">{fo.avaliacao ? '★'.repeat(fo.avaliacao) : '—'}</td>
              <td className="px-3 py-2.5 text-right">
                {pode('fornecedores', 'editar') && (
                  <Botao variante="fantasma" onClick={() => setEditando(fo)}>{t('acoes.editar')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={editando?.id ? t('acoes.editar') : t('fornecedor.novo')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('fornecedor.nome')} className="col-span-2">
              <Entrada name="nome" required defaultValue={editando.nome ?? ''} />
            </Campo>
            <Campo rotulo="CNPJ">
              <Entrada name="cnpj" defaultValue={editando.cnpj ?? ''} />
            </Campo>
            <Campo rotulo="Contato">
              <Entrada name="contato_nome" defaultValue={editando.contato_nome ?? ''} />
            </Campo>
            <Campo rotulo="Telefone">
              <Entrada name="contato_telefone" defaultValue={editando.contato_telefone ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.prazoEntrega')}>
              <Entrada name="prazo_entrega_dias" type="number" min="0" defaultValue={editando.prazo_entrega_dias ?? ''} />
            </Campo>
            <Campo rotulo={t('fornecedor.pedidoMinimo')}>
              <Entrada name="pedido_minimo" inputMode="decimal" defaultValue={editando.pedido_minimo != null ? deCentavos(editando.pedido_minimo) : ''} />
            </Campo>
            <Campo rotulo={`${t('fornecedor.avaliacao')} (1–5)`}>
              <Entrada name="avaliacao" type="number" min="1" max="5" defaultValue={editando.avaliacao ?? ''} />
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
