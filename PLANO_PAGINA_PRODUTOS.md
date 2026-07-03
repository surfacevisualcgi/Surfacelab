# Plano da pagina de produtos - checklist vivo

> Como usar: este arquivo e o roteiro de execucao da pagina de Produtos. Antes
> de codar uma etapa, ler este plano e marcar o que for concluido trocando
> `- [ ]` por `- [x]`. A pagina de Produtos deve virar a fonte mestre do que a
> empresa vende e precisa se conectar corretamente com Supabase, calculadora,
> estoque, pedidos, producao, financeiro e futuros canais de venda.
>
> Ultima atualizacao: 01/jul/2026.

---

## Objetivo

Transformar Produtos em um modulo operacional real, nao apenas um catalogo.

A pagina precisa responder com clareza:

- O que vendemos?
- Quais variacoes/SKUs existem?
- Como cada item e produzido?
- Quanto custa?
- Por quanto vendemos?
- Quanto existe em estoque local?
- Onde esta publicado?
- O que acontece quando vira orcamento, pedido e producao?

Regra principal: **Produto e a fonte mestre interna. Canal e distribuicao.**

---

## Modelo mental aprovado

- [x] **Produto**: agrupador comercial. Ex.: Porta-joias Purity.
- [x] **SKU / variacao**: unidade vendavel real. Ex.: Porta-joias Purity P Branco.
- [x] **Modelo 3D**: ficha tecnica de impressao, diferente do produto vendido.
- [x] **Composicao / BOM**: modelos, materiais, componentes, embalagem, servicos e mao de obra usados para produzir.
- [x] **Estoque local**: saldo pronto, reservado e disponivel, idealmente por SKU.
- [x] **Canal**: local de venda/publicacao, como Shopify, Shopee, Mercado Livre, Amazon, TikTok Shop, loja propria ou venda direta.
- [x] **Publicacao de canal**: representacao de um produto/SKU em um canal externo, com preco, status, codigo remoto e dados de sincronizacao.

Decisao de arquitetura:

- [x] Produto nao deve copiar a estrutura de cada marketplace.
- [x] Marketplace nao deve ser a fonte principal do cadastro interno.
- [x] Integracoes futuras devem adaptar o produto interno para cada canal, nao o contrario.

---

## Estado atual do sistema

### Ja existe

- [x] Tabela `produto`.
- [x] View `v_produto` com custos mascarados por permissao.
- [x] Tabela `variacao`.
- [x] Tabela `composicao_item`.
- [x] Tabela `produto_canal`.
- [x] Tabela `canal_venda`.
- [x] Ledger de estoque de materiais em `movimentacao_estoque`.
- [x] Pagina de produtos em cards.
- [x] Detalhe de produto com abas: geral, variacoes, canais e composicao.
- [x] Calculadora puxa produto, composicao e canal.
- [x] Pedidos e OPs ja se conectam com produto.

### Pontos fracos atuais

- [x] Modal de novo produto ainda e simples demais.
- [x] SKU e manual, nao automatico.
- [x] Produto e SKU ainda nao estao conceitualmente separados o bastante na UI.
- [ ] Estoque de produto acabado ainda e campo simples (`produto.estoque_pronto` / `variacao.estoque`), sem ledger.
- [ ] Aba de canais e apenas margem/preco por canal, ainda nao representa publicacao.
- [x] Lista de produtos nao tem modo tabela operacional.
- [x] Detalhe de produto tem informacao boa, mas a hierarquia visual ainda confunde.
- [x] Visual da pagina de produtos ainda nao segue tao bem o padrao atual das paginas mais novas do app.
- [x] Canais de marketplace ainda nao existem como modulo/menu proprio.
- [x] Falta alerta claro de cadastro incompleto.

---

## Fase 1 - Definir a espinha do produto

