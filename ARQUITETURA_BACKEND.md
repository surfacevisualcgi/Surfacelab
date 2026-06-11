# Arquitetura de Backend — PrintGestor 3D

Instruções de backend além da governança (multi-tenant, RBAC, LGPD, segurança, auth,
planos — ver os outros docs e a memória). Backend: Supabase (PostgreSQL + Auth +
Storage + Edge Functions).

---

## 1. Motor de cálculo (coração do produto)

- **Módulo isolado e testável:** função pura, sem dependência de UI nem de banco —
  recebe os inputs (itens de custo, tempos, energia, mão de obra, taxas, alíquotas,
  margem) e retorna o detalhamento completo. Cobertura de testes alta.
- **Reuso cliente/servidor:** a mesma lógica roda no **cliente** para preview ao vivo
  (resposta instantânea na calculadora) e no **servidor (Edge Function)** como versão
  **autoritativa** ao gerar orçamento/pedido. Nunca confiar só no cálculo do cliente.
- **Transparência:** cada valor calculado carrega sua explicação/fórmula (diferencial
  do produto vs. a calculadora do vídeo).
- **Fórmula base** (ver `PLANO_DO_PRODUTO.md`): custo_total → preço_antes_de_taxas
  (= custo / (1 − margem)) → preço_final (descontando taxas/comissões/tributos).
- **Snapshot / congelamento:** ao gerar orçamento ou pedido, gravar uma **fotografia
  imutável** de TODOS os valores e parâmetros usados (preços de insumos, taxas,
  alíquotas, margem, config fiscal). Os itens do orçamento guardam **valores
  congelados**, não referências vivas ao preço atual. Alterar um cadastro depois NÃO
  pode mudar uma venda antiga.
- **Rastreabilidade:** registrar qual versão da config fiscal e dos parâmetros foi
  usada em cada cálculo.

## 2. Estratégia de API (PostgREST vs. Edge Functions)

- **Acesso direto às tabelas** (PostgREST/SDK Supabase, protegido por RLS) para o CRUD
  comum: catálogos, cadastros, listagens.
- **Edge Functions (server-side)** para toda lógica sensível ou que não pode confiar
  no cliente:
  - cálculo autoritativo e geração de orçamento/pedido (snapshot);
  - webhook do Stripe (estado da assinatura);
  - anonimização LGPD (função que mascara PII preservando NF);
  - envio de convite;
  - exportações (contador/relatórios);
  - qualquer ação que cruze **limites/entitlements de plano**.
- **Permissão por ação e limite de plano checados SEMPRE no servidor.** A UI esconder
  botão é só conforto.

## 3. Internacionalização, moeda e locale (não hardcodar BR)

O usuário pretende internacionalizar no futuro — então desde já:
- **Moeda, locale e fuso vivem no `tenant`** (default BRL / pt-BR / America/Sao_Paulo),
  nunca fixos no código.
- **Strings da UI em arquivos de i18n** desde o começo, mesmo que só pt-BR no MVP.
- **Dinheiro armazenado em inteiro de centavos** (não float) para evitar erro de
  arredondamento — barato definir agora, caro corrigir depois.
- **Config fiscal é específica do Brasil** (NCM, CFOP, regime, alíquotas): isolar num
  módulo fiscal por país, para não travar a expansão internacional.

---

## Pendências de backend a resolver no início do build

- **Modelar o esquema de domínio** (o grande próximo passo): modelos 3D, produtos,
  composição/BOM, simulações, orçamentos, pedidos, ordens de produção, estoque,
  movimentações, fiscal, financeiro — tudo com `tenant_id` e RLS.
- **Soft-delete (`deleted_at`) + lixeira/recuperação**, alinhado com a anonimização da
  LGPD.
- **E-mail transacional** (ex.: Resend/SendGrid) para convites, alertas e orçamentos;
  **WhatsApp** para envio de orçamento (citado no plano).
- **Jobs agendados** (`pg_cron` / Edge Functions agendadas): alerta de estoque baixo,
  orçamento vencendo, próxima manutenção.
- **Ambientes** dev/produção (projetos Supabase separados) e **seeds** iniciais
  (config fiscal padrão, categorias, unidades).
- **Concorrência:** optimistic locking onde houver edição simultânea (a auditoria de
  fluxos já citou "conflito de alteração simultânea").
- **Observabilidade/erros** (ex.: Sentry) — opcional no MVP.
