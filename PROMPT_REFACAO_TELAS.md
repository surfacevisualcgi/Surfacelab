# Prompt para refazer as telas do PrintGestor 3D

Objetivo desta refação: **manter TODO o escopo e todos os dados das telas atuais**,
porém **reduzir a densidade visual**, melhorar a hierarquia e dar respiro. Nada de
informação é removida — ela é reorganizada com divulgação progressiva (modo simples
por padrão, detalhes atrás de "ver mais"/abas/acordeões).

## Como usar este arquivo

A geração de imagem do ChatGPT cria **uma imagem por vez**. Então o fluxo é:

1. Cole a **PARTE 1 (Prompt Base)** uma vez no início da conversa, pedindo para o
   modelo "guardar" como regra de estilo.
2. Para cada tela, cole o bloco correspondente (PARTE 2 a 5). Cada bloco já assume
   as regras da PARTE 1.
3. Gere desktop e mobile separadamente (proporções diferentes).
4. Mantenha a mesma conversa para o sistema visual ficar consistente entre telas.

Dica: gere primeiro 01-visão-geral e 07-calculadora em desktop. Aprove o estilo, e
só então siga com o resto, sempre pedindo "mesmo sistema visual da tela anterior".

---

## PARTE 1 — PROMPT BASE (colar antes de qualquer tela)

```
Você vai gerar mockups de UI de alta fidelidade de um SaaS web chamado
"PrintGestor 3D" — um sistema de gestão e precificação para negócios de impressão
3D, em português do Brasil. Guarde as regras abaixo e aplique a TODAS as telas que
eu pedir a seguir.

IDIOMA E CONTEXTO
- Todo texto em português do Brasil. Moeda em R$. Datas em dd/mm/aaaa.
- Público-alvo: iniciantes/pequenos negócios (um casal tocando a operação). A
  interface deve parecer simples e confiável, nunca intimidadora.

PRINCÍPIO CENTRAL — MENOS DENSIDADE, MESMO ESCOPO
- Mantenha todas as informações da tela, mas organize com divulgação progressiva:
  o essencial sempre visível; o avançado recolhido em abas, acordeões, "ver mais"
  ou um modo "avançado".
- Regra do respiro: muito espaço em branco, grid de 8px, margens generosas. Se a
  tela parecer cheia, agrupe em menos blocos e esconda detalhes.
- Cada bloco/card deve ter UM destaque visual só (um número grande, um título). Não
  competir vários números em negrito no mesmo cartão.

LAYOUT
- App shell: sidebar de navegação fixa à esquerda (largura ~240px) + topbar fina
  com busca global ao centro e avatar/usuário à direita.
- Sidebar com itens: Visão geral, Modelos 3D, Produtos, Calculadora, Orçamentos,
  Pedidos, Produção, Estoque, Financeiro, Fiscal, Relatórios, Configurações. Item
  ativo destacado. Rodapé da sidebar com o plano e o usuário logado.
- Conteúdo em no máximo 12 colunas. Prefira 2 a 3 blocos por linha, nunca 5 cartões
  espremidos lado a lado.

KPIs / CARTÕES DE TOPO
- No máximo 4 cartões de indicador por tela (idealmente 3). Se houver mais métricas,
  coloque 1 métrica "herói" grande + as outras menores ou dentro de um painel.
- Cada cartão: rótulo pequeno em cima, número grande embaixo, variação (▲/▼ com cor)
  e um ícone discreto. Nada de texto miúdo extra.

TABELAS
- No máximo 6 colunas visíveis. Colunas secundárias vão para uma linha expansível
  ("ver detalhes") ou para a tela de detalhe.
- Altura de linha confortável (>= 44px), zebra sutil, cabeçalho fixo. Fonte da
  tabela legível (mínimo equivalente a 14px), nunca microtexto.
- Status sempre como "chip"/badge colorido com texto, não só cor.

PAINÉIS LATERAIS DE APOIO (alertas, dicas, próximas entregas)
- No máximo UM painel lateral por tela, com seções recolhíveis (acordeão). Não
  empilhar 3 ou 4 widgets concorrendo pela atenção.

SISTEMA VISUAL
- Estilo: clean, moderno, flat, cantos arredondados (raio 12px), sombras muito
  sutis. Inspiração: Linear / Notion / dashboards financeiros modernos.
- Paleta: fundo branco/cinza muito claro (#F7F8FA). Cor primária teal/verde
  (aprox. #0E9F8E / #16B8A6). Verde para positivo, vermelho para negativo, âmbar
  para atenção. Use cor só para status e ações; o resto em tons de cinza.
- Tipografia: sans-serif (Inter ou similar). Hierarquia clara: título da tela ~24px
  bold; títulos de seção ~16px semibold; corpo ~14px; rótulos ~12px em cinza médio.
- ACESSIBILIDADE: contraste mínimo AA. Texto cinza nunca abaixo de #4B5563 sobre
  branco. Alvos de toque grandes.

CONSISTÊNCIA
- Mesma sidebar, topbar, estilo de cartão, botões e chips em todas as telas.
- Botão primário preenchido teal; secundário com contorno; ação de risco
  (excluir/cancelar) só em texto/vermelho discreto.
- Ícones de uma única família (estilo linha), tamanho consistente.

FORMATO DA IMAGEM
- Desktop: proporção 16:10 (ex. 1600x1000), tela inteira do app.
- Mobile: proporção 9:19.5 (ex. 1080x2340), uma única coluna.
- Mockup limpo, sem moldura de navegador nem barra de tarefas do sistema.

Use dados de exemplo realistas de um negócio de impressão 3D (luminárias,
vasos, chaveiros, suportes), incluindo alguns casos "reais": um valor no
vermelho, um estoque baixo, um nome de produto longo. Confirme que entendeu e
aguarde eu enviar a primeira tela.
```

