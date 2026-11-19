# Product

<!-- impeccable:product-schema 1 -->

Escopo: este arquivo descreve o **Giro Foco** (pasta `giro-foco/`). O app "Base Planejamento" da raiz é outro produto.

## Platform

web

## Stack

Um único arquivo HTML autocontido (CSS e JS embutidos, sem CDN), colado num bloco "Incorporar" do Google Sites.
Backend: Web App do Google Apps Script ligado à planilha do Google (`giro-foco/apps-script/Codigo.gs`).
Restrição do usuário: fácil de mexer, poucos arquivos, comentários em português.

## Users

- **Vendedor (setor):** na rua, no celular, entre um cliente e outro — muitas vezes no sol, com pressa e 4G instável.
  Precisa ver rápido quais clientes da carteira estão em giro zero / baixo desempenho e informar a venda feita.
- **Supervisor (mesa):** acompanha a evolução da mesa no mês, cobra a equipe (quem está com giro zero, ranking
  dos vendedores) e mostra os números em reunião/apresentação.
- **Administrador:** visão de todas as mesas, mesma rotina do supervisor em escala, mais atualização da base,
  senhas e configurações.

## Product Purpose

Acompanhamento diário do giro de refrigeração (equipamentos/geladeiras em clientes) da CDA Benevides.
Sucesso = menos clientes em GIRO ZERO e mais em GIRO EFICIENTE ao longo do mês, com cada venda informada
registrada sem se perder.

## Positioning

Ferramenta interna da operação, feita sob medida para a rotina do giro: carteira por setor, sinal amarelo de
venda informada aguardando faturamento, comparação com o início do mês e o mês anterior.

## Operating Context

- Base diária colada pelo admin a partir da planilha da empresa (status do giro, HL real × meta, ativos, expurgos).
- Status: GIRO ZERO, BAIXO DESEMPENHO, GIRO EFICIENTE. Clientes expurgados (`expurgado: SIM`) podem ser
  incluídos/excluídos dos cálculos e vistos à parte.
- Métrica em HL; conversão de caixas por `boxFactorHL` (padrão LN 330 ml c/12 = 0,0396 HL).
- Entrada sem conta: vendedor digita setor + senha; supervisor, mesa + senha; admin, senha.
  Regra de senha escolhida pelo admin: igual ao número ou número + final (ex.: 1562301), ou senha individual.
- Escala atual: ~643 clientes, 7 mesas, 29 setores, uma operação (CDA BENEVIDES).

## Capabilities and Constraints

- Ver carteira (filtro por status, categoria, busca por nome/código/CNPJ), informar venda (caixas, previsão, obs),
  limpar sinal amarelo; admin confirma amarelos, importa base, edita clientes, senhas e configurações.
- Gráficos de distribuição por status, comparativo por mesa, ranking por setor, evolução diária do mês.
- Dados nunca embutidos no HTML; recorte por setor/mesa feito no servidor.
- Precisa funcionar bem em celular comum e internet fraca; respeitar `prefers-reduced-motion`.

## Brand Commitments

- **Identidade Heineken** (confirmado pelo usuário): manter o verde e a estrela vermelha do grupo Heineken,
  como no site atual. Cabeçalho atual: "THE HEINEKEN COMPANY • CDA BENEVIDES".
- Nome do produto: **Giro Foco** (o site atual também usa "Giro em Foco").

## Evidence on Hand

- Dados reais existem só na planilha/Apps Script; nunca versionar nem usar em demonstrações públicas.
  Demonstrações usam dados fictícios.
- Código e prints do site atual: `docs/giro-foco/codigo-atual/`.

## Product Principles

1. O vendedor na rua resolve o que precisa em segundos, com uma mão, no sol.
2. Nenhum lançamento se perde; o site diz a verdade sobre o que foi salvo.
3. Cada pessoa vê só o que é dela; senhas e dados nunca ficam no código público.
4. O supervisor enxerga a evolução e quem cobrar sem montar planilha.
5. Fácil de manter por quem não é programador.

## Accessibility & Inclusion

Uso ao ar livre em celular: alto contraste, textos e toques grandes, nada de zoom ao digitar.
