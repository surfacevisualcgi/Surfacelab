# Agente de impressão — Surface Labs

Este programinha roda na **mesma rede da sua impressora** (um PC, notebook ou
Raspberry Pi ligado o tempo todo) e faz a ponte entre o Surface Labs e a
máquina. O site não fala direto com a impressora — ele coloca os trabalhos
numa fila, e o agente puxa, baixa o G-code e manda imprimir.

## Como funciona

```
Surface Labs (nuvem)              Sua rede local
┌────────────────────┐           ┌───────────────────────────┐
│  Você clica         │           │   agente.mjs (este programa)│
│  "Imprimir"  ───────┼── fila ──▶│   1. pega o trabalho        │
│                     │           │   2. baixa o G-code         │
│  status na tela ◀───┼── status ─┤   3. envia à impressora     │
└────────────────────┘           │   4. reporta o progresso    │
                                  └───────────────────────────┘
```

O agente só enxerga os trabalhos das **suas** impressoras (o token resolve a
sua empresa) — não tem acesso a clientes, financeiro ou nada além disso.

## Instalação

1. Instale o **Node.js 18 ou superior** no computador que fica na rede da
   impressora: <https://nodejs.org>
2. Baixe o arquivo `agente.mjs` (botão no site, em
   **Configurações → Agente de impressão**).
3. No site, em **Agente de impressão**, clique em **Gerar token** e copie o
   token (ele só aparece uma vez).

## Rodando

### Modo simulação (para testar sem impressora)

```bash
SL_URL="https://SEU-PROJETO.supabase.co" \
SL_TOKEN="sl_agent_xxxxxxxx" \
node agente.mjs
```

O agente vai aceitar trabalhos e simular o progresso — útil para conferir que
tudo está conectado antes de ligar a impressora.

### Modo OctoPrint (impressão real)

Se sua impressora roda **OctoPrint** (ou Klipper/Moonraker com o plugin de
compatibilidade), pegue a URL e a API key do OctoPrint e rode:

```bash
SL_URL="https://SEU-PROJETO.supabase.co" \
SL_TOKEN="sl_agent_xxxxxxxx" \
SL_MODO="octoprint" \
OCTOPRINT_URL="http://octopi.local" \
OCTOPRINT_KEY="sua-api-key-do-octoprint" \
node agente.mjs
```

> No Windows (PowerShell), defina as variáveis com `$env:SL_TOKEN="..."` antes
> de `node agente.mjs`.

## Deixar rodando sempre

- **Raspberry Pi / Linux:** crie um serviço `systemd` apontando para `node
  agente.mjs` com as variáveis no arquivo de serviço.
- **Windows:** use o Agendador de Tarefas (executar ao iniciar) ou uma
  ferramenta como `pm2`.

## Variáveis

| Variável | Obrigatória | Default | O que é |
| --- | --- | --- | --- |
| `SL_URL` | sim | `http://127.0.0.1:54321` | URL do Surface Labs |
| `SL_TOKEN` | sim | — | Token do agente (gerado no site) |
| `SL_MODO` | não | `simulacao` | `simulacao` ou `octoprint` |
| `OCTOPRINT_URL` | se octoprint | — | URL do OctoPrint na rede |
| `OCTOPRINT_KEY` | se octoprint | — | API key do OctoPrint |
| `SL_INTERVALO_MS` | não | `4000` | Intervalo de verificação da fila |

## Segurança

- O token é a chave da sua oficina — trate como senha. Se vazar, gere outro no
  site (o antigo deixa de funcionar).
- O agente só faz três coisas: listar a fila das suas impressoras, baixar o
  G-code do trabalho e reportar o status. Nada além disso.
- Marcas/modelos sem OctoPrint precisam de uma ponte equivalente (Moonraker,
  Bambu, Prusa Connect) — dá para estender o `imprimir...()` do `agente.mjs`.
