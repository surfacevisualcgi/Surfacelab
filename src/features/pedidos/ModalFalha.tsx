/**
 * Modal 08 — Registrar falha de produção (v2): tom de atenção (âmbar),
 * card de impacto estimado no custo calculado AO VIVO.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { moeda } from '@/lib/formato';
import { Botao, Campo, Entrada, Modal, Selecao } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';

interface MaterialRef { id: string; nome: string; custo_medio: number; unidade_consumo: string }

export function ModalFalha({ op, onFechar, onSucesso }: {
  op: { id: string; numero: string } | null;
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const { t } = useTranslation();
  const { formato, flag } = useAuth();
  const materiais = useLista<MaterialRef>('material', { ordem: 'nome', desc: false });
  const [erro, setErro] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState('');
  const [desperdicio, setDesperdicio] = useState(0);

  const impacto = useMemo(() => {
    const m = (materiais.data ?? []).find((x) => x.id === materialId);
    return m ? Math.round(desperdicio * Number(m.custo_medio)) : 0;
  }, [materiais.data, materialId, desperdicio]);

  async function registrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!op) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('registrar_falha', {
      p_op: op.id,
      p_motivo: f.get('motivo') as string,
      p_etapa: (f.get('etapa') as string) || null,
      p_material: materialId || null,
      p_desperdicio_g: desperdicio,
      p_tempo_perdido_min: Number(f.get('tempo_perdido_min') || 0),
      p_reimprimir: f.get('reimprimir') === 'on',
    });
    if (error) setErro(mensagemErro(error));
    else {
      setErro(null);
      onSucesso();
    }
  }

  return (
    <Modal aberto={!!op} titulo={`${t('pedido.registrarFalha')} — ${op?.numero ?? ''}`} onFechar={onFechar}>
      <form onSubmit={registrar} className="space-y-3">
        <Campo rotulo="Etapa">
          <Selecao name="etapa" defaultValue="impressao">
            {['preparacao', 'impressao', 'suporte', 'acabamento', 'montagem'].map((e2) => (
              <option key={e2} value={e2}>{t(`pedido.etapaFalha.${e2}`)}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Motivo">
          <Entrada name="motivo" required placeholder="Ex.: descolou da mesa na camada 40" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Material desperdiçado">
            <Selecao value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">—</option>
              {(materiais.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Desperdício (g/ml)">
            <Entrada type="number" min="0" step="any" value={desperdicio || ''}
              onChange={(e) => setDesperdicio(Number(e.target.value) || 0)} />
          </Campo>
        </div>
        <Campo rotulo="Tempo perdido (min)">
          <Entrada name="tempo_perdido_min" type="number" min="0" defaultValue={0} />
        </Campo>
        {/* impacto ao vivo (v2: card âmbar, tom de atenção) */}
        {flag('ver_custos') && impacto > 0 && (
          <div className="rounded-xl border border-alerta/40 bg-alerta/5 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-alerta">
              {t('pedido.impactoCusto')}
            </p>
            <p className="text-lg font-extrabold tabular-nums text-alerta">{moeda(impacto, formato)}</p>
            <p className="text-[11px] text-texto-2">{t('pedido.impactoCustoDica')}</p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-texto">
          <input type="checkbox" name="reimprimir" className="accent-brand-azul" />
          Reimprimir a peça
        </label>
        {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onFechar}>{t('acoes.cancelar')}</Botao>
          <Botao type="submit">{t('pedido.registrarFalhaConfirmar')}</Botao>
        </div>
      </form>
    </Modal>
  );
}