- [x] Confirmar que SKU/variacao sera a unidade vendavel principal.
- [x] Confirmar que produto sera agrupador comercial.
- [x] Confirmar que estoque local sera controlado por SKU quando houver variacoes.
- [ ] Confirmar comportamento para produto sem variacoes: criar uma variacao padrao automaticamente.
- [x] Definir nomes finais na UI: "SKUs", "Variacoes" ou "Variacoes/SKUs".
- [ ] Definir se `produto.sku` continua como SKU principal/legado ou se passa a ser codigo do produto.
- [x] Definir que `variacao.codigo` sera tratado como SKU vendavel.
- [x] Definir que `variacao.modelo_id` sera a ponte direta entre SKU vendavel e Modelo 3D tecnico.
- [ ] Definir campos minimos para um produto ser considerado "publicavel".
- [ ] Definir campos minimos para um produto ser considerado "calculavel".
- [ ] Definir campos minimos para um produto ser considerado "pronto para venda".

Resultado esperado:

- Produto, SKU, modelo 3D, composicao, estoque e canal ficam conceitualmente separados.

---

## Fase 1.5 - Validacao visual antes de codar

Antes de implementar a refatoracao, criar mockups estaticos para validar a direcao visual.

Mockups necessarios:

- [x] Lista de produtos em modo cards.
- [x] Lista de produtos em modo tabela/lista operacional.
- [x] Detalhe do produto - aba Resumo.
- [x] Detalhe do produto - aba SKUs/Variacoes.
- [x] Detalhe do produto - aba Composicao/Preco/Estoque em estrutura clara.
- [x] Detalhe do produto - aba Canais/Publicacoes.
- [x] Modal de novo produto em stepper.
- [x] Modal de criar/editar SKU.
- [x] Modal de ajuste de estoque local.
- [x] Placeholder da pagina Canais no menu lateral.

Direcao visual:

- [x] Seguir o padrao atual das paginas mais novas: interface operacional, densa, clara e sem cara de landing page.
- [x] Sidebar escura, topbar existente, conteudo em fundo claro.
- [x] Cards com borda leve, raio moderado e informacao escaneavel.
- [x] Usar tabelas para gestao operacional.
- [x] Usar chips/etiquetas para status, alertas, canais e disponibilidade.
- [x] Evitar excesso de cards decorativos.
- [x] Mostrar alertas e pendencias de cadastro de forma objetiva.
- [x] Priorizar leitura rapida de custo, preco, margem, estoque e status.

Resultado esperado:

- Validar visualmente o fluxo inteiro antes de mexer em codigo e banco.

---

## Fase 2 - Melhorar a lista de produtos

- [x] Adicionar alternancia entre modo **Cards** e modo **Lista**.
- [x] Manter cards para catalogo visual.
- [x] Criar tabela/lista para operacao.
- [x] Criar visao operacional por SKUs/variacoes.
- [x] Mostrar foto pequena no modo lista.
- [x] Mostrar nome do produto.
- [x] Mostrar SKU principal ou quantidade de SKUs.
- [x] Mostrar categoria.
- [x] Mostrar status.
- [x] Mostrar disponibilidade.
- [x] Mostrar estoque local.
- [x] Mostrar custo atual quando permitido.
- [x] Mostrar preco base.
- [x] Mostrar margem quando permitido.
- [x] Mostrar canais/publicacoes vinculadas.
- [x] Mostrar alertas de cadastro incompleto.

Filtros:

- [x] Busca por nome ou SKU.
- [x] Categoria.
- [x] Status.
- [x] Pronta entrega / sob demanda.
- [x] Com estoque / sem estoque.
- [x] Com canal / sem canal.
- [x] Cadastro incompleto.
- [x] Margem baixa ou negativa.
- [x] Sem foto.
- [ ] Sem composicao.

Supabase / dados:

- [ ] Avaliar se `v_produto` precisa trazer contagem de SKUs.
- [ ] Avaliar se `v_produto` precisa trazer saldo resumido de estoque local.
- [ ] Avaliar se `v_produto` precisa trazer quantidade de canais/publicacoes.
- [ ] Evitar queries pesadas no card/lista.

Resultado esperado:

- Cards servem para navegar visualmente.
- Lista serve para operar e corrigir problemas rapido.

---

## Fase 3 - Reorganizar detalhe do produto

Abas propostas:

