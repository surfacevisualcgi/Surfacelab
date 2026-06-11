# Prompt de arranque do build (para o Fable 5)

Cole o bloco abaixo no início de uma sessão do Claude Code (Fable 5) dentro da pasta
do projeto. Ele assume que `CLAUDE.md`, a memória do projeto e os docs de governança
já existem na pasta.

---

```
Você vai construir o PrintGestor 3D. ANTES de escrever qualquer código, leia e siga
como fonte de verdade, nesta ordem:
1. CLAUDE.md (raiz) — instruções e decisões travadas.
2. A memória do projeto (carrega sozinha) — multi-tenant, RBAC, LGPD, segurança
   Supabase, autenticação, planos, arquitetura de backend.
3. Os docs: PLANO_DO_PRODUTO.md, **LOGICA_E_MODELAGEM.md** (modelo de dados/regras/
   fórmulas/fluxos — leia antes de modelar o banco), PERMISSOES_E_LGPD.md,
   AUTENTICACAO_E_PLANOS.md, ARQUITETURA_BACKEND.md e **`prototipo v2/`** (telas finais;
   regra "protótipos = estrutura, não pele" — aplicar identidade Surface Labs).

Não reabra decisões já tomadas nesses arquivos. Onde faltar definição, use os padrões
abaixo e siga em frente — registre as suposições no final, não pare para perguntar.

## Missão desta rodada
Entregar o MVP funcional do **Surface Labs** — o "grosso" que roda de ponta a ponta.
Prioridade é PROFUNDIDADE antes de LARGURA: primeiro uma fatia vertical completa e
funcionando, depois espalhar para as demais telas.

## Stack
- Frontend: React + Vite + TypeScript, PWA responsivo (desktop + mobile), i18n
  (react-i18next) desde já com pt-BR como default. UI seguindo prototipo-telas/
  (densidade reduzida: ver PROMPT_REFACAO_TELAS.md).
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions). Schema e RLS via
  migrations versionadas (supabase/migrations), nunca pelo dashboard.
- Pagamento: Stripe (cartão), atrás de uma interface ProvedorPagamento.
- Estado/dados: TanStack Query + cliente Supabase. Componentes com um design system
  mínimo (tokens de cor/tipografia consistentes).

## Ordem de trabalho (com checkpoints)
1. `git init`, estrutura do projeto, configuração base (Vite, TS, lint, i18n, .env a
   partir de .env.example — a chave publicável do Stripe já está em .env.local).
2. Modelagem do banco em migrations, com RLS desde a PRIMEIRA tabela:
   - Governança: usuario, tenant, membership(papel, permissoes_extras,
     flags_sensiveis), convite.
   - Domínio: impressoras, materiais/componentes, fornecedores, clientes, modelos_3d,
     produtos, composicao (BOM), simulacoes/calculo, orcamentos (+itens congelados),
     pedidos, ordens_producao, estoque/movimentacoes, fiscal, financeiro.
   - LGPD/infra: consentimento, log_auditoria, registro_compartilhamento. Soft-delete
     (deleted_at) onde fizer sentido.
   - Tudo com tenant_id e política RLS filtrando pelo tenant ativo.
3. Auth + onboarding: signup (e-mail/senha + Google) cria usuário e tenant (vira
   Dono); aceite de Termos/Privacidade versionado; convite por e-mail; seletor de
   empresa; claim de tenant ativo no JWT.
4. FATIA VERTICAL (faça isto funcionar 100% antes de seguir):
   catálogo → cadastro de modelo/produto/insumos → CALCULADORA (motor de cálculo) →
   gerar ORÇAMENTO com snapshot imutável dos valores. Esta é a espinha do produto.
5. Motor de cálculo: módulo PURO, isolado e com testes (Vitest). Mesma lógica no
   cliente (preview ao vivo) e validada no servidor (Edge Function) ao gerar
   orçamento/pedido. Cada valor com explicação. Dinheiro em inteiro de centavos.
6. Largura: demais telas do MVP a partir dos protótipos (pedidos/produção kanban,
   estoque, fiscal/financeiro, clientes, fornecedores, cadastros, dashboard), com os
   estados de lista vazia / carregando / erro.
7. Planos/entitlements: limites por plano checados no backend (degradação graciosa,
   soft cap). Stripe via Edge Function + webhook (pode ficar mockado se faltar config
   real, mas com a estrutura pronta).

## Não-negociáveis (corretude e segurança)
- RLS ativa em TODA tabela; nada confia em tenant_id/papel vindo do cliente.
- service_role só no servidor; no front só a anon key. Segredos nunca no repositório.
- Permissão por ação e limite de plano checados SEMPRE no backend.
- Masking de dados sensíveis (custo/margem, financeiro, pró-labore, PII): backend não
  envia o campo a quem não pode ver.
- Orçamentos/pedidos guardam fotografia imutável dos valores; mudar cadastro não
  altera venda antiga.
- Anonimização (direito LGPD) preserva o registro fiscal; nunca apaga NF.
- Moeda/locale no tenant; não hardcodar BRL/pt-BR.

## Autonomia (liberdade de engenharia)
Os documentos são a INTENÇÃO e o piso de qualidade, não uma jaula. Tenha liberdade para
melhorar, simplificar e adicionar funções quando isso deixar o produto melhor, mais
robusto ou mais fácil para o iniciante — prefira a melhor solução real à cópia literal.
ÚNICO limite: não enfraqueça os não-negociáveis acima (segurança/LGPD/snapshot/centavos).
Ao fazer melhoria relevante, adicionar algo além do spec, ou divergir de uma decisão não
relacionada a segurança, registre no resumo de entrega o que mudou e por quê (não precisa
pedir permissão antes). Ver "Autonomia do agente" no CLAUDE.md.

## Padrões para decisões em aberto (não pare para perguntar)
- Impressão: **FDM e resina** no MVP (campo "tecnologia"); ver decisões §7 de
  LOGICA_E_MODELAGEM.md (baixa de estoque no fim/configurável, falha por modelo, rateio
  de custo fixo por faturamento, cenários como presets no "Avançado").
- Permissões dos papéis: presets fixos no código (5 papéis).
- Billing: estrutura de entitlements completa; cobrança real do Stripe pode ficar em
  modo teste/mock, com webhook e estados prontos.
- Região Supabase, preços dos planos, durações de trial/carência: usar placeholders
  configuráveis e registrar como pendência.

## Estilo de trabalho
- Trabalhe em commits pequenos e descritivos. Migrations versionadas.
- Escreva testes para o motor de cálculo e para o isolamento de tenant (usuário do
  tenant A não lê dados do tenant B).
- Rode o app e verifique que sobe e que a fatia vertical funciona antes de declarar
  pronto.
- Ao terminar a rodada, entregue um resumo: o que está funcionando, o que ficou
  scaffold/mock, as suposições feitas e os próximos passos recomendados para o
  refinamento.

Comece confirmando em 3-4 linhas o plano de execução e então mãos à obra.
```

---

## Dicas de uso
- Rode dentro da pasta do projeto, para o CLAUDE.md e a memória carregarem.
- Deixe o Fable 5 trabalhar a rodada inteira; só interrompa se ele divergir de uma
  decisão travada.
- No fim, peça o "resumo de entrega" (o prompt já pede) para saber o que refinar.
- Os números dos planos e textos legais (Termos/DPA) são placeholders — calibrar
  depois com você e com um advogado.
