# Plano de pendências — Surface Labs (checklist vivo)

> **Como usar:** este é o nosso checklist entre sessões. Quando algo for feito,
> trocamos `- [ ]` por `- [x]`. Comece cada sessão lendo este arquivo para
> retomar sem se perder. Última atualização: **12/jun/2026 (tarde — P1 e P2 concluídos)**.
>
> Legenda: `- [x]` feito · `- [ ]` a fazer · ⭐ próximo recomendado

---

## ✅ Já construído (resumo — não precisa refazer)

- [x] Banco multi-tenant com RLS em toda tabela; masking por flags; LGPD (anonimizar/auditar/exportar)
- [x] Motor de cálculo puro e testado (centavos), com **preço atacado**; preview ao vivo + Edge Function autoritativa com snapshot imutável
- [x] Auth (e-mail+Google), onboarding cria tenant, convite, seletor de empresa
- [x] Telas base (v2): visão geral, calculadora, catálogos em cards, fichas em abas, orçamento-documento, kanban, OP, estoque, clientes, fornecedores, financeiro, fiscal, impressoras, cadastros (hub), configurações
- [x] Upload real de imagens (Storage RLS) + galeria; cores do modelo e variações de cor
- [x] Kanban arrastar-e-soltar (otimista + rollback)
- [x] **Impressão remota**: G-code no modelo, agente local (token/claim/status), botão Imprimir no modelo e na OP, fila em tempo real
- [x] Busca global; aba Arquivos da OP (upload)
- [x] **Novo Produto em stepper** + editor de identidade do produto
- [x] **Formulário completo do Modelo 3D** (criar + editar, todos os campos)
- [x] **Novo Pedido manual** (RPC `criar_pedido_manual` + stepper com resumo ao vivo;
      entrada/parcelas viram contas a receber, item de produto gera OP + reserva)
- [x] Filtros nos catálogos + cadastros completados (P2 inteiro — ver abaixo)

---

## 🔜 A fazer (por prioridade)

### P1 — núcleo do catálogo ✅ COMPLETO
- [x] Novo Produto em stepper
- [x] Editar identidade do produto (modal + painel "Informações do produto")
- [x] Formulário completo do Modelo 3D (criar + editar)
- [x] **Novo Pedido manual** — stepper Cliente → Itens → Pagamento & entrega → Revisão,
      resumo ao vivo. RPC `criar_pedido_manual` no servidor: snapshot congelado,
      reserva de estoque, 1 OP por item de produto, contas a receber (entrada vence
      hoje + saldo em N parcelas mensais). Item avulso (serviço/taxa) não gera OP.

### P2 — completar formulários/cadastros ✅ COMPLETO
- [x] Filtro por **categoria** no catálogo de produtos (aparece quando há categorias)
- [x] Filtros no catálogo de modelos (categoria / material / tecnologia) + badge de versão no card
- [x] Material (modal): campo **fornecedor** + **observação**
- [x] Impressora (modal): **nº de série, data de aquisição, horas/dia, foto, perfil de energia**
- [x] Fornecedor (modal): **categorias fornecidas (multi), condições de pagamento, endereço, observações**
- [x] Cliente (modal): **canal de origem (select com opções), indicação**
- [x] Registrar falha (modal): **foto da falha** (Storage RLS) + **responsável** (membro ativo do tenant)

### P3 — gestão e agregações
- [ ] ⭐ Clientes: colunas **última compra / total comprado / a receber** + **ficha do cliente** (hoje só modal)
- [ ] Fornecedores: **última compra / total comprado**, **alertas de aumento de preço**, **histórico de preços**
- [ ] Estoque: coluna **sugestão de compra** (qtd calculada: mínimo − disponível + fila)
- [ ] Composição: botão **Importar** (modelos de composição por categoria) + coluna **fornecedor** por item

### P4 — Relatórios (módulo novo, não existe ainda)
- [ ] Painel de relatórios (§10 do plano): produtos mais rentáveis, **taxa de falhas**, **utilização das impressoras**, rentabilidade por canal de venda, horas/resultado por pessoa, faturamento×custo×lucro por período

### P5 — polimento das telas existentes
- [ ] Detalhamento de custos (08): tabela **custo → preço → margem** comparando os 3 cenários lado a lado
- [x] Orçamento (09): editar cabeçalho **e itens** em rascunho (com recálculo no servidor) + **ações de status** (enviar/aguardando/recusar/expirar) na lista e no detalhe + **Novo orçamento manual em stepper**. *(falta só anexos na UI)*
- [ ] Kanban (10): cards com **foto / responsável / tempo restante** + **rodapé de 4 métricas**; (opcional) separar "Pedidos" e "Produção" como itens de menu
- [ ] OP (11): aba **Comunicações** (precisa modelo de comentários no banco)
- [ ] Fiscal (13): **impostos por tipo** (ISS/ICMS), **calendário de obrigações**, **checklist de conformidade** (elétrico/infantil/alimento)
- [x] Financeiro (19): KPI **saldo em caixa**, coluna+filtro **conta**, card **próximos pagamentos**, **pagamento parcial** (baixa controlada). *(conciliação bancária por importação fica para depois)*
- [ ] Cadastros (17): cartões dedicados **Categorias**, **Embalagens**, **Backup & exportação**, **Usuários & permissões**
- [ ] Impressoras (18): **foto** + **barra de uso/horas** na tabela

### ✅ Página do Pedido (/pedidos/:id) — NOVO (não estava no plano)
- [x] Tela do pedido como objeto de negócio: itens, cliente, origem, **OPs vinculadas**, resumo interno (custo/lucro/margem), total, **entrega** (marcar entregue) e **recebimentos** (registrar do próprio pedido). Lista, kanban e OP agora linkam para o pedido. Fecha o maior buraco de controle do dia a dia.

---

## 🛠️ Pendências técnicas / infraestrutura

- [ ] **Deploy na nuvem**: `npx supabase link` → `db push` → `functions deploy` → habilitar **Google OAuth** no painel
- [ ] **Stripe real**: checkout + Customer Portal + webhook (hoje só a estrutura de entitlements)
- [ ] **E-mail transacional** (Resend/SendGrid): convite por e-mail (hoje só link copiável), envio de orçamento
- [ ] **2FA TOTP** na UI (Dono/Admin) — backend de Auth já suporta
- [ ] Impressão: integração **OctoPrint com hardware real** (testado só em simulação); nuvem de fabricante (Bambu/Anycubic); **segurança de impressão desacompanhada** (confirmação/câmera)
- [ ] **Replica Pro** como webfont (licença Lineto) ou manter Montserrat na web
- [ ] Limpar dados de teste do banco local (trabalhos de impressão com falha IMP-0001/0002, etc.)
- [ ] Jobs agendados (pg_cron): alerta de estoque baixo, orçamento vencendo, próxima manutenção
- [ ] Logo spirograph oficial (substituir o SVG placeholder em `public/brand/`)

---

## ❓ Decisões a confirmar com o Lucas (quando voltarmos)
- Preços dos planos (mensal/anual) e duração de trial/carência
- Quais OAuth além do Google; 2FA opcional vs. obrigatório
- Alíquotas/regime fiscal reais (validar com contador)
- Região do Supabase (US padrão → atenção LGPD/transferência internacional)
