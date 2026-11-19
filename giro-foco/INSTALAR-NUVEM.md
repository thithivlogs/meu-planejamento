# Instalar a nova nuvem do Giro Foco

## Planilha de teste já preparada: "Giro foco oficial nuvem"

ID `1Ct7gS41xwf8fKFGaOXciSRNCtGal3IrBXwYuGKHFfZQ`. As abas Leia-me, Clientes, Embalagens, Config, Senhas, Historico, Alertas e Log
já existem, com cabeçalhos, colunas de texto puro e o tamanho certo. A aba Clientes começa vazia: a base entra
quando o admin cola a planilha da empresa no site. **Não precisa rodar a migração nesta planilha.**

1. Abra a planilha **Giro foco oficial nuvem** → **Extensões → Apps Script**.
2. Apague o que estiver no arquivo `Código.gs`, cole todo o conteúdo de [`apps-script/Codigo.gs`](apps-script/Codigo.gs) e **Salvar**.
3. **Implantar → Nova implantação** → engrenagem → **App da Web**.
   Descrição `Giro Foco v2`; Executar como **Eu**; Quem pode acessar **Qualquer pessoa** → **Implantar**.
4. Na primeira vez o Google pede autorização: *Autorizar acesso* → sua conta → *Avançado* → *Acessar (não seguro)* → *Permitir*.
5. Copie a **URL do app da Web** (termina em `/exec`) e mande para o Claude, que liga o site nela e testa.

Para atualizar o código depois: cole o código novo, salve e use **Implantar → Gerenciar implantações → lápis →
Versão: Nova versão → Implantar**. Assim a URL `/exec` continua a mesma.

### Colocar o site no Google Sites (link novo, para teste)

1. Gere o arquivo do site ligado na nuvem (o Claude já gerou para a URL atual):
   `node giro-foco/site/gerar-versao-google-sites.js <URL /exec>` → `giro-foco/site/versao-google-sites.html`.
2. Abra o Google Sites e crie um **site novo** (ou uma página nova) para o teste.
3. **Inserir → Incorporar → aba "Incorporar código"**, cole **todo** o conteúdo de `versao-google-sites.html` → **Avançar → Inserir**.
4. Arraste as bordas do bloco para ocupar **a largura toda** e deixe-o **bem alto** (o site rola por dentro do bloco).
5. **Publicar** → escolha o endereço → confira em *Gerenciar acesso* que qualquer pessoa com o link pode ver.
6. Abra no celular, entre como **Admin** e cole a base do dia (Admin → Atualizar a base do dia → Publicar base).

### Atualizar o Apps Script sem mudar a URL

Cole o código novo em `Código.gs`, salve e vá em **Implantar → Gerenciar implantações → lápis (editar) →
Versão: Nova versão → Implantar**. A URL `/exec` continua a mesma e o site não precisa mudar.

---

## (Alternativa) Usar a planilha antiga, migrando os dados

O site atual continua funcionando normalmente durante todo o processo.
A implantação oficial do Apps Script fica "congelada" na versão antiga até o dia da troca.

### 1. Colar o código novo

1. Abra a planilha **Giro foco - Planilha/nuvem** → **Extensões → Apps Script**.
2. Antes de tudo, copie o código antigo para um bloco de notas (backup).
3. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
4. Clique em **Salvar** (ícone de disquete).

> ⚠️ **Não** mexa em *Implantar → Gerenciar implantações* da implantação que já existe.
> Ela continua rodando o código antigo e o site atual depende dela.

### 2. Copiar os dados para as abas novas

1. No topo do editor, na caixa de funções, escolha **`migrarDadosAntigos`** e clique em **Executar**.
2. Na primeira vez o Google pede autorização: *Revisar permissões* → escolha sua conta → *Avançado* →
   *Acessar (não seguro)* → *Permitir*. (É o seu próprio script; o aviso aparece para todo script pessoal.)
3. Espere aparecer "Execução concluída". Na planilha vão surgir as abas
   **Clientes, Config, Senhas, Historico, Alertas e Log**.
4. Escolha a função **`conferirMigracao`** e clique em **Executar**. Em *Registro de execução* deve aparecer
   algo como `Antigo: 643 | Novo: 643 | Diferenças: 0`.

A aba antiga `Nuvem_Giro` e o estado antigo não são apagados — continuam como backup.

### 3. Criar uma implantação de TESTE

1. **Implantar → Nova implantação** → engrenagem → **App da Web**.
2. Descrição: `Giro Foco v2 (teste)`. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
3. **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
4. Mande essa URL para o Claude. Ela é usada só pelo site novo durante os testes.

### No dia da troca (depois de aprovar o site novo)

1. Execute **`migrarDadosAntigosForcando`** (traz o que o site antigo gravou até aquele momento) e depois **`conferirMigracao`**.
2. Troque o código do bloco *Incorporar* do Google Sites pelo site novo e publique o Sites. O link continua o mesmo.
3. Opcional: em *Gerenciar implantações*, atualize também a implantação antiga para a versão nova.
   Assim, quem estiver com o site velho aberto não consegue mais sobrescrever nada (o envio é recusado e fica no Log).
4. **Troque a senha de administrador** (ela ficou exposta no código do site antigo).

## Onde ficam as coisas na planilha

| Aba | O que guarda |
|---|---|
| `Clientes` | Uma linha por cliente, com status, HL e os lançamentos (venda informada, embalagem, quantidade, HL, observação, saída). |
| `Embalagens` | Embalagens que o vendedor escolhe (nome, ml, unidades, ativa). HL do pacote = ml × unidades ÷ 100.000. |
| `Config` | Regras de senha, senha de admin, fator da caixa, data da última atualização. |
| `Senhas` | Senhas individuais (quando o admin troca a senha de um setor ou mesa). Vazia = vale a regra. |
| `Historico` | Um ponto por dia do mês (gráfico de evolução). |
| `Alertas` | Últimos 80 avisos (vendas informadas, saídas confirmadas). |
| `Log` | Tudo o que foi feito: quem, quando, o quê. |

Regras de senha (escolhidas pelo administrador no site, separadas para vendedor e supervisor):

- **Igual ao número** — setor 15623 → senha `15623` (como era antes).
- **Número + final** — setor 15623 com final `01` → senha `1562301`.
- **Palavra-chave** — uma senha única para todos.
- **Senha individual** — vale mais que a regra, para quem precisar.
