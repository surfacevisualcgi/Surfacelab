/**
 * Tela 18 — Impressoras e Manutenção (estrutura v2): 4 KPIs, tabela com
 * custo/h em destaque (alimenta a Calculadora), registrar manutenção
 * (custo real vai para o financeiro), painel lateral com acordeões
 * "Próximas manutenções" + "Últimas ocorrências".
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { dataCurta, paraCentavos } from '@/lib/formato';
import {
  Acordeao, Botao, CabecalhoPagina, Campo, Carregando, Dinheiro, Entrada,
  EntradaDinheiro, EstadoErro, Kpi, Modal, Selecao,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { AbaImpressoras, custoHoraImpressora, type Impressora } from '../cadastros/PaginaCadastros';

interface Manutencao {
  id: string; impressora_id: string; data: string; tipo: string;
  custo: number; observacao: string | null;
}

export function PaginaImpressoras() {
  const { t } = useTranslation();
  const { pode, ativa, formato } = useAuth();
  const qc = useQueryClient();
  const [registrando, setRegistrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const impressoras = useLista<Impressora & { horas_acumuladas: number; proxima_manutencao: string | null; status: string }>('impressora', { ordem: 'nome', desc: false });
  const manutencoes = useLista<Manutencao>('impressora_manutencao', { ordem: 'data', desc: true });
  const crudManut = useCrud('impressora_manutencao', ['impressora']);

  const kpis = useMemo(() => {
    const lista = impressoras.data ?? [];
    return {
      ativas: lista.filter((i) => i.status === 'ativa').length,
      emManutencao: lista.filter((i) => i.status === 'manutencao').length,
      horasTotais: lista.reduce((s, i) => s + Number(i.horas_acumuladas), 0),
      custoHoraMedio: lista.length > 0
        ? Math.round(lista.reduce((s, i) => s + custoHoraImpressora(i), 0) / lista.length)
        : 0,
    };
  }, [impressoras.data]);

  async function registrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const custo = paraCentavos(f.get('custo') as string);
    try {
      await crudManut.criar.mutateAsync({
        impressora_id: f.get('impressora_id') as string,
        data: f.get('data') as string,
        tipo: f.get('tipo') as string,
        custo,
        observacao: (f.get('observacao') as string) || null,
      });
      // custo real da manutenção entra no financeiro (saída)
      if (custo > 0) {
        await supabase.from('lancamento').insert({
          tenant_id: ativa?.tenant_id,
          tipo: 'saida',
          descricao: `Manutenção — ${(impressoras.data ?? []).find((i) => i.id === f.get('impressora_id'))?.nome ?? 'impressora'}`,
          categoria: 'manutencao',
          valor: custo,
          vencimento: f.get('data') as string,
          status: 'pago',
          pago_em: f.get('data') as string,
          origem_tipo: 'manual',
        });
        qc.invalidateQueries({ queryKey: ['lancamento'] });
      }
      setRegistrando(false);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (impressoras.isLoading) return <Carregando />;
  if (impressoras.isError) return <EstadoErro onRetry={() => impressoras.refetch()} />;

  const nomeImpressora = (id: string) => (impressoras.data ?? []).find((i) => i.id === id)?.nome ?? '—';
  const proximas = (impressoras.data ?? [])
    .filter((i) => i.proxima_manutencao)
    .sort((a, b) => (a.proxima_manutencao! < b.proxima_manutencao! ? -1 : 1));

  return (
    <div>
      <CabecalhoPagina
        titulo={t('impressoras.titulo')}
        subtitulo={t('impressoras.subtitulo')}
        acoes={pode('configuracoes', 'criar') ? (
          <Botao variante="secundario" onClick={() => setRegistrando(true)}>
            🔧 {t('impressoras.registrarManutencao')}
          </Botao>
        ) : undefined}
      />

      {/* 4 KPIs (v2) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('impressoras.kpiAtivas')} destaque>{kpis.ativas}</Kpi>
        <Kpi rotulo={t('impressoras.kpiEmManutencao')}>
          <span className={kpis.emManutencao > 0 ? 'text-alerta' : ''}>{kpis.emManutencao}</span>
        </Kpi>
        <Kpi rotulo={t('impressoras.kpiHoras')}>{Math.round(kpis.horasTotais).toLocaleString()}h</Kpi>
        <Kpi rotulo={t('impressoras.kpiCustoHora')}><Dinheiro centavos={kpis.custoHoraMedio} />/h</Kpi>
      </div>

      {erro && <p className="mb-3 text-xs font-semibold text-erro">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_270px]">
        {/* tabela + CRUD (custo/h calculado ao vivo no modal) */}
        <div><AbaImpressoras /></div>

        {/* painel lateral único com acordeões (v2) */}
        <div className="space-y-3 lg:sticky lg:top-16 lg:h-fit">
          <Acordeao abertoInicial titulo={`🗓 ${t('impressoras.proximasManutencoes')} (${proximas.length})`}>
            {proximas.length === 0 ? (
              <p className="text-xs text-texto-2">{t('impressoras.semProximas')}</p>
            ) : (
              <ul className="space-y-1.5">
                {proximas.map((i) => {
                  const atrasada = i.proxima_manutencao! < new Date().toISOString().slice(0, 10);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-semibold text-ink">{i.nome}</span>
                      <span className={atrasada ? 'font-bold text-erro' : 'text-texto-2'}>
                        {dataCurta(i.proxima_manutencao, formato)}{atrasada ? ' ⚠' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Acordeao>
          <Acordeao titulo={`🔧 ${t('impressoras.ultimas')} (${(manutencoes.data ?? []).length})`}>
            {(manutencoes.data ?? []).length === 0 ? (
              <p className="text-xs text-texto-2">{t('estados.vazio')}</p>
            ) : (
              <ul className="space-y-1.5">
                {(manutencoes.data ?? []).slice(0, 8).map((m) => (
                  <li key={m.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold text-ink">{nomeImpressora(m.impressora_id)}</span>
                      <Dinheiro centavos={m.custo} className="shrink-0 font-semibold" />
                    </div>
                    <p className="text-texto-2">
                      {dataCurta(m.data, formato)} · {t(`impressoras.tipoManutencao.${m.tipo}`)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Acordeao>
        </div>
      </div>

      {/* registrar manutenção (custo real por máquina) */}
      <Modal aberto={registrando} titulo={t('impressoras.registrarManutencao')} onFechar={() => setRegistrando(false)}>
        <form onSubmit={registrar} className="space-y-3">
          <Campo rotulo={t('impressoras.titulo')}>
            <Selecao name="impressora_id" required defaultValue="">
              <option value="">—</option>
              {(impressoras.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Selecao>
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Data">
              <Entrada name="data" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo rotulo="Tipo">
              <Selecao name="tipo" defaultValue="preventiva">
                {['preventiva', 'corretiva', 'calibracao'].map((tp) => (
                  <option key={tp} value={tp}>{t(`impressoras.tipoManutencao.${tp}`)}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo={t('pedido.custo')} dica={t('impressoras.custoVaiFinanceiro')}>
              <EntradaDinheiro name="custo" defaultCentavos={0} />
            </Campo>
          </div>
          <Campo rotulo="Observação">
            <Entrada name="observacao" placeholder="Troca de bico, lubrificação dos eixos…" />
          </Campo>
          {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setRegistrando(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.salvar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
