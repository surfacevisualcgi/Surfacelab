# Calculadora e Gestao de Impressao 3D

## Objetivo

Criar um sistema simples para iniciantes, mas confiavel o bastante para precificar,
gerar orcamentos e acompanhar a rentabilidade real de uma operacao de impressao 3D.

O sistema nao deve ser apenas uma calculadora isolada. Cada simulacao pode virar um
orcamento, um pedido e, depois da producao, um registro de custo real.

O uso inicial sera compartilhado pelo casal. As duas pessoas devem acessar os mesmos
dados, saber quem alterou cada registro e conseguir dividir tarefas de orcamento,
producao, acabamento, venda e entrega.

## Problemas da calculadora mostrada no video

- Os dados somem porque nao existe banco de dados.
- "Lucro de 100%" e ambiguo: pode significar markup ou margem sobre a venda.
- O risco e informado como um percentual generico, sem separar falha da impressao,
  perda de pecas e retrabalho.
- O custo de mao de obra nao e considerado.
- Nao ha custo de preparacao, fatiamento, troca de material ou pos-processamento.
- Nao ha taxas de marketplace, pagamento, impostos ou comissoes.
- Nao separa material da peca, suportes, purga e desperdicio.
- Nao compara a estimativa com o resultado real.
- Nao controla estoque, pedidos, clientes ou manutencoes.
- O historico e somente uma lista de calculos, sem fluxo operacional.
- Nao possui catalogo de modelos 3D nem ficha tecnica de impressao.
- Nao permite montar produtos compostos por pecas impressas e itens comprados.
- Nao trata corretamente tributacao, nota fiscal e custos ligados ao CNPJ.

## Principio de precificacao

O sistema deve mostrar claramente:

- Custo total do lote.
- Custo por unidade vendavel.
- Preco sugerido do lote e por unidade.
- Markup aplicado.
- Margem bruta sobre a venda.
- Lucro estimado em reais.
- Preco minimo recomendado.

Formula base:

```text
custo_total =
  materiais
  + energia
  + uso_da_maquina
  + mao_de_obra
  + amortizacao_do_desenvolvimento
  + rateio_de_custos_fixos
  + consumiveis
  + embalagem
  + custos_extras
  + custo_esperado_de_falhas
  + provisao_de_garantia_e_devolucoes

preco_antes_de_taxas =
  custo_total / (1 - margem_desejada)

preco_final =
  preco_antes_de_taxas / (
    1
    - taxas_do_canal
    - taxas_de_pagamento
    - comissoes
    - aliquota_tributaria_efetiva
  )
```

O numero de unidades usado no custo unitario deve ser a quantidade vendavel
esperada, nao apenas a quantidade colocada na mesa.

Tributos nao devem ser um unico percentual fixo escondido. O sistema deve permitir
configurar cenarios fiscais e mostrar qual configuracao foi usada no calculo. As
regras e aliquotas aplicaveis ao CNPJ precisam ser validadas com um contador.

## Modulos

### 1. Catalogo de modelos 3D

O modelo 3D e a ficha tecnica daquilo que sera impresso. Ele nao e necessariamente
o produto final vendido.

- Nome, codigo interno, categoria, foto e descricao.
- Arquivo original e arquivos derivados, com versoes.
- Fonte do modelo, autor e licenca de uso comercial.
- Data, custo de compra e observacoes sobre direitos de uso.
- Dimensoes, orientacao e quantidade por mesa.
- Impressora e perfil de fatiamento recomendados.
- Material, cor, bico, altura de camada, preenchimento, paredes e suportes.
- Tempo e peso estimados pelo fatiador.
- Peso separado entre peca, suporte, torre de purga e desperdicio.
- Instrucoes de impressao, acabamento e controle de qualidade.
- Historico de testes, falhas e melhorias por versao.
- Custo estimado e custo real medio das impressoes anteriores.
- Botao para usar o modelo em um novo calculo ou produto.

### 2. Produtos e composicao

O produto e o item efetivamente vendido. Pode combinar modelos 3D, componentes,
embalagem, servicos e variacoes.

- Ficha do produto com SKU, nome comercial, fotos e descricao.
- Lista de materiais e componentes, tambem chamada de composicao ou BOM.
- Um ou varios modelos 3D e suas quantidades.
- Itens comprados configuraveis: lampadas, soquetes, cabos, interruptores, fontes,
  parafusos, imas, ferragens, chaveiros, etiquetas e outros.
- Embalagem e materiais de protecao.
- Etapas de montagem, pintura, acabamento, teste e embalagem.
- Tempo de mao de obra por etapa e por responsavel.
- Variacoes de tamanho, cor, material, acabamento e kit.
- Itens opcionais e adicionais cobrados do cliente.
- Substitutos para componentes indisponiveis, com impacto no custo.
- Modelos de composicao por categoria, como luminaria, chaveiro, ima e kit.
- Custo atual, preco sugerido, preco praticado e margem por canal de venda.
- Custo de desenvolvimento rateado por uma quantidade planejada de vendas.
- Copiar um produto existente para criar uma variacao.

