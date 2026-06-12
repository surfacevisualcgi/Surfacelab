/**
 * Tela 17 — Configurações da EMPRESA (tenant): operacional (decisões §7),
 * fiscal, equipe (papéis + convites por link) e plano/limites.
 */
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useCrud, useLista, mensagemErro } from '@/lib/dados';
import { deCentavos, paraCentavos } from '@/lib/formato';
import {
  Botao, CabecalhoPagina, Campo, Carregando, Cartao, Entrada, EstadoVazio,
  Etiqueta, Modal, Selecao, Tabela,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { AbaAgente } from './AbaAgente';
import type { Papel } from '@/auth/permissoes';

type Aba = 'operacional' | 'equipe' | 'agente' | 'plano';

export function PaginaConfiguracoes() {
  const { t } = useTranslation();
  const { pode } = useAuth();
  const [aba, setAba] = useState<Aba>('operacional');
  if (!pode('configuracoes')) return <EstadoVazio />;

  // fiscal ganhou tela própria (/fiscal), como no v2
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'operacional', rotulo: t('config.operacional') },
    { id: 'equipe', rotulo: t('config.equipe') },
    { id: 'agente', rotulo: t('agente.aba') },
    { id: 'plano', rotulo: t('config.plano') },
  ];
  return (
    <div>
      <CabecalhoPagina titulo={t('config.titulo')} />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-borda">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              aba === a.id ? 'border-brand-roxo text-ink' : 'border-transparent text-texto-2 hover:text-ink'}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'operacional' && <AbaOperacional />}
      {aba === 'equipe' && <AbaEquipe />}
      {aba === 'agente' && <AbaAgente />}
      {aba === 'plano' && <AbaPlano />}
    </div>
  );
}

