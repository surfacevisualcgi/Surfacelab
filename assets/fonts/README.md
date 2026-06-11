# Tipografia — Surface

Fontes oficiais da identidade (copiadas de `D:\SURFACE VISUAL\...\TIPOGRAFIA`).

## Famílias
- **Replica Pro** (`replica-pro/ReplicaPro.ttf`) — display/marca, títulos, wordmark.
- **Montserrat** (`montserrat/`, 18 pesos: Thin→Black + itálicos) — UI e corpo de texto.

## Uso sugerido na app
- Títulos / números de destaque (KPIs, preços) → Replica Pro ou Montserrat ExtraBold/Black.
- Corpo, tabelas, formulários, labels → Montserrat (Regular/Medium/SemiBold).

## ⚠️ Licença (importante antes de publicar)
- **Montserrat** é OFL (livre para web e redistribuição) — sem problema.
- **Replica Pro** é uma fonte COMERCIAL (Lineto). A licença desktop dos `.ttf` em geral
  **NÃO cobre uso como webfont** num app público. Antes de embutir Replica Pro como
  webfont, confirmar/obter a licença de webfont — ou restringir Replica Pro a peças
  onde já há licença e usar Montserrat como fonte de web do produto. NÃO commitar
  Replica Pro em repositório público.

## Build
Converter os `.ttf` em `.woff2` (subsetados) para a web; declarar via `@font-face`
self-hosted (melhor para PWA offline). Montserrat também existe no Google Fonts.
