/**
 * Tela 02/05 — Catálogo de produtos (item vendável).
 * Leitura via v_produto (custos mascarados sem flag); escrita na tabela base.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

export interface ProdutoView {
  id: string;
  sku: string | null;
  nome: string;
  status: string;
  disponibilidade: string;
  custo_atual: number | null; // null = mascarado
  preco_sugerido: number | null;
  preco_praticado: number;
  custos_visiveis: boolean;
}

export function PaginaProdutos() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const lista = useLista<ProdutoView>('v_produto', { ordem: 'nome', desc: false });
  const crud = useCrud('produto', ['v_produto']);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const { id } = await crud.criar.mutateAsync({
        nome: f.get('nome') as string,
        sku: (f.get('sku') as string) || null,
        disponibilidade: f.get('disponibilidade') as string,
      });
      setNovo(false);
      navigate(`/produtos/${id}`);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <CabecalhoPagina
        titulo={t('produto.titulo')}
        acoes={pode('produtos', 'criar') ? <Botao onClick={() => setNovo(true)}>+ {t('produto.novo')}</Botao> : undefined}
      />
      {lista.data!.length === 0 ? (
        <EstadoVazio acao={pode('produtos', 'criar') ? <Botao onClick={() => setNovo(true)}>+ {t('produto.novo')}</Botao> : undefined} />
      ) : (
        <Tabela cabecalhos={[
          t('produto.nome'), t('produto.disponibilidade'),
          t('produto.custoAtual'), t('produto.precoPraticado'), '',
        ]}>
          {lista.data!.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5">
                <Link to={`/produtos/${p.id}`} className="font-semibold text-ink hover:text-brand-azul">
                  {p.nome}
                </Link>
                {p.sku && <span className="ml-1.5 text-xs text-texto-2">{p.sku}</span>}
              </td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={p.disponibilidade === 'pronta_entrega' ? 'verde' : 'cinza'}>
                  {t(`produto.dispLabel.${p.disponibilidade}`)}
                </Etiqueta>
              </td>
              <td className="px-3 py-2.5"><Dinheiro centavos={p.custo_atual} /></td>
              <td className="px-3 py-2.5"><Dinheiro centavos={p.preco_praticado} /></td>
              <td className="px-3 py-2.5 text-right">
                <Botao variante="fantasma" onClick={() => navigate(`/calculadora?produto=${p.id}`)}>
                  {t('produto.calcularPreco')}
                </Botao>
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={novo} titulo={t('produto.novo')} onFechar={() => setNovo(false)}>
        <form onSubmit={criar} className="space-y-3">
          <Campo rotulo={t('produto.nome')}>
            <Entrada name="nome" required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('produto.sku')}>
              <Entrada name="sku" />
            </Campo>
            <Campo rotulo={t('produto.disponibilidade')}>
              <Selecao name="disponibilidade" defaultValue="sob_demanda">
                <option value="sob_demanda">{t('produto.dispLabel.sob_demanda')}</option>
                <option value="pronta_entrega">{t('produto.dispLabel.pronta_entrega')}</option>
              </Selecao>
            </Campo>
          </div>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setNovo(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.criar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
