const SUPABASE_URL = 'https://airmjmjdrswqkgdbgind.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcm1qbWpkcnN3cWtnZGJnaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTMwOTQsImV4cCI6MjA5ODE4OTA5NH0.8uesJ31Btb5A17tAJCKi5d0O3nMOSlVPwquVc25Ktb4';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id)=>document.getElementById(id);
let user = null;
let familia = localStorage.getItem('bevi_familia') || '';
let movimentos = [];
let cadastros = [];
const money = (n)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today = ()=>new Date().toISOString().slice(0,10);
function show(view){ ['authView','setupView','appView'].forEach(v=>$(v).classList.add('hidden')); $(view).classList.remove('hidden'); $('logoutBtn').classList.toggle('hidden', !user); }
function setMsg(id, txt, ok=false){ $(id).textContent = txt||''; $(id).style.color = ok?'#22c55e':'#fb7185'; }
async function init(){
  const {data:{session}} = await db.auth.getSession();
  user = session?.user || null;
  if(!user){ show('authView'); return; }
  if(!familia){ show('setupView'); return; }
  $('familyLabel').textContent = `Família: ${familia}`;
  show('appView');
  await loadAll();
}
async function login(){ setMsg('authMsg','Entrando...'); const {error} = await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error) return setMsg('authMsg',error.message); setMsg('authMsg','Login realizado.',true); location.reload(); }
async function signup(){ setMsg('authMsg','Criando conta...'); const {error} = await db.auth.signUp({email:$('email').value.trim(),password:$('password').value}); if(error) return setMsg('authMsg',error.message); setMsg('authMsg','Conta criada. Se receber e-mail de confirmação, confirme e depois entre.',true); }
async function logout(){ await db.auth.signOut(); localStorage.removeItem('bevi_familia'); location.reload(); }
function makeFamily(){ $('familyCodeInput').value = 'BEVI-' + Math.random().toString(36).slice(2,8).toUpperCase(); }
async function useFamily(){ const code=$('familyCodeInput').value.trim().toUpperCase(); if(!code) return setMsg('setupMsg','Informe ou gere um código.'); familia=code; localStorage.setItem('bevi_familia',familia); await ensureDefaults(); location.reload(); }
async function ensureDefaults(){
  const defaults=[['pessoa','Larissa'],['pessoa','Davi'],['categoria','Alimentação'],['categoria','Moradia'],['categoria','Transporte'],['categoria','Receita'],['categoria','Cartão de crédito'],['terceiro','Nenhum']];
  for(const [tipo,nome] of defaults){ await db.from('bevi_cadastros').insert({familia,tipo,nome}).select().maybeSingle(); }
}
async function loadAll(){
  const [mov,cad] = await Promise.all([
    db.from('bevi_movimentacoes').select('*').eq('familia',familia).order('data_vencimento',{ascending:true}),
    db.from('bevi_cadastros').select('*').eq('familia',familia).order('ativo',{ascending:false}).order('nome',{ascending:true})
  ]);
  if(mov.error) alert('Erro ao carregar movimentos: '+mov.error.message);
  if(cad.error) alert('Erro ao carregar cadastros: '+cad.error.message);
  movimentos = mov.data || [];
  cadastros = cad.data || [];
  renderCadOptions(); renderDashboard(); renderMovs(); renderCadList();
}
function activeByTipo(tipo){ return cadastros.filter(c=>c.tipo===tipo && c.ativo).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')); }
function renderCadOptions(){
  $('categoria').innerHTML = activeByTipo('categoria').map(c=>`<option>${c.nome}</option>`).join('') || '<option>Geral</option>';
  $('terceiro').innerHTML = '<option></option>' + activeByTipo('terceiro').map(c=>`<option>${c.nome}</option>`).join('');
}
function renderDashboard(){
  const rec = movimentos.filter(m=>m.tipo==='receita');
  const desp = movimentos.filter(m=>m.tipo==='despesa');
  const recebidas = rec.filter(m=>['recebido','confirmado','pago'].includes(m.status)).reduce((s,m)=>s+Number(m.valor),0);
  const recPend = rec.filter(m=>m.status==='pendente').reduce((s,m)=>s+Number(m.valor),0);
  const pagas = desp.filter(m=>['pago','confirmado'].includes(m.status)).reduce((s,m)=>s+Number(m.valor),0);
  const pend = desp.filter(m=>m.status==='pendente').reduce((s,m)=>s+Number(m.valor),0);
  const terceiros = rec.filter(m=>m.responsavel==='Terceiro' && m.status==='pendente').reduce((s,m)=>s+Number(m.valor),0);
  $('mRecebidas').textContent=money(recebidas); $('mRecPend').textContent=money(recPend); $('mPagas').textContent=money(pagas); $('mPendentes').textContent=money(pend); $('mSaldo').textContent=money(recebidas-pagas); $('mTerceiros').textContent=money(terceiros);
}
async function saveMov(){
  const valor=Number($('valor').value||0); if(!valor || !$('titulo').value.trim()) return setMsg('saveMsg','Informe título e valor.');
  const payload={familia,modulo:'movimentacao',tipo:$('tipo').value,titulo:$('titulo').value.trim(),responsavel:$('responsavel').value,pagador:$('pagador').value,terceiro:$('terceiro').value||null,categoria:$('categoria').value,valor,status:$('status').value,data_lancamento:today(),data_vencimento:$('vencimento').value||null,data_pagamento:['pago','recebido','confirmado'].includes($('status').value)?today():null,observacao:$('observacao').value.trim()||null,dados:{user_id:user.id}};
  const {error} = await db.from('bevi_movimentacoes').insert(payload);
  if(error) return setMsg('saveMsg',error.message);
  ['titulo','valor','vencimento','observacao'].forEach(id=>$(id).value=''); setMsg('saveMsg','Lançamento salvo.',true); await loadAll();
}
function selectedStatuses(){ return Array.from($('filterStatus').selectedOptions).map(o=>o.value); }
function renderMovs(){
  const sts=selectedStatuses();
  const arr=movimentos.filter(m=>!sts.length || sts.includes(m.status));
  $('movList').innerHTML = arr.map(m=>`<div class="item"><div><strong class="${m.tipo}">${m.titulo}</strong><br><small>${m.tipo} • ${m.responsavel||'-'} • ${m.categoria||'-'} • venc.: ${m.data_vencimento||'-'} • pag.: ${m.data_pagamento||'-'}</small><br><span class="pill ${m.status}">${m.status}</span></div><div class="item-actions"><strong>${money(m.valor)}</strong><button class="secondary" onclick="openEdit('${m.id}')">Ajustar</button></div></div>`).join('') || '<p>Nenhum lançamento.</p>';
}
async function saveCad(){ const nome=$('cadNome').value.trim(); if(!nome) return; const {error}=await db.from('bevi_cadastros').insert({familia,tipo:$('cadTipo').value,nome,ativo:true}); if(error) return alert(error.message); $('cadNome').value=''; await loadAll(); }
function renderCadList(){
  $('cadList').innerHTML = cadastros.map(c=>`<div class="item"><div>${c.nome}<br><small>${c.tipo} • ${c.ativo?'ativo':'inativo'}</small></div><button class="secondary" onclick="toggleCad('${c.id}',${!c.ativo})">${c.ativo?'Inativar':'Ativar'}</button></div>`).join('');
}
async function toggleCad(id,ativo){ const {error}=await db.from('bevi_cadastros').update({ativo}).eq('id',id); if(error) return alert(error.message); await loadAll(); }
function openEdit(id){ const m=movimentos.find(x=>x.id===id); if(!m)return; $('editId').value=m.id; $('editTitulo').value=m.titulo; $('editValor').value=m.valor; $('editStatus').value=m.status; $('editPagamento').value=m.data_pagamento||''; $('editObs').value=m.observacao||''; $('editDialog').showModal(); }
async function confirmEdit(e){ e.preventDefault(); const id=$('editId').value; const status=$('editStatus').value; const payload={titulo:$('editTitulo').value.trim(),valor:Number($('editValor').value||0),status,data_pagamento:$('editPagamento').value||(['pago','recebido','confirmado'].includes(status)?today():null),observacao:$('editObs').value,atualizado_em:new Date().toISOString()}; const {error}=await db.from('bevi_movimentacoes').update(payload).eq('id',id); if(error) return alert(error.message); $('editDialog').close(); await loadAll(); }
function exportCSV(){
  const headers=['id','tipo','titulo','responsavel','pagador','terceiro','categoria','valor','status','data_lancamento','data_vencimento','data_pagamento','observacao'];
  const rows=movimentos.map(m=>headers.map(h=>`"${String(m[h]??'').replaceAll('"','""')}"`).join(';'));
  const blob=new Blob([headers.join(';')+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='bevi-movimentacoes.csv'; a.click();
}
$('loginBtn').onclick=login; $('signupBtn').onclick=signup; $('logoutBtn').onclick=logout; $('makeFamilyBtn').onclick=makeFamily; $('useFamilyBtn').onclick=useFamily; $('saveBtn').onclick=saveMov; $('cadSaveBtn').onclick=saveCad; $('refreshBtn').onclick=loadAll; $('filterStatus').onchange=renderMovs; $('confirmEditBtn').onclick=confirmEdit; $('exportBtn').onclick=exportCSV;
init();
