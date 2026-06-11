/**
 * Tela 01 — Visão geral: KPIs + primeiros passos (onboarding guiado para o
 * iniciante não precificar com cadastros vazios).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { Carregando, Cartao, Dinheiro, EstadoErro } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

export function PaginaDashboard() {
  const { t } = useTranslation();
  const { ativa, flag } = useAuth();

  const resumo = useQuery({
    queryKey: ['dashboard', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const [pedidos, orcamentos, materiais, ops, lancamentos, contagens] = await Promise.all([
        supabase.from('v_pedido').select('id, status, total').is('deleted_at', null),
        supabase.from('v_orcamento').select('id, status').is('deleted_at', null),
        supabase.from('material').select('id, saldo, reservado, minimo').is('deleted_at', null),
        supabase.from('v_ordem_producao').select('id, status').is('deleted_at', null),
        supabase.from('lancamento').select('tipo, valor, status').is('deleted_at', null).eq('status', 'pendente'),
        Promise.all([
          supabase.from('material').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('impressora').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('modelo_3d').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('v_produto').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('v_orcamento').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        ]),
      ]);
      const baixo = (materiais.data ?? []).filter(
        (m) => Number(m.minimo) > 0 && Number(m.saldo) - Number(m.reservado) <= Number(m.minimo),
      ).length;
      return {
        pedidosAbertos: (pedidos.data ?? []).filter((p) => !['concluido', 'cancelado'].includes(p.status)).length,
        orcamentosAguardando: (orcamentos.data ?? []).filter((o) =>
          ['enviado', 'aguardando_resposta'].includes(o.status)).length,
        emProducao: (ops.data ?? []).filter((o) => ['preparar', 'imprimindo', 'acabamento'].includes(o.status)).length,
        estoqueBaixo: baixo,
        aReceber: (lancamentos.data ?? []).filter((l) => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0),
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
  const passos = [
    { ok: r.passos.material, rotulo: t('dashboard.passoMaterial'), para: '/cadastros' },
    { ok: r.passos.impressora, rotulo: t('dashboard.passoImpressora'), para: '/cadastros' },
    { ok: r.passos.modelo, rotulo: t('dashboard.passoModelo'), para: '/modelos' },
    { ok: r.passos.produto, rotulo: t('dashboard.passoProduto'), para: '/produtos' },
    { ok: r.passos.orcamento, rotulo: t('dashboard.passoCalculo'), para: '/calculadora' },
  ];
  const tudoPronto = passos.every((p) => p.ok);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">
          {ativa?.tenant.nome}
        </h1>
        <p className="text-sm text-texto-2">{t('dashboard.titulo')}</p>
      </div>

      {/* máx. 4 KPIs (regra de densidade dos protótipos v2) */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {flag('ver_financeiro') && (
          <Cartao>
            <p className="text-[11px] font-bold uppercase text-texto-2">{t('dashboard.aReceber')}</p>
            <p className="mt-1 text-xl font-extrabold grad-texto"><Dinheiro centavos={r.aReceber} /></p>
          </Cartao>
        )}
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('dashboard.pedidosAbertos')}</p>
          <p className="mt-1 text-xl font-extrabold text-ink">{r.pedidosAbertos}</p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('dashboard.producaoAndamento')}</p>
          <p className="mt-1 text-xl font-extrabold text-ink">{r.emProducao}</p>
        </Cartao>
        <Cartao>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('dashboard.estoqueBaixo')}</p>
          <p className={`mt-1 text-xl font-extrabold ${r.estoqueBaixo > 0 ? 'text-alerta' : 'text-ink'}`}>
            {r.estoqueBaixo}
          </p>
        </Cartao>
      </div>

      {!tudoPronto && (
        <Cartao>
          <h2 className="mb-1 text-sm font-bold text-ink">{t('dashboard.boasVindas')} 👋</h2>
          <p className="mb-3 text-xs text-texto-2">{t('dashboard.primeirosPassos')}:</p>
          <ol className="space-y-2">
            {passos.map((p, i) => (
              <li key={i}>
                <Link
                  to={p.para}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    p.ok
                      ? 'border-ok/30 bg-ok/5 text-ok line-through opacity-70'
                      : 'border-borda text-ink hover:border-brand-azul hover:bg-brand-azul/5'
                  }`}
                >
                  <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${p.ok ? 'bg-ok' : 'grad-acento'}`}>
                    {p.ok ? '✓' : i + 1}
                  </span>
                  {p.rotulo}
                </Link>
              </li>
            ))}
          </ol>
        </Cartao>
      )}
    </div>
  );
}
