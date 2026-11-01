const root = document.querySelector('#app');
const cfg = window.APP_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || '') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('SUA_');
const tabs = [
  ['today','Hoje','◫'], ['tasks','Planejamento','☑'], ['mind','Mente','✦'],
  ['notes','Notas','▤'], ['meetings','Reuniões','◷'], ['focus','Modo caverna','◉'], ['reports','Relatórios','▥']
];
let tab = 'today';
let items = [];
let session = null;
let timer = null;
let seconds = 25 * 60;
let timerRunning = false;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(value)) : '';
const dayKey = value => value ? new Date(value).toISOString().slice(0,10) : '';
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const notify = (message, bad=false) => { const el=document.querySelector('#toast'); if (!el) return; el.textContent=message; el.className=`toast show ${bad?'error':''}`; setTimeout(()=>el.classList.remove('show'),4200); };

async function api(path, options={}) {
  const headers = {'apikey':cfg.supabaseAnonKey,'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token || cfg.supabaseAnonKey}`,...options.headers};
  let response;
  try { response = await fetch(`${cfg.supabaseUrl}${path}`, {...options,headers}); }
  catch { throw new Error('Sem conexão com a nuvem. Tente novamente; seus dados não foram alterados.'); }
  let data = null;
  const raw = await response.text();
  if (raw) { try { data=JSON.parse(raw); } catch { data=raw; } }
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || 'Não foi possível salvar na nuvem.');
  return data;
}