Exemplo de composicao de uma luminaria:

```text
1 cupula impressa
1 base impressa
1 soquete
1 lampada
1 cabo com interruptor
parafusos e pes antiderrapantes
montagem e teste eletrico
embalagem e protecao
```

### 3. Calculadora inteligente

- Nome do projeto e observacoes.
- Quantidade produzida e quantidade vendavel.
- Tempo de preparacao, impressao e pos-processamento.
- Multiplos materiais por projeto.
- Peso da peca, suporte, purga e desperdicio separados.
- Energia por perfil de impressora.
- Custo de uso e manutencao por hora.
- Mao de obra por etapa.
- Embalagens, componentes e outros custos.
- Probabilidade de falha e custo esperado de repeticao.
- Taxas, impostos, desconto e margem desejada.
- Arredondamento comercial e preco minimo.
- Cenarios rapido, padrao e conservador.
- Preco para varejo, atacado e pedido personalizado.
- Quantidade minima economicamente viavel.
- Simulador de desconto sem ultrapassar o preco minimo.
- Explicacao detalhada da origem de cada custo e formula.

### 4. Cadastros reutilizaveis

- Impressoras.
- Filamentos e resinas.
- Perfis de energia.
- Componentes e consumiveis.
- Embalagens.
- Clientes.
- Canais de venda e suas taxas.
- Fornecedores e historico de precos.
- Servicos terceirizados.
- Tarefas de mao de obra e valor por hora.
- Custos fixos mensais e criterios de rateio.

### 5. Fiscal, CNPJ e formacao de preco

O modulo fiscal deve ajudar na simulacao e organizacao, mas nao substituir contador
nem sistema oficial de emissao fiscal.

- Cadastro da empresa: razao social, nome fantasia, CNPJ e inscricoes aplicaveis.
- Regime tributario e vigencia de cada configuracao.
- Atividades da empresa e categorias fiscais dos produtos.
- Aliquota tributaria efetiva configuravel e historico de alteracoes.
- Perfis fiscais diferentes para produto, servico e combinacao dos dois.
- Campos fiscais por produto quando aplicaveis, como NCM, CEST, origem, CFOP,
  CST ou CSOSN.
- Separacao entre preco sem tributos, tributos estimados e preco final.
- Simulacao por canal, estado do cliente e tipo de cliente quando necessario.
- Registro de numero da nota fiscal ou link para o emissor utilizado.
- Relatorio mensal de vendas, tributos estimados e documentos para o contador.
- Calendario de obrigacoes, custos recorrentes do CNPJ e documentos pendentes.
- Alertas de configuracao fiscal ausente ou vencida.
- Checklist de conformidade e seguranca para categorias especiais.

Produtos eletricos, luminarias, brinquedos, itens infantis, itens para contato com
alimentos e produtos sujeitos a calor merecem um checklist proprio. O cadastro deve
registrar componentes certificados, testes realizados, avisos de uso e pendencias
que precisam ser validadas por profissional ou orgao competente.

### 6. Orcamentos e pedidos

- Transformar calculo em orcamento.
- Gerar PDF e mensagem para WhatsApp.
- Validade, prazo, entrada e condicoes.
- Status: rascunho, enviado, aprovado, produzindo, concluido e cancelado.
- Registro de pagamento e entrega.
- Versoes do orcamento e aceite do cliente.
- Entrada, saldo, parcelamento, taxas e data prevista de recebimento.
- Frete cobrado versus frete realmente pago.
- Pedido personalizado com aprovacao de arte ou prototipo.
- Politica de garantia, troca, devolucao e retrabalho.

### 7. Producao e resultado real

- Fila de impressoes.
- Registro de inicio, fim, falha e reimpressao.
- Material e tempo reais.
- Comparacao estimado versus realizado.
- Lucro real por pedido.
- Ordem de producao com responsavel e prazo.
- Controle de qualidade com checklist e fotos.
- Rastreabilidade da versao do modelo, lote do material e configuracao usada.
- Registro do motivo de falha para melhorar futuras estimativas.

### 8. Estoque, compras e manutencao

- Saldo de materiais e componentes.
- Baixa por producao.
- Alerta de estoque baixo.
- Unidade de compra, unidade de consumo e conversao entre elas.
- Lotes, cores, fornecedores, custo medio e ultima compra.
- Reserva de estoque para pedidos aprovados.
- Sugestao de compra com base na fila de producao.
- Perdas, ajustes e inventario.
- Horas acumuladas por impressora.
- Registro e lembrete de manutencao.
- Custo real de manutencao por maquina.

### 9. Financeiro e custos indiretos

- Custos fixos: internet, aluguel, software, contador e outros.
- Criterios de rateio por hora de maquina, hora de trabalho, pedido ou faturamento.
- Fluxo de caixa previsto e realizado.
- Contas a receber e a pagar.
- Taxas de pagamento e prazo ate o dinheiro ficar disponivel.
- Provisoes para garantia, devolucao, inadimplencia e reposicao.
- Separacao entre retirada dos socios, lucro e caixa da empresa.
- Ponto de equilibrio mensal.
- Pro-labore, retiradas e encargos configurados separadamente do lucro do produto.

