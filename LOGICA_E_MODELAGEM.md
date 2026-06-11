# Lógica e Modelagem — Surface Labs

Este documento traduz os protótipos (`prototipo v2/`) em **lógica**: o modelo de dados,
as regras de negócio, as fórmulas e os fluxos que conectam cada tela. Os protótipos são
a planta visual; este é o esqueleto que faz tudo se conectar corretamente.

Complementa (não repete) os docs de governança: multi-tenant, RBAC/LGPD, segurança
Supabase, auth, planos, e `ARQUITETURA_BACKEND.md` (motor de cálculo, snapshot, API,
i18n/centavos). Tudo aqui é **por tenant** (`tenant_id` + RLS) e dinheiro em **centavos**.

---

## 1. Mapa de entidades (visão de alto nível)

```
CADASTROS REUTILIZÁVEIS            CATÁLOGO                  COMERCIAL/OPERAÇÃO
  Impressora ───┐                  Modelo 3D ──┐             Simulação(cálculo)
  Material/Insumo──┐               Produto ────┤  composição     │ vira
  Fornecedor    │  │ alimentam     (BOM liga    │             Orçamento ─(aprova)─┐
  Cliente       │  │ custo/preço   Modelo+Insumo+│            (snapshot de valores)│
  Canal venda(taxas)│             Embalagem+Serviço)            │                  ▼
  Custo fixo    │  │                                          Pedido ──gera──> Ordem de Produção
  Tarefa M.O.   │  │                                            │ reserva         │ consumo real
  Perfil energia│  │                                            ▼ estoque          ▼
  Empresa/Fiscal┘  │                                       Movimentação de Estoque (ledger)
                   └──────────────> CALCULADORA <───────────────┘  (baixa/ajuste)
                                       │ resultados                      │
                                       ▼                                 ▼
                              preço/lucro/margem              Financeiro (lançamentos,
                                                               contas a pagar/receber)
```

**Relações centrais (as "conexões" que as telas revelam):**
- **Modelo 3D** é a ficha técnica do que se imprime (≠ produto). Um produto usa 1..N
  modelos (com quantidade).
- **Produto** = item vendável. Sua **Composição (BOM)** lista modelos impressos +
  componentes + embalagem + serviços, cada um com quantidade e custo.
- **Material/Insumo, Impressora, Mão de obra, Energia, Canal, Fiscal, Custo fixo**
  alimentam a **Calculadora**.
- **Calculadora → Orçamento (snapshot) → Pedido → Ordem de Produção → Movimentação de
  Estoque → Financeiro.** Essa é a espinha do sistema.
- Cada etapa guarda o **estimado**; a produção registra o **real**; o sistema compara.

---

## 2. Entidades de domínio

> Campos-chave (não exaustivo). Todos têm `id`, `tenant_id`, `created_at`,
> `updated_at`, `created_by`, `deleted_at` (soft-delete). Valores monetários em centavos.

### 2.1 Modelo 3D (`modelo_3d`)
Ficha técnica da peça impressa. (Tela 04 — abas Visão geral / Impressão / Instruções &
Qualidade / Histórico.)
- Identidade: `nome`, `codigo_interno`, `categoria`, `fotos[]`, `descricao`.
- Arquivos: `arquivo_original`, `arquivos_derivados[]`, **versões** (`versao`, data,
  notas).
- **Licença comercial**: `tipo_licenca`, `autor`, `origem` (próprio/comprado),
  `custo_aquisicao`, `validade`, `direitos_uso`.
- **Config de impressão**: `impressora_recomendada_id`, `perfil_fatiamento`,
  `material_recomendado_id`, `cor`, `bico`, `altura_camada` (ex. 0,20mm),
  `preenchimento` (ex. 38%), `paredes`, `suportes` (bool).
- **Estimativas do fatiador**: `tempo_impressao` (ex. 6h45), `peso_peca_g`,
  `peso_suporte_g`, `peso_purga_g`, `peso_desperdicio_g` (separados — importam no custo
  real de filamento).
- Qualidade: `instrucoes[]`, `checklist_qualidade[]`.
- **`probabilidade_falha`** (% — por modelo; alimenta `custo_falhas` no cálculo).
- Resultado: `custo_estimado`, `custo_real_medio` (das produções anteriores),
  `qtd_vendas/uso`.
