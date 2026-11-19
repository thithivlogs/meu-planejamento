# Giro Foco — briefing do projeto (ler antes de qualquer trabalho)

Objetivo: **refazer a aparência e a experiência do site Giro Foco** (CDA Benevides), mantendo a **mesma planilha do Google** como nuvem e, se possível, o **mesmo link do Google Sites** — para os usuários ser apenas uma atualização.

## 1. O que existe hoje

- Site: `https://sites.google.com/view/girofoco-cdabenevides/giro-foco` (Google Sites).
- Nuvem: planilha **"Giro foco - Planilha/nuvem"** — ID `1IIcrIvStwwqfweqRerUts5PmzPeEe47k_gtFCiznjZM`, aba `Nuvem_Giro`.
- Gravação: Web App do Apps Script (`cloudWebhookUrl`, termina em `/exec`).
- O código atual (Apps Script e/ou HTML incorporado no Sites) **será colado pelo usuário** na conversa. Pedir se ainda não estiver no repositório; salvar em `docs/giro-foco/codigo-atual/` antes de mudar qualquer coisa.
- Formato atual da nuvem: `A1` "Última Sincronização:", `B1` data; `A2` um único JSON com configurações
  (`adminPass`, `sellerPassMode: SAME_AS_SETOR`, `supPassMode: SAME_AS_MESA`, `sellerKeyword`, `supKeyword`,
  `calcMetricMode: ATIVOS`, `boxFactorHL: 0.0396`, `lastUpdateLabel`, `cloudWebhookUrl`) e a lista `clients`.
- Campos de cada cliente: `mes, regional, idCentro, idOrg, operacao, statusGiro, matriz, idCliente, cliente, cnpj,
  idGrupo, grupo, categoria, supId, supNome, setorId, vendedorNome, ativos, realHL, metaHL, retornoPct, unir,
  expurgado, monthStartStatus, monthStartHL, prevStatus, prevHL, vendaInformada, vendaCaixas, vendaObs,
  vendaAutor, vendaData, saidaConfirmada`.

## 2. Problema crítico a resolver primeiro: salvamento na nuvem

- O JSON inteiro vai numa célula só e é **cortado em 45.000 caracteres** (limite da célula é 50.000).
  Em 18/11/2026 só cabiam ~62 de ~643 clientes (587 válidos + 56 expurgos) e o JSON ficava **inválido**.
- Correção: **uma linha por cliente** numa aba própria (ex.: `Clientes`), configurações numa aba `Config`
  (chave/valor) e um registro de alterações (`Log`: quem, quando, o quê). Usar `LockService` e gravação em lote.
- Lançamentos feitos pelos usuários (venda informada, caixas, observação, saída confirmada) **nunca podem se perder**
  quando a base for reimportada: mesclar por `idCliente` + `mes`.
- Migrar sem perder nada do que já existe; manter a planilha **a mesma** (só adicionar abas).
- Testar: salvar → recarregar → conferir que todos os clientes voltaram.

## 3. Acesso (sem login de plataforma)

- Entrada simples, sem conta Google nem cadastro: a pessoa escolhe o perfil e digita o código.
  - **Vendedor:** número do setor.
  - **Supervisor:** número da mesa.
  - **Administrador:** senha de admin (guardada **somente na planilha** — nunca escrever em arquivos deste repositório, que é público).
- Senhas: padrão automático **ou** individual, configurável pelo admin:
  - Padrão sugerido pelo usuário: código + sequência (ex.: setor `123` → `12301`; o próximo → `12302` …). Confirmar a regra exata com o usuário.
  - O admin pode trocar a senha de qualquer pessoa individualmente.
  - Já existem modos no app atual (`SAME_AS_SETOR`, `SAME_AS_MESA`, palavra-chave) — preservar e ampliar.
- Senhas não devem ficar legíveis para quem só abre o site (não mandar a lista de senhas para o navegador; validar no Apps Script).
- Lembrar o perfil no aparelho para não precisar digitar toda vez.

## 4. Funcionalidades obrigatórias

- **Expurgos:** botão para incluir/excluir expurgos dos cálculos e uma visão só com os clientes expurgados.
- **Vendedor:** sua carteira, status do giro, meta × real (HL), informar venda/caixas/observação, confirmar saída.
- **Supervisor:** gráficos e indicadores da mesa (giro, % retorno, meta × real, ranking de vendedores, evolução vs. início do mês e mês anterior).
- **Administrador:** visão geral de todas as mesas, gráficos, importação/atualização da base, senhas, configurações, data da última atualização.
- Cálculo de HL/caixas usando `boxFactorHL` e o modo `calcMetricMode` da configuração.

## 5. Visual e experiência

- Bem mais bonito, interativo e com toques 3D/profundidade (camadas, parallax leve, cartões com profundidade, gráficos animados) — sem "cara de IA".
- **Celular em primeiro lugar:** a maioria usa no telefone. Testar em 390px e 1440px; toques grandes, nada de zoom em campos, carregamento rápido em 4G.
- Animações com propósito e respeitando `prefers-reduced-motion`; nada que deixe o celular lento.
- **Fácil de mexer:** poucos arquivos, configurações num lugar só, comentários em português.
- Usar as skills: `design-taste-frontend`, `impeccable`, `emil-design-eng`, `animate`, `mobile-native`, `gestures`,
  `choreograph`, `design-critique`, `accessibility-review`.

## 6. Publicação

- Meta: **manter o mesmo link do Google Sites**. Caminho provável: atualizar o código do Apps Script e publicar em
  *Implantar → Gerenciar implantações → editar → Nova versão* (o link `/exec` não muda) e manter o mesmo incorporado no Sites.
- Antes de publicar: testar numa implantação de teste e só depois atualizar a oficial.

## 7. Ordem de trabalho

1. Receber e salvar o código atual + link; entender tudo antes de mudar.
2. Corrigir o salvamento (seção 2) e provar que não perde dados.
3. Acesso e senhas (seção 3).
4. Novo visual e gráficos (seções 4 e 5), com prints de celular e computador para aprovação.
5. Publicar mantendo o link (seção 6).

## 8. Observações do ambiente na nuvem do Claude Code

- `sites.google.com` foi bloqueado pela rede do ambiente; para testar o Web App pode ser preciso liberar
  `script.google.com` / `script.googleusercontent.com` nas configurações de rede do ambiente.
- O usuário ainda vai acrescentar pedidos — anotar aqui neste arquivo o que for combinado.
