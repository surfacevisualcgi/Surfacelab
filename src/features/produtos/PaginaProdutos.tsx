/**
 * Tela 02 — Catálogo de produtos (estrutura v2): busca + filtro numa linha,
 * grade de cards com foto, nome, PREÇO em destaque e linha discreta com
 * margem + chip de status. Leitura via v_produto (custos mascarados).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLista } from '@/lib/dados';
import { percentual } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Etiqueta, Selecao,
} from '@/components/ui';
import { FotoOuPlaceholder } from '@/components/GaleriaFotos';
import { ModalNovoProduto } from './FormularioProduto';
import { useAuth } from '@/auth/AuthProvider';

export interface ProdutoView {
  id: string;
  sku: string | null;
  nome: string;
  status: string;
  categoria_id: string | null;
  disponibilidade: string;
  fotos: string[];
  custo_atual: number | null; // null = mascarado
  preco_sugerido: number | null;
  preco_praticado: number;
  custos_visiveis: boolean;
}

export function PaginaProdutos() {
  const { t } = useTranslation();
  const { pode, formato } = useAuth();
  const lista = useLista<ProdutoView>('v_produto', { ordem: 'nome', desc: false });
  const categorias = useLista<{ id: string; nome: string; escopo: string }>('categoria', { ordem: 'nome', desc: false });
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroDisp, setFiltroDisp] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const categoriasProduto = (categorias.data ?? []).filter((c) => c.escopo === 'produto');

  const filtrados = useMemo(
    () =>
      (lista.data ?? []).filter(
        (p) =>
          (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.sku?.toLowerCase().includes(busca.toLowerCase())) &&
          (!filtroDisp || p.disponibilidade === filtroDisp) &&
          (!filtroCategoria || p.categoria_id === filtroCategoria),
      ),
    [lista.data, busca, filtroDisp, filtroCategoria],
  );

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <CabecalhoPagina
        titulo={t('produto.titulo')}
        subtitulo={t('produto.subtitulo')}
        acoes={pode('produtos', 'criar') ? <Botao onClick={() => setNovo(true)}>+ {t('produto.novo')}</Botao> : undefined}
      />

      {/* barra de busca + filtro enxuta numa linha (v2) */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Entrada
          placeholder={t('acoes.buscar')}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Selecao value={filtroDisp} onChange={(e) => setFiltroDisp(e.target.value)} className="!w-auto">
          <option value="">{t('produto.todasDisponibilidades')}</option>
          <option value="pronta_entrega">{t('produto.dispLabel.pronta_entrega')}</option>
          <option value="sob_demanda">{t('produto.dispLabel.sob_demanda')}</option>
        </Selecao>
        {categoriasProduto.length > 0 && (
          <Selecao value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="!w-auto">
            <option value="">{t('produto.todasCategorias')}</option>
            {categoriasProduto.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        )}
      </div>

      {filtrados.length === 0 ? (
        <EstadoVazio
          mensagem={busca || filtroDisp || filtroCategoria ? t('estados.semResultados') : undefined}
          acao={pode('produtos', 'criar') && !busca ? <Botao onClick={() => setNovo(true)}>+ {t('produto.novo')}</Botao> : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((p) => {
            const preco = p.preco_praticado > 0 ? p.preco_praticado : p.preco_sugerido;
            const margem =
              p.custos_visiveis && preco && p.custo_atual != null && preco > 0
                ? (preco - p.custo_atual) / preco
                : null;
            return (
              <Link key={p.id} to={`/produtos/${p.id}`}
                className="group overflow-hidden rounded-xl border border-borda bg-white transition-shadow hover:shadow-md">
                {/* foto real do Storage (URL assinada) */}
                <FotoOuPlaceholder path={p.fotos?.[0]} alt={p.nome} className="aspect-[4/3] w-full object-cover" />
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-ink group-hover:text-brand-azul">{p.nome}</p>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-ink">
                    {preco ? <Dinheiro centavos={preco} /> : <span className="font-normal text-texto-2">—</span>}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-texto-2">
                    <span>{margem != null ? `${t('produto.margemCurta')} ${percentual(margem, formato)}` : p.sku ?? ''}</span>
                    <Etiqueta cor={p.disponibilidade === 'pronta_entrega' ? 'verde' : 'cinza'}>
                      {t(`produto.dispLabel.${p.disponibilidade}`)}
                    </Etiqueta>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ModalNovoProduto aberto={novo} onFechar={() => setNovo(false)} />
    </div>
  );
}