function saveSession(data) { session=data; if(data) localStorage.setItem('base_session',JSON.stringify(data)); else localStorage.removeItem('base_session'); }
async function restoreSession() {
  try {
    const old=JSON.parse(localStorage.getItem('base_session')||'null');
    if (!old?.refresh_token) return;
    if (old.expires_at && Date.now()/1000 < old.expires_at-60) { session=old; return; }
    const fresh=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:old.refresh_token})});
    saveSession({...fresh,expires_at:Math.floor(Date.now()/1000)+fresh.expires_in});
  } catch { saveSession(null); }
}
async function loadItems() {
  items=await api('/rest/v1/items?select=*&order=created_at.desc',{headers:{'Accept':'application/json'}});
  render();
}
async function saveItem(payload,id) {
  const method=id?'PATCH':'POST';
  const path=`/rest/v1/items${id?`?id=eq.${encodeURIComponent(id)}`:''}`;
  await api(path,{method,headers:{'Prefer':'return=representation'},body:JSON.stringify(id?payload:{...payload,user_id:session.user.id})});
  await loadItems();
  notify('Salvo na nuvem.');
}
async function deleteItem(id) {
  await api(`/rest/v1/items?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
  await loadItems(); notify('Item excluído.');
}

function shell(content) {
  root.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">✳</span><span>base<span class="brand-dot">.</span></span></div><div class="workspace-label">ESPAÇO PESSOAL</div><nav>${tabs.map(([key,label,icon])=>`<button class="nav-item ${tab===key?'active':''}" data-tab="${key}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="cloud-status"><span class="status-dot"></span> Dados armazenados na nuvem</div><button id="logout" class="text-button">Sair da conta ↗</button></div></aside><main class="main"><div class="topbar"><div class="mobile-brand">✳ base.</div><span>Seu espaço de clareza</span><span class="avatar">${esc(session.user.email?.[0]?.toUpperCase()||'B')}</span></div>${content}</main></div><div id="toast" class="toast"></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab; render();});
  document.querySelector('#logout').onclick=async()=>{try{await api('/auth/v1/logout',{method:'POST'});}catch{} saveSession(null); render();};
}
function heading(eyebrow,title,description,action='') { return `<div class="page-header"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`; }
function itemCard(item) {
  return `<article class="item-card ${item.status==='done'?'completed':''}"><div class="item-main">${item.kind==='task'?`<button class="check ${item.status==='done'?'checked':''}" data-toggle="${item.id}" aria-label="${item.status==='done'?'Reabrir':'Concluir'} tarefa">${item.status==='done'?'✓':''}</button>`:`<span class="item-symbol">${{mind:'✧',note:'✦',meeting:'◷',focus:'◉'}[item.kind]}</span>`}<div><div class="item-title">${esc(item.title)}</div>${item.body?`<div class="item-body">${esc(item.body)}</div>`:''}<div class="item-meta">${item.due_at?`<span>${dateLabel(item.due_at)}</span>`:''}${item.priority==='high'?'<span class="priority">Prioridade alta</span>':''}</div></div></div><div class="item-actions"><button data-edit="${item.id}" aria-label="Editar">Editar</button><button data-delete="${item.id}" aria-label="Excluir">×</button></div></article>`;
}
function cardList(list,empty='Tudo em ordem por aqui.') { return list.length?list.map(itemCard).join(''):`<div class="empty"><div class="empty-icon">✳</div><strong>${empty}</strong><p>Adicione algo quando fizer sentido.</p></div>`; }
function bindCards() {
  document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>perform(()=>saveItem({status:items.find(i=>i.id===b.dataset.toggle).status==='done'?'open':'done'},b.dataset.toggle)));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Excluir este item?')) perform(()=>deleteItem(b.dataset.delete));});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openModal(items.find(i=>i.id===b.dataset.edit)));
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openModal(null,b.dataset.add));
}
async function perform(fn) { try { await fn(); } catch(e) { notify(e.message,true); } }
function viewToday() {
  const date=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const open=items.filter(i=>i.kind==='task'&&i.status==='open');
  const due=open.filter(i=>dayKey(i.due_at)===today());
  const done=items.filter(i=>i.kind==='task'&&i.status==='done');
  shell(`<section class="content">${heading(date.toUpperCase(),'Um dia de cada vez.','Organize o que importa e avance com leveza.', '<button class="primary" data-add="task">+ Nova tarefa</button>')}<div class="hero"><div><span class="hero-kicker">SEU DIA EM FOCO</span><h2>O que merece sua atenção hoje?</h2><p>Comece pelo essencial. O resto pode esperar.</p><button data-add="task">Planejar meu dia <span>↗</span></button></div><div class="hero-art"><span>✳</span></div></div><div class="stats"><div><span>PARA HOJE</span><strong>${due.length}</strong><small>tarefas com prazo hoje</small></div><div><span>EM ABERTO</span><strong>${open.length}</strong><small>no seu planejamento</small></div><div><span>CONCLUÍDAS</span><strong>${done.length}</strong><small>passos dados até aqui</small></div></div><div class="section-title"><h2>Próximos passos</h2><button data-tab="tasks">Ver tudo →</button></div>${cardList(open.slice(0,5),'Seu planejamento está livre.')}</section>`);
  bindCards(); document.querySelector('.section-title [data-tab]').onclick=()=>{tab='tasks';render();};
}
function viewCollection(kind,eyebrow,title,description,empty) {
  const list=items.filter(i=>i.kind===kind);
  shell(`<section class="content">${heading(eyebrow,title,description,`<button class="primary" data-add="${kind}">+ Novo ${kind==='task'?'plano':kind==='meeting'?'registro':'registro'}</button>`)}${kind==='task'?'<div class="list-hint">PENDENTES</div>':''}${cardList(kind==='task'?list.filter(i=>i.status==='open'):list,empty)}${kind==='task'&&list.some(i=>i.status==='done')?`<div class="list-hint lower">CONCLUÍDAS</div>${cardList(list.filter(i=>i.status==='done'))}`:''}</section>`);
  bindCards();
}
function viewFocus() {
  const past=items.filter(i=>i.kind==='focus');
  shell(`<section class="content">${heading('PRESENÇA E CONCENTRAÇÃO','Modo caverna','Um espaço para fazer uma coisa de cada vez.')}<div class="focus-panel"><span class="eyebrow">SESSÃO DE FOCO</span><div class="timer" id="timer">${formatTime(seconds)}</div><p>Silencie o ruído. Avance no que importa.</p><div class="timer-actions"><button class="primary" id="timer-toggle">${timerRunning?'Pausar':'Começar foco'}</button><button class="secondary" id="timer-reset">Reiniciar</button></div><div class="timer-presets"><button data-minutes="15">15 min</button><button data-minutes="25">25 min</button><button data-minutes="50">50 min</button></div></div><div class="section-title"><h2>Sessões registradas</h2></div>${cardList(past,'Seu primeiro foco começa agora.')}</section>`);
  document.querySelector('#timer-toggle').onclick=()=>{timerRunning=!timerRunning; if(timerRunning) startTimer(); render();};
  document.querySelector('#timer-reset').onclick=()=>{timerRunning=false; clearInterval(timer); seconds=25*60; render();};
  document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{timerRunning=false;clearInterval(timer);seconds=Number(b.dataset.minutes)*60;render();}); bindCards();
}
function formatTime(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function startTimer(){clearInterval(timer); const minutes=Math.ceil(seconds/60); timer=setInterval(async()=>{if(!timerRunning)return; seconds--; const label=document.querySelector('#timer');if(label)label.textContent=formatTime(seconds);if(seconds<=0){timerRunning=false;clearInterval(timer);seconds=minutes*60;await perform(()=>saveItem({kind:'focus',title:`Sessão de foco de ${minutes} minutos`,body:'Concluída no modo caverna',status:'done',priority:'normal',due_at:new Date().toISOString()}));notify('Sessão concluída. Boa!');}},1000);}
function viewReports() {
  const tasks=items.filter(i=>i.kind==='task'); const done=tasks.filter(i=>i.status==='done').length; const rate=tasks.length?Math.round(done/tasks.length*100):0;
  shell(`<section class="content">${heading('OLHE O CAMINHO PERCORRIDO','Relatórios','Seus registros reunidos para acompanhar o progresso.','<button class="primary" id="export">Exportar CSV ↗</button>')}<div class="stats reports-stats"><div><span>TAREFAS</span><strong>${tasks.length}</strong><small>registradas</small></div><div><span>CONCLUÍDAS</span><strong>${done}</strong><small>${rate}% do total</small></div><div><span>NOTAS E REUNIÕES</span><strong>${items.filter(i=>['note','meeting'].includes(i.kind)).length}</strong><small>ideias preservadas</small></div></div><div class="report-panel"><h2>Seu panorama</h2><p>${tasks.length?`Você concluiu ${done} de ${tasks.length} tarefas registradas. Continue no seu ritmo.`:'Comece registrando suas tarefas para visualizar seu progresso.'}</p><div class="progress"><span style="width:${rate}%"></span></div><small>${rate}% concluído</small></div><div class="section-title"><h2>Atividade recente</h2></div>${cardList(items.slice(0,8),'Seus registros aparecerão aqui.')}</section>`);
  document.querySelector('#export').onclick=exportCsv; bindCards();
}
function exportCsv(){const fields=['kind','title','body','status','priority','due_at','created_at'];const rows=[fields.join(';'),...items.map(i=>fields.map(f=>'"'+String(i[f]??'').replace(/"/g,'""')+'"').join(';'))];const blob=new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`base-relatorio-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function render() {
  if(!configured){root.innerHTML='<div class="setup"><span class="brand-mark">✳</span><h1>Prepare seu espaço.</h1><p>Configure o Supabase no arquivo <code>config.js</code> para ativar o armazenamento seguro na nuvem.</p><a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Abrir Supabase ↗</a></div>';return;}
  if(!session){renderAuth();return;}
  ({today:viewToday,tasks:()=>viewCollection('task','O QUE VEM PELA FRENTE','Planejamento','Transforme intenções em passos claros.','Nenhuma tarefa por enquanto.'),mind:()=>viewCollection('mind','CAPTURE ANTES DE ESQUECER','Mente','Descarregue ideias, pensamentos e lembretes.','Sua mente está livre.'),notes:()=>viewCollection('note','TUDO EM SEU LUGAR','Notas','Guarde o que você quer encontrar depois.','Nenhuma nota por enquanto.'),meetings:()=>viewCollection('meeting','CONVERSAS QUE IMPORTAM','Reuniões','Decisões, ideias e próximos passos no mesmo lugar.','Nenhuma reunião registrada.'),focus:viewFocus,reports:viewReports})[tab]();
}
function renderAuth(){root.innerHTML=`<div class="auth-wrap"><div class="auth-intro"><div class="brand"><span class="brand-mark">✳</span>base<span class="brand-dot">.</span></div><h1>Mais clareza.<br><em>Mais espaço para viver.</em></h1><p>Seu planejamento, suas ideias e seus dias em um só lugar.</p><div class="auth-shape">✳</div></div><div class="auth-side"><form id="auth-form" class="auth-card"><div class="eyebrow">BEM-VINDO À SUA BASE</div><h2>Entre no seu espaço</h2><p>Tudo o que você registrar fica salvo na nuvem.</p><label>E-mail<input type="email" name="email" required autocomplete="email" placeholder="voce@exemplo.com"></label><label>Senha<input type="password" name="password" required minlength="6" autocomplete="current-password" placeholder="Sua senha"></label><button class="primary" type="submit">Entrar <span>↗</span></button><button class="text-button" id="signup" type="button">Criar uma conta</button><div id="auth-message" role="status"></div></form></div></div>`;
  document.querySelector('#auth-form').onsubmit=async e=>{e.preventDefault(); await auth('login');};
  document.querySelector('#signup').onclick=()=>auth('signup');
}
async function auth(mode){const f=document.querySelector('#auth-form'), email=f.elements.namedItem('email').value.trim(), password=f.elements.namedItem('password').value, message=document.querySelector('#auth-message');if(!f.reportValidity())return;message.textContent='Aguarde...';try{const result=await api(mode==='login'?'/auth/v1/token?grant_type=password':'/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password})});if(!result.access_token){message.textContent='Conta criada. Verifique seu e-mail para confirmar o cadastro.';return;}saveSession({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in});await loadItems();}catch(e){message.textContent=e.message;}}
function openModal(item=null,kind='task'){
  kind=item?.kind||kind;
  const label={task:'Tarefa',mind:'Pensamento',note:'Nota',meeting:'Reunião',focus:'Foco'}[kind];
  const dialog=document.createElement('dialog'); dialog.className='editor'; dialog.innerHTML=`<form id="editor-form"><div class="editor-top"><div><div class="eyebrow">${item?'EDITAR':'NOVO REGISTRO'}</div><h2>${label}</h2></div><button type="button" id="close-editor" aria-label="Fechar">×</button></div><label>Título<input name="title" maxlength="300" required value="${esc(item?.title||'')}" placeholder="O que você quer registrar?"></label><label>Detalhes<textarea name="body" rows="5" placeholder="Escreva livremente...">${esc(item?.body||'')}</textarea></label><div class="form-row"><label>${kind==='task'?'Prazo':'Data'}<input name="due_at" type="date" value="${item?.due_at?dayKey(item.due_at):''}"></label>${kind==='task'?`<label>Prioridade<select name="priority"><option value="normal" ${item?.priority==='normal'?'selected':''}>Normal</option><option value="high" ${item?.priority==='high'?'selected':''}>Alta</option><option value="low" ${item?.priority==='low'?'selected':''}>Baixa</option></select></label>`:''}</div><button class="primary" type="submit">Salvar na nuvem ↗</button></form>`;document.body.append(dialog);dialog.showModal();dialog.querySelector('#close-editor').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]'),field=n=>f.elements.namedItem(n);b.disabled=true;const payload={kind,title:field('title').value.trim(),body:field('body').value.trim(),due_at:field('due_at').value?`${field('due_at').value}T12:00:00Z`:null,priority:field('priority')?.value||'normal'};if(!payload.title){b.disabled=false;return;}try{await saveItem(payload,item?.id);dialog.close();}catch(err){notify(err.message,true);}finally{b.disabled=false;}};
}
await restoreSession(); render(); if(session) perform(loadItems);
