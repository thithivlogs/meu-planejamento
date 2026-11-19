// Testes da nova nuvem do Giro Foco. Rodar com:  node --test giro-foco/testes/
// Usa dados FICTÍCIOS. Para conferir com uma cópia real do estado antigo (nunca versionar!):
//   GIRO_ESTADO_REAL=/caminho/estado.json node --test giro-foco/testes/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { criarAmbiente } = require('./simulador-apps-script');

const { SENHA_ADMIN_TESTE, clientesFicticios, estadoAntigo } = require('./dados-ficticios');

function ambienteMigrado(clientes = clientesFicticios()) {
  const amb = criarAmbiente({ propriedades: { GIRO_CDA_CLOUD_STATE: JSON.stringify(estadoAntigo(clientes)) } });
  amb.ctx.migrarDadosAntigos();
  return amb;
}

function entrar(amb, perfil, codigo, senha) {
  const r = amb.post({ acao: 'entrar', perfil, codigo, senha });
  assert.equal(r.ok, true, `entrar ${perfil} ${codigo}: ${r.erro}`);
  return r.token;
}

test('migração copia todos os clientes, campo a campo, sem perder zeros à esquerda', () => {
  const originais = clientesFicticios();
  const amb = ambienteMigrado(originais);
  const migrados = amb.ctx.lerClientes();
  assert.equal(migrados.length, originais.length);
  const c = migrados.find(x => x.idCliente === originais[0].idCliente);
  assert.equal(c.idCentro, '0026');
  assert.equal(c.cnpj, originais[0].cnpj);
  assert.equal(c.idCliente, originais[0].idCliente);
  assert.match(amb.ctx.conferirMigracao(), /Diferenças: 0$/);
  // Estado antigo continua intacto como backup
  assert.ok(amb.props.GIRO_CDA_CLOUD_STATE.length > 100);
});

test('migração não sobrescreve sem pedir', () => {
  const amb = ambienteMigrado();
  assert.throws(() => amb.ctx.migrarDadosAntigos(), /já tem dados/);
});

test('dois vendedores informando venda ao mesmo tempo: nenhum apaga o outro', () => {
  const amb = ambienteMigrado();
  const tA = entrar(amb, 'VENDEDOR', '15619', '15619');
  const tB = entrar(amb, 'VENDEDOR', '15623', '15623');
  const carteiraA = amb.post({ acao: 'dados', token: tA }).clientes;
  const carteiraB = amb.post({ acao: 'dados', token: tB }).clientes;
  // Ambos com a página aberta (dados "velhos") lançam vendas em sequência
  const rB = amb.post({ acao: 'informarVenda', token: tB, idCliente: carteiraB[0].idCliente, caixas: 3, previsao: 'Amanhã' });
  const rA = amb.post({ acao: 'informarVenda', token: tA, idCliente: carteiraA[0].idCliente, caixas: 5, previsao: 'Hoje' });
  assert.equal(rA.ok, true); assert.equal(rB.ok, true);
  const todos = amb.ctx.lerClientes();
  const a = todos.find(c => c.idCliente === carteiraA[0].idCliente);
  const b = todos.find(c => c.idCliente === carteiraB[0].idCliente);
  assert.equal(a.vendaInformada, true); assert.equal(a.vendaCaixas, 5); assert.equal(a.vendaAutor, 'Setor 15619');
  assert.equal(b.vendaInformada, true); assert.equal(b.vendaCaixas, 3); assert.equal(b.vendaAutor, 'Setor 15623');
  assert.equal(todos.length, clientesFicticios().length);
  // Fica registrado no Log
  const log = amb.ctx.lerTabela('Log', amb.ctx.CAMPOS_LOG).filter(l => l.acao === 'INFORMAR_VENDA');
  assert.equal(log.length, 2);
});