- Ação-chave: "Usar em novo cálculo" → abre a Calculadora pré-preenchida.

### 2.2 Produto (`produto`)
Item efetivamente vendido. (Telas 05 e 06.)
- Identidade: `sku`/`codigo`, `nome_comercial`, `categoria`, `descricao`, `tags[]`,
  `fotos[]`, `dimensoes`, `peso`, `material_principal`, `status`.
- **Tipo de disponibilidade**: pronta entrega | sob demanda.
- **Composição (BOM)** — ver 2.3.
- **Variações de venda** (`variacao`): tamanho/cor/material/acabamento/kit, com
  `codigo`, `preço`, `estoque`.
- **Margem por canal** (`produto_canal`): por canal de venda, `preço_praticado`,
  `custo`, `taxas`, `lucro`, `margem`.
- Resumo financeiro: `custo_atual`, `preco_sugerido`, `preco_praticado`,
  `markup`, `margem`.
- Desenvolvimento: `custo_desenvolvimento`, `qtd_planejada_rateio` (amortização).
- Ações: Calcular preço, Criar orçamento, Nova simulação.

### 2.3 Composição / BOM (`composicao_item`)
Linhas que compõem um produto (1 produto → N itens). (Tela 06.)
- `produto_id`, `tipo` (modelo impresso | componente | embalagem | serviço),
  `ref_id` (aponta para modelo_3d ou material), `quantidade`, `unidade`,
  `custo_unitario` (vem do cadastro, ao vivo), `subtotal`, `fornecedor_id`.
- `total_composicao` = Σ subtotais (ex. R$78,42 na tela).
- Substitutos: `substituto_de` para componentes alternativos.

### 2.4 Material / Insumo (`material`)
(Modal 03 e tela 12.) **Tipos:** filamento | resina | componente | consumível |
embalagem. Cada tipo expõe campos relevantes.
- Identidade: `nome`, `marca`, `categoria`, `tipo`, `cor`.
- **Unidade de compra** (ex. kg, pacote) e **unidade de consumo** (ex. g, un) +
  **`fator_conversao`** (ex. 1 kg = 1000 g). ⚠️ Obrigatório.
- Custo: `preco_compra`, `frete`, **`custo_unitario_calculado`** =
  (preco_compra + frete) ÷ (qtd na unidade de consumo). Ex.: R$0,076/g.
- `fornecedor_id`.
- **Estoque** (ver §4): `saldo`, `reservado`, `disponivel` (=saldo−reservado),
  `minimo`, `custo_medio`, `ultimo_custo`, `valor_estoque`.

### 2.5 Impressora (`impressora`)
(Modal 04 e tela 18.)
- `tecnologia` (FDM | Resina), `fabricante`, `modelo`, `numero_serie`, `foto`, `status`.
- Aquisição: `valor`, `vida_util_horas`, `data_aquisicao`.
- Operação: `consumo_w`, `horas_dia`, `perfil_energia_id`.
- **`custo_por_hora_calculado`** (ex. R$4,32/h) = amortização (valor ÷ vida útil) +
  energia (consumo × tarifa) + rateio de manutenção. **Alimenta a Calculadora.**
- Uso: `horas_acumuladas`, `proxima_manutencao`, `manutencoes[]`
  (`custo`, `data`, `tipo`), `custo_real_manutencao`.

### 2.6 Fornecedor (`fornecedor`)
(Modal 06 e tela 16.)
- `razao_social`/`nome`, `cnpj`, `categorias_fornecidas[]`, `contato`,
  `prazo_entrega`, `pedido_minimo`, `condicoes_pagamento`, `avaliacao`.
- `historico_precos[]`, `total_comprado`. Alerta de aumento de preço.

### 2.7 Cliente (`cliente`)
(Modal 05 e tela 15.) **PII — sob masking/LGPD.**
- `tipo` (PF | PJ), `nome`/`razao_social`, `cpf_cnpj`, `email`, `telefone_whatsapp`,
  `endereco` (cep, cidade, estado), `canal_origem`, `indicacao`, `observacoes`.
- **`consentimento_marketing`** (bool + data + versão) — revogável (LGPD).
- Histórico: `total_comprado`, `orcamentos[]`, `a_receber`, `ultima_compra`, `status`.
- CPF/endereço **opcionais** por padrão (minimização).

