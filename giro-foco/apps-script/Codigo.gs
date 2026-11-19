/**
 * GIRO FOCO — Nuvem na planilha "Giro foco - Planilha/nuvem" (versão 2)
 * ---------------------------------------------------------------------------
 * Cole este arquivo inteiro em Extensões → Apps Script da planilha (substituindo o código antigo).
 *
 * O que muda em relação à versão antiga:
 *  - Cada cliente vira UMA LINHA na aba "Clientes" (antes era tudo numa célula, cortada em 45.000 caracteres).
 *  - Cada ação grava só o que mudou (ex.: a venda de um cliente). Duas pessoas usando ao mesmo tempo
 *    não apagam mais o trabalho uma da outra.
 *  - Senhas são conferidas aqui no servidor. O navegador nunca recebe senhas nem dados de outras mesas.
 *  - Toda alteração fica registrada na aba "Log".
 *
 * Abas criadas automaticamente: Clientes, Config, Senhas, Historico, Alertas, Log.
 * A aba antiga "Nuvem_Giro" e o estado antigo (Propriedades do script) NÃO são apagados: ficam como backup.
 *
 * Primeiro uso: no editor do Apps Script, escolha a função "migrarDadosAntigos" e clique em Executar.
 */

// ============================== CONFIGURAÇÕES ==============================

var VERSAO_API = '2.0.0';
var CHAVE_ESTADO_ANTIGO = 'GIRO_CDA_CLOUD_STATE';
var DIAS_VALIDADE_ACESSO = 30;          // por quantos dias o aparelho fica conectado
var MAX_TENTATIVAS_ERRADAS = 8;         // tentativas de senha errada antes de bloquear por 10 minutos
var MAX_ALERTAS = 80;
var MAX_DIAS_HISTORICO = 35;
var FUSO = 'America/Belem';           // fuso de Benevides (PA)

var ABA = {
  clientes: 'Clientes',
  config: 'Config',
  senhas: 'Senhas',
  historico: 'Historico',
  alertas: 'Alertas',
  log: 'Log'
};

// Campos de cada cliente e o tipo de cada um.
// "texto" fica gravado como texto puro na planilha (preserva zeros à esquerda, ex.: "0026").
var CAMPOS_CLIENTE = [
  ['idCliente', 'texto'], ['cliente', 'texto'], ['cnpj', 'texto'],
  ['setorId', 'texto'], ['vendedorNome', 'texto'], ['supId', 'texto'], ['supNome', 'texto'],
  ['statusGiro', 'texto'], ['expurgado', 'texto'], ['categoria', 'texto'], ['matriz', 'texto'],
  ['grupo', 'texto'], ['idGrupo', 'texto'],
  ['ativos', 'numero'], ['realHL', 'numero'], ['metaHL', 'numero'], ['retornoPct', 'numero'],
  ['monthStartStatus', 'texto'], ['monthStartHL', 'numero'], ['prevStatus', 'texto'], ['prevHL', 'numero'],
  ['vendaInformada', 'booleano'], ['vendaCaixas', 'numero'], ['vendaPrevisao', 'texto'], ['vendaObs', 'texto'],
  ['vendaAutor', 'texto'], ['vendaData', 'texto'], ['saidaConfirmada', 'booleano'],
  ['mes', 'texto'], ['regional', 'texto'], ['idCentro', 'texto'], ['idOrg', 'texto'], ['operacao', 'texto'],
  ['unir', 'texto'],
  ['atualizadoEm', 'texto'], ['atualizadoPor', 'texto']
];

// Campos que vêm da planilha da empresa (importação). Os demais são lançamentos feitos no site.
var CAMPOS_BASE = ['mes', 'regional', 'idCentro', 'idOrg', 'operacao', 'statusGiro', 'matriz', 'idCliente',
  'cliente', 'cnpj', 'idGrupo', 'grupo', 'categoria', 'supId', 'supNome', 'setorId', 'vendedorNome',
  'ativos', 'realHL', 'metaHL', 'retornoPct', 'unir', 'expurgado'];

var CAMPOS_HISTORICO = [
  ['dateLabel', 'texto'], ['totalClients', 'numero'], ['totalAtivos', 'numero'], ['zeroAtivos', 'numero'],
  ['baixoAtivos', 'numero'], ['eficAtivos', 'numero'], ['zeroPct', 'numero'], ['baixoPct', 'numero'],
  ['eficPct', 'numero']
];

var CAMPOS_ALERTA = [
  ['id', 'texto'], ['type', 'texto'], ['title', 'texto'], ['desc', 'texto'], ['time', 'texto'],
  ['clientId', 'texto'], ['setorId', 'texto'], ['supId', 'texto'], ['criadoEm', 'texto']
];

var CAMPOS_SENHA = [['tipo', 'texto'], ['codigo', 'texto'], ['senha', 'texto'], ['obs', 'texto']];
var CAMPOS_LOG = [['quando', 'texto'], ['quem', 'texto'], ['acao', 'texto'], ['idCliente', 'texto'], ['detalhes', 'texto']];

