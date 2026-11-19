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

## 1.1 Diagnóstico do código atual (19/11/2026)

Arquivos: `docs/giro-foco/codigo-atual/Codigo-apps-script.gs` (Apps Script) e `app-original.js` (JS do site, sem dados/senha).

- O site é um HTML único (~5 MB, Tailwind CDN + Chart.js + Lucide) gerado no Google AI Studio/Gemini, colado
  num bloco "Incorporar" do Google Sites. Abas: `carteira`, `amarelos` (previsão de saída), `periodo` (evolução/projeção),
  `graficos` (gráficos e mesas) e área admin (colar planilha, senhas, nuvem).
- **Publicação atual:** o admin usa "exportar HTML pré-compilado" (`buildPrecompiledHTMLString`), que embute
  `EMBEDDED_DEFAULT_STATE` com **senha de admin + todos os clientes (nomes, CNPJ)** e cola no Sites → qualquer pessoa
  com o link vê a senha e os dados no código-fonte. A página publicada também traz os cartões já renderizados.
- **Nuvem real:** o estado inteiro fica em `PropertiesService` (chave `GIRO_CDA_CLOUD_STATE`), ~458 KB — perto do
  limite total de 500 KB do armazenamento de propriedades. A aba `Nuvem_Giro` é só um backup cortado em 45.000 caracteres.
- `doGet` devolve tudo (inclusive senha) para quem tiver a URL `/exec`; `doPost` aceita sobrescrever tudo sem autenticação.
- **Perda de lançamentos:** cada ação (ex.: `confirmInformSale`) envia o estado **inteiro** do aparelho (`saveState` →
  `pushStateToGoogleCloud`). O app só lê a nuvem ao abrir ou no botão manual. Dois usuários com a página aberta
  sobrescrevem o trabalho um do outro (o último a salvar vence).
- O envio usa `mode: "no-cors"`: o site mostra "Nuvem Sincronizada ✓" mesmo se o Apps Script falhar.
- Senhas são verificadas no navegador (`confirmRoleEntry`): vendedor = setor, supervisor = mesa (modos `SAME_AS_*`
  ou palavra-chave). Todos os dados de todas as mesas são baixados para qualquer aparelho.
- Dados de 18/11/2026: 643 clientes (587 válidos, 56 expurgos `expurgado: "SIM"/"NAO"`), 7 mesas, 29 setores,
  `statusGiro`: GIRO EFICIENTE / BAIXO DESEMPENHO / GIRO ZERO. Mesa de teste: 31470 (setores 15619, 15623, 15627, 16906).
- Celular: o cabeçalho verde ocupa a primeira tela inteira; as abas ficam cortadas na horizontal; textos pequenos.
- Para testar localmente sem escrever na nuvem: servir o HTML, trocar CDNs por cópias do npm e **abortar todo
  request que não seja GET** (o ambiente bloqueia `*-atari-embeds.googleusercontent.com`, cujo número muda a cada carga).

## 2. Problema crítico a resolver primeiro: salvamento na nuvem

- O JSON inteiro vai numa célula só e é **cortado em 45.000 caracteres** (limite da célula é 50.000).
  Em 18/11/2026 só cabiam ~62 de ~643 clientes (587 válidos + 56 expurgos) e o JSON ficava **inválido**.
- Correção: **uma linha por cliente** numa aba própria (ex.: `Clientes`), configurações numa aba `Config`
  (chave/valor) e um registro de alterações (`Log`: quem, quando, o quê). Usar `LockService` e gravação em lote.
- Lançamentos feitos pelos usuários (venda informada, caixas, observação, saída confirmada) **nunca podem se perder**
  quando a base for reimportada: mesclar por `idCliente` (o app antigo também usa só o `idCliente`; o mês vem na base).
- Migrar sem perder nada do que já existe; manter a planilha **a mesma** (só adicionar abas).
- Testar: salvar → recarregar → conferir que todos os clientes voltaram.
- Cada ação grava **só o que mudou** (ex.: venda de um cliente), nunca o estado inteiro; o servidor mescla.
- Confirmar o resultado do salvamento (sem `no-cors`) e avisar de verdade quando falhar; atualizar a tela periodicamente.
- Tirar senha e dados do HTML publicado; o site busca os dados no Apps Script depois do acesso, e só os da mesa/setor.

### 2.1 Status (19/11/2026)

- **Feito:** nova nuvem em `giro-foco/apps-script/Codigo.gs` (abas Clientes/Config/Senhas/Historico/Alertas/Log,
  gravação por cliente com `LockService`, acesso por token assinado, recorte por setor/mesa, registro no Log).
- Testes: `node --test giro-foco/testes/*.test.js` (simulador do Apps Script em `giro-foco/testes/`).
  Com a cópia real do estado antigo (só local, nunca versionar): 643 clientes migrados, 0 diferenças.
- Instalação passo a passo para o usuário: `giro-foco/INSTALAR-NUVEM.md` (implantação de TESTE separada;
  a implantação oficial continua na versão antiga até a troca; no dia da troca rodar `migrarDadosAntigosForcando`).
- API (POST, corpo JSON em `text/plain`, sem `no-cors`): `entrar`, `dados` (com `desde` para atualização leve),
  `informarVenda`, `limparAmarelo`, e para admin `confirmarAmarelos`, `importarBase`, `salvarCliente`,
  `excluirCliente`, `salvarConfig`, `listarAcessos`, `definirSenha`, `novoCiclo`.