test('vendedor não consegue lançar venda em cliente de outro setor', () => {
  const amb = ambienteMigrado();
  const tA = entrar(amb, 'VENDEDOR', '15619', '15619');
  const outro = amb.ctx.lerClientes().find(c => c.setorId === '15623');
  const r = amb.post({ acao: 'informarVenda', token: tA, idCliente: outro.idCliente, caixas: 1 });
  assert.equal(r.ok, false);
  assert.match(r.erro, /não pertence/);
});

test('cada perfil recebe só a sua carteira e nunca a senha de admin', () => {
  const amb = ambienteMigrado();
  const vend = amb.post({ acao: 'dados', token: entrar(amb, 'VENDEDOR', '15623', '15623') });
  assert.ok(vend.clientes.length > 0);
  assert.ok(vend.clientes.every(c => c.setorId === '15623'));
  const sup = amb.post({ acao: 'dados', token: entrar(amb, 'SUPERVISOR', '31470', '31470') });
  assert.ok(sup.clientes.every(c => c.supId === '31470'));
  assert.equal(sup.clientes.length, 10);
  const adm = amb.post({ acao: 'dados', token: entrar(amb, 'ADMIN', '', SENHA_ADMIN_TESTE) });
  assert.equal(adm.clientes.length, clientesFicticios().length);
  for (const resp of [vend, sup, adm]) {
    assert.ok(!JSON.stringify(resp).includes(SENHA_ADMIN_TESTE), 'senha vazou na resposta');
    assert.equal(resp.config.adminPass, undefined);
  }
  // GET sem acesso não devolve dados (antes devolvia tudo)
  const g = amb.get();
  assert.equal(g.ok, false);
  assert.ok(!JSON.stringify(g).includes('Cliente Teste'));
});

test('regras de senha: igual ao número, número + 01, palavra-chave e senha individual', () => {
  const amb = ambienteMigrado();
  const admin = entrar(amb, 'ADMIN', '', SENHA_ADMIN_TESTE);
  // Padrão migrado: senha = número
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15623', senha: '15623' }).ok, true);
  // Muda para número + 01
  assert.equal(amb.post({ acao: 'salvarConfig', token: admin, config: { sellerPassMode: 'CODE_PLUS_SUFFIX', sellerSuffix: '01' } }).ok, true);
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15623', senha: '15623' }).ok, false);
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15623', senha: '1562301' }).ok, true);
  // Supervisor continua com a regra dele
  assert.equal(amb.post({ acao: 'entrar', perfil: 'SUPERVISOR', codigo: '31470', senha: '31470' }).ok, true);
  // Senha individual vale mais que a regra
  assert.equal(amb.post({ acao: 'definirSenha', token: admin, tipo: 'VENDEDOR', codigo: '15619', senha: 'abc789' }).ok, true);
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15619', senha: '1561901' }).ok, false);
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15619', senha: 'abc789' }).ok, true);
  // Remover a individual volta para a regra
  amb.post({ acao: 'definirSenha', token: admin, tipo: 'VENDEDOR', codigo: '15619', senha: '' });
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15619', senha: '1561901' }).ok, true);
  // Lista de acessos para o admin mostra a senha que vale
  const lista = amb.post({ acao: 'listarAcessos', token: admin }).acessos;
  assert.equal(lista.find(a => a.tipo === 'VENDEDOR' && a.codigo === '15623').senha, '1562301');
  assert.equal(lista.find(a => a.tipo === 'SUPERVISOR' && a.codigo === '31470').senha, '31470');
  // Setor inexistente não entra
  assert.equal(amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '99999', senha: '9999901' }).ok, false);
});

