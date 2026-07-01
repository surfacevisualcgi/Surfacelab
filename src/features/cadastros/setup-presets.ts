export type RegiaoSetup = 'br' | 'us';

export type PresetFornecedor = {
  nome: string;
  tipo: 'marketplace' | 'loja_3d' | 'local' | 'atacado' | 'outro';
  pais: 'BR' | 'US';
  categorias: string[];
  prazo_entrega_dias: number;
  condicoes_pagamento?: string;
  observacoes?: string;
};

export type PresetCanal = {
  nome: string;
  tipo: 'direto' | 'marketplace' | 'loja_online' | 'social' | 'atacado' | 'outro';
  taxa_marketplace: number;
  taxa_pagamento: number;
  comissao: number;
  custo_fixo_pedido: number;
  observacoes?: string;
};

export type PresetCustoFixo = {
  nome: string;
  categoria: string;
  valor_mensal: number;
  ratear: boolean;
  observacao?: string;
};

export type PresetTarefa = {
  nome: string;
  tipo: string;
  valor_hora: number;
  incluir_padrao: boolean;
};

export type PresetEnergia = {
  nome: string;
  tarifa_kwh: number;
};

export type PresetsSetup = {
  fornecedores: PresetFornecedor[];
  canais: PresetCanal[];
  custosFixos: PresetCustoFixo[];
  tarefas: PresetTarefa[];
  energia: PresetEnergia[];
};

