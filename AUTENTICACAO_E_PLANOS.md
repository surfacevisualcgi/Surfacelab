# Autenticação e Planos — PrintGestor 3D

Decisões de login/auth e de planos/assinatura. Entram na modelagem do banco e do
fluxo de onboarding. Backend: Supabase. Ver também `PERMISSOES_E_LGPD.md` e a memória
do projeto.

---

## PARTE A — Autenticação / Login

Tudo via **Supabase Auth**.

### Métodos de entrada (MVP)
- E-mail + senha.
- **Google (OAuth)** — provedor prioritário no Brasil.
- Apple e outros provedores: depois. Magic link: opcional.

### Segurança da conta
- Confirmação de e-mail obrigatória.
- Recuperação de senha.
- Proteção contra senha vazada (HaveIBeenPwned, nativo do Supabase).
- **2FA via TOTP** (app autenticador). Opcional para todos, **fortemente recomendado
  e enforçável para Dono e Admin** (acesso a financeiro e PII). SMS só se necessário.

### Aceite de termos (LGPD)
- No cadastro, aceite obrigatório de **Termos de Uso + Política de Privacidade**.
- Guardar **versão aceita + data/hora**. Se a versão mudar, re-pedir aceite.

### Encaixe no multi-tenant (ver memória)
- Cadastro (e-mail ou Google) → onboarding **cria o tenant (empresa)** → usuário vira
  **Dono**.
- Convidado: aceita convite → entra em tenant **existente**, sem criar empresa.
- Múltiplas memberships → seletor "trocar de empresa".
- JWT carrega claim do **tenant ativo** (liga na RLS).

### Pendências
- Definir provedores OAuth além do Google.
- Política de 2FA: opcional vs. obrigatório para Dono/Admin.

---

## PARTE B — Planos e assinatura

### Conceito central
**O plano vive no `tenant` (empresa), não no usuário.** Todos do mesmo tenant
compartilham o plano — é a empresa que paga e consome recursos.

Cada plano = conjunto de **limites e features liberadas (entitlements)**. Ao bater um
limite, o **backend barra** a ação e a UI mostra upsell amigável. Checagem sempre no
servidor.

### Princípio de desenho
- **Calculadora completa em TODOS os planos** — é o gancho que resolve a dor original
  e traz o usuário.
- O que escala (e é cobrado) é a **gestão**: time, fiscal, estoque, integrações.
- Profissional = o plano do casal. Gratuito = experimentar de verdade. Studio =
  crescimento.

### Os 3 planos (números são ponto de partida)

| Recurso | Gratuito | Profissional | Studio |
| --- | --- | --- | --- |
| Usuários | 1 | 3 | 10 |
| Modelos 3D | 15 | ilimitado | ilimitado |
| Produtos | 10 | ilimitado | ilimitado |
| Pedidos/mês | 20 | ilimitado | ilimitado |
| Impressoras | 1 | 5 | ilimitado |
| Calculadora completa | ✓ | ✓ | ✓ |
| Orçamento PDF/WhatsApp | marca d'água | ✓ | ✓ |
| Estoque/Compras | básico | ✓ | ✓ |
| Fiscal/Financeiro | — | ✓ | ✓ |
| Relatórios/Exportação | — | ✓ | avançado |
| Integrações (marketplace/NF/pgto) | — | — | ✓ |
| Storage de imagens | 0,5 GB | 5 GB | 20 GB |
| Suporte | comunidade | e-mail | prioritário |

### Dimensões de limite a modelar
Usuários, modelos 3D, produtos, pedidos/mês, impressoras, storage, e flags de
módulos avançados (fiscal, financeiro detalhado, relatórios, exportação,
integrações).

### Provedor de pagamento: Stripe (decidido)
**Motivo:** aposta na internacionalização — começar no Brasil no cartão e, ao
expandir, é quase só habilitar moedas/métodos no mesmo provedor, sem trocar de
fornecedor. Recorrência no **cartão**; **Pix** como pagamento único / plano anual
avulso. **Pix Automático fica para revisitar** (se o Stripe suportar, habilita; senão
reabrir). Recomendado abstrair o pagamento atrás de uma interface
(`ProvedorPagamento`) mesmo usando só Stripe — liberdade futura barata.

- **Stripe Billing** gerencia planos e assinaturas recorrentes.
- **Customer Portal** (hospedado pelo Stripe): cliente troca cartão, muda mensal↔anual,
  cancela e baixa faturas — não precisamos construir essas telas.
- **Webhooks** comandam o estado: `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated/deleted` → backend atualiza `tenant`
  (plano + status + fim do período). O webhook decide o que está liberado, não o front.
- **Ressalva BR:** recorrência funciona bem no **cartão**. **Pix recorrente** não é
  nativo — Pix/boleto servem para **plano anual avulso (renovação manual)**, não para
  débito mensal automático. Considerar isso ao precificar para público Pix-pesado.

### Ciclo mensal vs. anual
- Cada plano pago tem **dois preços** no Stripe: mensal e anual.
- Anual com desconto (padrão ~"2 meses grátis"/~17%) — melhora caixa e retenção.
- Upgrade/downgrade no meio do ciclo: Stripe faz a proporção (proration).

### O que trava quando não paga (degradação graciosa)
Princípio: **nunca trancar o cliente para fora dos próprios dados** (hostil + esbarra
na LGPD). Degrada o acesso, não bloqueia tudo.
1. Pagamento falhou → **`past_due` (carência ~7–14 dias):** acesso normal + banner
   "pagamento pendente"; Stripe re-tenta o cartão (dunning).
2. Carência esgotada → **cai para o Gratuito**, mantendo todos os dados e a leitura.
   - **Trava:** criar novos registros acima do limite (produtos/modelos/pedidos);
     módulos pagos (Fiscal/Financeiro, Relatórios/Exportação, Integrações);
     convidar/adicionar usuários (time extra vira leitura); orçamento volta com marca
     d'água; subir novas imagens acima do storage.
   - **Nunca trava:** login; ver e **exportar os próprios dados** (direito do titular);
     a calculadora completa.
   - **Soft cap:** nada é apagado. Se tinha 80 produtos e o Gratuito permite 10, os 80
     ficam visíveis/editáveis; só não cria o 81º até voltar a pagar ou reduzir.
3. Pagou de novo → volta na hora ao plano pago, tudo destravado.

### Implementação técnica
- `tenant.plano_id` + `tenant.status_assinatura` + `current_period_end` +
  `stripe_customer_id`/`stripe_subscription_id`.
- Definição de plano e limites (código ou tabela `plano`/`plano_limites`).
- Função de entitlement: `dentroDoLimite(tenant, recurso, qtdAtual)` /
  `podeUsar(tenant, recurso)`, checada no **backend** nos pontos de criação e nos
  módulos pagos.
- **Trial:** tenant começa em trial do Profissional por X dias (Stripe suporta trial
  nativo); depois cai para Gratuito ou exige pagamento.

### Pendências (decidir depois)
- Preços de cada plano (mensal e anual) e tamanho do desconto anual.
- Se o billing real entra no MVP ou só a estrutura de entitlements (estrutura entra
  agora; cobrança pode vir depois).
- Aceitar Pix/boleto para o plano anual avulso, além do cartão.
- Duração da carência (past_due) e do trial.
- Pix Automático (recorrente): revisitar se/quando o Stripe suportar.