---

## PARTE 2 — TELAS PRINCIPAIS (DESKTOP)

> Cada bloco abaixo é colado depois da PARTE 1. Comece sempre com:
> "Gere a versão **desktop** desta tela, seguindo as regras de estilo combinadas."

### 01 — Visão geral (Dashboard)
- **O que manter:** faturamento, lucro estimado, pedidos em produção, margem média,
  gráfico de faturamento (12 meses), faturamento por categoria (rosca), tarefas
  pendentes, alertas de estoque, resumo financeiro, fluxo de caixa.
- **O que mudar:** hoje há cartões e blocos demais competindo. Reduza para:
  - **1 linha com 4 KPIs** no topo (faturamento, lucro, pedidos em produção, margem).
  - **1 bloco grande** = gráfico de faturamento dos 12 meses (o herói da tela).
  - **2 blocos médios** abaixo: "Faturamento por categoria" (rosca) e "Fluxo de caixa".
  - **1 coluna lateral direita** única, com abas/acordeão para "Tarefas pendentes",
    "Alertas de estoque" e "Resumo financeiro" — não os três abertos ao mesmo tempo.
- Deixe muito respiro entre blocos. Menos números soltos, mais espaço.

### 02 — Catálogo de Produtos
- **Manter:** grade de cards de produto com foto, nome, custo, preço, margem, estoque,
  status; busca; filtros por categoria e status; botão "Novo produto"; paginação.
- **Mudar:** cada card hoje tem muitos rótulos miúdos. Simplifique o card para: foto
  grande, nome, **preço em destaque**, e uma linha discreta com margem + chip de
  estoque/status. Custo e demais dados aparecem só no hover ou no detalhe.
- Grade de 4 colunas no desktop, com bom espaçamento. Barra de filtros enxuta numa
  linha só.

### 03 — Catálogo de Modelos 3D
- **Manter:** igual ao catálogo de produtos, mas para modelos (.stl): foto, nome,
  material/tempo, custo estimado, nº de vendas/uso, status.
- **Mudar:** mesmo padrão de card simplificado da tela 02. Destaque para a foto e o
  nome; metadados técnicos (material, tempo, peso) em uma linha discreta ou no hover.
- Botões no topo: "Importar modelo" e "Novo modelo".

### 04 — Ficha do Modelo 3D
- **Manter:** foto do modelo, licença comercial (tipo, autor, origem, custo),
  histórico de versões, configurações de impressão (impressora, material, camada,
  preenchimento, paredes, suportes, tempo, peso), instruções de impressão, checklist
  de qualidade, botão "usar em novo cálculo".
