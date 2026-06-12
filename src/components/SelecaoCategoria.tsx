/**
 * Seletor de categoria reutilizável (modelo | produto | material): lista as
 * categorias do escopo e permite criar uma nova na hora (insere e seleciona).
 * Controlado: recebe `valor` (categoria_id|'') e `onChange`.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useLista, mensagemErro } from '@/lib/dados';
import { useAuth } from '@/auth/AuthProvider';
import { Botao, Entrada, Selecao } from '@/components/ui';

interface Categoria { id: string; nome: string; escopo: string }

export function SelecaoCategoria({
  escopo,
  valor,
  onChange,
}: {
  escopo: 'modelo' | 'produto' | 'material';
  valor: string;
  onChange: (categoriaId: string) => void;
}) {
  const { t } = useTranslation();
  const { ativa } = useAuth();
  const qc = useQueryClient();
  const lista = useLista<Categoria>('categoria', { ordem: 'nome', desc: false });
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const doEscopo = (lista.data ?? []).filter((c) => c.escopo === escopo);

  async function criar() {
    if (!nova.trim()) return;
    setErro(null);
    const { data, error } = await supabase
      .from('categoria')
      .insert({ tenant_id: ativa?.tenant_id, nome: nova.trim(), escopo })
      .select('id')
      .single();
    if (error) { setErro(mensagemErro(error)); return; }
    await qc.invalidateQueries({ queryKey: ['categoria'] });
    onChange(data.id);
    setNova('');
    setCriando(false);
  }

  if (criando) {
    return (
      <div className="flex gap-1.5">
        <Entrada autoFocus value={nova} onChange={(e) => setNova(e.target.value)}
          placeholder={t('categoria.nomePlaceholder')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criar(); } }} />
        <Botao type="button" variante="secundario" className="!px-2.5" onClick={criar}>✓</Botao>
        <Botao type="button" variante="fantasma" className="!px-2" onClick={() => { setCriando(false); setErro(null); }}>✕</Botao>
        {erro && <span className="text-xs text-erro">{erro}</span>}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <Selecao value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {doEscopo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </Selecao>
      <Botao type="button" variante="secundario" className="!px-2.5 whitespace-nowrap"
        onClick={() => setCriando(true)}>
        + {t('categoria.nova')}
      </Botao>
    </div>
  );
}