// Valores iniciais da aba Config (só usados se a chave ainda não existir).
var CONFIG_PADRAO = {
  adminPass: '',                       // definida na migração (vem do sistema antigo)
  sellerPassMode: 'SAME_AS_SETOR',     // SAME_AS_SETOR | CODE_PLUS_SUFFIX | CUSTOM_KEYWORD
  sellerSuffix: '01',
  sellerKeyword: '',
  supPassMode: 'SAME_AS_MESA',         // SAME_AS_MESA | CODE_PLUS_SUFFIX | CUSTOM_KEYWORD
  supSuffix: '01',
  supKeyword: '',
  calcMetricMode: 'ATIVOS',
  boxFactorHL: 0.0396,
  lastUpdateLabel: '',
  lastUpdateDateISO: '',
  dataVersion: '1',
  senhaVersao: '1'
};
var CONFIG_PUBLICA = ['calcMetricMode', 'boxFactorHL', 'lastUpdateLabel', 'lastUpdateDateISO', 'dataVersion'];

// ============================== ENTRADA (WEB APP) ==============================

function doGet(e) {
  var acao = e && e.parameter && e.parameter.acao;
  if (acao === 'ping') return responder({ ok: true, versao: VERSAO_API });
  // Compatibilidade: o site antigo fazia GET sem parâmetros esperando a base inteira.
  // Não devolvemos mais nada sem acesso (antes vazava senha e dados de todos).
  return responder({ ok: false, erro: 'Use o site atualizado do Giro Foco.' });
}

function doPost(e) {
  var corpo;
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return responder({ ok: false, erro: 'Pedido inválido.' });
  }
  // Site antigo (sem "acao") tentando sobrescrever a base inteira: recusado e registrado.
  if (!corpo.acao) {
    if (corpo.clients) registrarLog('site antigo', 'ENVIO_ANTIGO_RECUSADO', '', (corpo.clients.length || 0) + ' clientes');
    return responder({ ok: false, erro: 'Versão antiga do site. Recarregue a página.' });
  }
  try {
    return responder(executarAcao(corpo));
  } catch (err) {
    var msg = err && err.usuario ? err.message : 'Erro no servidor: ' + (err && err.message ? err.message : err);
    return responder({ ok: false, erro: msg });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function erroUsuario(msg) {
  var e = new Error(msg);
  e.usuario = true;
  return e;
}

var ACOES = {
  entrar: { publica: true, fn: acaoEntrar },
  dados: { fn: acaoDados },
  informarVenda: { escreve: true, fn: acaoInformarVenda },
  limparAmarelo: { escreve: true, fn: acaoLimparAmarelo },
  confirmarAmarelos: { admin: true, escreve: true, fn: acaoConfirmarAmarelos },
  importarBase: { admin: true, escreve: true, fn: acaoImportarBase },
  salvarCliente: { admin: true, escreve: true, fn: acaoSalvarCliente },
  excluirCliente: { admin: true, escreve: true, fn: acaoExcluirCliente },
  salvarConfig: { admin: true, escreve: true, fn: acaoSalvarConfig },
  listarAcessos: { admin: true, fn: acaoListarAcessos },
  definirSenha: { admin: true, escreve: true, fn: acaoDefinirSenha },
  novoCiclo: { admin: true, escreve: true, fn: acaoNovoCiclo }
};

function executarAcao(corpo) {
  var def = ACOES[corpo.acao];
  if (!def) throw erroUsuario('Ação desconhecida: ' + corpo.acao);
  var sessao = null;
  if (!def.publica) {
    sessao = validarToken(corpo.token);
    if (def.admin && sessao.perfil !== 'ADMIN') throw erroUsuario('Apenas o administrador pode fazer isso.');
  }
  if (!def.escreve) return def.fn(corpo, sessao);

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(25000)) throw erroUsuario('Servidor ocupado, tente de novo em alguns segundos.');
  try {
    var resultado = def.fn(corpo, sessao);
    gravarConfig({ dataVersion: String(Date.now()) });
    resultado.dataVersion = lerConfig().dataVersion;
    return resultado;
  } finally {
    trava.releaseLock();
  }
}

// ============================== ACESSO E SENHAS ==============================

function acaoEntrar(corpo) {
  var perfil = String(corpo.perfil || '').toUpperCase();
  var codigo = String(corpo.codigo || '').trim();
  var senha = String(corpo.senha || '').trim();
  if (['VENDEDOR', 'SUPERVISOR', 'ADMIN'].indexOf(perfil) < 0) throw erroUsuario('Perfil inválido.');
  if (perfil !== 'ADMIN' && !codigo) throw erroUsuario('Informe o número do ' + (perfil === 'VENDEDOR' ? 'setor.' : 'da mesa.'));
  if (!senha) throw erroUsuario('Informe a senha.');

  var chaveTentativas = 'tentativas_' + perfil + '_' + (codigo || 'admin');
  var cache = CacheService.getScriptCache();
  var tentativas = Number(cache.get(chaveTentativas) || 0);
  if (tentativas >= MAX_TENTATIVAS_ERRADAS) throw erroUsuario('Muitas tentativas erradas. Aguarde 10 minutos.');

  var config = lerConfig();
  var nome = '';
  if (perfil === 'ADMIN') {
    if (!config.adminPass || senha !== String(config.adminPass)) return falhaEntrada(cache, chaveTentativas, tentativas);
    codigo = 'ADMIN';
    nome = 'Administrador';
  } else {
    var campo = perfil === 'VENDEDOR' ? 'setorId' : 'supId';
    var achado = lerClientes().filter(function (c) { return c[campo] === codigo; })[0];
    if (!achado) return falhaEntrada(cache, chaveTentativas, tentativas);
    if (senha !== senhaEsperada(perfil, codigo, config)) return falhaEntrada(cache, chaveTentativas, tentativas);
    nome = perfil === 'VENDEDOR' ? achado.vendedorNome : achado.supNome;
  }
  cache.remove(chaveTentativas);
  registrarLog(rotulo(perfil, codigo), 'ENTRAR', '', '');
  return { ok: true, token: criarToken(perfil, codigo, config), perfil: perfil, codigo: codigo, nome: nome };
}

