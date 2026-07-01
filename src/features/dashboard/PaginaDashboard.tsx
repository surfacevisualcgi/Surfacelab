/**
 * Tela 01 — Visão geral (estrutura do protótipo v2):
 * saudação · 4 KPIs com variação · gráfico de faturamento 12 meses (herói) ·
 * faturamento por categoria (rosca) + fluxo de caixa · UM painel lateral com
 * abas (Tarefas / Alertas de estoque / Resumo financeiro).
 * Pele Surface Labs; primeiros passos aparecem enquanto o setup não terminou.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { moeda, percentual } from '@/lib/formato';
import { Carregando, Cartao, Dinheiro, EstadoErro, Etiqueta, Kpi } from '@/components/ui';
import { GraficoBarrasDuplas, GraficoLinha, GraficoRosca } from '@/components/graficos';
import { useAuth } from '@/auth/AuthProvider';

function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ultimosMeses(qtd: number): { chave: string; rotulo: string }[] {
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const agora = new Date();
  return Array.from({ length: qtd }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (qtd - 1 - i), 1);
    return { chave: chaveMes(d), rotulo: nomes[d.getMonth()] };
  });
}

type AbaPainel = 'tarefas' | 'alertas' | 'financeiro';

export function PaginaDashboard() {
  const { t } = useTranslation();
  const { ativa, flag, formato, session } = useAuth();
  const [abaPainel, setAbaPainel] = useState<AbaPainel>('tarefas');
  const verCustos = flag('ver_custos');
  const verFin = flag('ver_financeiro');

  const resumo = useQuery({
    queryKey: ['dashboard', ativa?.tenant_id, verCustos],
    enabled: !!ativa,
    queryFn: async () => {
      const [pedidos, orcamentos, materiais, ops, lancamentos, itens, produtos, categorias, contagens] =
        await Promise.all([
          supabase.from('v_pedido').select('id, status, total, custo_estimado, created_at').is('deleted_at', null),
          supabase.from('v_orcamento').select('id, numero, status, validade, cliente_snapshot').is('deleted_at', null),
          supabase.from('material').select('id, nome, saldo, reservado, minimo, unidade_consumo, alerta_estoque').is('deleted_at', null),
          supabase.from('v_ordem_producao').select('id, numero, status').is('deleted_at', null),
          supabase.from('lancamento').select('tipo, valor, status, vencimento').is('deleted_at', null),
          supabase.from('v_pedido_item').select('pedido_id, produto_id, valor_total').is('deleted_at', null),
          supabase.from('v_produto').select('id, categoria_id').is('deleted_at', null),
          supabase.from('categoria').select('id, nome').is('deleted_at', null),
          Promise.all([
            supabase.from('material').select('id', { count: 'exact', head: true }).is('deleted_at', null),
            supabase.from('impressora').select('id', { count: 'exact', head: true }).is('deleted_at', null),
            supabase.from('modelo_3d').select('id', { count: 'exact', head: true }).is('deleted_at', null),
            supabase.from('v_produto').select('id', { count: 'exact', head: true }).is('deleted_at', null),
            supabase.from('v_orcamento').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          ]),
        ]);

      const peds = (pedidos.data ?? []).filter((p) => p.status !== 'cancelado');
      const mesAtual = chaveMes(new Date());
      const mesAnterior = chaveMes(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
      const doMes = (chave: string) => peds.filter((p) => p.created_at.slice(0, 7) === chave);
      const soma = (lista: typeof peds, campo: 'total' | 'custo_estimado') =>
        lista.reduce((s, p) => s + Number(p[campo] ?? 0), 0);

      const fatMes = soma(doMes(mesAtual), 'total');
      const fatAnterior = soma(doMes(mesAnterior), 'total');
      const lucroMes = fatMes - soma(doMes(mesAtual), 'custo_estimado');
      const lucroAnterior = fatAnterior - soma(doMes(mesAnterior), 'custo_estimado');

      // série de 12 meses (herói)
      const meses12 = ultimosMeses(12).map((m) => ({
        rotulo: m.rotulo,
        valor: soma(doMes(m.chave), 'total'),
      }));

      // fluxo de caixa 6 meses (entradas × saídas por vencimento)
      const lancs = (lancamentos.data ?? []).filter((l) => l.status !== 'cancelado');
      const fluxo6 = ultimosMeses(6).map((m) => ({
        rotulo: m.rotulo,
        entrada: lancs.filter((l) => l.tipo === 'entrada' && l.vencimento.slice(0, 7) === m.chave)
          .reduce((s, l) => s + Number(l.valor), 0),
        saida: lancs.filter((l) => l.tipo === 'saida' && l.vencimento.slice(0, 7) === m.chave)
          .reduce((s, l) => s + Number(l.valor), 0),
      }));

      // faturamento por categoria (pedido_item → produto → categoria)
      const catPorProduto = new Map((produtos.data ?? []).map((p) => [p.id, p.categoria_id]));
      const nomeCat = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
      const pedidosValidos = new Set(peds.map((p) => p.id));
      const porCategoria = new Map<string, number>();
      for (const item of itens.data ?? []) {
        if (!pedidosValidos.has(item.pedido_id)) continue;
        const cat = (item.produto_id && nomeCat.get(catPorProduto.get(item.produto_id) ?? '')) || 'Sem categoria';
        porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + Number(item.valor_total));
      }
      const fatias = [...porCategoria.entries()]
        .map(([rotulo, valor]) => ({ rotulo, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);

      // painel lateral
      const hoje = new Date().toISOString().slice(0, 10);
      const estoqueBaixo = (materiais.data ?? []).filter(
        (m) => m.alerta_estoque !== false && Number(m.minimo) > 0 && Number(m.saldo) - Number(m.reservado) <= Number(m.minimo),
      );
      const orcs = orcamentos.data ?? [];
      const tarefas = [
        ...orcs.filter((o) => ['enviado', 'aguardando_resposta'].includes(o.status)).map((o) => ({
          texto: `Acompanhar orçamento ${o.numero} (${(o.cliente_snapshot as { nome?: string })?.nome ?? 'sem cliente'})`,
          prioridade: 'media' as const,
          para: `/orcamentos/${o.id}`,
        })),
        ...orcs.filter((o) => o.status === 'rascunho').map((o) => ({
          texto: `Enviar orçamento ${o.numero}`,
          prioridade: 'baixa' as const,
          para: `/orcamentos/${o.id}`,
        })),
        ...(ops.data ?? []).filter((o) => o.status === 'aguardando_aprovacao').map((o) => ({
          texto: `Iniciar produção da ${o.numero}`,
          prioridade: 'alta' as const,
          para: '/pedidos',
        })),
        ...estoqueBaixo.map((m) => ({
          texto: `Comprar ${m.nome} (estoque baixo)`,
          prioridade: 'alta' as const,
          para: '/estoque',
        })),
        ...orcs.filter((o) => o.validade && o.validade < hoje && ['enviado', 'aguardando_resposta'].includes(o.status))
          .map((o) => ({ texto: `Orçamento ${o.numero} venceu`, prioridade: 'media' as const, para: `/orcamentos/${o.id}` })),
      ].slice(0, 6);

      const pendentes = lancs.filter((l) => l.status === 'pendente');

      return {
        fatMes,
        lucroMes,
        varFat: fatAnterior > 0 ? (fatMes - fatAnterior) / fatAnterior : null,
        varLucro: lucroAnterior > 0 ? (lucroMes - lucroAnterior) / lucroAnterior : null,
        emProducao: (ops.data ?? []).filter((o) => ['preparar', 'imprimindo', 'acabamento'].includes(o.status)).length,
        margemMedia: fatMes > 0 ? lucroMes / fatMes : null,
        meses12,
        fluxo6,
        fatias,
        tarefas,
        estoqueBaixo,
        aReceber: pendentes.filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0),
        aPagar: pendentes.filter((l) => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0),
        atrasados: pendentes.filter((l) => l.vencimento < hoje).length,
        passos: {
          material: (contagens[0].count ?? 0) > 0,
          impressora: (contagens[1].count ?? 0) > 0,
          modelo: (contagens[2].count ?? 0) > 0,
          produto: (contagens[3].count ?? 0) > 0,
          orcamento: (contagens[4].count ?? 0) > 0,
        },
      };
    },
  });

  if (resumo.isLoading) return <Carregando />;
  if (resumo.isError) return <EstadoErro onRetry={() => resumo.refetch()} />;

  const r = resumo.data!;
  const nome = ((session?.user?.user_metadata?.nome_exibicao as string | undefined) ?? '').split(' ')[0];
  const passos = [
    { ok: r.passos.material, rotulo: t('dashboard.passoMaterial'), para: '/cadastros' },
    { ok: r.passos.impressora, rotulo: t('dashboard.passoImpressora'), para: '/cadastros' },
    { ok: r.passos.modelo, rotulo: t('dashboard.passoModelo'), para: '/modelos' },
    { ok: r.passos.produto, rotulo: t('dashboard.passoProduto'), para: '/produtos' },
    { ok: r.passos.orcamento, rotulo: t('dashboard.passoCalculo'), para: '/calculadora' },
  ];
  const tudoPronto = passos.every((p) => p.ok);

  const abasPainel: { id: AbaPainel; rotulo: string }[] = [
    { id: 'tarefas', rotulo: t('dashboard.tarefas') },
    { id: 'alertas', rotulo: t('dashboard.alertas') },
    ...(verFin ? [{ id: 'financeiro' as const, rotulo: t('nav.financeiro') }] : []),
  ];
  const corPrioridade = { alta: 'vermelho', media: 'amarelo', baixa: 'cinza' } as const;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">
          {nome ? t('dashboard.ola', { nome }) : ativa?.tenant.nome}
        </h1>
        <p className="text-sm text-texto-2">{t('dashboard.subtitulo')}</p>
      </div>

      {!tudoPronto && (
        <Cartao className="mb-5">
          <h2 className="mb-1 text-sm font-bold text-ink">{t('dashboard.boasVindas')} 👋</h2>
          <p className="mb-3 text-xs text-texto-2">{t('dashboard.primeirosPassos')}:</p>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {passos.map((p, i) => (
              <li key={i}>
                <Link to={p.para}
                  className={`flex h-full items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                    p.ok
                      ? 'border-ok/30 bg-ok/5 text-ok line-through opacity-70'
                      : 'border-borda text-ink hover:border-brand-azul hover:bg-brand-azul/5'
                  }`}>
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${p.ok ? 'bg-ok' : 'grad-acento'}`}>
                    {p.ok ? '✓' : i + 1}
                  </span>
                  {p.rotulo}
                </Link>
              </li>
            ))}
          </ol>
        </Cartao>
      )}

      {/* 4 KPIs com variação (regra v2: máx. 4) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t('dashboard.faturamento')} variacao={r.varFat} destaque>
          {moeda(r.fatMes, formato)}
        </Kpi>
        {verCustos ? (
          <Kpi rotulo={t('dashboard.lucroEstimado')} variacao={r.varLucro}>
            {moeda(r.lucroMes, formato)}
          </Kpi>
        ) : (
          <Kpi rotulo={t('dashboard.orcamentosAguardando')}>{r.tarefas.length}</Kpi>
        )}
        <Kpi rotulo={t('dashboard.pedidosProducao')}>{r.emProducao}</Kpi>
        <Kpi rotulo={t('dashboard.margemMedia')}>
          {verCustos && r.margemMedia != null ? percentual(r.margemMedia, formato) : '—'}
        </Kpi>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* herói: faturamento 12 meses */}
          <Cartao>
            <h2 className="mb-2 text-sm font-bold text-ink">{t('dashboard.faturamento12m')}</h2>
            <GraficoLinha pontos={r.meses12} />
          </Cartao>

          <div className="grid gap-4 md:grid-cols-2">
            <Cartao>
              <h2 className="mb-3 text-sm font-bold text-ink">{t('dashboard.porCategoria')}</h2>
              {r.fatias.length === 0 ? (
                <p className="py-6 text-center text-xs text-texto-2">{t('estados.vazio')}</p>
              ) : (
                <GraficoRosca fatias={r.fatias} />
              )}
            </Cartao>
            <Cartao>
              <h2 className="mb-1 text-sm font-bold text-ink">{t('dashboard.fluxoCaixa')}</h2>
              <div className="mb-1 flex gap-3 text-[10px] font-semibold text-texto-2">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" /> {t('financeiro.tipoLabel.entrada')}s</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-erro/70" /> {t('financeiro.tipoLabel.saida')}s</span>
              </div>
              <GraficoBarrasDuplas meses={r.fluxo6} />
            </Cartao>
          </div>
        </div>

        {/* UM painel lateral com abas (v2) */}
        <Cartao className="h-fit !p-0">
          <div className="flex border-b border-borda" role="tablist">
            {abasPainel.map((a) => (
              <button key={a.id} role="tab" aria-selected={abaPainel === a.id}
                onClick={() => setAbaPainel(a.id)}
                className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-semibold ${
                  abaPainel === a.id ? 'border-brand-roxo text-ink' : 'border-transparent text-texto-2'
                }`}>
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="p-3">
            {abaPainel === 'tarefas' && (
              r.tarefas.length === 0 ? (
                <p className="py-4 text-center text-xs text-texto-2">{t('dashboard.semTarefas')} ✓</p>
              ) : (
                <ul className="space-y-2">
                  {r.tarefas.map((tarefa, i) => (
                    <li key={i}>
                      <Link to={tarefa.para}
                        className="flex items-start justify-between gap-2 rounded-lg border border-borda px-2.5 py-2 text-xs font-semibold text-ink hover:border-brand-azul">
                        <span className="min-w-0">{tarefa.texto}</span>
                        <Etiqueta cor={corPrioridade[tarefa.prioridade]}>
                          {t(`dashboard.prioridade.${tarefa.prioridade}`)}
                        </Etiqueta>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
            {abaPainel === 'alertas' && (
              r.estoqueBaixo.length === 0 ? (
                <p className="py-4 text-center text-xs text-texto-2">{t('dashboard.semAlertas')} ✓</p>
              ) : (
                <ul className="space-y-2">
                  {r.estoqueBaixo.map((m) => (
                    <li key={m.id}>
                      <Link to="/estoque"
                        className="flex items-center justify-between gap-2 rounded-lg border border-alerta/30 bg-alerta/5 px-2.5 py-2 text-xs font-semibold text-ink">
                        <span className="min-w-0 truncate">{m.nome}</span>
                        <span className="shrink-0 tabular-nums text-alerta">
                          {(Number(m.saldo) - Number(m.reservado)).toLocaleString()} {m.unidade_consumo}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
            {abaPainel === 'financeiro' && (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-texto-2">{t('financeiro.aReceber')}</dt>
                  <dd className="font-bold text-ok"><Dinheiro centavos={r.aReceber} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-texto-2">{t('financeiro.aPagar')}</dt>
                  <dd className="font-bold text-erro"><Dinheiro centavos={r.aPagar} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-texto-2">{t('financeiro.atrasados')}</dt>
                  <dd className="font-bold text-ink">{r.atrasados}</dd>
                </div>
                <Link to="/financeiro" className="block pt-1 text-xs font-bold text-brand-azul hover:underline">
                  {t('dashboard.verFinanceiro')} →
                </Link>
              </dl>
            )}
          </div>
        </Cartao>
      </div>
    </div>
  );
}