### 2.8 Simulação de cálculo (`simulacao`)
A Calculadora (tela 07) salva como simulação; pode virar orçamento.
- **Config**: `produto_id`, `qtd_produzida`, `qtd_vendavel`, `modelo_id`,
  `material_id`, `impressora_id`, `canal_id`, `cliente_id`, `margem_desejada`,
  `desconto`, `impostos`.
- **Itens de custo** (editáveis, uma linha cada): materiais, componentes, energia,
  uso de máquina, mão de obra, embalagem, custos fixos, falhas. Cada um:
  `descricao`, `qtd`, `unidade`, `custo_unitario`, `total`.
- **Resultados**: `preco_varejo`, `preco_atacado`, `custo_unitario`, `lucro`,
  `margem` (a tela mostra R$299,90 / R$269,91 / R$16,03 / R$139,58 + margem).
- `formulas_e_explicacoes` (acordeão — transparência).

### 2.9 Orçamento (`orcamento` + `orcamento_item`)
(Tela 09 e 14.) **Guarda SNAPSHOT imutável dos valores** no momento da geração.
- Cabeçalho: `numero` (#ORC-0148), `empresa_snapshot`, `cliente_id` +
  `cliente_snapshot`, `validade`, `prazo_entrega`, `condicoes_pagamento`, `frete`.
- **Itens** (`orcamento_item`): `produto_id`, `descricao`, `qtd`, `valor_unit`,
  `valor_total` — **valores congelados** (não FK viva ao preço atual).
- `observacoes`, `anexos[]`.
- **Resumo interno** (visão da empresa, NÃO do cliente — masking): `custo`, `margem`,
  `lucro`. Rotulado "Interno".
- `total`, `status` (ver §3), `versao`, `aceite_cliente`.
- Ações: Gerar PDF, Enviar WhatsApp, Aprovar (→ vira pedido).

### 2.10 Pedido (`pedido` + `pedido_item`)
(Modal 07, telas 10.) Nasce de orçamento aprovado (ou criado direto).
- `numero` (#PED-1014), `cliente_id`, `canal_id`, `origem_orcamento_id`.
- Itens (snapshot, herdados do orçamento). Pagamento: `entrada`, `saldo`,
  `parcelas`, `taxas`, `data_prevista_recebimento`. Entrega: `frete_cobrado`,
  `frete_pago`, `prazo`. `status`.
- **Ao aprovar: reserva estoque** dos insumos da composição (ver §4).

### 2.11 Ordem de Produção (`ordem_producao`)
(Tela 11, modal 08.) Gerada a partir do pedido. Abas: Resumo / Arquivos /
Comunicações.
- `numero` (#OP-0357), `pedido_id`, `produto_id`, `qtd`, `responsavel_id`,
  `impressora_id`, `prazos`, `config_impressao_snapshot`, `status` (kanban).
- `progresso_pct`, `checklist_producao[]` (itens com check + hora).
- **Consumo real** (`consumo_real`): tempo real, material real (g), por etapa.
- **`custo_parcial`** e **divergências** = Estimado vs. Real (verde/vermelho).
  Ex. tela: tempo estimado 7h30 vs real 6h45 (−45min); material 110g vs 92g.
- **Registrar falha** (modal 08): `etapa`, `motivo`, `material_desperdicado`, `foto`,
  `responsavel`, `reimprimir?`, `impacto_custo`. Atualiza custo real e estoque.

### 2.12 Pedido de Compra (`compra` + `compra_item`)
(Tela 12, aba "Pedidos de compra".)
- `fornecedor_id`, itens (`material_id`, `qtd`, `custo`), `prazo`, `status`,
  `total`. Ao receber → **entrada** no estoque (movimentação).

### 2.13 Financeiro (`lancamento`)
(Telas 13 e 19.) Contas a pagar/receber e fluxo de caixa.
- `tipo` (entrada | saída), `descricao`, `categoria`, `parte` (cliente/fornecedor),
  `vencimento`, `valor`, `status` (pago/pendente/atrasado), `conta`, `origem`
  (pedido/compra/manual). Provisões (garantia, devolução, inadimplência).

### 2.14 Empresa & Fiscal (`empresa`, `perfil_fiscal`)
(Tela 13, modal config.) Simulação fiscal — não emite NF.
- Empresa: `razao_social`, `nome_fantasia`, `cnpj`, `inscricoes`, `regime_tributario`,
  `vigencia`.
- `perfil_fiscal`: `tipo` (produto/serviço/misto), `aliquota_efetiva`, histórico;
  campos por produto quando aplicável (`ncm`, `cest`, `cfop`, `cst/csosn`, `origem`).
- Alertas de conformidade; checklist de segurança para categorias especiais
  (elétrico, infantil, contato com alimento).

### 2.15 Cadastros de apoio (alimentam o cálculo)
- **Canal de venda** (`canal_venda`): `nome`, `taxa_marketplace`, `taxa_pagamento`,
  `comissao`. (Varejo/atacado/loja própria/marketplace.)
- **Custo fixo** (`custo_fixo`): `nome`, `valor_mensal`. Critério de rateio é
  config do tenant (`criterio_rateio_custo_fixo`, default **faturamento** — ver §7.4).
- **Tarefa de mão de obra** (`tarefa_mao_obra`): `nome`, `valor_hora`, `responsavel`.
- **Perfil de energia** (`perfil_energia`): `tarifa_kwh`.
- **Categoria**, **Embalagem** (material tipo embalagem).

### 2.16 Governança (já documentada — referência)
`usuario`, `tenant`, `membership(papel, permissoes_extras, flags_sensiveis)`,
`convite`, `consentimento`, `log_auditoria`, `registro_compartilhamento`. Ver memória
do projeto.

**Configurações operacionais do tenant** (além de plano/moeda/locale):
- `momento_baixa_estoque` (inicio | fim, default **fim**) — §7.2.
- `criterio_rateio_custo_fixo` (faturamento | hora_maquina | hora_trabalho | pedido,
  default **faturamento**) + `faturamento_mensal_esperado` — §7.4.
- `cenarios_precificacao[]` — 3 presets {prob_falha, margem, provisão}, default
  "Padrão" — §7.5.

### 2.17 Perfil e configurações do usuário ("Minha Conta")
Da **pessoa** (vale em todas as empresas), acessada pelo avatar no topo — distinta da
tela 17 (Configurações da empresa/tenant). NÃO existe no protótipo v2 (avatar só
sugerido) → **tela a criar no build**.
- Campos no `usuario`: `avatar_url`, `avatar_origem` (google | upload | iniciais),
  `nome_exibicao`, `email`, `telefone?`, `preferencias` (idioma, tema, fuso,
  notificações), `mfa_ativo`, `provedores_vinculados[]`.
- **Avatar:** signup via Google → puxa a foto do Google como `avatar_url` padrão
  (`avatar_origem=google`). Pode trocar (upload p/ Storage, RLS por tenant) ou remover
  (fallback = iniciais do nome em círculo com cor de acento da marca). Signup por
  e-mail começa em iniciais.
- **Seções:** Perfil (avatar/nome/e-mail/telefone) · Segurança (trocar senha, 2FA
  ativar/gerenciar, sessões ativas ver/encerrar, conta Google vinculada) · Preferências
  (idioma/tema/notificações/fuso) · Empresas (lista de memberships + trocar + sair) ·
  Dados/LGPD (baixar meus dados, desativar/excluir conta).
- **Conta vs. membership:** desativar/sair de UMA empresa = remove a membership;
  excluir a conta do usuário = processo à parte (a conta pode ser anonimizada/desativada
  preservando registros de auditoria). Ver [[lgpd-conformidade]].

---

## 3. Fluxos e máquinas de estado

### 3.1 Orçamento
```
rascunho → enviado → aguardando_resposta → aprovado → (gera pedido)
                                         ↘ recusado / cancelado
        (validade vence → expirado; pode duplicar/revisar → nova versão)
```
Ao **aprovar**: cria `pedido`, reserva estoque, congela snapshot definitivo.

### 3.2 Pedido
```
criado → aprovado(reserva estoque) → em_producao → concluido
       ↘ cancelado (estorna reserva)
```

### 3.3 Produção (Kanban — tela 10)
```
aguardando_aprovacao → preparar → imprimindo → acabamento → concluido
```
- Entrar em **imprimindo**: baixa estimada de material (da composição/estimativa).
- **Registrar falha** a qualquer momento: adiciona consumo de material desperdiçado,
  pode disparar reimpressão (nova passagem), atualiza custo real.
- **Concluir**: reconcilia consumo real × reserva; fecha custo real; alimenta
  `custo_real_medio` do modelo/produto e os indicadores (taxa de falha, utilização).

### 3.4 Regra de ouro do histórico
Orçamentos e pedidos guardam **fotografia imutável** dos valores usados. Alterar um
preço de insumo, taxa ou alíquota **hoje não muda** uma venda passada. O recálculo usa
valores atuais; o documento emitido fica congelado. (Ver `ARQUITETURA_BACKEND.md`.)

---

## 4. Lógica de estoque (livro-razão)

> Decidido em conversa: **saldo = projeção de um histórico imutável de movimentações**;
> valoração por **custo médio ponderado**; lote opcional só para rastreabilidade.

### 4.1 Movimentação (`movimentacao_estoque`) — o ledger
`material_id`, `tipo` (entrada | saida | ajuste | reserva | estorno), `quantidade`
(na unidade de consumo), `custo_unitario` (no momento), `motivo`, `referencia`
(compra/pedido/OP/inventário), `data`, `usuario_id`. Nunca se apaga.
- `saldo` = Σ(entradas − saídas ± ajustes). `reservado` = Σ reservas ativas.
  `disponivel` = saldo − reservado. (Cache materializado para performance.)

### 4.2 Custo médio ponderado
A cada **entrada**: `custo_medio = (valor_estoque_atual + valor_entrada) ÷
(saldo_atual + qtd_entrada)`. Toda **saída** usa o `custo_medio` vigente. É esse
custo que a Calculadora puxa como custo de material.

### 4.3 Ciclo reserva → baixa → real
1. **Pedido aprovado** → cria movimentações de **reserva** dos insumos da composição
   (saldo físico intacto, mas `disponivel` cai).
2. **Produção inicia (imprimindo)** → **baixa estimada** (pelo peso/qtd previstos,
   incluindo suporte/purga/desperdício do modelo).
3. **Produção conclui** → **reconcilia** com o consumo **real** registrado; lança
   `ajuste` da diferença; libera reservas remanescentes.

### 4.4 Alertas e compras
- `disponivel ≤ minimo` → **alerta de estoque baixo** (tela 12, painel lateral).
- **Sugestão de compra** = baseada em (mínimo − disponível) + demanda da fila de
  produção, respeitando `pedido_minimo` e `prazo_entrega` do fornecedor.
- Receber pedido de compra → **entrada** (recalcula custo médio).
- Inventário → `ajuste`. Perdas → `saida` motivo "perda".

---

## 5. Motor de cálculo (a fórmula, campo a campo)

> Módulo PURO e testável. Roda no cliente (preview ao vivo) e no servidor
> (autoritativo ao gerar orçamento/pedido). Dinheiro em centavos. Cada valor tem
> explicação visível.

### 5.1 Componentes do custo do lote
```
custo_materiais   = Σ (peso_consumido_g × custo_medio_g)         # peça+suporte+purga+desperdício
custo_componentes = Σ (qtd × custo_unitario_componente)          # da composição
custo_energia     = tempo_impressao_h × consumo_kw × tarifa_kwh
custo_maquina     = tempo_impressao_h × custo_por_hora_impressora # amortização + manutenção
custo_mao_de_obra = Σ (tempo_etapa_h × valor_hora_tarefa)
custo_embalagem   = Σ (qtd × custo_unitario_embalagem)
custo_desenvolv.  = custo_desenvolvimento ÷ qtd_planejada_rateio
custo_fixos       = rateio dos custos fixos (por hora-máquina/trabalho/pedido/fatur.)
custo_falhas      = (subtotal acima) × probabilidade_de_falha
provisao_garantia = (subtotal acima) × % provisão

custo_total = soma de todos os itens acima
```

### 5.2 Do custo ao preço
```
custo_unitario      = custo_total ÷ qtd_vendavel          # vendável, não produzida!
preco_antes_taxas   = custo_total ÷ (1 − margem_desejada)
preco_final         = preco_antes_taxas ÷
                      (1 − taxa_canal − taxa_pagamento − comissao − aliquota_efetiva)
markup              = preco_final ÷ custo_total
margem_bruta        = (preco_final − custo_total) ÷ preco_final
lucro_reais         = preco_final − custo_total
preco_minimo        = custo_total ÷ (1 − margem_minima) ÷ (1 − taxas)   # piso
```
- **Qtd vendável ≠ qtd produzida**: o custo unitário divide pela quantidade que
  realmente se espera vender (descontando refugo esperado).
- **Cenários** (rápido/padrão/conservador) variam probabilidade de falha e margem.
- **Preços** por canal: varejo, atacado, personalizado (cada canal tem taxas próprias).
- **Simulador de desconto** não pode furar o `preco_minimo`.

### 5.3 Estimado × Real
- A Calculadora/Orçamento usa **estimativas** (peso do fatiador, custo médio do
  momento) → congeladas no snapshot.
- A Produção registra **reais** (tempo real, gramas reais, falhas) → calcula o
  **custo real** e o **lucro real** do pedido, e compara com o estimado (tela 11).

---

## 6. Mapa rápido Tela → Entidades (referência)

| Tela | Entidades principais |
| --- | --- |
| 01 Visão geral | agregações de pedido, financeiro, estoque, produção |
| 02 Catálogo produtos | `produto` |
| 03 Catálogo modelos | `modelo_3d` |
| 04 Ficha modelo | `modelo_3d` (+versões, config, qualidade) |
| 05 Produto | `produto`, `variacao`, `produto_canal` |
| 06 Composição | `composicao_item`, `material`, `modelo_3d` |
| 07 Calculadora | `simulacao` (+ todos os cadastros de custo) |
| 08 Detalhamento | `simulacao` (breakdown) |
| 09 Orçamento | `orcamento`, `orcamento_item`, `cliente` |
| 10 Pedidos/Produção | `pedido`, `ordem_producao` (kanban) |
| 11 Ordem produção | `ordem_producao`, `consumo_real`, `movimentacao_estoque` |
| 12 Estoque/Compras | `material`, `movimentacao_estoque`, `compra` |
| 13 Fiscal/Financeiro | `empresa`, `perfil_fiscal`, `lancamento` |
| 14 Lista orçamentos | `orcamento` |
| 15 Clientes | `cliente` |
| 16 Fornecedores | `fornecedor` |
| 17 Cadastros | todos os cadastros de apoio + config |
| 18 Impressoras | `impressora`, manutenções |
| 19 Financeiro | `lancamento`, contas a pagar/receber |
| Modais 01–08 | criação de modelo/produto/material/impressora/cliente/fornecedor/pedido/falha |

---

## 7. Decisões de lógica (resolvidas em 11/jun/2026)

1. **FDM + resina, ambos no MVP.** Campo `tecnologia` em impressora e material.
   Filamento mede consumo em **g**; resina em **ml/g**. Insumos, impressoras e o motor
   de cálculo tratam os dois.
2. **Baixa de estoque no FIM da produção (padrão), configurável.** Config por tenant
   `momento_baixa_estoque` (inicio | fim, default **fim**). A **reserva** continua
   sempre na aprovação do pedido; só o momento da baixa de fato é que é configurável.
3. **Probabilidade de falha por modelo.** Campo `probabilidade_falha` em `modelo_3d`
   (alimenta `custo_falhas` no cálculo). Pode ter override na simulação.
4. **Rateio de custo fixo: por FATURAMENTO (padrão), configurável.** Config por tenant
   `criterio_rateio_custo_fixo` (faturamento | hora_maquina | hora_trabalho | pedido,
   default **faturamento**). ⚠️ "Por faturamento" aplica-se como **percentual**:
   `% = custo_fixo_mensal ÷ faturamento_mensal_esperado`, e cada venda carrega
   `preco × %`. Implementar como percentual (não recursivo) para evitar circularidade
   custo↔preço. O `faturamento_mensal_esperado` é um parâmetro configurável.
5. **Cenários (rápido/padrão/conservador): 3 presets configuráveis**, escondidos atrás
   do toggle **"Avançado"** da calculadora. Cada preset define
   `{probabilidade_falha, margem_desejada, provisao_%}`. Default = "Padrão". Valores
   padrão dos 3 presets configuráveis por tenant.
6. **Fiscal configurável por empresa/estado** (perfis fiscais — §2.14). Cada empresa
   cadastra regime/alíquotas; **validar fórmulas e alíquotas com contador** antes de
   produção.
