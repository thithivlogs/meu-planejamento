// Dados FICTÍCIOS usados nos testes (nenhum cliente real).
'use strict';
const SENHA_ADMIN_TESTE = 'admin-teste-123';

function clientesFicticios() {
  const mesas = { '31470': ['15619', '15623'], '31472': ['15610', '15631'] };
  const status = ['GIRO ZERO', 'BAIXO DESEMPENHO', 'GIRO EFICIENTE'];
  const lista = [];
  let n = 0;
  for (const [mesa, setores] of Object.entries(mesas)) {
    for (const setor of setores) {
      for (let i = 0; i < 5; i++) {
        n++;
        lista.push({
          mes: 'Nov', regional: 'DIR REG TESTE', idCentro: '0026', idOrg: '5087', operacao: 'CDA TESTE',
          statusGiro: status[n % 3], matriz: 'BRONZE', idCliente: String(1000 + n).padStart(7, '0'),
          cliente: `Cliente Teste ${n}`, cnpj: `0${String(n).padStart(13, '0')}`, idGrupo: 'B4', grupo: 'Adega',
          categoria: 'Adega', supId: mesa, supNome: `Supervisor ${mesa}`, setorId: setor, vendedorNome: `Vendedor ${setor}`,
          ativos: 1 + (n % 3), realHL: n % 3 === 0 ? 0 : 1.25 * (n % 3), metaHL: 2, retornoPct: 0, unir: '',
          expurgado: n % 7 === 0 ? 'SIM' : 'NAO', monthStartStatus: status[(n + 1) % 3], monthStartHL: 0.5,
          prevStatus: status[n % 3], prevHL: 0.5, vendaInformada: false, vendaCaixas: 0, vendaObs: '',
          vendaAutor: '', vendaData: '', saidaConfirmada: false,
        });
      }
    }
  }
  return lista;
}

function estadoAntigo(clientes) {
  return {
    adminPass: SENHA_ADMIN_TESTE, sellerPassMode: 'SAME_AS_SETOR', sellerKeyword: '', supPassMode: 'SAME_AS_MESA',
    supKeyword: '', calcMetricMode: 'ATIVOS', boxFactorHL: 0.0396, lastUpdateLabel: 'Hoje (18/11/2026)',
    lastUpdateDateISO: '18/11/2026', cloudWebhookUrl: 'https://script.google.com/macros/s/teste/exec',
    clients: clientes, dailySnapshots: [{ dateLabel: '17/11', totalClients: 10, totalAtivos: 20, zeroAtivos: 5,
      baixoAtivos: 5, eficAtivos: 10, zeroPct: 25, baixoPct: 25, eficPct: 50 }],
    alerts: [{ id: 'al_1', type: 'AMARELO', title: 'Teste', desc: 'Desc', time: 'Hoje', read: false, clientId: '' }],
  };
}

module.exports = { SENHA_ADMIN_TESTE, clientesFicticios, estadoAntigo };
