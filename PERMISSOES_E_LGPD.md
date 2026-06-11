# Permissões (RBAC) e Conformidade LGPD — PrintGestor 3D

Documento de decisões de governança de acesso e proteção de dados. Entra na
modelagem do banco e da camada de autenticação/autorização quando o projeto for
para React. O controle de acesso (RBAC) é também a principal medida de segurança
exigida pela LGPD — por isso os dois temas vivem no mesmo documento.

---

## PARTE A — Controle de acesso (RBAC)

Três camadas de controle, do mais simples ao mais fino.

### Camada 1 — Papéis (presets)

Resolvem a maioria dos casos só ao convidar a pessoa.

| Papel | Para quem | Vê financeiro/lucro | Vê custo/margem | Vê PII do cliente |
| --- | --- | --- | --- | --- |
| **Dono** | Os sócios (o casal) | Sim, tudo (inclui pró-labore/retiradas) | Sim | Sim |
| **Administrador** | Sócio operacional de confiança | Sim (menos pró-labore/sócios) | Sim | Sim |
| **Comercial/Gerente** | Faz orçamento e atende cliente | Não | Sim | Sim |
| **Produção** | Ajudante de impressão/acabamento | Não | **Não** | Não (só nome/prazo) |
| **Somente leitura** | Visitante | Não | Não | Não |

> **Decisão (jun/2026):** o contador NÃO é usuário convidado. Ele recebe os dados
> via **exportação** (Relatório contábil mensal — CSV/PDF). Assim o dono não abre o
> sistema inteiro a um terceiro. Por isso não existe papel "Financeiro/Contador" —
> são 5 papéis. Exportar é restrito a Dono/Admin (flag `exportar`) e conta como
> compartilhamento com terceiro para fins de LGPD (ver Parte B).

O papel **Produção** atende o requisito central: vê "imprima X, pedido #, prazo",
mas não vê lucro/margem nem CPF do cliente.

### Camada 2 — Permissões por módulo × ação

Cada papel é um conjunto de permissões. O dono pode customizar por pessoa
(preset + ajustes).

- **Módulos:** Modelos 3D, Produtos, Calculadora/Preços, Orçamentos, Pedidos,
  Produção, Estoque, Compras, Clientes, Fornecedores, Financeiro, Fiscal,
  Relatórios, Configurações, Usuários.
- **Ações:** `ver` · `criar` · `editar` · `excluir` · especiais: `aprovar`,
  `exportar`.

Exemplo do papel **Produção**:
```
Produção:   ver ✓  editar ✓ (status/progresso)  registrar falha ✓
Estoque:    ver ✓  editar ✓ (dar baixa)          excluir ✗
Modelos 3D: ver ✓  editar ✗
Pedidos:    ver ✓ (visão operacional)            editar ✗   valores ✗
Financeiro/Fiscal/Calculadora/Clientes/Usuários: ✗
```

### Camada 3 — Flags de dados sensíveis (masking)

Ter acesso a uma tela ≠ ver tudo nela. O backend remove o campo da resposta (não
é só esconder na UI); a interface mostra `•••` ou omite o bloco.

```
[ ] Ver custos e margem (produtos, calculadora, pedidos, orçamentos)
[ ] Ver financeiro (caixa, contas, resultado)
[ ] Ver pró-labore e retiradas dos sócios        ← só Dono por padrão
[ ] Ver dados pessoais de clientes (CPF, endereço, contato)   ← LGPD
[ ] Exportar dados / relatórios
```

Exemplo: o papel Produção abre a Ordem de Produção, mas o painel "Interno"
(custo/margem/lucro) e o CPF do cliente não vêm na resposta da API.

### Onde isso vive na modelagem

```
membership (usuario_id, tenant_id, papel, permissoes_extras, flags_sensiveis)
```
- `papel` = preset (conjunto base de permissões).
- `permissoes_extras` = ajustes do dono sobre o preset.
- `flags_sensiveis` = toggles da Camada 3.