- [x] **Resumo**: visao executiva do produto.
- [x] **Identidade**: dados comerciais e imagens.
- [x] **SKUs**: variacoes vendaveis.
- [x] **Composicao**: BOM de producao.
- [x] **Preco**: custo, preco, margem e calculadora.
- [x] **Estoque**: saldo local e movimentacoes.
- [x] **Canais**: publicacoes e preparo para integracoes.
- [x] **Historico**: orcamentos, pedidos, OPs e alteracoes.

Resumo:

- [x] Foto principal.
- [x] Status do produto.
- [x] Disponibilidade.
- [x] Custo atual.
- [x] Preco praticado.
- [x] Preco sugerido.
- [x] Margem.
- [x] Estoque pronto/disponivel.
- [x] Quantidade de SKUs.
- [x] Quantidade de canais/publicacoes.
- [x] Alertas principais.
- [x] Acoes: calcular preco, criar orcamento, editar produto, criar SKU, ajustar estoque.

Identidade:

- [x] Nome.
- [x] Codigo do produto.
- [x] Categoria.
- [x] Descricao.
- [x] Fotos.
- [x] Tags.
- [x] Dimensoes.
- [x] Peso.
- [x] Material principal.
- [x] Status.
- [x] Disponibilidade.

SKUs:

- [x] Codigo/SKU.
- [x] Nome da variacao.
- [x] Cor.
- [x] Tamanho.
- [x] Modelo 3D tecnico.
- [x] Foto propria.
- [x] Preco.
- [x] Estoque.
- [x] Status.
- [x] Peso/dimensoes quando diferente do produto.

Composicao:

- [x] Modelos impressos.
- [x] Materiais/componentes.
- [x] Embalagem.
- [x] Mao de obra.
- [x] Servicos.
- [x] Substitutos.
- [ ] Fornecedor por item quando fizer sentido.
- [x] Total da composicao.

Preco:

- [x] Custo atual.
- [x] Preco sugerido.
- [x] Preco praticado.
- [x] Margem.
- [x] Preco por canal.
- [x] Botao para abrir calculadora com produto/SKU/canal.
- [ ] Botao para atualizar preco calculado.

Estoque:

- [x] Saldo pronto.
- [x] Reservado.
- [x] Disponivel.
- [ ] Entradas.
- [ ] Saidas.
- [x] Ajustes.
- [ ] Reservas.
- [ ] Devolucoes.
- [ ] Perdas/avarias.

Canais:

- [x] Canal.
- [x] Status: nao publicado, publicado, pausado, erro.
- [x] Preco no canal.
- [ ] Estoque enviado.
- [ ] SKU remoto.
- [ ] ID/listing remoto.
- [ ] Link remoto.
- [ ] Ultima sincronizacao.
- [x] Erros de sincronizacao.

Historico:

- [ ] Orcamentos relacionados.
- [ ] Pedidos relacionados.
- [ ] Ordens de producao relacionadas.
- [ ] Movimentacoes de estoque.
- [x] Alteracoes relevantes.

Resultado esperado:

- Cada aba responde uma pergunta clara e reduz a confusao atual.

---

## Fase 4 - Melhorar modal de novo produto

Fluxo proposto:

- [x] Passo 1: Identidade.
- [x] Passo 2: SKU inicial.
- [x] Passo 3: Base tecnica.
- [ ] Passo 4: Composicao inicial.
- [x] Passo 5: Preco.
- [x] Passo 6: Revisao.

Passo 1 - Identidade:

- [x] Nome do produto.
- [x] Categoria.
- [x] Descricao.
- [ ] Fotos.
- [x] Tags.
- [x] Status inicial.
- [x] Disponibilidade.

Passo 2 - SKU inicial:

- [x] Criar SKU automaticamente.
- [x] Permitir edicao manual.
- [x] Nome da variacao.
- [x] Cor.
- [x] Tamanho.
- [x] Foto da variacao.
- [x] Preco inicial opcional.
- [x] Estoque inicial opcional.

Passo 3 - Base tecnica:

- [x] Vincular modelo 3D existente.
- [x] Permitir deixar modelo pendente.
- [x] Material principal.
- [x] Peso.
- [x] Dimensoes.

Passo 4 - Composicao:

- [ ] Adicionar modelo impresso.
- [ ] Adicionar componente.
- [ ] Adicionar embalagem.
- [ ] Adicionar mao de obra.
- [ ] Adicionar servico.

