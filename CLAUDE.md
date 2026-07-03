# Surface Labs — instruções do projeto

Leia este arquivo e a **memória do projeto** antes de qualquer coisa. As decisões de
arquitetura, governança e segurança já foram tomadas em sessões anteriores — não as
refaça nem improvise por cima delas. Em caso de dúvida, pergunte ao usuário (Lucas,
arquiteto, PT-BR) antes de divergir.

## Nome e identidade visual
**"Surface Labs" é o nome do produto** — sub-marca do ecossistema **Surface Visual**,
herdando a identidade. "PrintGestor 3D" era nome genérico de trabalho — não usar.
- **Logo do app:** símbolo **spirograph** (gradiente azul→roxo→rosa) + wordmark
  "SURFACE LABS"; no cabeçalho e como ícone/favicon. NÃO usar o wireframe (vaso) — esse é
  da Surface Visual, não deste produto. Arquivos em `assets/brand/` (ver README).
- **UI:** base **branca**, **detalhes/menus em preto**, **gradiente azul→roxo→rosa só
  como acento**. Substitui o teal dos protótipos.
- **Tipografia:** Replica Pro (títulos) + Montserrat (UI/corpo) em `assets/fonts/`.
  ⚠️ Replica Pro é comercial (Lineto) — licença desktop não cobre webfont; resolver
  licença antes de publicar ou usar Montserrat na web. Montserrat é OFL (livre).

**REGRA — protótipos = estrutura, NÃO pele:** os protótipos em `prototipo-telas/` são
referência de **layout, hierarquia, onde cada dado fica, fluxos e comportamento**.
NÃO copiar a aparência deles (teal/verde, fontes genéricas). Aplicar por cima a
identidade Surface Labs: branco + detalhes pretos + gradiente como acento, Replica Pro +
Montserrat, logo spirograph. Mesma "planta", vestida com a marca.

## O que é
SaaS de gestão e precificação para negócios de impressão 3D (uso inicial: um casal).
Calculadora transparente + ERP vertical (modelos 3D, produtos compostos/BOM,
orçamentos, pedidos/produção em kanban, estoque, fiscal/financeiro, cadastros).

## Fase atual
Pré-código. Existem: plano de produto, **protótipos visuais finais em `prototipo v2/`**
(19 telas + 8 modais, desktop e mobile, densidade reduzida — usar ESTES, não a pasta
antiga `prototipo-telas/`), o documento `LOGICA_E_MODELAGEM.md` (modelo de dados, regras,
fórmulas, fluxos derivados das telas) e as decisões de governança abaixo. O projeto
Supabase já existe (ver §infra na memória). Próximo passo: **construir em React**.

## Fontes de verdade (leia antes de modelar)
- `PLANO_DO_PRODUTO.md` — escopo completo, 11 módulos, fórmula de precificação, MVP.
- **`LOGICA_E_MODELAGEM.md` — modelo de dados, entidades/relações, regras de negócio,
  fórmulas do cálculo, fluxos/estados, lógica de estoque. Derivado dos protótipos v2.
  Leia antes de modelar o banco.**
- `prototipo v2/` — telas finais (estrutura/layout). Ver regra "protótipos = estrutura,
  não pele" acima.
- `PERMISSOES_E_LGPD.md` — RBAC (papéis/permissões/flags) + conformidade LGPD.
- `AUTENTICACAO_E_PLANOS.md` — login (Supabase Auth) e planos/assinatura.
- `ARQUITETURA_BACKEND.md` — motor de cálculo, estratégia de API, i18n/moeda, pendências.
- Memória do projeto (carrega sozinha): multi-tenant, permissões, LGPD, segurança
  Supabase, marca. É a fonte canônica das decisões.

## Stack
- Backend: **Supabase (PostgreSQL)** — auth, RLS, storage, exportação.
- Frontend: **React** (PWA responsivo, desktop + mobile, PT-BR, orientado a iniciante).
- Módulo de cálculo isolado e testável (não espalhar fórmulas pela UI).

