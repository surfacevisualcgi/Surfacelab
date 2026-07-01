/**
 * Catálogo curado de filamentos e resinas — dado de REFERÊNCIA global (igual
 * para todos os tenants), embutido no app. Serve só para deixar o cadastro
 * intuitivo: o usuário seleciona em vez de digitar tudo, e os campos técnicos
 * (unidade de compra/consumo, fator de conversão) são pré-preenchidos.
 *
 * Não vai para o banco: o tipo específico (PLA, PETG, Castável…) e o acabamento
 * entram no `nome` composto do material; a coluna `tipo` continua sendo a
 * categoria ampla (filamento/resina). Por isso não precisa de migration.
 *
 * Marcas são nomes próprios (não traduzidos). Acabamentos e subtipos de resina
 * têm rótulo traduzido via i18n (cadastros.material.acabamentoLabel /
 * subtipoResinaLabel). Polímeros são universais (PLA, PETG…) e ficam crus.
 */

/** Padrão de unidades — filamento e resina são vendidos por kg e consumidos em g. */
export const UNIDADE_PADRAO = { compra: 'kg', consumo: 'g', fator: 1000 } as const;

/** Polímeros de filamento mais comuns (rótulo é universal). */
export const POLIMEROS_FILAMENTO: { id: string; label: string }[] = [
  { id: 'PLA', label: 'PLA' },
  { id: 'PLA+', label: 'PLA+' },
  { id: 'PETG', label: 'PETG' },
  { id: 'ABS', label: 'ABS' },
  { id: 'ASA', label: 'ASA' },
  { id: 'TPU', label: 'TPU (flexível)' },
  { id: 'TPE', label: 'TPE (flexível)' },
  { id: 'Nylon', label: 'Nylon (PA)' },
  { id: 'PC', label: 'PC (policarbonato)' },
  { id: 'PVA', label: 'PVA (solúvel)' },
  { id: 'HIPS', label: 'HIPS (suporte)' },
  { id: 'PP', label: 'PP (polipropileno)' },
];

/** Acabamentos/aparência de filamento — id casa com i18n acabamentoLabel.<id>. */
export const ACABAMENTOS_FILAMENTO: string[] = [
  'padrao',
  'silk',
  'fosco',
  'brilhante',
  'transparente',
  'translucido',
  'glow',
  'termocromico',
  'holografico',
  'glitter',
  'multicor',
  'madeira',
  'marmore',
  'fibra_carbono',
  'metalizado',
];

/** Subtipos de resina — id casa com i18n subtipoResinaLabel.<id>. */
export const SUBTIPOS_RESINA: string[] = [
  'padrao',
  'resistente',
  'lavavel',
  'flexivel',
  'castavel',
  'alta_temp',
  'rapida',
  'transparente',
  'dental',
];

/** Marcas comuns de filamento (globais + Brasil). */
export const MARCAS_FILAMENTO: string[] = [
  'Multfila', 'Flashforge', 'Polymaker', 'Prusament', 'eSun', 'Bambu Lab',
  'Sunlu', 'Hatchbox', 'Overture', 'Creality', 'Voxelab', 'Elegoo',
  'Anycubic', '3DFila', 'Cliever', 'GTMax3D', 'National3D', 'Voolt 3D',
  'AzeoFil', 'Print3D', 'F3D Fillament', 'UP3D',
];

/** Marcas comuns de resina (globais + Brasil). */
export const MARCAS_RESINA: string[] = [
  'Anycubic', 'Elegoo', 'Phrozen', 'Siraya Tech', 'Sunlu', 'eSun',
  'Creality', 'Monocure', 'ApplyLabWork', 'Nova3D', 'BlueCast', 'Peopoly',
  'Smart Resin', 'Yller', '3DLab', 'Loctite 3D', 'Resilab',
];

export function marcasDe(tipo: string): string[] {
  return tipo === 'resina' ? MARCAS_RESINA : MARCAS_FILAMENTO;
}

export type PresetMaterialSimples = {
  nome: string;
  unidadeCompra: string;
  unidadeConsumo: string;
  fator: number;
  minimo: number;
  observacao?: string;
};

export const COMPONENTES_3D: PresetMaterialSimples[] = [
  { nome: 'Imã de neodímio', unidadeCompra: 'un', unidadeConsumo: 'un', fator: 1, minimo: 20 },
  { nome: 'Parafuso M3', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 100, minimo: 30 },
  { nome: 'Porca M3', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 100, minimo: 30 },
  { nome: 'Rolamento', unidadeCompra: 'un', unidadeConsumo: 'un', fator: 1, minimo: 4 },
  { nome: 'Argola de chaveiro', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 100, minimo: 25 },
  { nome: 'LED', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 50, minimo: 10 },
  { nome: 'Base acrílica', unidadeCompra: 'un', unidadeConsumo: 'un', fator: 1, minimo: 5 },
];

export const CONSUMIVEIS_3D: PresetMaterialSimples[] = [
  { nome: 'Álcool isopropílico', unidadeCompra: 'L', unidadeConsumo: 'ml', fator: 1000, minimo: 250 },
  { nome: 'Luva nitrílica', unidadeCompra: 'caixa', unidadeConsumo: 'un', fator: 100, minimo: 20 },
  { nome: 'Papel toalha', unidadeCompra: 'pacote', unidadeConsumo: 'folha', fator: 120, minimo: 20 },
  { nome: 'Cola bastão', unidadeCompra: 'un', unidadeConsumo: 'un', fator: 1, minimo: 1 },
  { nome: 'Fita azul', unidadeCompra: 'rolo', unidadeConsumo: 'cm', fator: 5000, minimo: 500 },
  { nome: 'Lixa', unidadeCompra: 'folha', unidadeConsumo: 'un', fator: 1, minimo: 10 },
  { nome: 'Nozzle / bico', unidadeCompra: 'un', unidadeConsumo: 'un', fator: 1, minimo: 2 },
  { nome: 'Filme FEP/PFA', unidadeCompra: 'un', unidadeConsumo: 'un', fator: 1, minimo: 1 },
];

export const EMBALAGENS_3D: PresetMaterialSimples[] = [
  { nome: 'Caixa de papelão pequena', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 25, minimo: 10 },
  { nome: 'Caixa de papelão média', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 25, minimo: 10 },
  { nome: 'Envelope plástico', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 100, minimo: 20 },
  { nome: 'Plástico bolha', unidadeCompra: 'rolo', unidadeConsumo: 'cm', fator: 10000, minimo: 1000 },
  { nome: 'Saco zip', unidadeCompra: 'pacote', unidadeConsumo: 'un', fator: 100, minimo: 20 },
  { nome: 'Etiqueta adesiva', unidadeCompra: 'rolo', unidadeConsumo: 'un', fator: 500, minimo: 50 },
  { nome: 'Fita adesiva para embalagem', unidadeCompra: 'rolo', unidadeConsumo: 'cm', fator: 5000, minimo: 500 },
];

export function presetsDeMaterialSimples(tipo: string): PresetMaterialSimples[] {
  if (tipo === 'componente') return COMPONENTES_3D;
  if (tipo === 'consumivel') return CONSUMIVEIS_3D;
  if (tipo === 'embalagem') return EMBALAGENS_3D;
  return [];
}