Duas frentes de garantia, **sempre no backend**:
1. Isolamento entre empresas → `tenant_id` via Row Level Security.
2. Permissão dentro da empresa → checagem por ação na API. A UI esconder botão é só
   conforto; quem barra de verdade é o backend.

### Escopo de MVP

MVP: **5 papéis-preset + 5 flags de dados sensíveis.** A customização fina item a
item (Camada 2 destravável na interface) fica para a 2ª etapa — a estrutura no banco
já nasce pronta, só não é exposta na UI ainda.

---

## PARTE B — Conformidade LGPD (Lei 13.709/2018)

### Papéis legais
- **Controlador** = o tenant (empresa de impressão). Decide o que coletar dos
  clientes dele.
- **Operador** = o PrintGestor (o SaaS). Processa em nome do tenant. **Exige
  contrato de operador / DPA nos Termos de Uso.**
- **Encarregado (DPO)** = campo por tenant; em negócio pequeno pode ser o próprio
  dono.

O principal dado pessoal tratado é o do **cliente final** (CPF, endereço, contato,
histórico). O foco da conformidade é o módulo Clientes e onde esse dado aparece
(orçamento, pedido, NF, compartilhamentos).

### Base legal por finalidade
- Guardar dado para **cumprir o pedido** → base "execução de contrato" (não precisa
  de consentimento).
- **Marketing** (WhatsApp/e-mail promocional) → **consentimento separado e
  revogável**, registrado com data. O checkbox "Autorizo contato" do modal de novo
  cliente vira consentimento auditável (quando deu, quando revogou).

### Direitos do titular (na ficha do cliente)
- **Exportar dados** (acesso + portabilidade).
- **Corrigir** (= editar).
- **Excluir / anonimizar** (eliminação).

### Eliminação × retenção fiscal (regra crítica)
"Excluir" cliente = **anonimizar os dados pessoais** (nome, CPF, contato → `•••`)
**preservando o registro fiscal/financeiro** da venda. Nunca apagar NF. Assim a
LGPD (eliminação) e a obrigação fiscal (guarda ~5 anos) convivem. Política de
retenção configurável, respeitando o mínimo legal fiscal.

### Compartilhamento de dados (transparência)
Todo destino para onde o dado do cliente sai é compartilhamento e precisa ser
registrado e transparente ao titular: marketplace, gateway de pagamento, emissor de
NF, transportadora, **contador (via exportação)**. O sistema mantém um **registro de
terceiros** com finalidade de cada compartilhamento. A exportação para o contador é
restrita a Dono/Admin e fica registrada (quem exportou, quando, o quê).

### Minimização
CPF e endereço **não obrigatórios por padrão** — pedidos só quando há NF ou entrega.
Não coletar "por garantia".

### Segurança (Art. 46) = o RBAC da Parte A
O controle de papéis + flags sensíveis É a medida de segurança da LGPD: só quem
precisa vê PII. Somar: criptografia em trânsito e em repouso, isolamento
multi-tenant (`tenant_id`/RLS), senhas com hash.

### Registro de tratamento (log)
Estender o "quem alterou cada registro" (já no plano) para **registrar também quem
visualizou dado pessoal** (acesso a PII), com quem/quando.

### Incidentes
Plano de resposta a vazamento: notificar ANPD e o titular afetado.

### Avisos
- **Aviso/política de privacidade** ao titular (cliente).
- **Consentimento de uso** dos usuários da equipe no cadastro.

### Resumo do que entra no produto por causa da LGPD
1. DPA nos Termos (SaaS = operador, tenant = controlador).
2. Consentimento de marketing registrado e revogável.
3. Botões "Exportar dados" e "Excluir/anonimizar" na ficha do cliente.
4. Anonimização preservando registro fiscal.
5. Registro de compartilhamento com terceiros.
6. CPF/endereço opcionais por padrão (minimização).
7. Log de acesso e alteração de PII.
8. Campo de Encarregado (DPO) por empresa.
9. Plano de incidente + notificação ANPD.
