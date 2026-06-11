/**
 * Tela 14 — lista de orçamentos (leitura via v_orcamento, mascarada).
 */
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLista } from '@/lib/dados';
import { dataCurta } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Carregando, Dinheiro, EstadoErro, EstadoVazio,
  Etiqueta, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

export interface OrcamentoView {
  id: string;
  numero: string;
  status: string;
  cliente_snapshot: { nome?: string } | null;
  validade: string | null;
  total: number;
  custo_total: number | null;
  lucro_estimado: number | null;
  margem_estimada: number | null;
  calculo_snapshot: unknown;
  created_at: string;
}

export const COR_STATUS_ORC: Record<string, 'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho'> = {
  rascunho: 'cinza',
  enviado: 'azul',
  aguardando_resposta: 'amarelo',
  aprovado: 'verde',
  recusado: 'vermelho',
  cancelado: 'vermelho',
  expirado: 'cinza',
};

export function PaginaOrcamentos() {
  const { t } = useTranslation();
  const { formato } = useAuth();
  const navigate = useNavigate();
  const lista = useLista<OrcamentoView>('v_orcamento', { ordem: 'created_at', desc: true });

  if (lista.isLoading) return <Carregando />;
  if (lista.isError) return <EstadoErro onRetry={() => lista.refetch()} />;

  return (
    <div>
      <CabecalhoPagina
        titulo={t('orcamento.titulo')}
        acoes={<Botao variante="acento" onClick={() => navigate('/calculadora')}>+ {t('orcamento.novo')}</Botao>}
      />
      {lista.data!.length === 0 ? (
        <EstadoVazio acao={<Botao variante="acento" onClick={() => navigate('/calculadora')}>+ {t('orcamento.novo')}</Botao>} />
      ) : (
        <Tabela cabecalhos={[
          t('orcamento.numero'), t('orcamento.cliente'), t('orcamento.total'),
          t('orcamento.validade'), t('orcamento.status'),
        ]}>
          {lista.data!.map((o) => (
            <tr key={o.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5">
                <Link to={`/orcamentos/${o.id}`} className="font-bold text-ink hover:text-brand-azul">
                  {o.numero}
                </Link>
              </td>
              <td className="px-3 py-2.5">{o.cliente_snapshot?.nome ?? '—'}</td>
              <td className="px-3 py-2.5 font-semibold"><Dinheiro centavos={o.total} /></td>
              <td className="px-3 py-2.5 text-texto-2">{dataCurta(o.validade, formato)}</td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>
                  {t(`orcamento.statusLabel.${o.status}`)}
                </Etiqueta>
              </td>
            </tr>
          ))}
        </Tabela>
      )}
    </div>
  );
}