function falhaEntrada(cache, chave, tentativas) {
  cache.put(chave, String(tentativas + 1), 600);
  throw erroUsuario('Número ou senha incorretos.');
}

/** Senha que vale para um setor/mesa: senha individual (aba Senhas) ou a regra escolhida pelo admin. */
function senhaEsperada(perfil, codigo, config) {
  var individual = lerTabela(ABA.senhas, CAMPOS_SENHA).filter(function (s) {
    return s.tipo.toUpperCase() === perfil && s.codigo === codigo && s.senha !== '';
  })[0];
  if (individual) return individual.senha;
  var modo = perfil === 'VENDEDOR' ? config.sellerPassMode : config.supPassMode;
  if (modo === 'CUSTOM_KEYWORD') return String(perfil === 'VENDEDOR' ? config.sellerKeyword : config.supKeyword);
  if (modo === 'CODE_PLUS_SUFFIX') return codigo + String(perfil === 'VENDEDOR' ? config.sellerSuffix : config.supSuffix);
  return codigo; // SAME_AS_SETOR / SAME_AS_MESA
}

function segredoToken() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function assinar(texto) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, segredoToken()));
}

function criarToken(perfil, codigo, config) {
  var dados = { p: perfil, c: codigo, v: String(config.senhaVersao), exp: Date.now() + DIAS_VALIDADE_ACESSO * 86400000 };
  var corpo = Utilities.base64EncodeWebSafe(JSON.stringify(dados));
  return corpo + '.' + assinar(corpo);
}

function validarToken(token) {
  var partes = String(token || '').split('.');
  if (partes.length !== 2 || assinar(partes[0]) !== partes[1]) throw erroSessao();
  var dados;
  try {
    dados = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
  } catch (e) {
    throw erroSessao();
  }
  if (!dados || dados.exp < Date.now()) throw erroSessao();
  if (String(dados.v) !== String(lerConfig().senhaVersao)) throw erroSessao();
  return { perfil: dados.p, codigo: dados.c };
}

function erroSessao() {
  var e = erroUsuario('Seu acesso expirou. Entre novamente.');
  e.sessao = true;
  return e;
}

function rotulo(perfil, codigo) {
  if (perfil === 'ADMIN') return 'Administrador';
  return (perfil === 'VENDEDOR' ? 'Setor ' : 'Mesa ') + codigo;
}

function podeVerCliente(sessao, c) {
  if (sessao.perfil === 'ADMIN') return true;
  if (sessao.perfil === 'VENDEDOR') return c.setorId === sessao.codigo;
  return c.supId === sessao.codigo;
}

// ============================== LEITURA ==============================

function acaoDados(corpo, sessao) {
  var config = lerConfig();
  if (corpo.desde && String(corpo.desde) === String(config.dataVersion)) {
    return { ok: true, semMudancas: true, dataVersion: config.dataVersion };
  }
  var clientes = lerClientes().filter(function (c) { return podeVerCliente(sessao, c); });
  var alertas = lerTabela(ABA.alertas, CAMPOS_ALERTA).filter(function (a) {
    if (sessao.perfil === 'ADMIN' || (!a.setorId && !a.supId)) return true;
    return sessao.perfil === 'VENDEDOR' ? a.setorId === sessao.codigo : a.supId === sessao.codigo;
  });
  var publica = {};
  CONFIG_PUBLICA.forEach(function (k) { publica[k] = config[k]; });
  publica.boxFactorHL = Number(publica.boxFactorHL) || 0.0396;
  return {
    ok: true,
    perfil: sessao.perfil,
    codigo: sessao.codigo,
    config: publica,
    clientes: clientes,
    historico: lerTabela(ABA.historico, CAMPOS_HISTORICO),
    alertas: alertas,
    dataVersion: config.dataVersion
  };
}

// ============================== LANÇAMENTOS (vendedor/supervisor/admin) ==============================

function acaoInformarVenda(corpo, sessao) {
  var caixas = Math.max(1, parseInt(corpo.caixas, 10) || 1);
  var previsao = String(corpo.previsao || '').slice(0, 60);
  var obs = String(corpo.obs || '').trim().slice(0, 500);
  var autor = rotulo(sessao.perfil, sessao.codigo);
  var agora = new Date().toISOString();
  var c = atualizarCliente(corpo.idCliente, sessao, function (c) {
    c.vendaInformada = true;
    c.vendaCaixas = caixas;
    c.vendaPrevisao = previsao;
    c.vendaObs = obs || ('Venda informada de ' + caixas + ' caixas aguardando faturamento.');
    c.vendaAutor = autor;
    c.vendaData = agora;
  });
  adicionarAlerta({
    type: 'AMARELO',
    title: '🟡 Venda Informada (+' + caixas + ' cx) — ' + c.cliente,
    desc: autor + ' marcou venda no cliente ' + c.idCliente + ' (' + c.statusGiro + '). Previsão: ' + previsao + '.',
    clientId: c.idCliente, setorId: c.setorId, supId: c.supId
  });
  registrarLog(autor, 'INFORMAR_VENDA', c.idCliente, caixas + ' cx; previsão ' + previsao + '; ' + obs);
  return { ok: true, cliente: c };
}