## REGRA OPERACIONAL - Supabase cloud
- O banco oficial do projeto e o **Supabase cloud** do projeto **Surface Labs**
  (`zqpkvlurablyswdxambl`, `https://zqpkvlurablyswdxambl.supabase.co`).
- Nao usar Supabase local para alteracoes, melhorias, migrations, testes de schema ou
  validacoes de banco. O ambiente local pode rodar apenas o frontend.
- Toda mudanca de banco deve ser criada em migration versionada no repositorio e aplicada
  no projeto cloud linkado pela Supabase CLI ou pelas ferramentas oficiais do Supabase.
- Depois de alterar schema/RLS/views/funcoes/storage no cloud, validar no proprio cloud
  com consulta/teste real e, quando disponivel, rodar advisors.
- Nunca clicar manualmente no dashboard para criar schema fora de migration, salvo se o
  usuario pedir explicitamente uma acao emergencial.

## Decisões travadas — NÃO reabrir sem o usuário
1. **Multi-tenant** shared schema: `tenant_id` em toda tabela de negócio. Entidades
   base: `usuario`, `tenant`, `membership(papel, permissoes_extras, flags_sensiveis)`,
   `convite`.
2. **RBAC** com 5 papéis (Dono, Administrador, Comercial/Gerente, Produção, Somente
   leitura) + flags de dados sensíveis (custo/margem, financeiro, pró-labore, PII do
   cliente, exportar). Contador NÃO é usuário — recebe por exportação (só Dono/Admin).
3. **LGPD:** controlador = tenant, operador = o SaaS (DPA nos Termos). Base legal de
   cliente = execução de contrato; marketing = consentimento revogável registrado.
   Eliminação = **anonimizar preservando o registro fiscal/NF** (nunca apagar NF).
   CPF/endereço opcionais por padrão. Registro de compartilhamento com terceiros.
4. **Auth** (Supabase Auth): e-mail+senha e **Google** no MVP; **2FA TOTP** opcional,
   recomendado/enforçável para Dono/Admin; aceite de Termos+Privacidade versionado no
   cadastro. Signup cria o tenant e torna o usuário Dono.
5. **Planos** vivem no `tenant`: 3 níveis (Gratuito, Profissional, Studio) por
   limites/entitlements, checados no backend. Calculadora completa em todos; a gestão
   (time, fiscal, estoque, integrações) é o que escala. Trial do Profissional no signup.
6. **Pagamento: Stripe** (Billing + Customer Portal + webhooks comandam o estado do
   tenant). Mensal e anual por plano (anual com desconto). **Não pagamento = degradação
   graciosa**: past_due c/ carência → cai para Gratuito mantendo dados e leitura;
   soft cap (nada apagado, excedente vira só-leitura). NUNCA trancar login nem o acesso
   aos próprios dados. Recorrência no cartão (escolha pela internacionalização futura);
   Pix como pagamento único/anual avulso; Pix Automático a revisitar. Abstrair o
   pagamento atrás de uma interface `ProvedorPagamento`.

## Guarda-corpos de segurança (Supabase) — obrigatórios
- **RLS ativa em TODA tabela**, sem exceção. Política filtra pelo **tenant ativo**
  (via claim no JWT), derivado de `auth.uid()` + membership — nunca do payload.
- **`service_role` key só no servidor** (Edge Functions); no front só a `anon` key.
  Chaves em env vars, fora do repo.
- **Permissão por ação checada no backend**, não só na UI.
- **Masking de coluna ≠ RLS** (RLS é por linha): custo/margem/CPF via privilégio de
  coluna, view por papel ou stripping na API.
- **Storage** (fotos) com política RLS por tenant.
- **Schema e políticas em migrations versionadas** (não clicar no dashboard).
- Escrever teste de isolamento: tenant A não lê dados do tenant B.