### 10. Painel

- Faturamento, custo e lucro por periodo.
- Margem media.
- Produtos mais rentaveis.
- Taxa de falhas.
- Utilizacao das impressoras.
- Orcamentos aguardando resposta e pedidos atrasados.
- Estoque a comprar e caixa necessario para os proximos pedidos.
- Comparacao de rentabilidade entre canais de venda.
- Horas trabalhadas e resultado por pessoa.

### 11. Usuarios, colaboracao e seguranca

- Acesso compartilhado para o casal, com contas individuais.
- Papeis e permissoes simples.
- Registro de quem criou ou alterou cada informacao.
- Tarefas, responsaveis, prazos e comentarios.
- Backup automatico e exportacao completa dos dados.
- Lixeira e recuperacao de registros excluidos.
- Protecao de dados pessoais de clientes.

## Custos e riscos frequentemente esquecidos

- Tempo para conversar com o cliente e preparar orcamento.
- Modelagem, adaptacao, prototipos e impressoes de teste.
- Compra ou licenca comercial do arquivo 3D.
- Assinaturas de software, armazenamento e ferramentas.
- Pecas que ficam encalhadas ou se tornam obsoletas.
- Variacao de preco de material e componentes.
- Capital parado em estoque e prazo para receber vendas.
- Descontos, cupons, brindes e amostras.
- Fotografias, anuncios, comissoes e custo de aquisicao de clientes.
- Frete de compra dos insumos e frete de reposicao ou garantia.
- Limpeza, EPIs, ventilacao e descarte de residuos.
- Manutencao preventiva, calibracao e tempo de maquina parada.
- Consumo em espera, computador, iluminacao e climatizacao.
- Quebras durante montagem, acabamento, transporte ou uso pelo cliente.
- Devolucoes, garantia, retrabalho e atendimento depois da venda.
- Inflacao e validade limitada dos orcamentos.
- Risco juridico, fiscal, de licenciamento e de seguranca do produto.

## Fluxo principal desejado

1. Abrir o catalogo e clicar em um modelo 3D ou produto existente.
2. Visualizar fotos, configuracao de impressao, composicao, custo e historico.
3. Escolher quantidade, variacao, canal de venda e cliente.
4. Recalcular com os precos atuais de materiais, componentes, taxas e tributos.
5. Ajustar itens, margem, desconto ou servicos sem alterar o cadastro original.
6. Salvar como simulacao, gerar orcamento ou criar pedido.
7. Ao aprovar, reservar estoque e gerar a ordem de producao.
8. Registrar consumo e tempo reais para descobrir o lucro real.

O recalculo usa os valores atuais, mas cada orcamento e pedido guarda uma fotografia
dos valores usados naquele momento. Assim, o historico financeiro permanece correto.

## Etapas de implementacao

### MVP

- Calculadora completa e transparente.
- Catalogo de modelos 3D e produtos compostos.
- Cadastros de impressoras, materiais, componentes e configuracoes.
- Perfil fiscal configuravel, sem emissao automatica de nota fiscal.
- Salvamento permanente dos projetos.
- Historico pesquisavel.
- Orcamento compartilhavel e exportacao CSV.
- Duas contas de usuario compartilhando a mesma empresa.
- Aplicacao responsiva para computador e celular.

### Segunda etapa

- Clientes, orcamentos e pedidos.
- PDF e WhatsApp.
- Comparacao estimado versus real.
- Fila de producao.
- Estoque de componentes e reserva por pedido.
- Relatorio mensal para conferencia com o contador.

### Terceira etapa

- Estoque, manutencao e painel financeiro.
- Compras, fluxo de caixa e custos indiretos.
- Integracao com emissor fiscal quando escolhida e tecnicamente viavel.
- Importacao de dados do fatiador quando viavel.

## Direcao tecnica sugerida

- Aplicacao web responsiva e instalavel como PWA.
- Interface em portugues e orientada a iniciantes.
- Banco de dados online desde o primeiro MVP, com autenticacao e backup.
- Calculos centralizados em um modulo testavel, sem formulas espalhadas pela tela.
- Cada valor calculado deve ter uma explicacao visivel.
- Configuracoes iniciais guiadas para evitar que o usuario precifique com campos
  importantes zerados.
- Valores historicos devem ficar congelados em orcamentos e pedidos. Alterar o
  preco atual de um componente nao pode modificar uma venda antiga.
- O sistema deve guardar tanto a estimativa quanto os valores reais.

## Decisoes que precisam ser validadas antes da implementacao

- Impressao FDM inicialmente ou FDM e resina desde o MVP.
- Regime tributario, atividades e regras fiscais validadas com contador.
- Emissor de nota fiscal que sera utilizado.
- Produtos iniciais e quais exigem checklist especial de seguranca ou conformidade.
- Canais de venda iniciais e suas taxas.
- Nivel de detalhe desejado para estoque, financeiro e pedidos.