export const SETUP_PRESETS: Record<RegiaoSetup, PresetsSetup> = {
  br: {
    fornecedores: [
      { nome: 'Amazon Brasil', tipo: 'marketplace', pais: 'BR', categorias: ['filamento', 'resina', 'componentes'], prazo_entrega_dias: 3, observacoes: 'Marketplace geral. Confirme frete e vendedor.' },
      { nome: 'Mercado Livre', tipo: 'marketplace', pais: 'BR', categorias: ['filamento', 'resina', 'componentes', 'embalagem'], prazo_entrega_dias: 3, observacoes: 'Bom para reposicao rapida; variacao grande de vendedores.' },
      { nome: 'Shopee Brasil', tipo: 'marketplace', pais: 'BR', categorias: ['componentes', 'embalagem', 'consumiveis'], prazo_entrega_dias: 7 },
      { nome: 'AliExpress', tipo: 'marketplace', pais: 'BR', categorias: ['componentes', 'pecas', 'consumiveis'], prazo_entrega_dias: 20, observacoes: 'Melhor para compra planejada.' },
      { nome: '3DFila', tipo: 'loja_3d', pais: 'BR', categorias: ['filamento'], prazo_entrega_dias: 5 },
      { nome: 'GTMax3D', tipo: 'loja_3d', pais: 'BR', categorias: ['filamento', 'pecas', 'impressoras'], prazo_entrega_dias: 5 },
      { nome: 'Voolt 3D', tipo: 'loja_3d', pais: 'BR', categorias: ['filamento'], prazo_entrega_dias: 5 },
      { nome: 'Anycubic', tipo: 'loja_3d', pais: 'BR', categorias: ['resina', 'impressoras'], prazo_entrega_dias: 10 },
      { nome: 'Elegoo', tipo: 'loja_3d', pais: 'BR', categorias: ['resina', 'impressoras'], prazo_entrega_dias: 10 },
    ],
    canais: [
      { nome: 'Venda direta / WhatsApp', tipo: 'direto', taxa_marketplace: 0, taxa_pagamento: 0.0199, comissao: 0, custo_fixo_pedido: 0, observacoes: 'Ajuste a taxa conforme Pix, cartao ou link de pagamento.' },
      { nome: 'Instagram', tipo: 'social', taxa_marketplace: 0, taxa_pagamento: 0.0299, comissao: 0, custo_fixo_pedido: 0 },
      { nome: 'Mercado Livre', tipo: 'marketplace', taxa_marketplace: 0.16, taxa_pagamento: 0, comissao: 0, custo_fixo_pedido: 0, observacoes: 'Tarifa varia por categoria, preco e tipo de anuncio.' },
      { nome: 'Shopee', tipo: 'marketplace', taxa_marketplace: 0.14, taxa_pagamento: 0, comissao: 0, custo_fixo_pedido: 0, observacoes: 'Confirme comissao atual da sua categoria.' },
      { nome: 'Elo7', tipo: 'marketplace', taxa_marketplace: 0.18, taxa_pagamento: 0, comissao: 0, custo_fixo_pedido: 0 },
      { nome: 'Amazon', tipo: 'marketplace', taxa_marketplace: 0.15, taxa_pagamento: 0, comissao: 0, custo_fixo_pedido: 0, observacoes: 'Tarifa por categoria.' },
    ],
    custosFixos: [
      { nome: 'Aluguel / espaco', categoria: 'aluguel', valor_mensal: 0, ratear: true },
      { nome: 'Internet', categoria: 'internet', valor_mensal: 0, ratear: true },
      { nome: 'Softwares e assinaturas', categoria: 'software', valor_mensal: 0, ratear: true },
      { nome: 'Contador', categoria: 'contador', valor_mensal: 0, ratear: true },
      { nome: 'Manutencao preventiva', categoria: 'manutencao', valor_mensal: 0, ratear: true },
      { nome: 'Suprimentos indiretos', categoria: 'suprimentos', valor_mensal: 0, ratear: true },
    ],
    tarefas: [
      { nome: 'Preparacao do arquivo', tipo: 'preparacao', valor_hora: 0, incluir_padrao: true },
      { nome: 'Fatiamento / slicing', tipo: 'preparacao', valor_hora: 0, incluir_padrao: true },
      { nome: 'Setup da maquina', tipo: 'producao', valor_hora: 0, incluir_padrao: true },
      { nome: 'Remocao de suporte', tipo: 'acabamento', valor_hora: 0, incluir_padrao: true },
      { nome: 'Lixamento / acabamento', tipo: 'acabamento', valor_hora: 0, incluir_padrao: true },
      { nome: 'Pintura', tipo: 'acabamento', valor_hora: 0, incluir_padrao: false },
      { nome: 'Embalagem', tipo: 'embalagem', valor_hora: 0, incluir_padrao: true },
    ],
    energia: [
      { nome: 'Residencial - media', tarifa_kwh: 90 },
      { nome: 'Comercial - media', tarifa_kwh: 110 },
      { nome: 'Estimado manual', tarifa_kwh: 100 },
    ],
  },
  us: {
    fornecedores: [
      { nome: 'Amazon', tipo: 'marketplace', pais: 'US', categorias: ['filament', 'resin', 'components'], prazo_entrega_dias: 3 },
      { nome: 'eBay', tipo: 'marketplace', pais: 'US', categorias: ['components', 'parts'], prazo_entrega_dias: 7 },
      { nome: 'Walmart Marketplace', tipo: 'marketplace', pais: 'US', categorias: ['supplies', 'packaging'], prazo_entrega_dias: 5 },
      { nome: 'AliExpress', tipo: 'marketplace', pais: 'US', categorias: ['components', 'printer parts'], prazo_entrega_dias: 18 },
      { nome: 'MatterHackers', tipo: 'loja_3d', pais: 'US', categorias: ['filament', 'resin', 'printers'], prazo_entrega_dias: 5 },
      { nome: 'Micro Center', tipo: 'loja_3d', pais: 'US', categorias: ['filament', 'printers', 'parts'], prazo_entrega_dias: 3 },
      { nome: 'Bambu Lab', tipo: 'loja_3d', pais: 'US', categorias: ['filament', 'printers'], prazo_entrega_dias: 5 },
      { nome: 'Printed Solid', tipo: 'loja_3d', pais: 'US', categorias: ['filament', 'printer parts'], prazo_entrega_dias: 5 },
      { nome: 'Elegoo', tipo: 'loja_3d', pais: 'US', categorias: ['resin', 'printers'], prazo_entrega_dias: 5 },
    ],
    canais: [
      { nome: 'Direct sale', tipo: 'direto', taxa_marketplace: 0, taxa_pagamento: 0.029, comissao: 0, custo_fixo_pedido: 0, observacoes: 'Adjust to your card processor or cash/POS flow.' },
      { nome: 'Etsy', tipo: 'marketplace', taxa_marketplace: 0.065, taxa_pagamento: 0.03, comissao: 0, custo_fixo_pedido: 20, observacoes: 'Includes an editable listing/payment estimate.' },
      { nome: 'Shopify', tipo: 'loja_online', taxa_marketplace: 0, taxa_pagamento: 0.029, comissao: 0, custo_fixo_pedido: 30 },
      { nome: 'Amazon', tipo: 'marketplace', taxa_marketplace: 0.15, taxa_pagamento: 0, comissao: 0, custo_fixo_pedido: 0, observacoes: 'Referral fee varies by category.' },
      { nome: 'eBay', tipo: 'marketplace', taxa_marketplace: 0.1325, taxa_pagamento: 0, comissao: 0, custo_fixo_pedido: 0 },
      { nome: 'Facebook Marketplace', tipo: 'social', taxa_marketplace: 0, taxa_pagamento: 0.029, comissao: 0, custo_fixo_pedido: 0 },
    ],
    custosFixos: [
      { nome: 'Rent / studio space', categoria: 'aluguel', valor_mensal: 0, ratear: true },
      { nome: 'Internet', categoria: 'internet', valor_mensal: 0, ratear: true },
      { nome: 'Software subscriptions', categoria: 'software', valor_mensal: 0, ratear: true },
      { nome: 'Accounting', categoria: 'contador', valor_mensal: 0, ratear: true },
      { nome: 'Insurance', categoria: 'seguro', valor_mensal: 0, ratear: true },
      { nome: 'Shop supplies', categoria: 'suprimentos', valor_mensal: 0, ratear: true },
    ],
    tarefas: [
      { nome: 'File prep', tipo: 'preparacao', valor_hora: 0, incluir_padrao: true },
      { nome: 'Slicing', tipo: 'preparacao', valor_hora: 0, incluir_padrao: true },
      { nome: 'Machine setup', tipo: 'producao', valor_hora: 0, incluir_padrao: true },
      { nome: 'Support removal', tipo: 'acabamento', valor_hora: 0, incluir_padrao: true },
      { nome: 'Sanding / finishing', tipo: 'acabamento', valor_hora: 0, incluir_padrao: true },
      { nome: 'Painting', tipo: 'acabamento', valor_hora: 0, incluir_padrao: false },
      { nome: 'Packing', tipo: 'embalagem', valor_hora: 0, incluir_padrao: true },
    ],
    energia: [
      { nome: 'Residential average', tarifa_kwh: 18 },
      { nome: 'Commercial average', tarifa_kwh: 24 },
      { nome: 'Manual estimate', tarifa_kwh: 20 },
    ],
  },
};