function AbaOperacional() {
  const { t } = useTranslation();
  const { ativa, recarregar } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from('tenant').update({
      nome: f.get('nome') as string,
      momento_baixa_estoque: f.get('momento_baixa_estoque') as string,
      criterio_rateio_custo_fixo: f.get('criterio_rateio_custo_fixo') as string,
      faturamento_mensal_esperado: paraCentavos(f.get('faturamento_mensal_esperado') as string),
    }).eq('id', ativa?.tenant_id);
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      setMsg(t('estados.salvo'));
      await recarregar();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  if (!ativa) return <Carregando />;
  return (
    <Cartao className="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo={t('config.nomeEmpresa')}>
          <Entrada name="nome" required defaultValue={ativa.tenant.nome} />
        </Campo>
        <Campo rotulo={t('config.momentoBaixa')}>
          <Selecao name="momento_baixa_estoque" defaultValue={ativa.tenant.momento_baixa_estoque}>
            <option value="fim">{t('config.baixaFim')}</option>
            <option value="inicio">{t('config.baixaInicio')}</option>
          </Selecao>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t('config.criterioRateio')}>
            <Selecao name="criterio_rateio_custo_fixo" defaultValue={ativa.tenant.criterio_rateio_custo_fixo}>
              {['faturamento', 'hora_maquina', 'hora_trabalho', 'pedido'].map((c) => (
                <option key={c} value={c}>{t(`config.rateioLabel.${c}`)}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo={t('config.faturamentoEsperado')}>
            <Entrada name="faturamento_mensal_esperado" inputMode="decimal"
              defaultValue={deCentavos(Number(ativa.tenant.faturamento_mensal_esperado))} />
          </Campo>
        </div>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        {msg && <p className="text-xs font-semibold text-ok">{msg}</p>}
        <Botao type="submit">{t('acoes.salvar')}</Botao>
      </form>
    </Cartao>
  );
}

export function AbaFiscal() {
  const { t } = useTranslation();
  const lista = useLista<{ id: string; nome: string; tipo: string; aliquota_efetiva: number; padrao: boolean }>('perfil_fiscal', { ordem: 'nome', desc: false });
  const crud = useCrud('perfil_fiscal');
  const [editando, setEditando] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    const valores = {
      nome: f.get('nome') as string,
      tipo: f.get('tipo') as string,
      aliquota_efetiva: Number(f.get('aliquota_efetiva')) / 100,
      padrao: f.get('padrao') === 'on',
    };
    try {
      if (editando.id) await crud.atualizar.mutateAsync({ id: editando.id as string, ...valores });
      else await crud.criar.mutateAsync(valores);
      setEditando(null);
      setErro(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  if (lista.isLoading) return <Carregando />;
  return (
    <div>
      <p className="mb-3 rounded-lg bg-alerta/5 border border-alerta/30 px-3 py-2 text-xs text-alerta">
        ⚠ {t('config.avisoFiscal')}
      </p>
      <div className="mb-3 flex justify-end">
        <Botao onClick={() => setEditando({})}>+ {t('acoes.novo')}</Botao>
      </div>
      {(lista.data ?? []).length === 0 ? <EstadoVazio /> : (
        <Tabela cabecalhos={['Nome', 'Tipo', t('config.aliquotaEfetiva'), '', '']}>
          {lista.data!.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{p.nome}</td>
              <td className="px-3 py-2.5 text-texto-2">{p.tipo}</td>
              <td className="px-3 py-2.5 tabular-nums">{(Number(p.aliquota_efetiva) * 100).toFixed(2)}%</td>
              <td className="px-3 py-2.5">{p.padrao && <Etiqueta cor="azul">padrão</Etiqueta>}</td>
              <td className="px-3 py-2.5 text-right">
                <Botao variante="fantasma" onClick={() => setEditando(p as unknown as Record<string, unknown>)}>{t('acoes.editar')}</Botao>
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      <Modal aberto={!!editando} titulo={t('config.fiscal')} onFechar={() => setEditando(null)}>
        {editando && (
          <form onSubmit={salvar} className="space-y-3">
            <Campo rotulo="Nome">
              <Entrada name="nome" required defaultValue={(editando.nome as string) ?? ''} placeholder="Ex.: Simples Nacional Anexo II" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tipo">
                <Selecao name="tipo" defaultValue={(editando.tipo as string) ?? 'produto'}>
                  <option value="produto">Produto</option>
                  <option value="servico">Serviço</option>
                  <option value="misto">Misto</option>
                </Selecao>
              </Campo>
              <Campo rotulo={t('config.aliquotaEfetiva')}>
                <Entrada name="aliquota_efetiva" type="number" step="0.01" min="0" max="60"
                  defaultValue={editando.aliquota_efetiva != null ? Number(editando.aliquota_efetiva) * 100 : 6} />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="padrao" defaultChecked={!!editando.padrao} className="accent-brand-azul" />
              Usar como padrão na calculadora
            </label>
            {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>{t('acoes.cancelar')}</Botao>
              <Botao type="submit">{t('acoes.salvar')}</Botao>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function AbaEquipe() {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const qc = useQueryClient();
  const [convidando, setConvidando] = useState(false);
  const [linkConvite, setLinkConvite] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const equipe = useQuery({
    queryKey: ['equipe', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership')
        .select('id, papel, ativo, usuario:usuario_id (id, nome_exibicao, email)')
        .eq('tenant_id', ativa!.tenant_id);
      if (error) throw error;
      return data as unknown as { id: string; papel: Papel; ativo: boolean; usuario: { nome_exibicao: string | null; email: string } }[];
    },
  });

  const convites = useQuery({
    queryKey: ['convite', ativa?.tenant_id],
    enabled: !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('convite').select('*').eq('status', 'pendente');
      if (error) throw error;
      return data as { id: string; email: string; papel: Papel; token: string }[];
    },
  });

  async function convidar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { data, error } = await supabase
      .from('convite')
      .insert({
        tenant_id: ativa?.tenant_id,
        email: (f.get('email') as string).toLowerCase(),
        papel: f.get('papel') as string,
      })
      .select('token')
      .single();
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      setConvidando(false);
      setLinkConvite(`${window.location.origin}/convite/${data.token}`);
      qc.invalidateQueries({ queryKey: ['convite'] });
    }
  }

  const papeis: Papel[] = ['administrador', 'comercial', 'producao', 'leitura'];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Botao onClick={() => setConvidando(true)}>+ {t('config.convidar')}</Botao>
      </div>
      {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
      {linkConvite && (
        <div className="rounded-xl border border-ok/40 bg-ok/5 p-3 text-xs">
          <p className="mb-1 font-bold text-ok">{t('config.conviteEnviado')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1">{linkConvite}</code>
            <Botao variante="secundario" onClick={() => navigator.clipboard.writeText(linkConvite)}>
              {t('config.copiarLink')}
            </Botao>
          </div>
        </div>
      )}

      {equipe.isLoading ? <Carregando /> : (
        <Tabela cabecalhos={['Pessoa', 'E-mail', t('config.papel')]}>
          {(equipe.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2.5 font-semibold text-ink">{m.usuario?.nome_exibicao ?? '—'}</td>
              <td className="px-3 py-2.5 text-texto-2">{m.usuario?.email}</td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={m.papel === 'dono' ? 'roxo' : 'cinza'}>{t(`config.papelLabel.${m.papel}`)}</Etiqueta>
              </td>
            </tr>
          ))}
          {(convites.data ?? []).map((c) => (
            <tr key={c.id} className="opacity-60">
              <td className="px-3 py-2.5 italic text-texto-2">({t('empresa.convitePendente')})</td>
              <td className="px-3 py-2.5 text-texto-2">{c.email}</td>
              <td className="px-3 py-2.5"><Etiqueta cor="amarelo">{t(`config.papelLabel.${c.papel}`)}</Etiqueta></td>
            </tr>
          ))}
        </Tabela>
      )}

      <Modal aberto={convidando} titulo={t('config.convidar')} onFechar={() => setConvidando(false)}>
        <form onSubmit={convidar} className="space-y-3">
          <Campo rotulo={t('auth.email')}>
            <Entrada name="email" type="email" required />
          </Campo>
          <Campo rotulo={t('config.papel')}>
            <Selecao name="papel" defaultValue="comercial">
              {papeis.map((p) => <option key={p} value={p}>{t(`config.papelLabel.${p}`)}</option>)}
            </Selecao>
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setConvidando(false)}>{t('acoes.cancelar')}</Botao>
            <Botao type="submit">{t('acoes.criar')}</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AbaPlano() {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const limites = useQuery({
    queryKey: ['plano_limite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plano_limite').select('*');
      if (error) throw error;
      return data as { plano: string; recurso: string; limite: number | null }[];
    },
  });

  if (!ativa || limites.isLoading) return <Carregando />;
  const plano = ativa.tenant.plano;
  const doPlano = (limites.data ?? []).filter((l) => l.plano === plano);

  return (
    <Cartao className="max-w-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-texto-2">{t('config.planoAtual')}</p>
          <p className="text-lg font-extrabold grad-texto">{t(`config.planoLabel.${plano}`)}</p>
          <p className="text-xs text-texto-2">{ativa.tenant.status_assinatura}</p>
        </div>
        <Botao variante="acento" disabled title="Stripe — estrutura pronta, cobrança em modo teste (pendência)">
          {t('plano.fazerUpgrade')}
        </Botao>
      </div>
      <dl className="space-y-1.5 text-sm">
        {doPlano.map((l) => (
          <div key={l.recurso} className="flex justify-between">
            <dt className="text-texto-2">{l.recurso}</dt>
            <dd className="font-semibold">{l.limite ?? '∞'}</dd>
          </div>
        ))}
      </dl>
    </Cartao>
  );
}
