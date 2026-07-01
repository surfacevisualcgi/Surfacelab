import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/dados';
import { dataCurta, moeda, percentual } from '@/lib/formato';
import { useFotoUrl } from '@/lib/fotos';
import { Botao, Carregando, Dinheiro, EstadoErro, Etiqueta } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { COR_STATUS_ORC, type OrcamentoView } from './PaginaOrcamentos';
import { ModalEditarOrcamento } from './ModalEditarOrcamento';

interface ItemView {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unit: number;
  valor_total: number;
  custo_unit: number | null;
}

interface ClienteDetalhe {
  id: string;
  nome: string;
  email: string | null;
  telefone_whatsapp: string | null;
  cidade: string | null;
  estado: string | null;
}

interface OrcamentoDetalhe extends OrcamentoView {
  observacoes: string | null;
  prazo_entrega: string | null;
  condicoes_pagamento: string | null;
  frete: number;
  desconto: number;
  empresa_snapshot: Record<string, string> | null;
  anexos: string[] | null;
  aceite_cliente: Record<string, unknown> | null;
  enviado_em: string | null;
  aprovado_em: string | null;
  cliente_id: string | null;
  canal_id: string | null;
}

function MiniIcone({ tipo }: { tipo: 'pdf' | 'whats' | 'send' | 'check' | 'copy' | 'edit' | 'history' | 'attach' }) {
  const paths: Record<typeof tipo, string> = {
    pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2.5L17.5 8H14V4.5ZM8 13h8v2H8v-2Zm0 4h6v2H8v-2Z',
    whats: 'M12 2a9 9 0 0 0-7.7 13.7L3 22l6.5-1.2A9 9 0 1 0 12 2Zm4.8 12.7c-.2.6-1.2 1.1-1.7 1.2-.5.1-1.1.2-3.5-.8-3-1.2-4.9-4.3-5-4.5-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.2.5-.3.8-.3h.6c.2 0 .5 0 .7.5.2.6.8 2 .9 2.1.1.2.1.4 0 .6-.1.2-.2.4-.4.6-.2.2-.4.4-.5.5-.2.2-.4.4-.2.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.3.7-.2.3.1 1.8.8 2.1 1 .3.1.5.2.6.4 0 .1 0 .6-.1 1Z',
    send: 'M2 12 21 3l-4 18-5-7-7 5 3-7-6-0Z',
    check: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1.1 14.2-4-4 1.4-1.4 2.6 2.6 5.8-5.8 1.4 1.4-7.2 7.2Z',
    copy: 'M8 8h11v13H8V8Zm-3 8H3V3h11v2H5v11Z',
    edit: 'M4 17.5V21h3.5L18.1 10.4l-3.5-3.5L4 17.5ZM20.7 7.8a1 1 0 0 0 0-1.4l-3.1-3.1a1 1 0 0 0-1.4 0l-1.6 1.6 4.5 4.5 1.6-1.6Z',
    history: 'M13 3a9 9 0 1 1-8.5 6H2l3.2-3.2L8.5 9H6.6A7 7 0 1 0 13 5V3Zm-1 4h2v5l4 2-1 1.7-5-2.7V7Z',
    attach: 'M17.5 6.5 8.7 15.3a3 3 0 0 0 4.2 4.2l8.1-8.1a5 5 0 0 0-7.1-7.1L5.8 12.4a7 7 0 1 0 9.9 9.9l6.8-6.8-1.4-1.4-6.8 6.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3 3 0 0 1 4.2 4.2l-8.1 8.1a1 1 0 0 1-1.4-1.4l8.8-8.8-1.3-1.3Z',
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={paths[tipo]} />
    </svg>
  );
}

function InfoCard({ rotulo, valor, apoio }: { rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-borda bg-white p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-texto-2">{rotulo}</p>
      <div className="mt-1 font-extrabold text-ink">{valor}</div>
      {apoio && <div className="mt-1 text-xs text-texto-2">{apoio}</div>}
    </div>
  );
}