Passo 5 - Preco:

- [x] Preco manual.
- [x] Opcao "calcular depois".
- [ ] Mostrar alerta se composicao/custo estiver incompleto.

Passo 6 - Revisao:

- [x] Mostrar produto que sera criado.
- [x] Mostrar SKU inicial que sera criado.
- [ ] Mostrar composicao que sera criada.
- [ ] Mostrar pendencias antes de finalizar.

Supabase / gravacao:

- [x] Criar `produto`.
- [x] Criar `variacao` inicial.
- [x] Criar `composicao_item` quando houver itens.
- [ ] Evitar produto orfao se algum insert falhar.
- [ ] Considerar RPC transacional para criar tudo junto.

Resultado esperado:

- Todo produto novo ja nasce com estrutura minima vendavel.

---

## Fase 5 - SKU automatico

Regras:

- [x] SKU automatico por padrao.
- [x] SKU editavel manualmente.
- [ ] SKU unico por tenant.
- [x] SKU deve ser legivel.
- [x] SKU nao deve depender de marketplace.
- [x] SKU deve funcionar para venda direta e para canais externos.

Formato inicial sugerido:

```text
CODPROD-TAM-COR-001
```

Exemplos:

```text
PURITY-P-BRANCO-001
PURITY-M-ROSA-002
PP-PUR-P-BRA-001
```

Banco:

- [ ] Adicionar unicidade para SKU/codigo vendavel por tenant.
- [ ] Avaliar se a constraint fica em `variacao.codigo`.
- [ ] Criar funcao/helper para gerar proxima sequencia.
- [ ] Tratar conflito de SKU no front e no banco.

Resultado esperado:

- Usuario iniciante nao precisa inventar codigo, mas usuario avancado pode editar.

---

## Fase 6 - Estoque local de produto acabado

Problema atual:

- [ ] `produto.estoque_pronto` e `variacao.estoque` sao campos simples.
- [ ] Nao existe historico imutavel de produto acabado.
- [ ] Nao existe reserva/baixa de produto pronto bem modelada.

Movimentos necessarios:

- [ ] Entrada por producao concluida.
- [ ] Entrada manual.
- [ ] Saida por pedido/venda.
- [ ] Reserva por pedido aprovado.
- [ ] Estorno de reserva.
- [ ] Ajuste de inventario.
- [ ] Perda/avaria.
- [ ] Devolucao.

Modelo de banco provavel:

- [ ] Criar `movimentacao_estoque_produto` ou nome equivalente.
- [ ] Referenciar `produto_id`.
- [ ] Referenciar `variacao_id` quando houver SKU.
- [ ] Guardar `tenant_id`.
- [ ] Guardar tipo de movimentacao.
- [ ] Guardar quantidade.
- [ ] Guardar motivo.
- [ ] Guardar referencia: pedido, OP, inventario, manual, canal.
- [ ] Tornar ledger imutavel.
- [ ] Criar caches de saldo/reservado/disponivel por SKU.

Conexoes:

- [ ] Pedido aprovado reserva produto pronto quando houver estoque pronta entrega.
- [ ] Pedido sob demanda reserva insumos/producao, como hoje.
- [ ] OP concluida pode gerar entrada de produto acabado.
- [ ] Venda/pedido entregue pode gerar saida de produto acabado.
- [ ] Ajuste manual preserva historico.

Resultado esperado:

- Estoque de produto pronto passa a ter confianca operacional, como o estoque de materiais.

---

## Fase 7 - Conectar produto, SKU e calculadora

Calculadora deve aceitar:

- [ ] Produto.
- [ ] SKU/variacao.
- [ ] Canal.
- [ ] Cliente.
- [ ] Quantidade produzida.
- [ ] Quantidade vendavel.

Calculadora deve puxar:

- [ ] Composicao do produto.
- [ ] Modelo 3D do SKU quando houver.
- [ ] Material recomendado.
- [ ] Custo atual.
- [ ] Desenvolvimento/rateio.
- [ ] Taxas do canal.
- [ ] Fiscal.
- [ ] Custos fixos.

Calculadora deve devolver:

