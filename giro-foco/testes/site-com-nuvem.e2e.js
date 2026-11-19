// Teste de ponta a ponta: o SITE (giro-foco/site/index.html) ligado à NUVEM de verdade
// (giro-foco/apps-script/Codigo.gs rodando no simulador). Usa dados fictícios.
// Rodar:  node giro-foco/testes/site-com-nuvem.e2e.js      (precisa do pacote "playwright")
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { criarAmbiente } = require('./simulador-apps-script');
const { estadoAntigo, clientesFicticios, SENHA_ADMIN_TESTE } = require('./dados-ficticios');

const SITE = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const URL_NUVEM = 'https://nuvem.teste/macros/s/teste/exec';

const amb = criarAmbiente({ propriedades: { GIRO_CDA_CLOUD_STATE: JSON.stringify(estadoAntigo(clientesFicticios())) } });
amb.ctx.migrarDadosAntigos();

async function novoAparelho(navegador, nome, { semInternet } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(url => { window.GIRO_URL_NUVEM = url; }, URL_NUVEM);
  const rede = { fora: Boolean(semInternet) };
  const respostas = [];
  await ctx.route('**/*', async route => {
    const req = route.request();
    if (req.url().startsWith('http://giro.teste/')) return route.fulfill({ contentType: 'text/html', body: SITE });
    if (req.url().startsWith(URL_NUVEM)) {
      if (rede.fora) return route.abort('internetdisconnected');
      const r = amb.post(JSON.parse(req.postData() || '{}'));
      respostas.push(JSON.stringify(r));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(r), headers: { 'access-control-allow-origin': '*' } });
    }
    return route.abort();
  });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on('pageerror', e => erros.push(nome + ': ' + e.message));
  pagina.on('dialog', d => d.accept());
  await pagina.goto('http://giro.teste/');
  return { ctx, pagina, rede, erros, respostas };
}

async function entrar(p, perfil, codigo, senha) {
  await p.click(`[data-perfil="${perfil}"]`);
  if (perfil !== 'ADMIN') await p.fill('#entCodigo', codigo);
  await p.fill('#entSenha', senha);
  await p.click('#btnEntrar');
  await p.waitForSelector('.cli', { timeout: 10000 });
}

async function informarPrimeiraVenda(p, caixas) {
  const id = await p.getAttribute('[data-vender]', 'data-vender');
  await p.click(`[data-vender="${id}"]`);
  await p.fill('#vendaCaixas', String(caixas));
  await p.click('#vendaConfirmar');
  return id;
}