- **Mudar:** hoje são 4 blocos pesados na base. Organize em **abas**: "Visão geral",
  "Impressão", "Instruções & Qualidade", "Histórico". A aba inicial mostra só foto +
  licença + 4 dados-chave de impressão + botão de ação primário ("Usar em novo
  cálculo"). O resto vive nas outras abas.
- Cabeçalho com nome do modelo, código, categoria e botão "Editar".

### 05 — Produto
- **Manter:** foto + galeria, informações (código, SKU, categoria, descrição, tags),
  resumo financeiro (custo, preço sugerido), variações de venda (tabela), margem por
  canal de venda (tabela), ações (Calcular preço, Criar orçamento, Nova simulação).
- **Mudar:** separe em **abas**: "Visão geral", "Variações", "Margem por canal",
  "Composição". A visão geral mostra foto + resumo financeiro + as 3 ações primárias
  bem visíveis. As duas tabelas (variações e margem por canal) ganham abas próprias
  para não empilhar tudo numa tela só.

### 06 — Composição do Produto (BOM)
- **Manter:** tabela de itens da composição (item, qtd, unidade, custo unitário,
  subtotal, fornecedor), total do custo de composição em destaque, dica/observação,
  botões "Importar", "Adicionar item", "Recalcular".
- **Mudar:** a tela já está boa; só dê mais respiro. Tabela com no máx. 6 colunas.
  Painel direito vira um único card "Resumo da composição" com o total grande e a
  dica recolhível. Use ícone por tipo de item (peça impressa, componente, embalagem).

### 07 — Calculadora de Preço (tela central do produto)
- **Manter TUDO:** configuração da simulação (produto, quantidade produzida vs.
  vendável, modelo, material, impressora, canal, cliente, margem, desconto,
  impostos); itens de custo editáveis (materiais, componentes, energia, máquina,
  mão de obra, embalagem, falhas, custos fixos); resultados (preço varejo, atacado,
  custo unitário, lucro, margem); bloco "Fórmulas e explicações"; ações (Salvar
  simulação, Gerar orçamento).
- **Mudar (importante):** esta é a tela mais sobrecarregada. Aplique modo simples:
  - Topo: card "Configuração da simulação" com só os campos essenciais. Campos
    avançados (purga vs. desperdício, quantidade vendável vs. produzida, cenários
    conservador/rápido) atrás de um toggle **"Avançado"**.
  - Centro/esquerda: tabela "Itens de custo" editável, uma linha por custo, com
    custo unitário e total. Linha de total destacada.
  - Direita: painel fixo **"Resultados"** com os 4 números-herói (preço varejo,
    atacado, custo unitário, lucro/margem), bem grandes e espaçados.
  - Base: bloco "Fórmulas e explicações" em **acordeão recolhido** — abre quem
    quiser entender a conta. Mantém o diferencial de transparência sem poluir.
  - Ações primárias ("Salvar" e "Gerar orçamento") fixas no rodapé do painel direito.

### 08 — Detalhamento de Custos
- **Manter:** composição de custo unitário (barras), composição de venda (tabela
  custo→preço→margem por cenário), bloco "Fórmulas e explicações", "Observações
  importantes", recomendação de preço.
- **Mudar:** hoje são 4 colunas densas. Reorganize em 2 linhas:
  - Linha 1: à esquerda gráfico de barras "De onde vem o custo" (herói visual); à
    direita a tabela "Custo → preço → margem" só com cenários padrão (avançados num
    toggle).
  - Linha 2: "Fórmulas e explicações" e "Observações" como **dois acordeões**
    recolhidos. Recomendação de preço destacada num card teal claro.

### 09 — Orçamento (documento individual)
- **Manter:** dados da empresa, dados do cliente, validade/prazo/entrega/condições,
  itens do orçamento (tabela), observações, anexos, resumo interno (custo, margem,
  lucro), totais, ações (Gerar PDF, Enviar WhatsApp, Aprovar pedido).
- **Mudar:** dê cara de "documento". Cabeçalho com empresa à esquerda, cliente à
  direita, e os metadados (validade, prazo, condições) numa faixa de chips compacta —
  não 6 blocos separados. O "resumo interno" (custo/margem/lucro — visão da empresa,
  não do cliente) fica num painel lateral claramente rotulado **"Interno"** e
  recolhível. Total grande e as 3 ações fixas no rodapé.

### 10 — Pedidos e Produção (Kanban)
- **Manter:** colunas Kanban (Aguardando aprovação, Preparar, Imprimindo, Acabamento,
  Concluído) com cards de pedido (foto, nº pedido, cliente, impressora, responsável,
  progresso, tempo restante), contadores por coluna, métricas no rodapé.
- **Mudar:** o Kanban está bom; só simplifique o card. Card = foto pequena + nº do
  pedido + cliente + barra de progresso + chip de status. Impressora/responsável/
  tempo como ícones discretos numa linha. Contador no topo de cada coluna. Evite
  texto miúdo demais. Rodapé com no máx. 4 métricas.

### 11 — Ordem de Produção (detalhe)
- **Manter:** dados do pedido/produto, responsável, impressora, prazos, configuração
  de impressão, progresso da produção (%), checklist de produção, consumo real, custo
  parcial, divergências (estimado vs. real), ações (Registrar falha, Avançar ordem),
  abas (Resumo, Arquivos, Comunicações).
- **Mudar:** já usa abas — bom. Na aba "Resumo", priorize 3 blocos: **Progresso**
  (rosca % grande, herói), **Checklist de produção** e **Estimado vs. Real** (com as
  divergências em verde/vermelho). Configuração de impressão e dados do produto vão
  para um cabeçalho compacto ou acordeão. Ações primárias fixas no rodapé.

### 12 — Estoque e Compras
- **Manter:** KPIs (itens em estoque, valor total, itens em alerta, pedidos
  pendentes), abas (Estoque / Pedidos de compra), tabela de filamentos, tabela de
  componentes/itens gerais (estoque atual, mínimo, custo, fornecedor, sugestão de
  compra), painel de alertas de estoque e próximas entregas.
- **Mudar:** muita coisa junta. Use as **abas Estoque/Compras** para separar de
  verdade. Em "Estoque", um seletor (Filamentos | Componentes) troca a tabela, em vez
  de mostrar as duas empilhadas. Tabela com no máx. 6 colunas; sugestão de compra como
  chip de ação. Painel direito único com acordeão "Alertas" + "Próximas entregas".

### 13 — Fiscal e Financeiro
- **Manter:** dados da empresa, regime tributário, impostos estimados (ISS, ICMS...),
  faturamento, fluxo de caixa, contas a receber, contas a pagar, ponto de equilíbrio,
  alertas de conformidade, botão "Relatório contábil mensal".
- **Mudar (muito denso hoje):** separe em **abas** "Visão geral", "Financeiro",
  "Fiscal", "Obrigações". A "Visão geral" mostra 4 KPIs (impostos estimados,
  faturamento, a receber, a pagar) + 1 gráfico de fluxo de caixa + ponto de
  equilíbrio. Detalhe de impostos, dados da empresa e alertas de conformidade vão
  para as abas Fiscal/Obrigações. Deixe claro que é simulação, não emissão fiscal.

---

## PARTE 3 — PÁGINAS ADICIONAIS (DESKTOP)

### 14 — Lista de Orçamentos
- **Manter:** KPIs (rascunhos, enviados, aguardando resposta, aprovados, taxa de
  conversão), filtros (status, cliente, período), tabela de orçamentos (número,
  cliente, data, validade, total, margem, status, ações).
- **Mudar:** reduza os KPIs do topo para 4 (junte rascunho+enviado num só, ou use 1
  herói "taxa de conversão" + 3). Tabela limpa, status em chip, ações em menu "⋯".
  Validade vencida em âmbar/vermelho.

### 15 — Clientes
- **Manter:** KPIs (clientes ativos, novos no mês, total comprado, a receber), filtros
  (status, cidade, tipo PF/PJ), tabela (cliente, cidade, contato, última compra, total
  comprado, orçamentos, a receber, status).
- **Mudar:** tabela com no máx. 6 colunas — leve contato e orçamentos para a linha
  expansível ou tela de detalhe. CPF/CNPJ discreto sob o nome. "A receber" colorido.

### 16 — Fornecedores
- **Manter:** KPIs (fornecedores ativos, compras no mês, prazo médio, itens com alta
  de preço), tabela (fornecedor, categoria, última compra, prazo, pedido mínimo,
  total comprado, avaliação, ações), alertas de aumento de preço, dicas.
- **Mudar:** mesma dieta de colunas (máx. 6). Avaliação como estrelas discretas.
  Painel direito único com acordeão "Alertas de preço" + "Dicas". Logos pequenos.

### 17 — Cadastros e Configurações (central)
- **Manter:** grade de cartões de atalho para todos os cadastros (Empresa & fiscal,
  Usuários & permissões, Impressoras, Materiais & resinas, Componentes, Embalagens,
  Tarefas/mão de obra, Canais de venda, Custos fixos, Perfil de energia, Categorias,
  Backup & exportação), progresso de configuração (%), pendências.
- **Mudar:** já está bem organizada. Só padronize os cartões (ícone + título + 1 linha
  de descrição + contador), 3–4 por linha, agrupados por seção ("Operação", "Comercial",
  "Empresa & Fiscal", "Sistema"). Painel direito: anel de progresso de configuração +
  lista de pendências. Não mais que isso.

### 18 — Impressoras e Manutenção
- **Manter:** KPIs (impressoras ativas, imprimindo agora, horas acumuladas, em
  manutenção), tabela de impressoras (foto, modelo, status, fila/uso, horas, custo/h,
  próxima manutenção), próximas manutenções, divergências/avisos.
- **Mudar:** tabela enxuta; status em chip; barra de uso por impressora. Painel direito
  único com acordeão "Próximas manutenções" + "Avisos". Custo/hora em destaque por
  linha (é um dado que alimenta a calculadora).

### 19 — Financeiro Detalhado
- **Manter:** KPIs (saldo, a receber, a pagar, resultado do mês), filtros (tipo,
  categoria, conta, período), gráfico de fluxo de caixa, próximos pagamentos,
  tabela de lançamentos (data, descrição, categoria, cliente/fornecedor, vencimento,
  valor, status, ações).
- **Mudar:** topo com 4 KPIs + gráfico de fluxo de caixa herói. Tabela de lançamentos
  como foco principal, com entradas em verde e saídas em vermelho, status em chip.
  "Próximos pagamentos" num card lateral recolhível.

---

## PARTE 4 — MODAIS / INTERAÇÕES

> Regra para todos: no **desktop**, modal centralizado sobre a página de origem
> (fundo escurecido), largura ~640px, com **passos numerados (stepper)** quando houver
> muitos campos, e um card de **resultado calculado ao vivo** em teal claro quando
> aplicável. Botões no rodapé: "Cancelar" (texto) à esquerda, "Salvar/Continuar"
> (teal) à direita. No **mobile**, o mesmo conteúdo vira **formulário em tela cheia**
> com o stepper no topo e botões fixos no rodapé.
> Princípio: por passo, mostrar poucos campos. Campos opcionais/avançados recolhidos.

### 01 — Novo Modelo 3D
- Stepper: **Informações → Arquivo & imagem → Impressão → Revisão**.
- Passo 1: nome, código interno, categoria, subcategoria, descrição, imagem
  principal, fonte/autor/licença comercial. Não amontoar tudo num passo só.
- Reduza para ~5 campos por passo, rótulos claros, upload com área generosa.

### 02 — Novo Produto
- Stepper: **Informações → Composição → Preço & fiscal → Revisão**.
- Passo 1: nome comercial, SKU, categoria, descrição, tipo (pronta entrega / sob
  demanda), imagem, modelo de composição, margem padrão.
- Mantenha o escolhedor de composição visual e simples.

### 03 — Novo Material ou Componente
- Abas por tipo no topo do modal: **Filamento | Resina | Componente | Consumível |
  Embalagem**. Cada tipo mostra só os campos relevantes.
- Campos: nome, marca, categoria, unidade de compra, unidade de consumo, conversão,
  preço de compra, frete, fornecedor. Card teal "Custo unitário calculado" ao vivo.

### 04 — Nova Impressora
- Passo único enxuto: tecnologia (FDM/Resina), fabricante, modelo, nº de série;
  aquisição & operação (valor, vida útil, consumo W, horas/dia). Card teal "Custo por
  hora calculado" ao vivo — este é o número que importa.

### 05 — Novo Cliente
- Toggle no topo: **Pessoa física | Pessoa jurídica** (muda os campos).
- Campos: nome/razão social, CPF/CNPJ, e-mail, telefone/WhatsApp, endereço (CEP,
  cidade, estado), canal de origem, indicação, observações, consentimento LGPD.
- Agrupe em "Identificação" e "Endereço & contato"; opcionais recolhidos.

### 06 — Novo Fornecedor
- Campos: razão social/nome, CNPJ, categorias fornecidas, contato, prazo de entrega,
  pedido mínimo, condições de pagamento, avaliação, observações. Agrupar e recolher
  o que for opcional.

### 07 — Novo Pedido
- Stepper: **Cliente → Itens → Pagamento & entrega → Revisão**.
- Passo 1: cliente (buscar ou criar) + canal de venda.
- Passo 2: itens (produto, variação, qtd, preço) com resumo do pedido ao vivo
  (subtotal, descontos, frete, total destacado).
- Reaproveite o estilo da calculadora para o resumo.

### 08 — Registrar Falha de Produção
- Abre a partir da ordem de produção. Campos: etapa da falha (preparação, impressão,
  suporte, acabamento, montagem), tipo/motivo, material desperdiçado, foto, descrição,
  responsável, "reimprimir?". Card teal/âmbar "Impacto estimado no custo" ao vivo.
- Tom de atenção (âmbar), não alarmante. Botão primário "Registrar falha e reimprimir".

---

## PARTE 5 — VERSÕES MOBILE

> Regras gerais para gerar qualquer tela em mobile (proporção 9:19.5, coluna única):

- **Navegação:** topbar fina com logo + ícone de notificação + menu hambúrguer. Uma
  **bottom nav fixa com 5 itens**: Visão geral, Produtos, Calculadora (item central
  em destaque), Pedidos, Configurações. O resto da navegação vai no menu.
- **KPIs:** viram cards empilhados ou um carrossel horizontal de 2 por vez — nunca 4
  espremidos lado a lado.
- **Tabelas viram listas de cards.** Cada linha da tabela do desktop = um card com o
  dado principal em destaque e 2–3 secundários abaixo. Sem rolagem horizontal de
  tabela.
- **Kanban (Pedidos/Produção):** as colunas viram **abas roláveis no topo** (com
  contador), e abaixo a lista de cards da coluna selecionada.
- **Calculadora mobile:** configuração no topo (recolhível), lista vertical de itens
  de custo, e os **4 resultados-herói fixos numa faixa no rodapé** (preço varejo,
  atacado, custo unitário, margem) acima da bottom nav. As ações "Salvar" e "Gerar
  orçamento" como botões largos.
- **Fiscal/Financeiro e telas densas:** sempre via abas no topo (Visão geral /
  Financeiro / Fiscal / Obrigações). Uma seção por vez.
- **Modais:** viram formulário em tela cheia, stepper no topo, botão primário fixo no
  rodapé.

Gerar mobile para a mesma lista de telas: 01 a 13, 14 a 19 e os 8 modais.

---

## Resumo das 6 mudanças que mais reduzem densidade

1. **Máx. 4 KPIs por tela** (1 herói + 3), nunca 5+.
2. **Abas** nas telas pesadas: Ficha do modelo, Produto, Ordem de produção, Fiscal,
   Estoque.
3. **Acordeão recolhido** para "Fórmulas e explicações", "Observações", alertas e
   dicas — transparência sem poluição.
4. **Tabelas com no máx. 6 colunas**, linhas altas, fonte legível, status em chip.
5. **Um único painel lateral** por tela (em vez de 3–4 widgets empilhados).
6. **Modo "Avançado"** recolhido na calculadora e nos cadastros, para o iniciante ver
   só o essencial por padrão.
```
