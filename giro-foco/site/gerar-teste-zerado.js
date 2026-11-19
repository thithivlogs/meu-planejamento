// Gera teste-zerado.html a partir de index.html: a mesma página, em modo demonstração SEM clientes,
// para testar a colagem da base da planilha da empresa. Rodar:  node giro-foco/site/gerar-teste-zerado.js
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const marca = "<script>\n'use strict';";
if (!html.includes(marca)) throw new Error('Não achei o início do script em index.html');
const saida = html.replace(marca, '<script>window.GIRO_DEMO_ZERADO = true;</script>\n' + marca)
  .replace('<title>Giro Foco · CDA Benevides</title>', '<title>Giro Foco · teste zerado</title>');
fs.writeFileSync(path.join(__dirname, 'teste-zerado.html'), saida);
console.log('teste-zerado.html gerado.');