function acaoLimparAmarelo(corpo, sessao) {
  var c = atualizarCliente(corpo.idCliente, sessao, function (c) {
    c.vendaInformada = false;
    c.vendaCaixas = 0;
    c.vendaObs = '';
    c.vendaPrevisao = '';
  });
  registrarLog(rotulo(sessao.perfil, sessao.codigo), 'LIMPAR_AMARELO', c.idCliente, '');
  return { ok: true, cliente: c };
}

/** Altera um único cliente e grava só a linha dele. */
function atualizarCliente(idCliente, sessao, alterar) {
  var id = String(idCliente || '').trim();
  var aba = obterAba(ABA.clientes, CAMPOS_CLIENTE);
  var ids = colunaComoTexto(aba, 1);
  var idx = ids.indexOf(id);
  if (idx < 0) throw erroUsuario('Cliente ' + id + ' não encontrado. Atualize a página.');
  var linha = idx + 2;
  var c = linhaParaObjeto(aba.getRange(linha, 1, 1, CAMPOS_CLIENTE.length).getValues()[0], CAMPOS_CLIENTE);
  if (!podeVerCliente(sessao, c)) throw erroUsuario('Este cliente não pertence à sua carteira.');
  alterar(c);
  c.atualizadoEm = new Date().toISOString();
  c.atualizadoPor = rotulo(sessao.perfil, sessao.codigo);
  aba.getRange(linha, 1, 1, CAMPOS_CLIENTE.length).setValues([objetoParaLinha(c, CAMPOS_CLIENTE)]);
  return c;
}

// ============================== ADMINISTRADOR ==============================

function acaoConfirmarAmarelos(corpo, sessao) {
  var config = lerConfig();
  var fator = Number(config.boxFactorHL) || 0.0396;
  var clientes = lerClientes();
  var n = 0;
  clientes.forEach(function (c) {
    if (!c.vendaInformada) return;
    c.prevStatus = c.statusGiro;
    c.prevHL = c.realHL;
    c.realHL = arredondar(c.realHL + (c.vendaCaixas || 0) * fator, 2);
    c.retornoPct = c.metaHL > 0 ? Math.round((c.realHL / c.metaHL) * 100) : 100;
    if (c.realHL >= c.metaHL) {
      c.statusGiro = 'GIRO EFICIENTE';
      c.saidaConfirmada = true;
    } else if (c.realHL > 0) {
      c.statusGiro = 'BAIXO DESEMPENHO';
    }
    c.vendaInformada = false;
    c.atualizadoEm = new Date().toISOString();
    c.atualizadoPor = 'Administrador';
    n++;
  });
  if (n > 0) {
    gravarClientes(clientes);
    adicionarAlerta({ type: 'SAIDA_CONFIRMADA', title: '✅ ' + n + ' Saída(s) Confirmada(s)!',
      desc: n + ' cliente(s) que estavam com sinal amarelo tiveram o volume confirmado.' });
  }
  registrarLog('Administrador', 'CONFIRMAR_AMARELOS', '', n + ' clientes');
  return { ok: true, confirmados: n };
}

/**
 * Importa a base colada da planilha da empresa.
 * Os lançamentos do site (vendas, caixas, observações, saídas) são preservados por idCliente.
 * substituirTudo = true: clientes que não vieram na nova base são removidos (ficam registrados no Log).
 */
