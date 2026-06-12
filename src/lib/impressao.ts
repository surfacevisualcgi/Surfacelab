/**
 * Impressão remota — tipos e cores de status compartilhados entre a ficha do
 * modelo (G-code + imprimir), a OP (botão imprimir) e a config do agente.
 */
export interface ArquivoGcode {
  id: string;
  modelo_id: string;
  nome: string;
  path: string;
  impressora_id: string | null;
  cor: string | null;
  peso_g: number | null;
  tempo_min: number | null;
  tamanho_bytes: number | null;
}

export interface TrabalhoImpressao {
  id: string;
  numero: string;
  gcode_id: string | null;
  modelo_id: string | null;
  impressora_id: string | null;
  agente_id: string | null;
  pedido_id: string | null;
  ordem_producao_id: string | null;
  status: 'fila' | 'enviado' | 'imprimindo' | 'pausado' | 'concluido' | 'falha' | 'cancelado';
  progresso_pct: number;
  mensagem: string | null;
  enfileirado_em: string;
  created_at: string;
}

export const COR_STATUS_IMPRESSAO: Record<
  TrabalhoImpressao['status'],
  'cinza' | 'azul' | 'amarelo' | 'verde' | 'vermelho' | 'roxo'
> = {
  fila: 'cinza',
  enviado: 'azul',
  imprimindo: 'roxo',
  pausado: 'amarelo',
  concluido: 'verde',
  falha: 'vermelho',
  cancelado: 'cinza',
};