- **Site novo (prévia para aprovação):** `giro-foco/site/index.html` — arquivo único, sem CDN. Sem `URL_NUVEM`
  abre em modo demonstração (dados fictícios no localStorage; vendedor 70101/70101, supervisor 90100/90100, admin `demo`).
  Fila de envios pendentes (nada se perde sem internet), cópia local da carteira, atualização a cada 90 s.
  Teste de ponta a ponta com a nuvem real no simulador: `node giro-foco/testes/site-com-nuvem.e2e.js`.
- **Combinado com o usuário (19/11):** testar primeiro com **planilha nova e link novo**; depois de aprovado o
  visual, criar a planilha de teste, ligar o Apps Script e só então pensar na troca do site oficial.

- **Planilha nova de teste (19/11):** "Giro foco oficial nuvem", ID `1Ct7gS41xwf8fKFGaOXciSRNCtGal3IrBXwYuGKHFfZQ`,
  fuso America/Belem, abas criadas e formatadas pelo Claude (Clientes vazia). Próximo: o usuário cola o Apps Script,
  cria a implantação e envia a URL `/exec`; então ligar `URL_NUVEM` no site e testar ao vivo.
- **Nuvem ao vivo (19/11):** implantação da planilha nova:
  `https://script.google.com/macros/s/AKfycbxsTjYIY5IT88e4_vtzk34zlDgmLtVFIKd6-raA7qjQlXbXfeTUwluHxfPFQI8Gn-K26Q/exec`
  (versão implantada 2.1.0; o código no repositório é 2.1.1, só muda o horário do Log para Belém).
  Testado ao vivo com 3 clientes fictícios (setor 99901 / mesa 99900): entrar, importar, informar venda com embalagem,
  supervisor, atualização leve; depois os dados de teste foram apagados. Cada chamada leva 2–7 s (normal do Apps Script).
  Node no ambiente precisa de `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` para chamar a URL.
- **Tela cheia (20/11):** o bloco "Incorporar" do Google Sites encolhe no celular (mantém a proporção), então o site
  passou a ser servido pelo próprio Apps Script: `doGet` sem `acao` devolve o arquivo HTML **`Site`** do projeto
  (HtmlService, viewport, ALLOWALL) e injeta a URL `/exec`. No Google Sites fica só um **Botão** nativo para o `/exec`.
  Desde a 2.3.0, sem o arquivo `Site` o Apps Script **baixa `giro-foco/site/index.html` do GitHub** (raw da branch
  `claude/giro-foto-site-improvements-dnxhu6`, constante `URL_CODIGO_DO_SITE`, cache em pedaços de 10 min): push na
  branch = site atualizado. Se a branch mudar/for apagada, atualizar a constante. `testarSite` autoriza o UrlFetch.
- **Publicado e funcionando (20/11):** implantação na versão **2.3.0**; o link `/exec` abre o site em tela cheia
  (confirmado pelo usuário no navegador). O Google Sites ficou **opcional**: o usuário usa o `/exec` direto
  (celular: "Adicionar à tela inicial"). Na troca do site oficial, pôr no Sites antigo um botão para o `/exec`.
  Próximo: admin cola a base real e a equipe testa vendedor/supervisor.
- **Site para o Google Sites:** `giro-foco/site/versao-google-sites.html`, gerado por `gerar-versao-google-sites.js <URL>`.
- **Embalagens (pedido do usuário, 19/11):** aba `Embalagens` (nome, ml, unidades, ativa; padrão 330ml c/12, 330ml c/24,
  600ml c/12, 600ml c/24). HL do pacote = ml × unidades ÷ 100.000. Venda guarda `vendaEmbalagem` + `vendaHL` (colunas
  novas no FIM de Clientes) e "confirmar amarelos" soma o `vendaHL` exato. No site: "Calcular em" (falta em pacotes da
  embalagem escolhida, lembrado no aparelho) e escolha da embalagem ao informar a venda; admin edita a lista.
- O Apps Script aumenta as abas quando precisa (`garantirTamanho`): aba nova do Google nasce com 1000×26.

### 2.2 Formato da base colada pelo admin (planilha da empresa, copiada do Excel)

23 colunas separadas por tabulação, com cabeçalho:
`Mês | Regional | ID Centro | ID Organização de vendas | Operação | Status Giro | Matriz Potencial | ID Cliente | Cliente |
CNPJ/CPF | ID Grupo de clientes | Grupo de clientes | Categoria de Cliente | Supervisor Vendas | Desc. Sup. Vendas |
Setor de Vendas | Desc. Setor de Vendas | Ativos em Campo | Real HL | Meta HL | Retorno % | UNIR | EXPURGADO`.
Valores: vírgula decimal (`0,31`), `Retorno %` como `15%`, `ID Centro` `0026` e CNPJ com zeros à esquerda (texto),
`EXPURGADO` `SIM`/`NAO`, `Supervisor Vendas` = mesa (ex.: 31473), `Setor de Vendas` = setor (ex.: 15666).
Coberto pelo teste de ponta a ponta (`site-com-nuvem.e2e.js`, passo 5). O cabeçalho é lido pelo nome, então a ordem pode mudar.

## 3. Acesso (sem login de plataforma)

- Entrada simples, sem conta Google nem cadastro: a pessoa escolhe o perfil e digita o código.
  - **Vendedor:** número do setor.
  - **Supervisor:** número da mesa.
  - **Administrador:** senha de admin (guardada **somente na planilha** — nunca escrever em arquivos deste repositório, que é público).
- Senhas: padrão automático **ou** individual, configurável pelo admin:
  - Confirmado pelo usuário: o admin escolhe entre **igual ao número** (15623) e **número + final** (1562301).
    Implementado como `SAME_AS_SETOR`/`SAME_AS_MESA`, `CODE_PLUS_SUFFIX` (final configurável, padrão `01`) e `CUSTOM_KEYWORD`.
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
