// Gera versao-google-sites.html: o site ligado na nuvem (URL do Apps Script, termina em /exec).
// Rodar:  node giro-foco/site/gerar-versao-google-sites.js https://script.google.com/macros/s/XXXX/exec
// Depois copie TODO o conteúdo do arquivo gerado e cole no Google Sites (Incorporar → Código).
'use strict';
const fs = require('fs');
const path = require('path');
const url = (process.argv[2] || '').trim();
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
  console.error('Informe a URL do Apps Script, que começa com https://script.google.com/macros/s/ e termina em /exec');
  process.exit(1);
}
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const marca = "const URL_NUVEM = window.GIRO_URL_NUVEM || '';";
if (!html.includes(marca)) throw new Error('Não achei a linha do URL_NUVEM em index.html');
fs.writeFileSync(path.join(__dirname, 'versao-google-sites.html'), html.replace(marca, `const URL_NUVEM = window.GIRO_URL_NUVEM || '${url}';`));
console.log('versao-google-sites.html gerado, ligado em ' + url);