function LinhaResumo({ rotulo, children, destaque = false }: { rotulo: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${destaque ? 'font-extrabold text-ink' : 'text-texto-2'}`}>
      <span>{rotulo}</span>
      <span className="tabular-nums text-ink">{children}</span>
    </div>
  );
}

function escapeHtml(valor: unknown) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function telefoneParaWa(telefone?: string | null) {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55')) return digitos;
  return `55${digitos}`;
}

export function PaginaOrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { ativa, pode, flag, formato } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [editando, setEditando] = useState(false);
  const logoUrl = useFotoUrl(ativa?.tenant.logo_path);

  const orc = useQuery({
    queryKey: ['v_orcamento', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_orcamento').select('*').eq('id', id).single();
      if (error) throw error;
      return data as OrcamentoDetalhe;
    },
  });

  const itens = useQuery({
    queryKey: ['v_orcamento_item', id],
    enabled: !!id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_orcamento_item').select('*').eq('orcamento_id', id).is('deleted_at', null).order('ordem');
      if (error) throw error;
      return data as ItemView[];
    },
  });

  const cliente = useQuery({
    queryKey: ['v_cliente', orc.data?.cliente_id, 'orcamento-detalhe'],
    enabled: !!orc.data?.cliente_id && !!ativa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_cliente')
        .select('id, nome, email, telefone_whatsapp, cidade, estado')
        .eq('id', orc.data?.cliente_id)
        .single();
      if (error) throw error;
      return data as ClienteDetalhe;
    },
  });

  async function mudarStatus(status: string) {
    setAgindo(true);
    setErro(null);
    const patch: Record<string, unknown> = { status };
    if (status === 'enviado') patch.enviado_em = new Date().toISOString();
    const { error } = await supabase.from('orcamento').update(patch).eq('id', id);
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries({ queryKey: ['v_orcamento'] });
      orc.refetch();
    }
  }

  async function aprovar() {
    setAgindo(true);
    setErro(null);
    const { data, error } = await supabase.rpc('aprovar_orcamento', { p_orcamento: id });
    setAgindo(false);
    if (error) setErro(mensagemErro(error));
    else {
      qc.invalidateQueries();
      navigate('/pedidos', { state: { pedido: data } });
    }
  }

  async function duplicar() {
    const atual = orc.data;
    if (!atual) return;
    const atuaisItens = itens.data ?? [];
    setAgindo(true);
    setErro(null);
    const { data, error } = await supabase.rpc('criar_orcamento_manual', {
      p_itens: atuaisItens.map((item) => ({
        produto_id: null,
        descricao: item.descricao,
        quantidade: Number(item.quantidade),
        valor_unit: Number(item.valor_unit),
      })),
      p_cliente: atual.cliente_id || null,
      p_canal: atual.canal_id || null,
      p_validade: atual.validade || null,
      p_prazo_entrega: atual.prazo_entrega || null,
      p_condicoes: atual.condicoes_pagamento || null,
      p_frete: Number(atual.frete || 0),
      p_desconto: Number(atual.desconto || 0),
      p_observacoes: atual.observacoes || null,
    });
    setAgindo(false);
    if (error) {
      setErro(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['v_orcamento'] });
    navigate(`/orcamentos/${data as string}`);
  }

  if (orc.isLoading || itens.isLoading) return <Carregando />;
  if (orc.isError || !orc.data) return <EstadoErro onRetry={() => orc.refetch()} />;

  const o = orc.data;
  const empresa = o.empresa_snapshot ?? {};
  const clienteNome = cliente.data?.nome ?? o.cliente_snapshot?.nome ?? t('orcamento.detail.clienteNaoInformado');
  const clienteContato = [cliente.data?.telefone_whatsapp, cliente.data?.email].filter(Boolean).join(' · ');
  const clienteLocal = [cliente.data?.cidade, cliente.data?.estado].filter(Boolean).join('/');
  const empresaNome = empresa.nome_fantasia || empresa.razao_social || ativa?.tenant.nome || 'Surface Labs';
  const itensLista = itens.data ?? [];
  const subtotal = itensLista.reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  const totalComFrete = Number(o.total || 0);
  const custoTotal = o.custo_total ?? 0;
  const lucro = o.lucro_estimado ?? Math.max(0, totalComFrete - custoTotal);
  const margem = o.margem_estimada != null ? Number(o.margem_estimada) : (totalComFrete > 0 ? lucro / totalComFrete : 0);
  const podeAgir = ['rascunho', 'enviado', 'aguardando_resposta'].includes(o.status);
  const hoje = new Date().toISOString().slice(0, 10);
  const vencido = !!o.validade && o.validade < hoje;
  const origem = (o.calculo_snapshot as { origem?: string } | null)?.origem === 'orcamento_manual'
    ? t('orcamento.detail.manual')
    : o.simulacao_id
      ? t('orcamento.detail.calculadora')
      : t('orcamento.detail.recorrente');
  const mensagemClientePadrao = t('orcamento.detail.mensagemPadrao', {
    cliente: clienteNome,
    validade: dataCurta(o.validade, formato),
  });

  function mensagemTexto() {
    return [
      t('orcamento.detail.whatsappSaudacao', { cliente: clienteNome, numero: o.numero }),
      '',
      ...itensLista.map((i) => `- ${i.descricao}: ${Number(i.quantidade)} x ${moeda(i.valor_unit, formato)} = ${moeda(i.valor_total, formato)}`),
      '',
      o.frete > 0 ? `${t('orcamento.frete')}: ${moeda(o.frete, formato)}` : '',
      o.desconto > 0 ? `${t('calculadora.desconto')}: ${moeda(o.desconto, formato)}` : '',
      `${t('orcamento.total')}: ${moeda(o.total, formato)}`,
      o.validade ? `${t('orcamento.validade')}: ${dataCurta(o.validade, formato)}` : '',
      o.prazo_entrega ? `${t('orcamento.prazoEntrega')}: ${o.prazo_entrega}` : '',
      o.condicoes_pagamento ? `${t('orcamento.condicoes')}: ${o.condicoes_pagamento}` : '',
      '',
      o.observacoes || '',
    ].filter(Boolean).join('\n');
  }

  function enviarWhatsApp() {
    const numero = telefoneParaWa(cliente.data?.telefone_whatsapp);
    const url = numero
      ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagemTexto())}`
      : `https://wa.me/?text=${encodeURIComponent(mensagemTexto())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function gerarPdf() {
    const linhas = itensLista.map((item) => `
      <tr>
        <td class="muted center">${escapeHtml(itensLista.indexOf(item) + 1)}</td>
        <td>${escapeHtml(item.descricao)}</td>
        <td class="right">${escapeHtml(Number(item.quantidade))}</td>
        <td class="right">${escapeHtml(moeda(item.valor_unit, formato))}</td>
        <td class="right muted">—</td>
        <td class="right strong">${escapeHtml(moeda(item.valor_total, formato))}</td>
      </tr>
    `).join('');
    const logoHtml = logoUrl
      ? `<img class="logo-img" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(empresaNome)}" />`
      : `<div class="logo-text">${escapeHtml(empresaNome)}</div>`;
    const mensagemCliente = o.observacoes || mensagemClientePadrao;
    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(o.numero)} - ${escapeHtml(t('orcamento.pdf.documento'))}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 15mm 16mm; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111; font-size: 12px; }
    h1 { margin: 0; font-size: 23px; line-height: 1.1; }
    h2 { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .header { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: start; padding-bottom: 11px; }
    .logo { display: flex; align-items: center; gap: 10px; min-height: 38px; }
    .logo-img { max-width: 155px; max-height: 42px; object-fit: contain; }
    .logo-text { font-size: 17px; font-weight: 800; letter-spacing: .02em; }
    .quote-meta { text-align: right; min-width: 190px; }
    .quote-meta .num { font-size: 18px; font-weight: 800; }
    .accent { height: 3px; border-radius: 999px; background: linear-gradient(100deg, #29c2f2, #4b6ce0 35%, #8a3fd1 70%, #e5179a); margin-bottom: 12px; }
    .muted { color: #5f6573; font-size: 11px; }
    .center { text-align: center; }
    .right { text-align: right; }
    .strong { font-weight: 700; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
    .box { border: 1px solid #e1e3e8; border-radius: 9px; padding: 10px 12px; min-height: 62px; }
    .label { color: #5f6573; font-size: 9px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; margin-bottom: 5px; }
    .box strong { font-size: 13px; }
    .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 9px; }
    .fact { border: 1px solid #e1e3e8; border-radius: 8px; padding: 7px 9px; }
    .fact b { display: block; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #f6f7f9; color: #5f6573; text-transform: uppercase; font-size: 9px; text-align: left; padding: 8px 9px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    td { border-bottom: 1px solid #edf0f2; padding: 8px 9px; font-size: 11.5px; vertical-align: top; }
    th:nth-child(1), td:nth-child(1) { width: 32px; }
    th:nth-child(3), td:nth-child(3) { width: 58px; }
    th:nth-child(4), td:nth-child(4) { width: 92px; }
    th:nth-child(5), td:nth-child(5) { width: 64px; }
    th:nth-child(6), td:nth-child(6) { width: 92px; }
    .after-table { display: grid; grid-template-columns: minmax(0, 1fr) 265px; gap: 14px; align-items: start; margin-top: 12px; }
    .total { border: 1.5px solid #111; border-radius: 10px; overflow: hidden; }
    .total div { display: flex; justify-content: space-between; gap: 16px; padding: 7px 11px; border-bottom: 1px solid #e8e8e8; font-size: 12px; }
    .total .grand { background: #111; color: white; font-size: 17px; font-weight: 800; border-bottom: 0; padding: 10px 11px; }
    .lower { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 10px; margin-top: 12px; }
    .obs { white-space: pre-wrap; line-height: 1.5; }
    .footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #5f6573; font-size: 10px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr, .box, .total { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo">
      ${logoHtml}
    </div>
    <div class="quote-meta">
      <div class="num">${escapeHtml(o.numero)}</div>
      <div class="muted">${escapeHtml(t('orcamento.pdf.orcamentoMeta', { status: statusLegivel(o.status) }))}</div>
      <div class="muted">${escapeHtml(t('orcamento.pdf.emitidoEm', { date: dataCurta(o.created_at, formato) }))}</div>
      <div class="muted">${escapeHtml(t('orcamento.pdf.validade', { date: dataCurta(o.validade, formato) }))}</div>
    </div>
  </header>
  <div class="accent"></div>
  <h1>${escapeHtml(t('orcamento.tituloDoc'))} ${escapeHtml(o.numero)}</h1>
  <div class="info-grid">
    <div class="box">
      <div class="label">${escapeHtml(t('orcamento.pdf.empresa'))}</div>
      <strong>${escapeHtml(empresaNome)}</strong><br />
      <span class="muted">${escapeHtml(empresa.cnpj ? `CNPJ ${empresa.cnpj}` : '')}</span>
    </div>
    <div class="box">
      <div class="label">${escapeHtml(t('orcamento.pdf.cliente'))}</div>
      <strong>${escapeHtml(clienteNome)}</strong><br />
      <span class="muted">${escapeHtml(clienteContato)}</span><br />
      <span class="muted">${escapeHtml(clienteLocal)}</span>
    </div>
  </div>
  <div class="facts">
    <div class="fact"><span class="label">${escapeHtml(t('orcamento.pdf.prazo'))}</span><b>${escapeHtml(o.prazo_entrega || t('orcamento.detail.aCombinar'))}</b></div>
    <div class="fact"><span class="label">${escapeHtml(t('orcamento.pdf.pagamento'))}</span><b>${escapeHtml(o.condicoes_pagamento || t('orcamento.detail.aCombinar'))}</b></div>
    <div class="fact"><span class="label">${escapeHtml(t('orcamento.frete'))}</span><b>${escapeHtml(moeda(o.frete, formato))}</b></div>
    <div class="fact"><span class="label">${escapeHtml(t('orcamento.validade'))}</span><b>${escapeHtml(dataCurta(o.validade, formato))}</b></div>
  </div>
  <h2>${escapeHtml(t('orcamento.pdf.itens'))}</h2>
  <table>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>${escapeHtml(t('orcamento.pdf.descricao'))}</th>
        <th class="right">${escapeHtml(t('orcamento.pdf.qtd'))}</th>
        <th class="right">${escapeHtml(t('orcamento.pdf.unitario'))}</th>
        <th class="right">${escapeHtml(t('orcamento.pdf.desc'))}</th>
        <th class="right">${escapeHtml(t('orcamento.total'))}</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="after-table">
    <div class="muted">
      ${escapeHtml(t('orcamento.pdf.avisoCongelado'))}
    </div>
    <div class="total">
      <div><span>Subtotal</span><strong>${escapeHtml(moeda(subtotal, formato))}</strong></div>
      <div><span>${escapeHtml(t('calculadora.desconto'))}</span><strong>${escapeHtml(moeda(o.desconto, formato))}</strong></div>
      <div><span>${escapeHtml(t('orcamento.frete'))}</span><strong>${escapeHtml(moeda(o.frete, formato))}</strong></div>
      <div class="grand"><span>${escapeHtml(t('orcamento.total'))}</span><span>${escapeHtml(moeda(o.total, formato))}</span></div>
    </div>
  </div>
  <div class="lower">
    <div>
      <h2>${escapeHtml(t('orcamento.pdf.mensagemCliente'))}</h2>
      <div class="box obs">${escapeHtml(mensagemCliente)}</div>
    </div>
    <div>
      <h2>${escapeHtml(t('orcamento.condicoes'))}</h2>
      <div class="box muted">
        ${escapeHtml(t('orcamento.validade'))}: ${escapeHtml(dataCurta(o.validade, formato))}<br />
        ${escapeHtml(t('orcamento.prazoEntrega'))}: ${escapeHtml(o.prazo_entrega || '-')}<br />
        ${escapeHtml(t('orcamento.pdf.condicoesPagamento'))}: ${escapeHtml(o.condicoes_pagamento || '-')}<br />
        ${escapeHtml(t('orcamento.frete'))}: ${escapeHtml(moeda(o.frete, formato))}
      </div>
    </div>
  </div>
  <footer class="footer">
    <span>${escapeHtml(t('orcamento.pdf.validoAte', { date: dataCurta(o.validade, formato) }))}</span>
    <span>1/1</span>
  </footer>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
</body>
</html>`;
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) {
      setErro(t('orcamento.detail.popUpBloqueado'));
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  function statusLegivel(status: string) {
    if (status === 'recusado') return t('orcamento.statusLabel.recusadoPublico');
    return t(`orcamento.statusLabel.${status}`);
  }

  return (
    <div className="mx-auto flex w-full flex-col lg:h-[calc(100dvh-112px)] lg:min-h-0 lg:overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate('/orcamentos')}
            className="mb-2 text-xs font-extrabold text-brand-azul hover:underline"
          >
            ← {t('orcamento.titulo')}
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('orcamento.tituloDoc')} {o.numero}</h1>
            <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>{statusLegivel(o.status)}</Etiqueta>
          </div>
          <p className="mt-1 text-sm text-texto-2">
            {t('orcamento.criadoEm')} {dataCurta(o.created_at, formato)}
            {o.validade ? ` · ${t('orcamento.detail.validadeLinha', { date: dataCurta(o.validade, formato) })}` : ''}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Botao variante="secundario" className="h-11 sm:min-w-32" onClick={() => setEditando(true)} disabled={o.status !== 'rascunho' || !pode('orcamentos', 'editar')}>
            <MiniIcone tipo="edit" /> {t('acoes.editar')}
          </Botao>
          <Botao variante="secundario" className="h-11 sm:min-w-32" disabled={agindo} onClick={duplicar}>
            <MiniIcone tipo="copy" /> {t('orcamento.detail.duplicar')}
          </Botao>
          {podeAgir && pode('orcamentos', 'aprovar') && (
            <Botao variante="acento" className="h-11 sm:min-w-52" disabled={agindo} onClick={aprovar}>
              <MiniIcone tipo="check" /> {t('orcamento.aprovarGerarPedido')}
            </Botao>
          )}
        </div>
      </div>

      {erro && (
        <p className="mb-3 rounded-lg border border-erro/30 bg-erro/5 px-3 py-2 text-xs font-semibold text-erro">
          {erro}
        </p>
      )}

      <div className="grid flex-1 gap-4 lg:min-h-0 min-[2200px]:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-4 overflow-y-auto pr-0 min-[2200px]:pr-1">
          <section className="grid gap-3 xl:grid-cols-2">
            <InfoCard
              rotulo={t('orcamento.dadosEmpresa')}
              valor={empresaNome}
              apoio={empresa.cnpj ? `CNPJ ${empresa.cnpj}` : t('orcamento.detail.dadosCongelados')}
            />
            <InfoCard
              rotulo={t('orcamento.dadosCliente')}
              valor={clienteNome}
              apoio={[clienteContato, clienteLocal].filter(Boolean).join(' · ') || t('orcamento.detail.dadosCongelados')}
            />
          </section>

          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <InfoCard rotulo={t('orcamento.validade')} valor={dataCurta(o.validade, formato)} apoio={vencido ? t('orcamento.detail.vencido') : t('orcamento.detail.ativo')} />
            <InfoCard rotulo={t('orcamento.prazoEntrega')} valor={o.prazo_entrega || t('orcamento.detail.aCombinar')} />
            <InfoCard rotulo={t('orcamento.condicoes')} valor={o.condicoes_pagamento || t('orcamento.detail.naoInformado')} />
            <InfoCard rotulo={t('orcamento.frete')} valor={<Dinheiro centavos={o.frete} />} />
            <InfoCard rotulo={t('orcamento.detail.origem')} valor={origem} />
          </section>

          <section className="overflow-hidden rounded-xl border border-borda bg-white">
            <div className="border-b border-borda px-4 py-3">
              <h2 className="text-sm font-extrabold text-ink">{t('orcamento.detail.itensTitulo')}</h2>
              <p className="mt-0.5 text-xs text-texto-2">{t('orcamento.detail.itensAjuda')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-borda bg-surface-2/70 text-left">
                    {['Item', t('orcamento.detail.produtoDescricao'), t('orcamento.pdf.qtd'), t('orcamento.detail.valorUnit'), t('calculadora.desconto'), t('orcamento.total')].map((c, i) => (
                      <th key={c} className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide text-texto-2 ${i >= 2 ? 'text-right' : ''}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda/70">
                  {itensLista.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-extrabold text-texto-2">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-extrabold text-ink">{item.descricao}</p>
                        <p className="mt-0.5 text-xs text-texto-2">{t('orcamento.detail.snapshotItem')}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(item.quantidade)}</td>
                      <td className="px-4 py-3 text-right tabular-nums"><Dinheiro centavos={item.valor_unit} /></td>
                      <td className="px-4 py-3 text-right text-texto-2">—</td>
                      <td className="px-4 py-3 text-right font-extrabold tabular-nums text-ink"><Dinheiro centavos={item.valor_total} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-borda bg-surface-2/40">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right font-bold text-texto-2">Subtotal</td>
                    <td className="px-4 py-3 text-right font-extrabold"><Dinheiro centavos={subtotal} /></td>
                  </tr>
                  {o.frete > 0 && (
                    <tr>
                    <td colSpan={5} className="px-4 py-2 text-right font-bold text-texto-2">{t('orcamento.frete')}</td>
                      <td className="px-4 py-2 text-right font-extrabold"><Dinheiro centavos={o.frete} /></td>
                    </tr>
                  )}
                  {o.desconto > 0 && (
                    <tr>
                    <td colSpan={5} className="px-4 py-2 text-right font-bold text-texto-2">{t('calculadora.desconto')}</td>
                      <td className="px-4 py-2 text-right font-extrabold text-erro">- <Dinheiro centavos={o.desconto} /></td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right text-sm font-extrabold text-ink">Total</td>
                    <td className="px-4 py-3 text-right text-base font-extrabold grad-texto"><Dinheiro centavos={o.total} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
            <div className="rounded-xl border border-borda bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-ink">{t('orcamento.detail.mensagemCliente')}</h2>
                <Etiqueta cor="azul">{t('orcamento.detail.clienteEtiqueta')}</Etiqueta>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
                {o.observacoes || mensagemClientePadrao}
              </p>
            </div>
            <div className="rounded-xl border border-borda bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-ink">{t('orcamento.detail.relacaoProducao')}</h2>
                <Etiqueta cor="roxo">{t('orcamento.detail.proximoPasso')}</Etiqueta>
              </div>
              <p className="text-sm text-texto-2">
                {t('orcamento.detail.aprovacaoCriaPedido', {
                  count: itensLista.length,
                  itemLabel: t('orcamento.detail.itemProducao', { count: itensLista.length }),
                })}
              </p>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-borda bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-roxo/10 text-brand-roxo">
                  <MiniIcone tipo="attach" />
                </span>
                <h2 className="text-sm font-extrabold text-ink">{t('orcamento.detail.anexos')}</h2>
              </div>
              {(o.anexos ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {(o.anexos ?? []).map((a) => <li key={a} className="text-sm font-semibold text-brand-azul">{a}</li>)}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-borda bg-surface-2/50 py-6 text-center text-sm text-texto-2">
                  {t('orcamento.detail.semAnexos')}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-borda bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-azul/10 text-brand-azul">
                  <MiniIcone tipo="history" />
                </span>
                <h2 className="text-sm font-extrabold text-ink">{t('orcamento.detail.historico')}</h2>
              </div>
              <ol className="space-y-3">
                <LinhaHistorico titulo={t('orcamento.detail.criado')} detalhe={dataCurta(o.created_at, formato)} ativo />
                <LinhaHistorico titulo={t('orcamento.detail.enviado')} detalhe={o.enviado_em ? dataCurta(o.enviado_em, formato) : t('orcamento.detail.aguardandoEnvio')} ativo={!!o.enviado_em} />
                <LinhaHistorico titulo={t('orcamento.detail.aprovacao')} detalhe={o.aprovado_em ? dataCurta(o.aprovado_em, formato) : t('orcamento.detail.pendente')} ativo={!!o.aprovado_em} />
              </ol>
            </div>
          </section>
        </main>

        <aside className="min-h-0 space-y-3 overflow-y-auto min-[2200px]:block">
          <section className="rounded-xl border border-borda bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-ink">{t('orcamento.detail.resumoFinanceiro')}</h2>
              <Etiqueta cor={COR_STATUS_ORC[o.status] ?? 'cinza'}>{statusLegivel(o.status)}</Etiqueta>
            </div>
            <div className="mb-4 rounded-xl bg-ink p-4 text-white">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-white/60">{t('orcamento.totalDoc')}</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums"><Dinheiro centavos={o.total} /></p>
            </div>
            <dl className="space-y-2 text-sm">
              <LinhaResumo rotulo="Subtotal"><Dinheiro centavos={subtotal} /></LinhaResumo>
              <LinhaResumo rotulo={t('calculadora.desconto')}><Dinheiro centavos={o.desconto} /></LinhaResumo>
              <LinhaResumo rotulo={t('orcamento.frete')}><Dinheiro centavos={o.frete} /></LinhaResumo>
              {flag('ver_custos') && <LinhaResumo rotulo={t('orcamento.detail.custoEstimado')}><Dinheiro centavos={custoTotal} /></LinhaResumo>}
              {flag('ver_custos') && <LinhaResumo rotulo={t('orcamento.detail.lucroEstimado')}><span className="text-ok"><Dinheiro centavos={lucro} /></span></LinhaResumo>}
              {flag('ver_custos') && <LinhaResumo rotulo={t('orcamento.margemInterna')} destaque>{percentual(margem, formato)}</LinhaResumo>}
            </dl>
            {flag('ver_custos') && (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs font-bold text-texto-2">
                  <span>{t('orcamento.margemInterna')}</span>
                  <span>{percentual(margem, formato)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full grad-acento" style={{ width: `${Math.min(100, Math.max(0, margem * 100))}%` }} />
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-borda bg-white p-4">
            <h2 className="mb-3 text-sm font-extrabold text-ink">{t('orcamento.detail.acoes')}</h2>
            <div className="flex flex-col gap-2">
              <Botao variante="secundario" onClick={gerarPdf}><MiniIcone tipo="pdf" /> {t('orcamento.gerarPdf')}</Botao>
              <Botao variante="secundario" onClick={enviarWhatsApp}><MiniIcone tipo="whats" /> {t('orcamento.detail.enviarWhatsapp')}</Botao>
              {o.status === 'rascunho' && pode('orcamentos', 'editar') && (
                <>
                  <Botao variante="secundario" disabled={agindo} onClick={() => setEditando(true)}><MiniIcone tipo="edit" /> {t('orcamento.editar')}</Botao>
                  <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('enviado')}><MiniIcone tipo="send" /> {t('orcamento.marcarEnviado')}</Botao>
                </>
              )}
              {o.status === 'enviado' && pode('orcamentos', 'editar') && (
                <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('aguardando_resposta')}>
                  {t('orcamento.detail.aguardandoResposta')}
                </Botao>
              )}
              {['enviado', 'aguardando_resposta'].includes(o.status) && vencido && pode('orcamentos', 'editar') && (
                <Botao variante="secundario" disabled={agindo} onClick={() => mudarStatus('expirado')}>
                  {t('orcamento.marcarExpirado')}
                </Botao>
              )}
              {podeAgir && pode('orcamentos', 'aprovar') && (
                <>
                  <Botao variante="acento" disabled={agindo} onClick={aprovar}><MiniIcone tipo="check" /> {t('orcamento.aprovarGerarPedido')}</Botao>
                  <Botao variante="perigo" disabled={agindo} onClick={() => mudarStatus('recusado')}>{t('orcamento.recusar')}</Botao>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      {id && (
        <ModalEditarOrcamento
          orcamentoId={id}
          aberto={editando}
          onFechar={() => setEditando(false)}
          onSalvo={() => { setEditando(false); orc.refetch(); itens.refetch(); }}
        />
      )}
    </div>
  );
}

function LinhaHistorico({ titulo, detalhe, ativo }: { titulo: string; detalhe: string; ativo: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 size-3 rounded-full ${ativo ? 'bg-brand-roxo' : 'bg-borda'}`} />
      <span>
        <span className="block text-sm font-extrabold text-ink">{titulo}</span>
        <span className="text-xs text-texto-2">{detalhe}</span>
      </span>
    </li>
  );
}