function acaoImportarBase(corpo) {
  var linhas = corpo.linhas;
  if (!Array.isArray(linhas) || linhas.length === 0) throw erroUsuario('Nenhuma linha para importar.');
  var atuais = lerClientes();
  var mapa = {};
  atuais.forEach(function (c) { mapa[c.idCliente] = c; });
  var vistos = {};
  var saidasEficiente = 0;
  var sairamDoZero = 0;
  var novos = [];

  linhas.forEach(function (bruta) {
    var r = normalizarCliente(bruta, true);
    if (!r.idCliente || vistos[r.idCliente]) return;
    vistos[r.idCliente] = true;
    var antigo = mapa[r.idCliente];
    var c;
    if (antigo) {
      var virouEficiente = antigo.statusGiro !== 'GIRO EFICIENTE' && r.statusGiro === 'GIRO EFICIENTE';
      var saiuDoZero = antigo.statusGiro === 'GIRO ZERO' && r.statusGiro !== 'GIRO ZERO';
      if (virouEficiente) saidasEficiente++;
      if (saiuDoZero) sairamDoZero++;
      c = copiar(antigo);
      CAMPOS_BASE.forEach(function (k) { if (bruta[k] !== undefined) c[k] = r[k]; });
      c.monthStartStatus = antigo.monthStartStatus || antigo.statusGiro;
      c.monthStartHL = antigo.monthStartStatus ? antigo.monthStartHL : antigo.realHL;
      c.prevStatus = antigo.statusGiro;
      c.prevHL = antigo.realHL;
      c.saidaConfirmada = virouEficiente || saiuDoZero || antigo.saidaConfirmada;
      c.vendaInformada = (virouEficiente || saiuDoZero) ? false : antigo.vendaInformada;
    } else {
      c = r;
      c.monthStartStatus = r.statusGiro;
      c.monthStartHL = r.realHL;
      c.prevStatus = r.statusGiro;
      c.prevHL = r.realHL;
      c.vendaInformada = false;
      c.vendaCaixas = 0;
      c.saidaConfirmada = false;
    }
    c.atualizadoEm = new Date().toISOString();
    c.atualizadoPor = 'Importação';
    novos.push(c);
  });

  var removidos = [];
  if (!corpo.substituirTudo) {
    atuais.forEach(function (c) { if (!vistos[c.idCliente]) novos.push(c); });
  } else {
    atuais.forEach(function (c) { if (!vistos[c.idCliente]) removidos.push(c.idCliente); });
  }
  gravarClientes(novos);

  var validos = novos.filter(function (c) { return !ehExpurgado(c); }).length;
  var agora = new Date();
  var dataBR = Utilities.formatDate(agora, FUSO, 'dd/MM/yyyy');
  var horaBR = Utilities.formatDate(agora, FUSO, 'HH:mm');
  var carimbo = String(corpo.carimbo || '').trim();
  gravarConfig({
    lastUpdateDateISO: dataBR,
    lastUpdateLabel: carimbo || ('Hoje (' + dataBR + ') às ' + horaBR + ' (' + validos + ' válidos • ' + (novos.length - validos) + ' expurgos)')
  });
  registrarHistorico(novos, carimbo ? carimbo.slice(0, 5) : Utilities.formatDate(agora, FUSO, 'dd/MM'));
  if (saidasEficiente > 0 || sairamDoZero > 0) {
    adicionarAlerta({ type: 'SAIDA_CONFIRMADA',
      title: '🎉 Evolução do Dia: ' + sairamDoZero + ' saíram do Zero | ' + saidasEficiente + ' p/ Eficiente!',
      desc: 'Atualização de ' + dataBR + ' às ' + horaBR + ' registrada na série do mês.' });
  }
  registrarLog('Administrador', 'IMPORTAR_BASE', '', novos.length + ' clientes; ' + removidos.length +
    ' removidos' + (removidos.length ? ' (' + removidos.slice(0, 50).join(', ') + ')' : ''));
  return { ok: true, total: novos.length, validos: validos, removidos: removidos.length,
    saidasEficiente: saidasEficiente, sairamDoZero: sairamDoZero };
}

function acaoSalvarCliente(corpo) {
  var r = normalizarCliente(corpo.cliente || {}, false);
  if (!r.idCliente || !r.cliente || !r.setorId) throw erroUsuario('Informe pelo menos ID do cliente, nome e setor.');
  var clientes = lerClientes();
  var idx = -1;
  clientes.forEach(function (c, i) { if (c.idCliente === r.idCliente) idx = i; });
  if (idx >= 0) {
    var c = clientes[idx];
    CAMPOS_BASE.forEach(function (k) { if (corpo.cliente[k] !== undefined) c[k] = r[k]; });
    c.atualizadoEm = new Date().toISOString();
    c.atualizadoPor = 'Administrador';
  } else {
    r.monthStartStatus = r.statusGiro;
    r.monthStartHL = r.realHL;
    r.prevStatus = r.statusGiro;
    r.prevHL = r.realHL;
    r.saidaConfirmada = r.statusGiro === 'GIRO EFICIENTE';
    r.atualizadoEm = new Date().toISOString();
    r.atualizadoPor = 'Administrador';
    clientes.unshift(r);
  }
  gravarClientes(clientes);
  registrarLog('Administrador', idx >= 0 ? 'EDITAR_CLIENTE' : 'NOVO_CLIENTE', r.idCliente, r.cliente);
  return { ok: true };
}

function acaoExcluirCliente(corpo) {
  var id = String(corpo.idCliente || '').trim();
  var clientes = lerClientes();
  var removido = clientes.filter(function (c) { return c.idCliente === id; })[0];
  if (!removido) throw erroUsuario('Cliente não encontrado.');
  gravarClientes(clientes.filter(function (c) { return c.idCliente !== id; }));
  registrarLog('Administrador', 'EXCLUIR_CLIENTE', id, JSON.stringify(removido));
  return { ok: true };
}

