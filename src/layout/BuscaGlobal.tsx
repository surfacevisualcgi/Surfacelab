/**
 * Busca global da topbar (v2): procura em produtos, modelos, clientes e
 * orçamentos (consultas reais com RLS/masking — cliente via v_cliente).
 * Resultados agrupados; Enter/clique navega.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';

interface Resultado {
  grupo: string;
  rotulo: string;
  detalhe?: string;
  para: string;
}

export function BuscaGlobal() {
  const { t } = useTranslation();
  const { ativa, pode } = useAuth();
  const navigate = useNavigate();
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [debounced, setDebounced] = useState('');
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(termo.trim()), 250);
    return () => clearTimeout(timer);
  }, [termo]);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const busca = useQuery({
    queryKey: ['busca-global', ativa?.tenant_id, debounced],
    enabled: !!ativa && debounced.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<Resultado[]> => {
      const like = `%${debounced}%`;
      const [produtos, modelos, clientes, orcamentos] = await Promise.all([
        pode('produtos')
          ? supabase.from('v_produto').select('id, nome, sku').is('deleted_at', null).ilike('nome', like).limit(4)
          : Promise.resolve({ data: [] }),
        pode('modelos')
          ? supabase.from('modelo_3d').select('id, nome, codigo_interno').is('deleted_at', null).ilike('nome', like).limit(4)
          : Promise.resolve({ data: [] }),
        pode('clientes')
          ? supabase.from('v_cliente').select('id, nome, cidade').is('deleted_at', null).ilike('nome', like).limit(4)
          : Promise.resolve({ data: [] }),
        pode('orcamentos')
          ? supabase.from('v_orcamento').select('id, numero, status').is('deleted_at', null).ilike('numero', like).limit(4)
          : Promise.resolve({ data: [] }),
      ]);
      return [
        ...(produtos.data ?? []).map((p: { id: string; nome: string; sku: string | null }) => ({
          grupo: t('nav.produtos'), rotulo: p.nome, detalhe: p.sku ?? undefined, para: `/produtos/${p.id}`,
        })),
        ...(modelos.data ?? []).map((m: { id: string; nome: string; codigo_interno: string | null }) => ({
          grupo: t('nav.modelos'), rotulo: m.nome, detalhe: m.codigo_interno ?? undefined, para: `/modelos/${m.id}`,
        })),
        ...(clientes.data ?? []).map((c: { id: string; nome: string; cidade: string | null }) => ({
          grupo: t('nav.clientes'), rotulo: c.nome, detalhe: c.cidade ?? undefined, para: '/clientes',
        })),
        ...(orcamentos.data ?? []).map((o: { id: string; numero: string; status: string }) => ({
          grupo: t('nav.orcamentos'), rotulo: o.numero,
          detalhe: t(`orcamento.statusLabel.${o.status}`), para: `/orcamentos/${o.id}`,
        })),
      ];
    },
  });

  const resultados = busca.data ?? [];
  const grupos = [...new Set(resultados.map((r) => r.grupo))];

  function ir(r: Resultado) {
    setAberto(false);
    setTermo('');
    navigate(r.para);
  }

  return (
    <div ref={caixaRef} className="relative hidden w-full max-w-xs md:block">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-texto-2">
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onFocus={() => termo.length >= 2 && setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberto(false);
          if (e.key === 'Enter' && resultados[0]) ir(resultados[0]);
        }}
        placeholder={t('busca.placeholder')}
        aria-label={t('busca.placeholder')}
        className="w-full rounded-lg border border-borda bg-surface-2/60 py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-texto-2/70 focus:border-brand-azul focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-azul/20"
      />
      {aberto && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-borda bg-white p-1.5 shadow-lg">
          {busca.isLoading ? (
            <p className="px-2.5 py-3 text-center text-xs text-texto-2">{t('estados.carregando')}</p>
          ) : resultados.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-xs text-texto-2">{t('estados.semResultados')}</p>
          ) : (
            grupos.map((g) => (
              <div key={g}>
                <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-texto-2">{g}</p>
                {resultados.filter((r) => r.grupo === g).map((r, i) => (
                  <button key={`${r.para}-${i}`} onClick={() => ir(r)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-surface-2">
                    <span className="min-w-0 truncate font-semibold text-ink">{r.rotulo}</span>
                    {r.detalhe && <span className="shrink-0 text-[10px] text-texto-2">{r.detalhe}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
