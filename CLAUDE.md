# Instruções para o Claude neste repositório

Responda sempre em português do Brasil.

## Projetos

- **Base Planejamento** (raiz deste repositório): app estático (`index.html`, `app.js`, `styles.css`) com dados no Supabase. Publicado pelo GitHub Pages (`.github/workflows/pages.yml`, que envia apenas os arquivos do site).
- **Giro Foco** (CDA Benevides): acompanhamento de giro de clientes/refrigeração. Hoje vive no Google Sites
  (`https://sites.google.com/view/girofoco-cdabenevides/giro-foco`) e usa a planilha
  **"Giro foco - Planilha/nuvem"** (ID `1IIcrIvStwwqfweqRerUts5PmzPeEe47k_gtFCiznjZM`, aba `Nuvem_Giro`) como nuvem,
  gravada por um Web App do Apps Script (`cloudWebhookUrl`).
  - Formato atual: `A1`/`B1` = data da última sincronização; `A2` = um único JSON com configurações e a lista `clients`.
  - **Problema conhecido:** o JSON passa do limite de uma célula e é cortado em 45.000 caracteres (JSON inválido, só ~62 clientes de ~640). A correção planejada é gravar uma linha por cliente.
  - O JSON contém senhas (`adminPass`). Nunca as exiba, copie para commits ou envie para serviços externos.

### Briefing completo do Giro Foco (sempre carregado)

@docs/giro-foco/BRIEFING.md

## Fluxo de design para sites (evitar "cara de IA")

Skills instaladas em `.claude/skills` (versões travadas em `skills-lock.json`; atualizar com `npx skills update -p`):

1. **Direção e construção:** `design-taste-frontend` (Taste) para escolher paleta, tipografia, layout e fotos pelo ramo do negócio; `impeccable` para planejar, criticar e refinar (`/impeccable ...`).
2. **Acabamento e movimento (Emil Kowalski):** `emil-design-eng`, `animate`, `choreograph`, `gestures`, `mobile-native`, `improve-animations`, `review-animations`, `remove-animations`, `find-animation-opportunities`, `animation-performance`, `apple-design`, `pick-ui-library`, `prototype`, `break-ui`, `learn-taste`, `ask-emil`, `animation-vocabulary`.
3. **Figma:** conector Figma MCP + skills `figma-use-motion` / `figma-implement-motion` / `figma-design-to-code`.
4. **Revisão:** `design-critique` e `accessibility-review` antes de entregar.
5. **Verificação visual:** sempre abrir o site no navegador (Playwright) e conferir prints em 1440px e 390px (celular) antes de dizer que está pronto.

Evitar: degradê roxo genérico, fonte padrão sem intenção, textos genéricos de marketing, cards idênticos em grade.