function acaoSalvarConfig(corpo) {
  var novo = corpo.config || {};
  var atual = lerConfig();
  var mudancas = {};
  var modosVend = ['SAME_AS_SETOR', 'CODE_PLUS_SUFFIX', 'CUSTOM_KEYWORD'];
  var modosSup = ['SAME_AS_MESA', 'CODE_PLUS_SUFFIX', 'CUSTOM_KEYWORD'];
  if (novo.sellerPassMode !== undefined) {
    if (modosVend.indexOf(novo.sellerPassMode) < 0) throw erroUsuario('Regra de senha do vendedor inválida.');
    mudancas.sellerPassMode = novo.sellerPassMode;
  }
  if (novo.supPassMode !== undefined) {
    if (modosSup.indexOf(novo.supPassMode) < 0) throw erroUsuario('Regra de senha do supervisor inválida.');
    mudancas.supPassMode = novo.supPassMode;
  }
  ['sellerSuffix', 'sellerKeyword', 'supSuffix', 'supKeyword', 'calcMetricMode', 'lastUpdateLabel'].forEach(function (k) {
    if (novo[k] !== undefined) mudancas[k] = String(novo[k]).trim();
  });
  if (novo.boxFactorHL !== undefined) {
    var f = Number(novo.boxFactorHL);
    if (!(f > 0)) throw erroUsuario('Fator de caixa inválido.');
    mudancas.boxFactorHL = f;
  }
  if (novo.adminPass !== undefined) {
    var p = String(novo.adminPass).trim();
    if (p.length < 4) throw erroUsuario('A senha de administrador precisa ter pelo menos 4 caracteres.');
    mudancas.adminPass = p;
  }
  var final = copiar(atual);
  Object.keys(mudancas).forEach(function (k) { final[k] = mudancas[k]; });
  if (final.sellerPassMode === 'CUSTOM_KEYWORD' && !final.sellerKeyword) throw erroUsuario('Informe a palavra-chave dos vendedores.');
  if (final.supPassMode === 'CUSTOM_KEYWORD' && !final.supKeyword) throw erroUsuario('Informe a palavra-chave dos supervisores.');
  if (final.sellerPassMode === 'CODE_PLUS_SUFFIX' && !final.sellerSuffix) throw erroUsuario('Informe o final da senha dos vendedores (ex.: 01).');
  if (final.supPassMode === 'CODE_PLUS_SUFFIX' && !final.supSuffix) throw erroUsuario('Informe o final da senha dos supervisores (ex.: 01).');

  var mexeuEmSenha = ['adminPass', 'sellerPassMode', 'sellerSuffix', 'sellerKeyword', 'supPassMode', 'supSuffix', 'supKeyword']
    .some(function (k) { return mudancas[k] !== undefined && String(mudancas[k]) !== String(atual[k]); });
  if (mexeuEmSenha && corpo.desconectarTodos) mudancas.senhaVersao = String(Number(atual.senhaVersao || 1) + 1);
  gravarConfig(mudancas);
  registrarLog('Administrador', 'SALVAR_CONFIG', '', Object.keys(mudancas).filter(function (k) { return k !== 'adminPass'; }).join(', ') +
    (mudancas.adminPass ? ' (senha de admin alterada)' : ''));
  return { ok: true };
}

/** Lista setores e mesas com a senha que vale hoje para cada um (só para o administrador). */
function acaoListarAcessos() {
  var config = lerConfig();
  var individuais = lerTabela(ABA.senhas, CAMPOS_SENHA);
  var vistos = {};
  var lista = [];
  lerClientes().forEach(function (c) {
    [['VENDEDOR', c.setorId, c.vendedorNome, c.supId], ['SUPERVISOR', c.supId, c.supNome, '']].forEach(function (a) {
      var chave = a[0] + '|' + a[1];
      if (!a[1] || vistos[chave]) return;
      vistos[chave] = true;
      var ind = individuais.filter(function (s) { return s.tipo.toUpperCase() === a[0] && s.codigo === a[1] && s.senha !== ''; })[0];
      lista.push({ tipo: a[0], codigo: a[1], nome: a[2], mesa: a[3], senha: senhaEsperada(a[0], a[1], config), individual: Boolean(ind) });
    });
  });
  var publica = {};
  ['sellerPassMode', 'sellerSuffix', 'sellerKeyword', 'supPassMode', 'supSuffix', 'supKeyword', 'calcMetricMode', 'boxFactorHL'].forEach(function (k) {
    publica[k] = config[k];
  });
  return { ok: true, acessos: lista, config: publica };
}

/** Define (ou remove, com senha vazia) a senha individual de um setor ou mesa. */
function acaoDefinirSenha(corpo) {
  var tipo = String(corpo.tipo || '').toUpperCase();
  var codigo = String(corpo.codigo || '').trim();
  var senha = String(corpo.senha || '').trim();
  if (['VENDEDOR', 'SUPERVISOR'].indexOf(tipo) < 0 || !codigo) throw erroUsuario('Informe o tipo e o código.');
  var senhas = lerTabela(ABA.senhas, CAMPOS_SENHA).filter(function (s) {
    return !(s.tipo.toUpperCase() === tipo && s.codigo === codigo);
  });
  if (senha) senhas.push({ tipo: tipo, codigo: codigo, senha: senha, obs: 'Definida em ' + new Date().toISOString() });
  gravarTabela(ABA.senhas, CAMPOS_SENHA, senhas);
  registrarLog('Administrador', senha ? 'DEFINIR_SENHA' : 'REMOVER_SENHA_INDIVIDUAL', '', rotulo(tipo, codigo));
  return { ok: true };
}

function acaoNovoCiclo() {
  var clientes = lerClientes();
  clientes.forEach(function (c) {
    c.monthStartStatus = c.statusGiro;
    c.monthStartHL = c.realHL;
    c.prevStatus = c.statusGiro;
    c.prevHL = c.realHL;
    c.saidaConfirmada = false;
  });
  gravarClientes(clientes);
  gravarTabela(ABA.historico, CAMPOS_HISTORICO, []);
  gravarTabela(ABA.alertas, CAMPOS_ALERTA, []);
  registrarHistorico(clientes, Utilities.formatDate(new Date(), FUSO, 'dd/MM'));
  registrarLog('Administrador', 'NOVO_CICLO', '', clientes.length + ' clientes');
  return { ok: true };
}

// ============================== HISTÓRICO E ALERTAS ==============================