- [ ] Custo calculado.
- [ ] Preco sugerido.
- [ ] Margem.
- [ ] Alertas de cadastro incompleto.
- [ ] Opcao de atualizar produto.
- [ ] Opcao de atualizar SKU.
- [ ] Opcao de atualizar preco por canal.

Resultado esperado:

- Produto e SKU viram entrada natural da calculadora, sem duplicar logica.

---

## Fase 8 - Preparar canais no menu e no produto

Menu lateral:

- [x] Criar item **Canais** abaixo de Produtos.
- [x] Permitir expansao do menu Canais.
- [x] Criar subpaginas placeholder:
  - [x] Shopify.
  - [x] TikTok Shop.
  - [x] Shopee.
  - [x] Amazon.
  - [x] Mercado Livre.
  - [x] Loja propria.
  - [x] Venda direta / Manual.

Pagina de cada canal:

- [x] Exibir estado vazio bem feito.
- [x] Explicar que integracao ainda sera configurada.
- [x] Mostrar campos futuros: conectar conta, status, produtos publicados, erros.
- [x] Nao implementar API real ainda.

Banco futuro:

- [ ] Criar/planejar `canal_integracao`.
- [ ] Criar/planejar `produto_publicacao_canal`.
- [ ] Guardar credenciais fora do front, via secrets/Edge Functions quando houver API.
- [ ] Guardar status de sincronizacao.
- [ ] Guardar payload remoto minimo para auditoria/debug.

Resultado esperado:

- Estrutura visual de canais preparada sem misturar cadastro de produto com integracao.

---

## Fase 9 - Publicacoes por canal

Na ficha do produto:

- [x] Mostrar canais disponiveis.
- [ ] Permitir criar publicacao manual/futura.
- [x] Mostrar status da publicacao.
- [x] Mostrar preco por canal.
- [x] Mostrar estoque enviado ao canal.
- [x] Mostrar SKU remoto.
- [x] Mostrar ID remoto/listing ID.
- [ ] Mostrar link remoto.
- [x] Mostrar ultima sincronizacao.
- [x] Mostrar erros.

Overrides por canal:

- [x] Titulo no canal.
- [x] Descricao no canal.
- [x] Fotos por canal.
- [x] Categoria remota.
- [x] Preco remoto.
- [x] Estoque sincronizado.
- [ ] Peso/dimensoes exigidos pelo canal.
- [x] Status publicado/pausado.

Resultado esperado:

- Produto continua mestre, mas cada canal pode ter dados especificos.

---

## Fase 10 - Alertas de cadastro incompleto

Alertas de produto:

- [x] Sem foto.
- [x] Sem SKU.
- [x] Sem variacao vendavel.
- [x] Sem composicao.
- [ ] Sem modelo 3D.
- [x] Sem custo calculavel.
- [x] Sem preco.
- [x] Margem negativa.
- [x] Margem abaixo do minimo configurado.
- [x] Pronta entrega sem estoque.
- [ ] Estoque sem SKU.
- [ ] Canal sem preco.
- [ ] Canal sem peso/dimensoes.
- [ ] Produto com composicao usando material sem custo.
- [ ] Produto com modelo sem tempo/peso.

Onde mostrar:

- [x] Lista de produtos.
- [x] Card do produto.
- [x] Resumo do produto.
- [ ] Revisao do modal de criacao.
- [ ] Calculadora.
- [x] Aba Canais/Publicacoes.

Resultado esperado:

- O usuario sabe o que precisa corrigir antes de vender/publicar.

---

## Fase 11 - Conectar com orcamentos, pedidos e producao

Orcamentos:

- [ ] Selecionar produto.
- [ ] Selecionar SKU quando houver.
- [ ] Congelar nome, SKU, descricao, preco e custo no snapshot.
- [ ] Preservar historico mesmo se produto mudar depois.

Pedidos:

- [ ] Item de pedido deve guardar produto e SKU quando aplicavel.
- [ ] Pedido de produto pronta entrega deve reservar estoque local.
- [ ] Pedido sob demanda deve gerar OP e reservar insumos.
- [ ] Pedido misto deve suportar parte pronta entrega e parte producao.

Producao:

