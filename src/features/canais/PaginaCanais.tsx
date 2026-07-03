import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Botao, Cartao, Etiqueta } from '@/components/ui';

const CANAIS = [
  { id: 'shopify', nome: 'Shopify', tipo: 'Loja online', status: 'Planejado', cor: 'verde' as const },
  { id: 'tiktok-shop', nome: 'TikTok Shop', tipo: 'Marketplace', status: 'Planejado', cor: 'azul' as const },
  { id: 'shopee', nome: 'Shopee', tipo: 'Marketplace', status: 'Planejado', cor: 'azul' as const },
  { id: 'amazon', nome: 'Amazon', tipo: 'Marketplace', status: 'Planejado', cor: 'azul' as const },
  { id: 'mercado-livre', nome: 'Mercado Livre', tipo: 'Marketplace', status: 'Planejado', cor: 'azul' as const },
  { id: 'loja-propria', nome: 'Loja propria', tipo: 'Canal direto', status: 'Planejado', cor: 'roxo' as const },
  { id: 'venda-direta', nome: 'Venda direta / Manual', tipo: 'Canal interno', status: 'Disponivel no cadastro', cor: 'cinza' as const },
];

export function PaginaCanais() {
  const { canal } = useParams<{ canal?: string }>();
  const atual = useMemo(
    () => CANAIS.find((c) => c.id === canal) ?? CANAIS[0],
    [canal],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4 xl:h-[calc(100dvh-112px)] xl:overflow-hidden">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">Canais</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{atual.nome}</h1>
          <p className="mt-1 max-w-3xl text-sm text-texto-2">
            Estrutura preparada para conectar marketplaces e lojas sem transformar o canal na fonte mestre do produto.
          </p>
        </div>
        <Botao disabled>Conectar conta</Botao>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-borda bg-white p-2">
          {CANAIS.map((item) => (
            <Link
              key={item.id}
              to={`/canais/${item.id}`}
              className={`mb-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                item.id === atual.id ? 'bg-ink text-white' : 'text-ink hover:bg-surface-2'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{item.nome}</span>
                <span className={`block text-[10px] font-medium ${item.id === atual.id ? 'text-white/65' : 'text-texto-2'}`}>
                  {item.tipo}
                </span>
              </span>
              <span className={`size-2 shrink-0 rounded-full ${item.id === atual.id ? 'bg-white' : 'bg-brand-roxo'}`} />
            </Link>
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto rounded-xl border border-borda bg-white">
          <div className="border-b border-borda p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-ink">Painel do canal</h2>
                <p className="mt-0.5 text-xs text-texto-2">Conexao, publicacoes, erros e sincronizacao ficarao aqui.</p>
              </div>
              <Etiqueta cor={atual.cor}>{atual.status}</Etiqueta>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-4">
            <CanalKpi rotulo="Publicados" valor="0" />
            <CanalKpi rotulo="Pendentes" valor="0" />
            <CanalKpi rotulo="Erros" valor="0" alerta />
            <CanalKpi rotulo="Ultima sync" valor="-" />
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-xl border border-dashed border-borda bg-surface-2/40 p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-white text-brand-roxo shadow-sm">
                <IconeCanal />
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-ink">Integracao ainda nao configurada</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-texto-2">
                Primeiro vamos fortalecer Produto, SKUs, estoque local e publicacoes. Depois este canal podera conectar conta,
                puxar categorias remotas, enviar estoque e importar pedidos.
              </p>
              <div className="mt-5 grid gap-3 text-left md:grid-cols-3">
                <MiniCard titulo="1. Conectar" texto="OAuth, token seguro ou credenciais via Edge Functions." />
                <MiniCard titulo="2. Mapear produtos" texto="Produto interno continua sendo a fonte mestre." />
                <MiniCard titulo="3. Sincronizar" texto="Preco, estoque, status, erros e pedidos externos." />
              </div>
            </div>
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto space-y-3">
          <Cartao>
            <h2 className="text-sm font-extrabold text-ink">Campos futuros</h2>
            <div className="mt-3 space-y-2 text-xs text-ink">
              {['Status da conexao', 'Produtos publicados', 'Fila de sincronizacao', 'Erros recentes', 'Categorias remotas', 'Regras de estoque'].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <span>{item}</span>
                  <span className="text-texto-2">planejado</span>
                </div>
              ))}
            </div>
          </Cartao>
          <Cartao>
            <h2 className="text-sm font-extrabold text-ink">Regra de arquitetura</h2>
            <p className="mt-2 text-xs leading-relaxed text-texto-2">
              Canais distribuem produtos. Eles nao substituem o cadastro mestre, a composicao, o custo nem o estoque local.
            </p>
          </Cartao>
        </aside>
      </div>
    </div>
  );
}

function CanalKpi({ rotulo, valor, alerta = false }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-borda bg-white p-3">
      <p className="text-[10px] font-extrabold uppercase text-texto-2">{rotulo}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${alerta ? 'text-erro' : 'text-ink'}`}>{valor}</p>
    </div>
  );
}

function MiniCard({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-borda bg-white p-3">
      <p className="text-sm font-extrabold text-ink">{titulo}</p>
      <p className="mt-1 text-xs text-texto-2">{texto}</p>
    </div>
  );
}

function IconeCanal() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16v4H4V4Zm0 6h7v10H4V10Zm9 0h7v10h-7V10Zm-7 2v2h3v-2H6Zm9 0v2h3v-2h-3Z" />
    </svg>
  );
}
