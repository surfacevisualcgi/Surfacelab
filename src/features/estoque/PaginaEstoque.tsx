/**
 * Tela 12 — Estoque & Compras: saldos (cache do ledger), movimentações
 * imutáveis e lançamentos manuais de entrada/saída.
 */
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLista, mensagemErro } from '@/lib/dados';
import { supabase } from '@/lib/supabase';
import { dataCurta, deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada, EstadoErro,
  EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import type { Material } from '../cadastros/PaginaCadastros';

interface Mov {
  id: string; material_id: string; tipo: string; quantidade: number;
  custo_unitario: number; motivo: string | null; created_at: string;
}

export function PaginaEstoque() {
  const { t } = useTranslation();
  const { ativa, pode, formato } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'materiais' | 'movimentacoes'>('materiais');
  const [lancando, setLancando] = useState<'entrada' | 'saida' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const materiais = useLista<Material>('material', { ordem: 'nome', desc: false });
  const movs = useLista<Mov>('movimentacao_estoque', {
    ordem: 'created_at', desc: true, incluirExcluidos: true,
  });

  async function lancar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lancando) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('movimentacao_estoque').insert({
      tenant_id: ativa?.tenant_id,
      material_id: f.get('material_id') as string,
      tipo: lancando,
      quantidade: Number(f.get('quantidade')),
      custo_unitario: lancando === 'entrada' ? paraCentavos(f.get('custo_unitario') as string) : 0,
      motivo: (f.get('motivo') as string) || (lancando === 'entrada' ? 'entrada manual' : 'saída manual'),
      referencia_tipo: 'manual',
    });
    if (error) setErro(mensagemErro(error));
    else {
      setLancando(null);
      setErro(null);
      qc.invalidateQueries({ queryKey: ['material'] });
      qc.invalidateQueries({ queryKey: ['movimentacao_estoque'] });
    }
  }

  if (materiais.isLoading) return <Carregando />;
  if (materiais.isError) return <EstadoErro onRetry={() => materiais.refetch()} />;

  const nomeMaterial = (id: string) => materiais.data?.find((m) => m.id === id)?.nome ?? '—';
  const baixos = (materiais.data ?? []).filter(
    (m) => Number(m.minimo) > 0 && Number(m.saldo) - Number(m.reservado) <= Number(m.minimo),
  );

  return (
    <div>
      <CabecalhoPagina
        titulo={t('estoque.titulo')}
        acoes={pode('estoque', 'criar') ? (
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={() => setLancando('saida')}>− {t('estoque.novaSaida')}</Botao>
            <Botao onClick={() => setLancando('entrada')}>+ {t('estoque.novaEntrada')}</Botao>
          </div>
        ) : undefined}
      />

      {baixos.length > 0 && (
        <div className="mb-4 rounded-xl border border-alerta/40 bg-alerta/5 p-3 text-xs">
          <p className="font-bold text-alerta">⚠ {t('estoque.estoqueBaixo')}:</p>
          <p className="mt-1 text-texto-2">{baixos.map((m) => m.nome).join(' · ')}</p>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-borda">
        {(['materiais', 'movimentacoes'] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              aba === a ? 'border-brand-roxo text-ink' : 'border-transparent text-texto-2 hover:text-ink'}`}>
            {t(`estoque.${a}`)}
          </button>
        ))}
      </div>

      {aba === 'materiais' && (
        (materiais.data ?? []).length === 0 ? <EstadoVazio /> : (
          <Tabela cabecalhos={[
            'Material', t('estoque.saldo'), t('estoque.reservado'), t('estoque.disponivel'),
            t('estoque.custoMedio'), t('estoque.valorEstoque'),
          ]}>
            {materiais.data!.map((m) => {
              const disponivel = Number(m.saldo) - Number(m.reservado);
              const baixo = Number(m.minimo) > 0 && disponivel <= Number(m.minimo);
              return (
                <tr key={m.id} className="hover:bg-surface-2/50">
                  <td className="px-3 py-2.5 font-semibold text-ink">{m.nome}</td>
                  <td className="px-3 py-2.5 tabular-nums">{Number(m.saldo).toLocaleString()} {m.unidade_consumo}</td>
                  <td className="px-3 py-2.5 tabular-nums text-texto-2">{Number(m.reservado).toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">
                    {disponivel.toLocaleString()} {baixo && <Etiqueta cor="vermelho">{t('estoque.estoqueBaixo')}</Etiqueta>}
                  </td>
                  <td className="px-3 py-2.5"><Dinheiro centavos={Math.round(Number(m.custo_medio))} />/{m.unidade_consumo}</td>
                  <td className="px-3 py-2.5 font-semibold"><Dinheiro centavos={Number(m.valor_estoque)} /></td>
                </tr>
              );
            })}
          </Tabela>
        )
      )}

      {aba === 'movimentacoes' && (
        movs.isLoading ? <Carregando /> : (movs.data ?? []).length === 0 ? <EstadoVazio /> : (
          <Tabela cabecalhos={['Data', 'Material', 'Tipo', 'Qtd.', 'Motivo']}>
            {movs.data!.map((mv) => (
              <tr key={mv.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-2.5 text-texto-2">{dataCurta(mv.created_at, formato)}</td>
                <td className="px-3 py-2.5 font-semibold text-ink">{nomeMaterial(mv.material_id)}</td>
                <td className="px-3 py-2.5">
                  <Etiqueta cor={mv.tipo === 'entrada' ? 'verde' : mv.tipo === 'saida' ? 'vermelho' : mv.tipo === 'reserva' ? 'amarelo' : 'cinza'}>
                    {t(`estoque.tipoMov.${mv.tipo}`)}
                  </Etiqueta>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{Number(mv.quantidade).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-texto-2">{mv.motivo ?? '—'}</td>
              </tr>
            ))}
          </Tabela>
        )
      )}

      <Modal aberto={!!lancando} titulo={lancando === 'entrada' ? t('estoque.novaEntrada') : t('estoque.novaSaida')} onFechar={() => setLancando(null)}>
        <form onSubmit={lancar} className="space-y-3">
          <Campo rotulo="Material">
            <Selecao name="material_id" required defaultValue="">
              <option value="">—</option>
              {(materiais.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nome} ({m.unidade_consumo})</option>
              ))}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Quantidade (na unidade de consumo)">
              <Entrada name="quantidade" type="number" step="any" min="0.0001" required />
            </Campo>
            {lancando === 'entrada' && (
              <Campo rotulo="Custo por unidade (R$)" dica="Recalcula o custo médio ponderado">
                <Entrada name="custo_unitario" inputMode="decimal" defaultValue={deCentavos(0)} />
              </Campo>
            )}
          </div>
          <Campo rotulo="Motivo">
            <Entrada name="motivo" placeholder={lancando === 'saida' ? 'perda / inventário / uso interno…' : 'compra avulsa / inventário…'} />
          </Campo>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setLancando(null)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.confirmar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