test('bloqueia depois de muitas senhas erradas', () => {
  const amb = ambienteMigrado();
  for (let i = 0; i < 8; i++) amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15623', senha: 'errada' });
  const r = amb.post({ acao: 'entrar', perfil: 'VENDEDOR', codigo: '15623', senha: '15623' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Muitas tentativas/);
});

test('acesso adulterado, expirado ou de outro perfil é recusado', () => {
  const amb = ambienteMigrado();
  const t = entrar(amb, 'VENDEDOR', '15623', '15623');
  const [corpo, assinatura] = t.split('.');
  const falso = Buffer.from(JSON.stringify({ p: 'ADMIN', c: 'ADMIN', v: '1', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(amb.post({ acao: 'dados', token: `${falso}.${assinatura}` }).ok, false);
  assert.equal(amb.post({ acao: 'importarBase', token: t, linhas: [{ idCliente: '1' }] }).ok, false);
  assert.equal(amb.post({ acao: 'dados', token: t }).ok, true);
  amb.avancarRelogio(31 * 86400000);
  assert.match(amb.post({ acao: 'dados', token: t }).erro, /expirou/);
  assert.ok(corpo.length > 10);
});

test('importar base preserva lançamentos, mês inicial e conta as saídas', () => {
  const amb = ambienteMigrado();
  const admin = entrar(amb, 'ADMIN', '', SENHA_ADMIN_TESTE);
  const vend = entrar(amb, 'VENDEDOR', '15623', '15623');
  const antes = amb.ctx.lerClientes();
  const comVenda = antes.find(c => c.setorId === '15623' && c.statusGiro === 'BAIXO DESEMPENHO');
  const zero = antes.find(c => c.statusGiro === 'GIRO ZERO' && c.idCliente !== comVenda.idCliente);
  amb.post({ acao: 'informarVenda', token: vend, idCliente: comVenda.idCliente, caixas: 4, previsao: 'Sexta', obs: 'Pedido fechado' });

  // Nova base do dia: mesmo conjunto, "zero" passou a eficiente, valores de HL mudaram
  const base = antes.map(c => {
    const r = {};
    amb.ctx.CAMPOS_BASE.forEach(k => { r[k] = c[k]; });
    if (r.idCliente === zero.idCliente) { r.statusGiro = 'GIRO EFICIENTE'; r.realHL = 2.5; }
    if (r.idCliente === comVenda.idCliente) r.realHL = 1.9;
    return r;
  });
  const res = amb.post({ acao: 'importarBase', token: admin, linhas: base, substituirTudo: true });
  assert.equal(res.ok, true, res.erro);
  assert.equal(res.total, antes.length);
  assert.equal(res.sairamDoZero, 1);
  const depois = amb.ctx.lerClientes();
  const v = depois.find(c => c.idCliente === comVenda.idCliente);
  assert.equal(v.vendaInformada, true);
  assert.equal(v.vendaCaixas, 4);
  assert.equal(v.vendaObs, 'Pedido fechado');
  assert.equal(v.realHL, 1.9);
  assert.equal(v.prevHL, comVenda.realHL);
  const z = depois.find(c => c.idCliente === zero.idCliente);
  assert.equal(z.saidaConfirmada, true);
  assert.equal(z.monthStartStatus, zero.monthStartStatus);
  assert.equal(z.prevStatus, 'GIRO ZERO');
  assert.ok(amb.ctx.lerTabela('Historico', amb.ctx.CAMPOS_HISTORICO).length >= 2);
  assert.ok(amb.ctx.lerConfig().lastUpdateLabel.includes('válidos'));
});

test('importar sem "substituir tudo" mantém clientes que não vieram', () => {
  const amb = ambienteMigrado();
  const admin = entrar(amb, 'ADMIN', '', SENHA_ADMIN_TESTE);
  const antes = amb.ctx.lerClientes();
  const parcial = [{ idCliente: antes[0].idCliente, statusGiro: 'GIRO EFICIENTE', realHL: 3, metaHL: 2 },
    { idCliente: '9999999', cliente: 'Novo', setorId: '15623', supId: '31470', statusGiro: 'GIRO ZERO', realHL: 0, metaHL: 2, ativos: 1 }];
  const r = amb.post({ acao: 'importarBase', token: admin, linhas: parcial, substituirTudo: false });
  assert.equal(r.ok, true, r.erro);
  const depois = amb.ctx.lerClientes();
  assert.equal(depois.length, antes.length + 1);
  assert.equal(depois.find(c => c.idCliente === antes[0].idCliente).cliente, antes[0].cliente);
});

test('atualização automática: "dados" com a mesma versão não reenvia a base', () => {
  const amb = ambienteMigrado();
  const t = entrar(amb, 'SUPERVISOR', '31470', '31470');
  const d1 = amb.post({ acao: 'dados', token: t });
  const d2 = amb.post({ acao: 'dados', token: t, desde: d1.dataVersion });
  assert.equal(d2.semMudancas, true);
  amb.post({ acao: 'informarVenda', token: t, idCliente: d1.clientes[0].idCliente, caixas: 2 });
  const d3 = amb.post({ acao: 'dados', token: t, desde: d1.dataVersion });
  assert.notEqual(d3.semMudancas, true);
  assert.equal(d3.clientes.find(c => c.idCliente === d1.clientes[0].idCliente).vendaCaixas, 2);
});

test('site antigo tentando sobrescrever tudo é recusado e registrado', () => {
  const amb = ambienteMigrado();
  const antes = amb.ctx.lerClientes().length;
  const r = amb.post({ clients: [], adminPass: 'x' });
  assert.equal(r.ok, false);
  assert.equal(amb.ctx.lerClientes().length, antes);
  assert.ok(amb.ctx.lerTabela('Log', amb.ctx.CAMPOS_LOG).some(l => l.acao === 'ENVIO_ANTIGO_RECUSADO'));
});

test('confirmar amarelos soma as caixas e atualiza o status', () => {
  const amb = ambienteMigrado();
  const admin = entrar(amb, 'ADMIN', '', SENHA_ADMIN_TESTE);
  const c = amb.ctx.lerClientes().find(x => x.statusGiro === 'BAIXO DESEMPENHO');
  amb.post({ acao: 'informarVenda', token: admin, idCliente: c.idCliente, caixas: 100 });
  const r = amb.post({ acao: 'confirmarAmarelos', token: admin });
  assert.equal(r.confirmados, 1);
  const d = amb.ctx.lerClientes().find(x => x.idCliente === c.idCliente);
  assert.equal(d.statusGiro, 'GIRO EFICIENTE');
  assert.equal(d.vendaInformada, false);
  assert.equal(d.realHL, Math.round((c.realHL + 100 * 0.0396) * 100) / 100);
});

test('com dados reais do estado antigo (opcional, só local)', { skip: !process.env.GIRO_ESTADO_REAL }, () => {
  const estado = JSON.parse(fs.readFileSync(process.env.GIRO_ESTADO_REAL, 'utf8'));
  const amb = criarAmbiente({ propriedades: { GIRO_CDA_CLOUD_STATE: JSON.stringify(estado) } });
  amb.ctx.migrarDadosAntigos();
  assert.match(amb.ctx.conferirMigracao(), /Diferenças: 0$/);
  const migrados = amb.ctx.lerClientes();
  assert.equal(migrados.length, estado.clients.length);
  const validos = migrados.filter(c => c.expurgado !== 'SIM').length;
  console.log(`  real: ${migrados.length} clientes (${validos} válidos, ${migrados.length - validos} expurgos)`);
  // Login com uma mesa e um setor reais, conferindo o recorte
  const mesa = estado.clients[0].supId;
  const setor = estado.clients[0].setorId;
  const sup = amb.post({ acao: 'dados', token: entrar(amb, 'SUPERVISOR', mesa, mesa) });
  assert.equal(sup.clientes.length, estado.clients.filter(c => c.supId === mesa).length);
  const vend = amb.post({ acao: 'dados', token: entrar(amb, 'VENDEDOR', setor, setor) });
  assert.equal(vend.clientes.length, estado.clients.filter(c => c.setorId === setor).length);
  const tamanho = JSON.stringify(amb.post({ acao: 'dados', token: entrar(amb, 'ADMIN', '', estado.adminPass) })).length;
  console.log(`  resposta completa do admin: ${(tamanho / 1024).toFixed(0)} KB; supervisor: ${(JSON.stringify(sup).length / 1024).toFixed(0)} KB`);
});