function registrarHistorico(clientes, rotuloData) {
  var validos = clientes.filter(function (c) { return !ehExpurgado(c); });
  if (validos.length === 0) return;
  var soma = function (lista) { return lista.reduce(function (a, c) { return a + (parseInt(c.ativos, 10) || 1); }, 0); };
  var porStatus = function (s) { return soma(validos.filter(function (c) { return c.statusGiro === s; })); };
  var tot = soma(validos);
  var z = porStatus('GIRO ZERO');
  var b = porStatus('BAIXO DESEMPENHO');
  var e = porStatus('GIRO EFICIENTE');
  var pct = function (x) { return tot > 0 ? arredondar((x / tot) * 100, 2) : 0; };
  var ponto = { dateLabel: rotuloData, totalClients: validos.length, totalAtivos: tot, zeroAtivos: z, baixoAtivos: b,
    eficAtivos: e, zeroPct: pct(z), baixoPct: pct(b), eficPct: pct(e) };
  var hist = lerTabela(ABA.historico, CAMPOS_HISTORICO).filter(function (h) { return h.dateLabel !== rotuloData; });
  hist.push(ponto);
  gravarTabela(ABA.historico, CAMPOS_HISTORICO, hist.slice(-MAX_DIAS_HISTORICO));
}

function adicionarAlerta(a) {
  var agora = new Date();
  a.id = 'al_' + agora.getTime() + '_' + Math.floor(Math.random() * 1000);
  a.time = Utilities.formatDate(agora, FUSO, 'dd/MM HH:mm');
  a.criadoEm = agora.toISOString();
  var lista = lerTabela(ABA.alertas, CAMPOS_ALERTA);
  lista.unshift(a);
  gravarTabela(ABA.alertas, CAMPOS_ALERTA, lista.slice(0, MAX_ALERTAS));
}

function registrarLog(quem, acao, idCliente, detalhes) {
  var aba = obterAba(ABA.log, CAMPOS_LOG);
  // Formato texto puro: sem isso a planilha converte a data e os códigos sozinha.
  aba.getRange(aba.getLastRow() + 1, 1, 1, CAMPOS_LOG.length).setNumberFormat('@')
    .setValues([objetoParaLinha({ quando: new Date().toISOString(), quem: quem, acao: acao,
      idCliente: idCliente || '', detalhes: String(detalhes || '').slice(0, 5000) }, CAMPOS_LOG)]);
}

// ============================== MIGRAÇÃO DO SISTEMA ANTIGO ==============================

/**
 * Copia o estado antigo (Propriedades do script) para as abas novas.
 * Executar UMA vez pelo editor. Se a aba Clientes já tiver dados, use migrarDadosAntigosForcando().
 * O estado antigo não é apagado.
 */
function migrarDadosAntigos(forcar) {
  var trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    var bruto = PropertiesService.getScriptProperties().getProperty(CHAVE_ESTADO_ANTIGO);
    if (!bruto) throw new Error('Não encontrei o estado antigo (' + CHAVE_ESTADO_ANTIGO + ').');
    var antigo = JSON.parse(bruto);
    if (!Array.isArray(antigo.clients)) throw new Error('Estado antigo sem a lista de clientes.');
    if (lerClientes().length > 0 && forcar !== true) {
      throw new Error('A aba Clientes já tem dados. Para sobrescrever, execute migrarDadosAntigosForcando.');
    }
    var clientes = antigo.clients.map(function (c) { return normalizarCliente(c, false); });
    gravarClientes(clientes);
    var cfg = {};
    ['adminPass', 'sellerPassMode', 'sellerKeyword', 'supPassMode', 'supKeyword', 'calcMetricMode', 'boxFactorHL',
      'lastUpdateLabel', 'lastUpdateDateISO'].forEach(function (k) {
      if (antigo[k] !== undefined && antigo[k] !== null) cfg[k] = antigo[k];
    });
    gravarConfig(cfg);
    gravarTabela(ABA.historico, CAMPOS_HISTORICO, (antigo.dailySnapshots || []).slice(-MAX_DIAS_HISTORICO));
    gravarTabela(ABA.alertas, CAMPOS_ALERTA, (antigo.alerts || []).slice(0, MAX_ALERTAS));
    obterAba(ABA.senhas, CAMPOS_SENHA);
    gravarConfig({ dataVersion: String(Date.now()) });
    registrarLog('Migração', 'MIGRAR_DADOS_ANTIGOS', '', clientes.length + ' clientes');
    var msg = 'Migração concluída: ' + clientes.length + ' clientes copiados para a aba "' + ABA.clientes + '".';
    Logger.log(msg);
    return msg;
  } finally {
    trava.releaseLock();
  }
}

function migrarDadosAntigosForcando() {
  return migrarDadosAntigos(true);
}

/** Confere se a aba Clientes tem exatamente os mesmos clientes do estado antigo. */
function conferirMigracao() {
  var antigo = JSON.parse(PropertiesService.getScriptProperties().getProperty(CHAVE_ESTADO_ANTIGO) || '{}');
  var novos = lerClientes();
  var mapa = {};
  novos.forEach(function (c) { mapa[c.idCliente] = c; });
  var problemas = [];
  (antigo.clients || []).forEach(function (a) {
    var n = mapa[String(a.idCliente).trim()];
    if (!n) { problemas.push('Faltando: ' + a.idCliente); return; }
    CAMPOS_CLIENTE.forEach(function (campo) {
      var k = campo[0];
      if (a[k] === undefined) return;
      var esperado = converter(a[k], campo[1]);
      if (String(esperado) !== String(n[k])) problemas.push(a.idCliente + '.' + k + ': "' + esperado + '" ≠ "' + n[k] + '"');
    });
  });
  var msg = 'Antigo: ' + (antigo.clients || []).length + ' | Novo: ' + novos.length + ' | Diferenças: ' + problemas.length;
  Logger.log(msg + (problemas.length ? '\n' + problemas.slice(0, 30).join('\n') : ''));
  return msg;
}

