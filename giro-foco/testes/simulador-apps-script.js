// Simulador mínimo do Google Apps Script para testar giro-foco/apps-script/Codigo.gs no Node.
// Imita o comportamento da planilha que importa para nós: células sem formato "@" convertem
// texto numérico em número (ex.: "0026" vira 26) e "TRUE"/"FALSE" em booleano.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function autoConverter(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^(TRUE|FALSE)$/i.test(t)) return t.toUpperCase() === 'TRUE';
  return v;
}

class Aba {
  // Igual ao Google: aba nova nasce com 1000 linhas x 26 colunas, e gravar fora disso dá erro.
  constructor(nome) { this.nome = nome; this.celulas = []; this.formatos = []; this.maxLinhas = 1000; this.maxColunas = 26; }
  getMaxRows() { return this.maxLinhas; }
  getMaxColumns() { return this.maxColunas; }
  insertRowsAfter(_depois, n) { this.maxLinhas += n; }
  insertColumnsAfter(_depois, n) { this.maxColunas += n; }
  getLastRow() {
    for (let r = this.celulas.length - 1; r >= 0; r--) {
      if ((this.celulas[r] || []).some(v => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  }
  getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
    if (linha + nLinhas - 1 > this.maxLinhas || coluna + nColunas - 1 > this.maxColunas) {
      throw new Error(`Exception: The coordinates of the range are outside the dimensions of the sheet. (${this.nome} ${this.maxLinhas}x${this.maxColunas})`);
    }
    return new Intervalo(this, linha, coluna, nLinhas, nColunas);
  }
  appendRow(valores) {
    if (this.getLastRow() + 1 > this.maxLinhas) this.maxLinhas++;
    this.maxColunas = Math.max(this.maxColunas, valores.length);
    this.getRange(this.getLastRow() + 1, 1, 1, valores.length).setValues([valores]);
  }
  setFrozenRows() {}
}

class Intervalo {
  constructor(aba, l, c, nl, nc) { Object.assign(this, { aba, l, c, nl, nc }); }
  _cada(fn) {
    for (let i = 0; i < this.nl; i++) for (let j = 0; j < this.nc; j++) fn(this.l - 1 + i, this.c - 1 + j, i, j);
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nl; i++) {
      const linha = [];
      for (let j = 0; j < this.nc; j++) {
        const v = ((this.aba.celulas[this.l - 1 + i] || [])[this.c - 1 + j]);
        linha.push(v === undefined || v === null ? '' : v);
      }
      out.push(linha);
    }
    return out;
  }
  setValues(valores) {
    if (valores.length !== this.nl || valores.some(l => l.length !== this.nc)) {
      throw new Error(`Tamanho incompatível: esperado ${this.nl}x${this.nc}`);
    }
    this._cada((r, c, i, j) => {
      this.aba.celulas[r] = this.aba.celulas[r] || [];
      const fmt = (this.aba.formatos[r] || [])[c];
      const v = valores[i][j];
      this.aba.celulas[r][c] = fmt === '@' ? (typeof v === 'string' ? v : v) : autoConverter(v);
    });
    return this;
  }
  setNumberFormat(fmt) {
    this._cada((r, c) => { this.aba.formatos[r] = this.aba.formatos[r] || []; this.aba.formatos[r][c] = fmt; });
    return this;
  }
  clearContent() { this._cada((r, c) => { if (this.aba.celulas[r]) this.aba.celulas[r][c] = ''; }); return this; }
  setFontWeight() { return this; }
}

function criarAmbiente({ propriedades = {} } = {}) {
  const abas = {};
  const props = Object.assign({}, propriedades);
  const cache = {};
  let agoraFalso = null;
  const RealDate = Date;

  const planilha = {
    getSheetByName: n => abas[n] || null,
    insertSheet: n => (abas[n] = new Aba(n)),
  };

  const globais = {
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
    }) },
    CacheService: { getScriptCache: () => ({
      get: k => (k in cache ? cache[k] : null),
      put: (k, v) => { cache[k] = String(v); },
      remove: k => { delete cache[k]; },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: texto => ({ texto, setMimeType() { return this; } }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (texto, chave) => Array.from(crypto.createHmac('sha256', chave).update(texto).digest()),
      base64EncodeWebSafe: x => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x)).toString('base64url'),
      base64DecodeWebSafe: s => Array.from(Buffer.from(s, 'base64url')),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
      formatDate: (d, _tz, fmt) => {
        const p = n => String(n).padStart(2, '0');
        return fmt.replace('dd', p(d.getUTCDate())).replace('MM', p(d.getUTCMonth() + 1)).replace('yyyy', d.getUTCFullYear())
          .replace('HH', p(d.getUTCHours())).replace('mm', p(d.getUTCMinutes()));
      },
    },
    Logger: { log: () => {} },
    console,
    JSON, Math, Number, String, Boolean, Array, Object, Error, isNaN, parseInt, parseFloat,
  };
  // Date controlável (para testar expiração do acesso)
  globais.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0 && agoraFalso !== null) super(agoraFalso); else super(...a); }
    static now() { return agoraFalso !== null ? agoraFalso : RealDate.now(); }
  };

  const contexto = vm.createContext(globais);
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
  vm.runInContext(codigo, contexto, { filename: 'Codigo.gs' });

  function post(corpo) {
    const r = contexto.doPost({ postData: { contents: JSON.stringify(corpo) } });
    return JSON.parse(r.texto);
  }
  function get(parametros = {}) { return JSON.parse(contexto.doGet({ parameter: parametros }).texto); }

  return {
    ctx: contexto, abas, props, cache, post, get,
    avancarRelogio: ms => { agoraFalso = (agoraFalso !== null ? agoraFalso : RealDate.now()) + ms; },
  };
}

module.exports = { criarAmbiente };
