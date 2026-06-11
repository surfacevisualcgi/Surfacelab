/**
 * Telas 13/19 — Financeiro: contas a pagar/receber, KPIs e lançamentos.
 * Pró-labore só aparece com a flag (o backend nem envia a linha).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Dinheiro, Entrada,
  EstadoErro, EstadoVazio, Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface Lancamento {
  id: string; tipo: 'entrada' | 'saida'; descricao: string; categoria: string;
  vencimento: string; pago_em: string | null; valor: number; status: string;
}

export function PaginaFinanceiro() {
  const { t } = useTranslation();
  const { pode, flag, formato } = useAuth();
  const lista = useLista<Lancamento>('lancamento', { ordem: 'vencimento', desc: true });
  const crud = useCrud('lancamento');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const kpis = useMemo(() => {
    const pendentes = (lista.data ?? []).filter((l) => l.status === 'pendente');
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      aReceber: pendentes.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0),
      aPagar: pendentes.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0),
      atrasados: pendentes.filter((l) => l.vencimento < hoje).length,
    };
  }, [lista.data]);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await crud.criar.mutateAsync({
        tipo: f.get('tipo') as string,
        descricao: f.get('descricao') as string,
        categoria: f.get('categoria') as string,
        vencimento: f.get('vencimento') as string,
        valor: paraCentavos(f.get('valor') as string),
        origem_tipo: 'manual',
      });
      setNovo(false);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function marcarPago(l: Lancamento) {
    await crud.atualizar.mutateAsync({
      id: l.id, status: 'pago', pago_em: new Date().toISOString().slice(0, 10),
    });
  }

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  const categorias = ['vendas', 'insumos', 'frete', 'energia', 'aluguel', 'software',
    'contador', 'marketing', 'manutencao', ...(flag('ver_prolabore') ? ['prolabore'] : []), 'outros'];

  return (
    <div>
      <CabecalhoPagina
        titulo={t('financeiro.titulo')}
        acoes={pode('financeiro', 'criar') ? <Botao onClick={() => setNovo(true)}>+ {t('financeiro.novoLancamento')}</Botao> : undefined}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('financeiro.aReceber')}</p>
          <p className="mt-1 text-lg font-extrabold text-ok"><Dinheiro centavos={kpis.aReceber} /></p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('financeiro.aPagar')}</p>
          <p className="mt-1 text-lg font-extrabold text-erro"><Dinheiro centavos={kpis.aPagar} /></p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('financeiro.atrasados')}</p>
          <p className="mt-1 text-lg font-extrabold text-ink">{kpis.atrasados}</p>
        </Cartao>
      </div>

      {lista.data!.length === 0 ? (
        <EstadoVazio />
      ) : (
        <Tabela cabecalhos={[
          t('financeiro.descricao'), t('financeiro.categoria'), t('financeiro.vencimento'),
          t('financeiro.valor'), t('orcamento.status'), '',
        ]}>
          {lista.data!.map((l) => (
            <tr key={l.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{l.descricao}</td>
              <td className="px-3 py-2.5 text-texto-2">{l.categoria}</td>
              <td className="px-3 py-2.5 text-texto-2">{dataCurta(l.vencimento, formato)}</td>
              <td className={`px-3 py-2.5 font-semibold ${l.tipo === 'entrada' ? 'text-ok' : 'text-erro'}`}>
                {l.tipo === 'entrada' ? '+' : '−'}<Dinheiro centavos={Number(l.valor)} />
              </td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={l.status === 'pago' ? 'verde' : l.status === 'cancelado' ? 'cinza' : 'amarelo'}>
                  {t(`financeiro.statusLabel.${l.status}`)}
                </Etiqueta>
              </td>
              <td className="px-3 py-2.5 text-right">
                {l.status === 'pendente' && pode('financeiro', 'editar') && (
                  <Botao variante="fantasma" onClick={() => marcarPago(l)}>{t('financeiro.marcarPago')}</Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={novo} titulo={t('financeiro.novoLancamento')} onFechar={() => setNovo(false)}>
        <form onSubmit={salvar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo">
              <Selecao name="tipo" defaultValue="saida">
                <option value="entrada">{t('financeiro.tipoLabel.entrada')}</option>
                <option value="saida">{t('financeiro.tipoLabel.saida')}</option>
              </Selecao>
            </Campo>
            <Campo rotulo={t('financeiro.categoria')}>
              <Selecao name="categoria" defaultValue="outros">
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </Selecao>
            </Campo>
          </div>
          <Campo rotulo={t('financeiro.descricao')}>
            <Entrada name="descricao" required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={t('financeiro.vencimento')}>
              <Entrada name="vencimento" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo rotulo={`${t('financeiro.valor')} (R$)`}>
              <Entrada name="valor" inputMode="decimal" required defaultValue={deCentavos(0)} />
            </Campo>
          </div>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setNovo(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.salvar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
