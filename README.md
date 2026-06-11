# Surface Labs

SaaS de gestão e precificação para negócios de impressão 3D. Calculadora
transparente + ERP vertical (modelos 3D, produtos/BOM, orçamentos, pedidos,
produção, estoque, financeiro), multi-tenant com Supabase.

## Rodar em desenvolvimento (stack local)

```bash
npm install
npx supabase start        # sobe Postgres/Auth/Storage/Functions via Docker
npx supabase db reset     # aplica as migrations (supabase/migrations)
npx supabase functions serve   # em outro terminal — Edge Functions locais
npm run dev               # Vite em http://localhost:5173
```

O `npm run dev` usa o `.env.development.local` (stack local). O build de
produção usa o `.env.local` (projeto Supabase na nuvem — ver memória §infra).

## Testes

```bash
npm test                  # motor de cálculo (puro, sem dependências)
npm run test:isolamento   # RLS/masking/snapshot — exige o stack local rodando
```

## Deploy do banco na nuvem

```bash
npx supabase link --project-ref zqpkvlurablyswdxambl
npx supabase db push          # aplica as migrations
npx supabase functions deploy gerar-orcamento
```

## Arquitetura (resumo)

- **Motor de cálculo**: `supabase/functions/_shared/calculo/` — módulo puro,
  compartilhado entre o cliente (preview ao vivo) e a Edge Function
  `gerar-orcamento` (cálculo autoritativo + snapshot imutável).
  Re-exportado em `src/core/calculo`.
- **RLS em toda tabela**, escopada ao tenant ativo (claim no JWT validada
  contra a membership). Masking de dados sensíveis via views `v_*`
  (o front LÊ as views, ESCREVE nas tabelas base).
- **Estoque** é um ledger imutável (`movimentacao_estoque`) com custo médio
  ponderado; saldos no `material` são cache mantido por trigger.
- **Decisões e fontes de verdade**: `CLAUDE.md`, `LOGICA_E_MODELAGEM.md`,
  `PLANO_DO_PRODUTO.md` e a memória do projeto.
