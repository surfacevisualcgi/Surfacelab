/**
 * Espelho CLIENT-SIDE da matriz papel × módulo × ação (seed de
 * 20260611000001_governanca.sql) e das flags sensíveis.
 *
 * Serve SÓ para esconder botões/menus (conforto de UI). A garantia real é
 * sempre do backend: RLS + funções app.tem_permissao / app.tem_flag.
 */

export type Papel = 'dono' | 'administrador' | 'comercial' | 'producao' | 'leitura';
export type Acao = 'ver' | 'criar' | 'editar' | 'excluir' | 'aprovar' | 'exportar';
export type Flag =
  | 'ver_custos'
  | 'ver_financeiro'
  | 'ver_prolabore'
  | 'ver_pii_cliente'
  | 'exportar';

export const MODULOS = [
  'modelos', 'produtos', 'calculadora', 'orcamentos', 'pedidos', 'producao',
  'estoque', 'compras', 'clientes', 'fornecedores', 'financeiro', 'fiscal',
  'relatorios', 'configuracoes', 'usuarios',
] as const;
export type Modulo = (typeof MODULOS)[number];

const TODAS_ACOES: Acao[] = ['ver', 'criar', 'editar', 'excluir', 'aprovar', 'exportar'];

const MODULOS_COMERCIAL: Modulo[] = [
  'modelos', 'produtos', 'calculadora', 'orcamentos', 'pedidos', 'producao',
  'estoque', 'compras', 'clientes', 'fornecedores', 'relatorios',
];

export function temPermissao(
  papel: Papel | null,
  modulo: Modulo,
  acao: Acao,
  extras?: Record<string, Record<string, boolean>>,
): boolean {
  if (!papel) return false;
  if (extras?.[modulo]?.[acao]) return true;
  switch (papel) {
    case 'dono':
    case 'administrador':
      return true;
    case 'comercial':
      return (
        MODULOS_COMERCIAL.includes(modulo) &&
        (['ver', 'criar', 'editar', 'aprovar'] as Acao[]).includes(acao)
      );
    case 'producao':
      if (acao === 'ver')
        return (['modelos', 'produtos', 'pedidos', 'producao', 'estoque'] as Modulo[]).includes(modulo);
      if (acao === 'criar' || acao === 'editar')
        return modulo === 'producao' || modulo === 'estoque';
      return false;
    case 'leitura':
      return acao === 'ver' && MODULOS_COMERCIAL.includes(modulo);
    default:
      return false;
  }
}

export function temFlag(
  papel: Papel | null,
  flag: Flag,
  overrides?: Record<string, boolean>,
): boolean {
  if (!papel) return false;
  if (overrides && flag in overrides) return overrides[flag];
  switch (papel) {
    case 'dono':
      return true;
    case 'administrador':
      return flag !== 'ver_prolabore';
    case 'comercial':
      return flag === 'ver_custos' || flag === 'ver_pii_cliente';
    default:
      return false;
  }
}

export { TODAS_ACOES };
