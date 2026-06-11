/**
 * Telas 05/06 — Ficha do produto + editor de Composição (BOM).
 * O custo de cada linha é "vivo" (vem dos cadastros); o total atualiza o
 * cache custo_atual do produto.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { custoItemComposicao, SELECAO_COMPOSICAO, type ItemComposicao } from '@/lib/composicao';
import { deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro, Entrada,
  EstadoErro, EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import type { ProdutoView } from './PaginaProdutos';

export function PaginaProdutoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { pode, ativa } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const produto = useQuery({
    queryKey: ['v_produto', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_produto').select('*').eq('id', id).single();
      if (error) throw error;
      return data as ProdutoView & { descricao: string | null };
    },
  });

  const composicao = useQuery({
    queryKey: ['composicao_item', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('composicao_item')
        .select(SELECAO_COMPOSICAO)
        .eq('produto_id', id)
        .is('deleted_at', null)
        .order('ordem');
      if (error) throw error;
      return data as unknown as ItemComposicao[];
    },
  });

  const crudItem = useCrud('composicao_item');
  const [editando, setEditando] = useState<Partial<ItemComposicao> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const modelos = useLista<{ id: string; nome: string }>('modelo_3d', { ordem: 'nome', desc: false });
  const materiais = useLista<{ id: string; nome: string; tipo: string }>('material', { ordem: 'nome', desc: false });
  const tarefas = useLista<{ id: string; nome: string }>('tarefa_mao_obra', { ordem: 'nome', desc: false });

  const total = useMemo(
    () =>
      (composicao.data ?? []).reduce(
        (s, item) => s + custoItemComposicao(item) * Number(item.quantidade),
        0,
      ),
    [composicao.data],
  );

  async function salvarItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando || !id) return;
    const f = new FormData(e.currentTarget);
    const tipo = f.get('tipo') as ItemComposicao['tipo'];
    const valores: Record<string, unknown> = {
      produto_id: id,
      tipo,
      quantidade: Number(f.get('quantidade')),
      unidade: (f.get('unidade') as string) || 'un',
      modelo_id: tipo === 'modelo_impresso' ? (f.get('modelo_id') as string) || null : null,
      material_id: ['componente', 'embalagem'].includes(tipo)
        ? (f.get('material_id') as string) || null
        : tipo === 'modelo_impresso'
          ? (f.get('material_id') as string) || null
          : null,
      tarefa_id: tipo === 'mao_de_obra' ? (f.get('tarefa_id') as string) || null : null,
      tempo_min: tipo === 'mao_de_obra' ? Number(f.get('tempo_min') || 0) : null,
      descricao: (f.get('descricao') as string) || null,
      custo_manual: tipo === 'servico' ? paraCentavos(f.get('custo_manual') as string) : null,
    };
    try {
      if (editando.id) await crudItem.atualizar.mutateAsync({ id: editando.id, ...valores });
      else await crudItem.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['composicao_item', id] });
      // atualiza o cache de custo do produto (valor "vivo" de referência)
      const { data } = await supabase
        .from('composicao_item')
        .select(SELECAO_COMPOSICAO)
        .eq('produto_id', id)
        .is('deleted_at', null);
      const novoTotal = ((data ?? []) as unknown as ItemComposicao[]).reduce(
        (s, it) => s + custoItemComposicao(it) * Number(it.quantidade),
        0,
      );
      await supabase.from('produto').update({ custo_atual: novoTotal }).eq('id', id);
      qc.invalidateQueries({ queryKey: ['v_produto'] });
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function removerItem(itemId: string) {
    await crudItem.excluir.mutateAsync(itemId);
    qc.invalidateQueries({ queryKey: ['composicao_item', id] });
  }

  if (produto.isLoading || composicao.isLoading) return <Carregando />;
  if (produto.isError || !produto.data) return <EstadoErro onRetry={() => produto.refetch()} />;

  const p = produto.data;
  const tipoSel = (editando?.tipo ?? 'componente') as ItemComposicao['tipo'];

  return (
    <div>
      <CabecalhoPagina
        titulo={p.nome}
        subtitulo={p.sku ?? undefined}
        acoes={
          <Botao variante="acento" onClick={() => navigate(`/calculadora?produto=${p.id}`)}>
            {t('produto.calcularPreco')}
          </Botao>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.custoAtual')}</p>
          <p className="mt-1 text-lg font-extrabold text-ink"><Dinheiro centavos={p.custo_atual} /></p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.precoPraticado')}</p>
          <p className="mt-1 text-lg font-extrabold text-ink"><Dinheiro centavos={p.preco_praticado} /></p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.disponibilidade')}</p>
          <p className="mt-1.5"><Etiqueta cor={p.disponibilidade === 'pronta_entrega' ? 'verde' : 'cinza'}>
            {t(`produto.dispLabel.${p.disponibilidade}`)}
          </Etiqueta></p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('produto.totalComposicao')}</p>
          <p className="mt-1 text-lg font-extrabold grad-texto"><Dinheiro centavos={p.custos_visiveis ? total : null} /></p>
        </Cartao>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">{t('produto.composicao')}</h2>
        {pode('produtos', 'editar') && (
          <Botao onClick={() => setEditando({})}>+ {t('produto.adicionarItem')}</Botao>
        )}
      </div>

      {composicao.data!.length === 0 ? (
        <EstadoVazio
          mensagem={t('calculadora.semItens')}
          acao={pode('produtos', 'editar') ? <Botao onClick={() => setEditando({})}>+ {t('produto.adicionarItem')}</Botao> : undefined}
        />
      ) : (
        <Tabela cabecalhos={['Item', 'Tipo', t('produto.quantidade'), t('produto.custoUnit'), t('produto.subtotal'), '']}>
          {composicao.data!.map((item) => {
            const unit = custoItemComposicao(item);
            const nome =
              item.tipo === 'modelo_impresso' ? item.modelo?.nome
              : item.tipo === 'mao_de_obra' ? item.tarefa?.nome
              : item.material?.nome ?? item.descricao;
            return (
              <tr key={item.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-2.5 font-semibold text-ink">{nome ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <Etiqueta cor={item.tipo === 'modelo_impresso' ? 'roxo' : 'cinza'}>
                    {t(`produto.tipoItem.${item.tipo}`)}
                  </Etiqueta>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{Number(item.quantidade)} {item.unidade}</td>
                <td className="px-3 py-2.5"><Dinheiro centavos={p.custos_visiveis ? unit : null} /></td>
                <td className="px-3 py-2.5 font-semibold"><Dinheiro centavos={p.custos_visiveis ? Math.round(unit * Number(item.quantidade)) : null} /></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {pode('produtos', 'editar') && (
                    <>
                      <Botao variante="fantasma" onClick={() => setEditando(item)}>{t('acoes.editar')}</Botao>
                      <Botao variante="fantasma" onClick={() => removerItem(item.id)}>✕</Botao>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </Tabela>
      )}

      <Modal aberto={!!editando} titulo={t('produto.adicionarItem')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvarItem} className="space-y-3" key={editando.id ?? 'novo'}>
            <Campo rotulo="Tipo">
              <Selecao
                name="tipo"
                value={tipoSel}
                onChange={(e) => setEditando({ ...editando, tipo: e.target.value as ItemComposicao['tipo'] })}
              >
                {(['modelo_impresso', 'componente', 'embalagem', 'mao_de_obra', 'servico'] as const).map((tp) => (
                  <option key={tp} value={tp}>{t(`produto.tipoItem.${tp}`)}</option>
                ))}
              </Selecao>
            </Campo>

            {tipoSel === 'modelo_impresso' && (
              <>
                <Campo rotulo={t('nav.modelos')}>
                  <Selecao name="modelo_id" required defaultValue={editando.modelo_id ?? ''}>
                    <option value="">—</option>
                    {(modelos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Material (sobrepõe o recomendado)" dica="Vazio = usa o material recomendado do modelo">
                  <Selecao name="material_id" defaultValue={editando.material_id ?? ''}>
                    <option value="">—</option>
                    {(materiais.data ?? []).filter((m) => m.tipo === 'filamento' || m.tipo === 'resina')
                      .map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </Selecao>
                </Campo>
              </>
            )}

            {(tipoSel === 'componente' || tipoSel === 'embalagem') && (
              <Campo rotulo={t('cadastros.materiais')}>
                <Selecao name="material_id" required defaultValue={editando.material_id ?? ''}>
                  <option value="">—</option>
                  {(materiais.data ?? []).filter((m) =>
                    tipoSel === 'embalagem' ? m.tipo === 'embalagem' : m.tipo !== 'filamento' && m.tipo !== 'resina',
                  ).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </Selecao>
              </Campo>
            )}

            {tipoSel === 'mao_de_obra' && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo={t('cadastros.tarefa.nome')}>
                  <Selecao name="tarefa_id" required defaultValue={editando.tarefa_id ?? ''}>
                    <option value="">—</option>
                    {(tarefas.data ?? []).map((tf) => <option key={tf.id} value={tf.id}>{tf.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Tempo (min)">
                  <Entrada name="tempo_min" type="number" min="0" defaultValue={editando.tempo_min ?? 15} />
                </Campo>
              </div>
            )}

            {tipoSel === 'servico' && (
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Descrição">
                  <Entrada name="descricao" required defaultValue={editando.descricao ?? ''} />
                </Campo>
                <Campo rotulo="Custo (R$)">
                  <Entrada name="custo_manual" inputMode="decimal" defaultValue={deCentavos(Number(editando.custo_manual ?? 0))} />
                </Campo>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo={t('produto.quantidade')}>
                <Entrada name="quantidade" type="number" step="any" min="0.0001" required defaultValue={editando.quantidade ?? 1} />
              </Campo>
              <Campo rotulo="Unidade">
                <Entrada name="unidade" defaultValue={editando.unidade ?? 'un'} />
              </Campo>
            </div>

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