- [ ] OP deve saber produto e SKU.
- [ ] Conclusao de OP pode gerar entrada de produto acabado.
- [ ] Consumo real continua baixando materiais.
- [ ] Falhas continuam afetando custo real.

Financeiro:

- [ ] Venda deve manter snapshot de preco/custo/margem.
- [ ] Canal deve influenciar taxa e previsao de recebimento.
- [ ] Futuras vendas de marketplace devem entrar como pedido/receita reconciliavel.

Resultado esperado:

- Produto deixa de ser uma tela isolada e se conecta ao fluxo operacional inteiro.

---

## Fase 12 - Ajustes Supabase previstos

Possiveis migrations:

- [ ] Melhorar constraints de `variacao`.
- [ ] Garantir unicidade de SKU por tenant.
- [ ] Criar ledger de estoque de produto acabado.
- [ ] Criar caches de saldo por SKU.
- [ ] Criar view de resumo de produtos para lista.
- [ ] Criar tabela de integracoes de canal.
- [ ] Criar tabela de publicacoes por canal.
- [ ] Criar policies RLS para novas tabelas.
- [ ] Revisar masking de custos em views novas.
- [ ] Criar indices para produto, SKU, canal e estoque.

Cuidados:

- [ ] Toda tabela nova precisa `tenant_id`.
- [ ] Toda tabela exposta precisa RLS.
- [ ] Custos/margens devem respeitar `ver_custos`.
- [ ] Dados sensiveis de integracao nao devem ir para o front.
- [ ] Snapshots historicos nao podem mudar retroativamente.

Resultado esperado:

- Banco suporta a UX sem gambiarra e sem quebrar seguranca multi-tenant.

---

## Ordem de execucao recomendada

- [x] 1. Reorganizar detalhe do produto em abas claras.
- [x] 2. Adicionar modo card/lista na pagina de produtos.
- [x] 3. Adicionar alertas de cadastro incompleto.
- [ ] 4. Melhorar modal de novo produto com SKU inicial.
- [x] 5. Implementar SKU automatico.
- [x] 6. Fortalecer aba de SKUs.
- [ ] 7. Criar estoque local de produto acabado.
- [ ] 8. Conectar estoque local com pedidos e OPs.
- [x] 9. Separar aba Preco da antiga margem por canal.
- [x] 10. Criar aba Canais/Publicacoes.
- [x] 11. Criar menu lateral Canais com placeholders.
- [ ] 12. Ajustar calculadora para SKU quando necessario.
- [ ] 13. Revisar orcamento/pedido/producao para carregar SKU.
- [ ] 14. Planejar integracoes reais de marketplace.

---

## Fora de escopo por enquanto

- [ ] Integracao real com Shopify.
- [ ] Integracao real com TikTok Shop.
- [ ] Integracao real com Shopee.
- [ ] Integracao real com Amazon.
- [ ] Integracao real com Mercado Livre.
- [ ] Sincronizacao automatica de pedidos de marketplace.
- [ ] Sincronizacao automatica de estoque com marketplace.
- [ ] Emissao fiscal automatica.

Esses itens devem vir depois que Produto, SKU, Estoque local e Publicacoes estiverem bem modelados.

---

## Criterios de pronto

A pagina de Produtos so deve ser considerada boa o suficiente quando:

- [ ] Usuario consegue criar produto com SKU inicial sem entender banco de dados.
- [ ] Usuario entende diferenca entre produto, SKU e modelo 3D.
- [ ] Usuario consegue ver rapidamente se o produto esta pronto para vender.
- [ ] Usuario consegue alternar entre catalogo visual e lista operacional.
- [ ] Usuario consegue calcular preco a partir do produto/SKU.
- [ ] Usuario consegue ver composicao e custo com clareza.
- [ ] Usuario consegue controlar estoque local de produto acabado com historico.
- [ ] Usuario consegue entender em quais canais o produto esta ou estara publicado.
- [ ] Orcamentos e pedidos conseguem usar produto/SKU com snapshot correto.
- [ ] A producao consegue devolver entrada de produto acabado quando fizer sentido.
- [ ] O banco preserva RLS, tenant, masking de custos e historico imutavel.