## Autonomia do agente (liberdade de engenharia)
Os documentos são a **intenção e o piso de qualidade, não uma jaula**. Você (Fable 5 ou
qualquer agente no build) tem **liberdade para melhorar, simplificar e adicionar funções**
quando julgar que isso deixa o produto melhor, mais robusto, mais fácil para o iniciante,
ou mais manutenível. Prefira a melhor solução real à cópia literal do texto. O usuário
(Lucas) quer essa autonomia explicitamente.
- **Limite inegociável:** a liberdade NÃO vale para enfraquecer os guarda-corpos acima —
  RLS/isolamento por tenant, permissão checada no backend, masking de dados sensíveis,
  LGPD (anonimizar preservando NF, consentimento), snapshot imutável de orçamento/pedido,
  dinheiro em centavos, segredos fora do front. Esses são piso, não teto: melhore por
  cima, nunca abra mão.
- **Transparência:** ao fazer uma melhoria relevante, adicionar algo além do
  especificado, ou divergir de uma decisão documentada (que não seja de segurança),
  **registre no resumo de entrega o que mudou e por quê** — para o Lucas revisar depois.
  Não precisa pedir permissão antes; melhorias pequenas e óbvias não precisam de aviso.

## Ordem de trabalho sugerida ao iniciar o build
1. `git init` (a pasta ainda não é repositório) e estrutura inicial do projeto.
2. Confirmar com o usuário as pendências em aberto (abaixo).
3. Modelar o banco no Supabase via migrations: entidades base + RLS desde a 1ª tabela.
4. Auth + fluxo de signup (cria usuário + tenant) + convite + seletor de empresa.
5. Implementar o módulo de cálculo isolado e testável (coração do produto).
6. Construir as telas do MVP a partir dos protótipos, do simples ao complexo.

## Pendências a confirmar com o usuário antes/no início do build
- FDM só, ou FDM + resina desde o MVP.
- Permissões dos papéis: fixas no código (sugerido p/ MVP) vs. tabela no banco.
- Modelar tabelas ainda só descritas: `consentimento`, `log_auditoria`,
  `registro_compartilhamento`.
- Super-admin da plataforma (Lucas vê todos os tenants p/ suporte) — provável, fora
  do MVP.
- Plano/assinatura no `tenant` — depois do MVP.
- Região do Supabase (US por padrão → transferência internacional na LGPD).
- DPA/Termos de Uso: redação jurídica precisa de revisão de advogado.
- Planos: preços (mensal/anual) e desconto anual; billing real no MVP ou só a
  estrutura de entitlements; aceitar Pix/boleto no plano anual avulso; duração de
  carência (past_due) e do trial. (Provedor = Stripe, já decidido.)
- Auth: provedores OAuth além do Google; 2FA opcional vs. obrigatório p/ Dono/Admin.

## Backend (ver `ARQUITETURA_BACKEND.md`)
- **Motor de cálculo:** módulo puro, isolado e testável; mesma lógica no cliente
  (preview) e no servidor (autoritativa ao gerar orçamento/pedido). **Snapshot
  imutável** dos valores ao gerar orçamento/pedido — mudar cadastro não altera venda
  antiga.
- **API:** CRUD comum direto nas tabelas (RLS); lógica sensível (cálculo, webhook
  Stripe, anonimização, convite, exportação, limites de plano) em Edge Functions.
- **i18n:** moeda/locale/fuso no `tenant` (default BRL/pt-BR, não hardcodar);
  **dinheiro em inteiro de centavos**; config fiscal BR isolada.

## Segredos e variáveis de ambiente
- Chaves em `.env.local` (gitignored); `.env.example` documenta as variáveis sem
  valores. Frontend usa prefixo `VITE_`.
- **Stripe publicável de teste** (`pk_test_...`) já em `.env.local` como
  `VITE_STRIPE_PUBLISHABLE_KEY` — pública por natureza, segura no frontend.
- **NUNCA** colocar chaves secretas (`sk_...`, `STRIPE_WEBHOOK_SECRET`,
  `service_role`) no frontend, em docs ou na memória. Só nos segredos do servidor
  (`supabase secrets set`), usados pelas Edge Functions.

## Convenções
- UI/dados/mensagens em português do Brasil. R$ e dd/mm/aaaa (mas sem hardcodar —
  ver i18n acima).
- Cada valor calculado deve ter explicação visível (transparência é o diferencial).
- Valores históricos congelados em orçamentos/pedidos: mudar preço atual de um
  insumo não altera venda antiga.
