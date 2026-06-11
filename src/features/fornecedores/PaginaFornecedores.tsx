/** Tela 16 — Fornecedores (estrutura v2): 4 KPIs + tabela enxuta com estrelas. */
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Kpi, Modal, TabelaDados,
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

  const kpis = useMemo(() => {
    const fs = lista.data ?? [];
    const comPrazo = fs.filter((fo) => fo.prazo_entrega_dias != null);
    const comNota = fs.filter((fo) => fo.avaliacao != null);
    return {
      ativos: fs.length,
      prazoMedio: comPrazo.length > 0
        ? Math.round(comPrazo.reduce((s, fo) => s + Number(fo.prazo_entrega_dias), 0) / comPrazo.length)
        : null,
      notaMedia: comNota.length > 0
        ? comNota.reduce((s, fo) => s + Number(fo.avaliacao), 0) / comNota.length
        : null,
      comPedidoMinimo: fs.filter((fo) => fo.pedido_minimo != null && fo.pedido_minimo > 0).length,
    };
  }, [lista.data]);

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <CabecalhoPagina
        titulo={t('fornecedor.titulo')}
        acoes={pode('fornecedores', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('fornecedor.novo')}</Botao> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('fornecedor.kpiAtivos')} destaque>{kpis.ativos}</Kpi>
        <Kpi rotulo={t('fornecedor.kpiPrazoMedio')}>{kpis.prazoMedio != null ? `${kpis.prazoMedio}d` : '—'}</Kpi>
        <Kpi rotulo={t('fornecedor.kpiNotaMedia')}>{kpis.notaMedia != null ? `★ ${kpis.notaMedia.toFixed(1)}` : '—'}</Kpi>
        <Kpi rotulo={t('fornecedor.kpiPedidoMinimo')}>{kpis.comPedidoMinimo}</Kpi>
      </div>

      {lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('fornecedores', 'criar') ? <Botao onClick={() => setEditando({})}>+ {t('fornecedor.novo')}</Botao> : undefined} />
      ) : (
        <TabelaDados<Fornecedor>
          colunas={[
            { titulo: t('fornecedor.nome'), principal: true, render: (fo) => <span className="font-semibold text-ink">{fo.nome}</span> },
            { titulo: 'Contato', render: (fo) => <span className="text-texto-2">{fo.contato_nome ?? fo.contato_telefone ?? '—'}</span> },
            { titulo: t('fornecedor.prazoEntrega'), numerica: true, render: (fo) => fo.prazo_entrega_dias != null ? `${fo.prazo_entrega_dias}d` : '—' },
            { titulo: t('fornecedor.pedidoMinimo'), numerica: true, render: (fo) => <Dinheiro centavos={fo.pedido_minimo} /> },
            { titulo: t('fornecedor.avaliacao'), render: (fo) => <span className="text-alerta">{fo.avaliacao ? '★'.repeat(fo.avaliacao) : '—'}</span> },
          ]}
          linhas={lista.data!}
          chave={(fo) => fo.id}
          acoes={(fo) =>
            pode('fornecedores', 'editar') ? (
              <Botao variante="fantasma" onClick={() => setEditando(fo)}>{t('acoes.editar')}</Botao>
            ) : null
          }
        />
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