// ============================== PLANILHA (leitura/gravação em lote) ==============================

function obterAba(nome, campos) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, campos.length).setValues([campos.map(function (c) { return c[0]; })]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

function lerTabela(nome, campos) {
  var aba = obterAba(nome, campos);
  var n = aba.getLastRow() - 1;
  if (n <= 0) return [];
  return aba.getRange(2, 1, n, campos.length).getValues()
    .filter(function (l) { return String(l[0]) !== ''; })
    .map(function (l) { return linhaParaObjeto(l, campos); });
}

function gravarTabela(nome, campos, objetos) {
  var aba = obterAba(nome, campos);
  var antigas = aba.getLastRow() - 1;
  var n = objetos.length;
  if (n > 0) {
    // Colunas de texto ficam com formato "texto puro" para não perder zeros à esquerda.
    campos.forEach(function (c, i) {
      if (c[1] === 'texto') aba.getRange(2, i + 1, n, 1).setNumberFormat('@');
    });
    aba.getRange(2, 1, n, campos.length).setValues(objetos.map(function (o) { return objetoParaLinha(o, campos); }));
  }
  if (antigas > n) aba.getRange(n + 2, 1, antigas - n, campos.length).clearContent();
}

function lerClientes() { return lerTabela(ABA.clientes, CAMPOS_CLIENTE); }
function gravarClientes(lista) { gravarTabela(ABA.clientes, CAMPOS_CLIENTE, lista); }

function colunaComoTexto(aba, coluna) {
  var n = aba.getLastRow() - 1;
  if (n <= 0) return [];
  return aba.getRange(2, coluna, n, 1).getValues().map(function (l) { return String(l[0]).trim(); });
}

function lerConfig() {
  var aba = obterAba(ABA.config, [['chave', 'texto'], ['valor', 'texto']]);
  var config = copiar(CONFIG_PADRAO);
  var n = aba.getLastRow() - 1;
  if (n > 0) {
    aba.getRange(2, 1, n, 2).getValues().forEach(function (l) {
      if (String(l[0]) !== '') config[String(l[0])] = l[1] === null || l[1] === undefined ? '' : String(l[1]);
    });
  }
  return config;
}

function gravarConfig(mudancas) {
  var aba = obterAba(ABA.config, [['chave', 'texto'], ['valor', 'texto']]);
  var n = aba.getLastRow() - 1;
  var chaves = n > 0 ? aba.getRange(2, 1, n, 1).getValues().map(function (l) { return String(l[0]); }) : [];
  Object.keys(mudancas).forEach(function (k) {
    var idx = chaves.indexOf(k);
    var linha = idx >= 0 ? idx + 2 : aba.getLastRow() + 1;
    if (idx < 0) chaves.push(k);
    aba.getRange(linha, 1, 1, 2).setNumberFormat('@').setValues([[k, String(mudancas[k])]]);
  });
}

// ============================== CONVERSÕES ==============================

function converter(v, tipo) {
  if (tipo === 'numero') {
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/\./g, function (m, i, s) {
      return /,\d+$/.test(s) ? '' : m; // "1.234,5" → "1234,5"
    }).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  if (tipo === 'booleano') return v === true || ['TRUE', 'SIM', '1', 'VERDADEIRO'].indexOf(String(v).trim().toUpperCase()) >= 0;
  return v === null || v === undefined ? '' : String(v).trim();
}

function linhaParaObjeto(linha, campos) {
  var o = {};
  campos.forEach(function (c, i) { o[c[0]] = converter(linha[i], c[1]); });
  return o;
}

function objetoParaLinha(o, campos) {
  return campos.map(function (c) { return converter(o[c[0]], c[1]); });
}

function normalizarCliente(c, soBase) {
  var o = {};
  CAMPOS_CLIENTE.forEach(function (campo) { o[campo[0]] = converter(c[campo[0]], campo[1]); });
  o.statusGiro = o.statusGiro.toUpperCase();
  var exp = o.expurgado.toUpperCase();
  o.expurgado = ['SIM', 'S', 'EXPURGADO', 'TRUE', '1'].indexOf(exp) >= 0 ? 'SIM' : 'NAO';
  if (!o.supNome && o.supId) o.supNome = 'Mesa ' + o.supId;
  if (!o.vendedorNome && o.setorId) o.vendedorNome = 'Setor ' + o.setorId;
  if (o.metaHL > 0 && c.retornoPct === undefined) o.retornoPct = Math.round((o.realHL / o.metaHL) * 100);
  return o;
}

function ehExpurgado(c) { return String(c.expurgado).toUpperCase() === 'SIM'; }
function arredondar(x, casas) { var f = Math.pow(10, casas); return Math.round(x * f) / f; }
function copiar(o) { return JSON.parse(JSON.stringify(o)); }