(async () => {
  const navegador = await chromium.launch();
  const passos = [];
  const ok = msg => { passos.push('✓ ' + msg); };
  try {
    // 1. Dois vendedores com o site aberto ao mesmo tempo
    const A = await novoAparelho(navegador, 'vendedor A');
    const B = await novoAparelho(navegador, 'vendedor B');
    await entrar(A.pagina, 'VENDEDOR', '15619', '15619');
    await entrar(B.pagina, 'VENDEDOR', '15623', '15623');
    const nA = await A.pagina.$$eval('.cli', l => l.length);
    assert.equal(nA, clientesFicticios().filter(c => c.setorId === '15619' && c.expurgado !== 'SIM').length);
    ok(`vendedor A vê só a carteira dele (${nA} clientes sem expurgos)`);

    const idB = await informarPrimeiraVenda(B.pagina, 3);
    const idA = await informarPrimeiraVenda(A.pagina, 7);
    await A.pagina.waitForFunction(() => document.querySelector('#pilulaSinc').dataset.estado === 'ok');
    await B.pagina.waitForFunction(() => document.querySelector('#pilulaSinc').dataset.estado === 'ok');
    let planilha = amb.ctx.lerClientes();
    assert.equal(planilha.find(c => c.idCliente === idA).vendaCaixas, 7);
    assert.equal(planilha.find(c => c.idCliente === idB).vendaCaixas, 3);
    ok('as duas vendas chegaram na planilha, uma não apagou a outra');

    // 2. Sem internet: a venda fica na fila e é enviada quando a conexão volta
    const C = await novoAparelho(navegador, 'vendedor C');
    await entrar(C.pagina, 'VENDEDOR', '15610', '15610');
    C.rede.fora = true;
    const idC = await informarPrimeiraVenda(C.pagina, 5);
    await C.pagina.waitForFunction(() => document.querySelector('#pilulaSinc').dataset.estado === 'pendente');
    assert.equal(amb.ctx.lerClientes().find(c => c.idCliente === idC).vendaInformada, false);
    await C.pagina.reload();                       // até recarregando a página a venda continua guardada
    await C.pagina.waitForSelector('.cli');
    C.rede.fora = false;
    await C.pagina.click('#pilulaSinc');
    await C.pagina.waitForFunction(() => document.querySelector('#pilulaSinc').dataset.estado === 'ok');
    assert.equal(amb.ctx.lerClientes().find(c => c.idCliente === idC).vendaCaixas, 5);
    ok('sem internet a venda ficou pendente, sobreviveu ao recarregar e foi enviada quando a conexão voltou');

    // 3. Supervisor vê as vendas da mesa e o ranking
    const S = await novoAparelho(navegador, 'supervisor');
    await entrar(S.pagina, 'SUPERVISOR', '31470', '31470');
    await S.pagina.click('[data-aba="amarelos"]');
    const amarelos = await S.pagina.$$eval('.cli', l => l.length);
    assert.equal(amarelos, 2);                      // vendas de A (15619) e B (15623); C é de outra mesa
    await S.pagina.click('[data-aba="equipe"]');
    assert.equal(await S.pagina.$$eval('.rank-item', l => l.length), 2);
    ok('supervisor 31470 vê as 2 vendas da mesa e o ranking dos 2 setores');

    // 4. Admin muda a regra para número + 01; senha antiga deixa de valer
    const ADM = await novoAparelho(navegador, 'admin');
    await entrar(ADM.pagina, 'ADMIN', '', SENHA_ADMIN_TESTE);
    await ADM.pagina.click('[data-aba="admin"]');
    await ADM.pagina.waitForSelector('#sellerM2');
    await ADM.pagina.check('#sellerM2');
    await ADM.pagina.click('[data-salvar-senhas]');
    await ADM.pagina.waitForFunction(() => /Senhas salvas/.test(document.querySelector('#avisos').textContent));
    const D = await novoAparelho(navegador, 'vendedor D');
    await D.pagina.click('[data-perfil="VENDEDOR"]');
    await D.pagina.fill('#entCodigo', '15631'); await D.pagina.fill('#entSenha', '15631'); await D.pagina.click('#btnEntrar');
    await D.pagina.waitForFunction(() => !document.querySelector('#entErro').classList.contains('oculto'));
    await D.pagina.fill('#entSenha', '1563101'); await D.pagina.click('#btnEntrar');
    await D.pagina.waitForSelector('.cli');
    ok('admin trocou para "número + 01": 15631 foi recusada e 1563101 entrou');

    // 5. Admin cola a base no formato exato da planilha da empresa (copiada do Excel, separada por tabulação)
    const cab = ['Mês', 'Regional', 'ID Centro', 'ID Organização de vendas', 'Operação', 'Status Giro', 'Matriz Potencial', 'ID Cliente',
      'Cliente', 'CNPJ/CPF', 'ID Grupo de clientes', 'Grupo de clientes', 'Categoria de Cliente', 'Supervisor Vendas', 'Desc. Sup. Vendas',
      'Setor de Vendas', 'Desc. Setor de Vendas', 'Ativos em Campo', 'Real HL', 'Meta HL', 'Retorno %', 'UNIR', 'EXPURGADO'];
    const base = clientesFicticios();
    const linhaExcel = c => ['Nov', 'DIR REG NORDESTE N', '0026', '5087', 'CDA BENEVIDES', c.idCliente === base[0].idCliente ? 'GIRO EFICIENTE' : c.statusGiro,
      'BRONZE', c.idCliente, c.cliente, '000005' + c.cnpj.slice(0, 11), 'B4', 'Armazém/Mercearia', 'Tradicional', c.supId, c.supNome,
      c.setorId, c.vendedorNome, String(c.ativos), String(c.realHL).replace('.', ','), '1,2', '15%', '', c.expurgado].join('\t');
    const colagem = [cab.join('\t'), ...base.map(linhaExcel)].join('\r\n');
    await ADM.pagina.fill('#colarBase', colagem);
    await ADM.pagina.waitForFunction(n => (document.querySelector('.previa') || {}).textContent?.includes(n + ' clientes lidos'), base.length);
    await ADM.pagina.click('[data-publicar]');
    await ADM.pagina.waitForFunction(() => /Base publicada/.test(document.querySelector('#avisos').textContent));
    planilha = amb.ctx.lerClientes();
    const c0 = planilha.find(c => c.idCliente === base[0].idCliente);
    assert.equal(planilha.length, base.length);
    assert.equal(c0.statusGiro, 'GIRO EFICIENTE');
    assert.equal(c0.idCentro, '0026');
    assert.equal(c0.cnpj, '000005' + base[0].cnpj.slice(0, 11));
    assert.equal(c0.metaHL, 1.2);
    assert.equal(c0.grupo, 'Armazém/Mercearia');
    assert.equal(c0.categoria, 'Tradicional');
    assert.equal(c0.supNome, base[0].supNome);
    assert.equal(c0.vendedorNome, base[0].vendedorNome);
    assert.equal(c0.retornoPct, 15);
    assert.equal(planilha.find(c => c.idCliente === idA).vendaCaixas, 7, 'venda informada se perdeu na importação');
    assert.equal(planilha.filter(c => c.expurgado === 'SIM').length, base.filter(c => c.expurgado === 'SIM').length);
    ok(`colagem no formato da planilha da empresa (23 colunas, vírgula decimal, %, zeros à esquerda): ${base.length} clientes importados e a venda do vendedor A preservada`);

    // 6. Nada sensível chegou a nenhum aparelho que não fosse o admin
    for (const ap of [A, B, C, S, D]) {
      assert.ok(!ap.respostas.some(r => r.includes(SENHA_ADMIN_TESTE)), 'senha de admin vazou');
      assert.ok(!(await ap.pagina.content()).includes(SENHA_ADMIN_TESTE));
    }
    ok('a senha de admin não aparece em nenhuma resposta nem página de vendedor/supervisor');

    const erros = [A, B, C, S, ADM, D].flatMap(a => a.erros);
    assert.deepEqual(erros, []);
    ok('nenhum erro de JavaScript no site');
    console.log(passos.join('\n') + '\n\nTodos os testes de ponta a ponta passaram.');
  } catch (e) {
    console.log(passos.join('\n'));
    console.error('\n✗ FALHOU:', e.message);
    process.exitCode = 1;
  } finally {
    await navegador.close();
  }
})();
