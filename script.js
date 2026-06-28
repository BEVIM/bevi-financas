const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const storeKey = 'bevi-financas-v16';
const oldKeys = ['bevi-financas-v15','bevi-financas-v14','bevi-financas-v13-corrigida','bevi-financas-v13','bevi-financas-v12','bevi-financas-v11','bevi-financas-v10','bevi-financas-v9','bevi-financas-v8','bevi-financas-v7','bevi-financas-v6','bevi-financas-v5','bevi-financas-v4','bevi-financas-v3','bevi-financas-v2','bevi-financas-v1'];
const today = new Date().toISOString().slice(0,10);
const currentYm = today.slice(0,7);

function id(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()); }
function money(v){ return BRL.format(Number(v || 0)); }
function ym(dateStr){ return (dateStr || '').slice(0,7); }
function dateBR(dateStr){ return dateStr ? new Date(dateStr+'T00:00:00').toLocaleDateString('pt-BR') : '-'; }
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function num(v){ return Number(String(v ?? 0).replace(',','.')) || 0; }
function byName(a,b){ return String(a.nome||a).localeCompare(String(b.nome||b),'pt-BR',{sensitivity:'base'}); }
function monthName(ref){ return new Date(ref+'-02T00:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); }
function lastDayOfMonth(ref){ const [y,m]=ref.split('-').map(Number); return new Date(y,m,0).getDate(); }
function clampDay(ref, day){ return `${ref}-${String(Math.min(Number(day||1), lastDayOfMonth(ref))).padStart(2,'0')}`; }
function addMonths(dateStr, n){ const d=new Date(dateStr+'T00:00:00'); d.setMonth(d.getMonth()+n); return d.toISOString().slice(0,10); }
function monthsBetween(start, end){ const out=[]; let d=new Date(start+'-01T00:00:00'); const e=new Date(end+'-01T00:00:00'); while(d<=e){ out.push(d.toISOString().slice(0,7)); d.setMonth(d.getMonth()+1); } return out; }

const defaultState = {
  despesas: [], receitas: [], receitasRecorrentes: [], cartoes: [], metas: [], contas: [], faturas: [], acertos: [], transferencias: [], caixinhas: [],
  categorias: [
    {id:id(), nome:'Alimentação', ativo:true}, {id:id(), nome:'Cartão de crédito', ativo:true},
    {id:id(), nome:'Lazer', ativo:true}, {id:id(), nome:'Moradia', ativo:true},
    {id:id(), nome:'Outros', ativo:true}, {id:id(), nome:'Saúde', ativo:true},
    {id:id(), nome:'Terceiros', ativo:true}, {id:id(), nome:'Transporte', ativo:true}
  ],
  terceiros: []
};
let state = loadState();
let selectedFaturaKey = '';
let selectedFluxoMes = '';


// =====================================================================
// MÓDULO 00 - ACESSO, FAMÍLIA E SINCRONIZAÇÃO
// =====================================================================
const BEVI_SUPABASE_URL = 'https://airmjmjdrswqkgdbgind.supabase.co';
const BEVI_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcm1qbWpkcnN3cWtnZGJnaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTMwOTQsImV4cCI6MjA5ODE4OTA5NH0.8uesJ31Btb5A17tAJCKi5d0O3nMOSlVPwquVc25Ktb4';
const beviClient = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(BEVI_SUPABASE_URL, BEVI_SUPABASE_ANON_KEY) : null;
const accessKey = 'bevi-access-v1';
let beviUser = null;
let beviFamily = null;
let pendingSyncTimer = null;
let accessReady = false;

function getAccess(){
  try { return JSON.parse(localStorage.getItem(accessKey) || '{}'); } catch { return {}; }
}
function setAccess(data){ localStorage.setItem(accessKey, JSON.stringify(data || {})); }
function randomFamilyCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}
function familyStorageKey(code){ return `family:${String(code||'').toUpperCase().trim()}`; }
function userFamilyKey(userId){ return `user_family:${userId}`; }
function familyDataKey(code){ return `data:${String(code||'').toUpperCase().trim()}`; }
function setAuthStatus(target, message){ const el=document.getElementById(target); if(el) el.textContent=message; }
function showOnlyAccess(step){
  const login=document.getElementById('loginScreen');
  const family=document.getElementById('familyScreen');
  const app=document.getElementById('appContent');
  login?.classList.toggle('hidden', step !== 'login');
  family?.classList.toggle('hidden', step !== 'family');
  app?.classList.toggle('hidden', step !== 'app');
}
function updateSessionBar(){
  const email=beviUser?.email || getAccess().email || '';
  const code=beviFamily?.code || getAccess().familyCode || '';
  const name=beviFamily?.name || getAccess().familyName || '';
  const logged=document.getElementById('loggedEmailInfo');
  const user=document.getElementById('sessionUserLabel');
  const fam=document.getElementById('sessionFamilyLabel');
  if(logged) logged.textContent = email ? `Logado como ${email}` : 'Logado';
  if(user) user.textContent = email ? `Logado: ${email}` : 'Usuário não identificado';
  if(fam) fam.textContent = code ? `Família: ${name || 'Sem nome'} • Código BEVI: ${code}` : 'Família não conectada';
}
async function beviGetConfig(chave){
  if(!beviClient) return null;
  const { data, error } = await beviClient.from('bevi_configuracoes').select('valor').eq('familia','bevi').eq('chave',chave).maybeSingle();
  if(error) throw error;
  return data?.valor || null;
}
async function beviSetConfig(chave, valor){
  if(!beviClient) return null;
  const payload={familia:'bevi', chave, valor};
  const { error } = await beviClient.from('bevi_configuracoes').upsert(payload, { onConflict: 'familia,chave' });
  if(error) throw error;
}
async function loadRemoteFamilyData(){
  if(!beviFamily?.code) return;
  try{
    const remote = await beviGetConfig(familyDataKey(beviFamily.code));
    const remoteState = remote?.state || remote;
    if(remoteState && typeof remoteState === 'object'){
      state = normalize(remoteState);
      localStorage.setItem(storeKey, JSON.stringify(state));
      render();
      setAuthStatus('beviFamilyStatus','Dados carregados da família conectada.');
    }
  }catch(err){ console.warn('Falha ao carregar dados remotos', err); }
}
async function syncRemoteNow(){
  if(!beviFamily?.code){ alert('Conecte uma família antes de sincronizar.'); return; }
  try{
    await beviSetConfig(familyDataKey(beviFamily.code), { state, updatedAt:new Date().toISOString(), updatedBy:beviUser?.email || '' });
    setAuthStatus('beviFamilyStatus','Sincronizado com sucesso.');
    alert('Sincronizado com sucesso.');
  }catch(err){
    console.error(err); alert('Não foi possível sincronizar agora. Os dados continuam salvos neste navegador.');
  }
}
function scheduleRemoteSave(){
  if(!accessReady || !beviFamily?.code || !beviClient) return;
  clearTimeout(pendingSyncTimer);
  pendingSyncTimer=setTimeout(()=>{ syncRemoteNow().catch(console.warn); }, 1200);
}
async function authSignUp(){
  const email=(document.getElementById('authEmail')?.value||'').trim().toLowerCase();
  const password=document.getElementById('authPassword')?.value||'';
  if(!email || !password){ alert('Informe e-mail e senha.'); return; }
  if(password.length < 6){ alert('A senha precisa ter pelo menos 6 caracteres.'); return; }
  if(!beviClient){ alert('Conexão Supabase indisponível.'); return; }
  setAuthStatus('beviLoginStatus','Criando conta...');
  const { data, error } = await beviClient.auth.signUp({ email, password });
  if(error){
    const msg=String(error.message||error);
    if(msg.toLowerCase().includes('registered') || msg.toLowerCase().includes('already')) alert('Este e-mail já está cadastrado. Use Entrar ou Esqueci senha.');
    else alert('Erro ao criar conta: '+msg);
    setAuthStatus('beviLoginStatus','Não foi possível criar a conta.');
    return;
  }
  beviUser=data.user || null;
  setAccess({ ...getAccess(), email });
  setAuthStatus('beviLoginStatus','Conta criada. Se o Supabase pedir confirmação, confirme o e-mail antes de entrar.');
  alert('Conta criada. Se chegar e-mail de confirmação, confirme antes de entrar.');
}
async function authLogin(){
  const email=(document.getElementById('authEmail')?.value||'').trim().toLowerCase();
  const password=document.getElementById('authPassword')?.value||'';
  if(!email || !password){ alert('Informe e-mail e senha.'); return; }
  if(!beviClient){ alert('Conexão Supabase indisponível.'); return; }
  setAuthStatus('beviLoginStatus','Entrando...');
  const { data, error } = await beviClient.auth.signInWithPassword({ email, password });
  if(error){ alert('Erro ao entrar: '+(error.message||error)); setAuthStatus('beviLoginStatus','Falha no login.'); return; }
  beviUser=data.user;
  setAccess({ ...getAccess(), email:beviUser.email, userId:beviUser.id });
  await afterLogin();
}
async function authForgotPassword(){
  const email=(document.getElementById('authEmail')?.value||'').trim().toLowerCase();
  if(!email){ alert('Informe seu e-mail no campo de login.'); return; }
  if(!beviClient){ alert('Conexão Supabase indisponível.'); return; }
  const { error } = await beviClient.auth.resetPasswordForEmail(email, { redirectTo: location.href });
  if(error){ alert('Erro ao enviar recuperação: '+(error.message||error)); return; }
  alert('Se este e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.');
}
async function authLogout(){
  try{ if(beviClient) await beviClient.auth.signOut(); }catch{}
  beviUser=null; beviFamily=null; accessReady=false; setAccess({}); showOnlyAccess('login');
  setAuthStatus('beviLoginStatus','Você saiu.'); updateSessionBar();
}
async function afterLogin(){
  const access=getAccess();
  updateSessionBar();
  let linked=null;
  try{ linked = beviUser?.id ? await beviGetConfig(userFamilyKey(beviUser.id)) : null; }catch{}
  if(linked?.code){
    beviFamily = linked;
    setAccess({ ...access, familyCode:linked.code, familyName:linked.name, userId:beviUser.id, email:beviUser.email });
    accessReady=true; showOnlyAccess('app'); updateSessionBar(); await loadRemoteFamilyData(); render();
  } else {
    showOnlyAccess('family'); setAuthStatus('beviFamilyStatus','Informe um Código BEVI ou crie uma nova família.'); updateSessionBar();
  }
}
async function createFamily(){
  if(!beviUser){ alert('Faça login primeiro.'); return; }
  const name=(document.getElementById('familyNameInput')?.value||'').trim();
  if(!name){ alert('Informe o nome da família.'); return; }
  let code=randomFamilyCode();
  try{
    for(let i=0;i<5;i++){
      const exists=await beviGetConfig(familyStorageKey(code));
      if(!exists) break;
      code=randomFamilyCode();
    }
    const family={code,name,createdAt:new Date().toISOString(),createdBy:beviUser.email};
    await beviSetConfig(familyStorageKey(code), family);
    await beviSetConfig(userFamilyKey(beviUser.id), family);
    beviFamily=family; accessReady=true;
    setAccess({ ...getAccess(), familyCode:code, familyName:name, userId:beviUser.id, email:beviUser.email });
    document.getElementById('familyCodeInput').value=code;
    document.getElementById('familyShareActions')?.classList.remove('hidden');
    showOnlyAccess('app'); updateSessionBar(); await syncRemoteNow(); render();
    alert(`Família criada. Código BEVI: ${code}`);
  }catch(err){ console.error(err); alert('Erro ao criar família: '+(err.message||err)); }
}
async function joinFamily(){
  if(!beviUser){ alert('Faça login primeiro.'); return; }
  const code=(document.getElementById('familyCodeInput')?.value||'').trim().toUpperCase();
  if(!code){ alert('Informe o Código BEVI.'); return; }
  try{
    const family=await beviGetConfig(familyStorageKey(code));
    if(!family){ alert('Código BEVI não encontrado. Confira e tente novamente.'); return; }
    await beviSetConfig(userFamilyKey(beviUser.id), family);
    beviFamily=family; accessReady=true;
    setAccess({ ...getAccess(), familyCode:family.code, familyName:family.name, userId:beviUser.id, email:beviUser.email });
    showOnlyAccess('app'); updateSessionBar(); await loadRemoteFamilyData(); render();
  }catch(err){ console.error(err); alert('Erro ao entrar na família: '+(err.message||err)); }
}
function copyFamilyCode(){
  const code=beviFamily?.code || document.getElementById('familyCodeInput')?.value || '';
  if(!code){ alert('Nenhum Código BEVI disponível.'); return; }
  navigator.clipboard?.writeText(code);
  alert('Código copiado: '+code);
}
function emailFamilyCode(){
  const code=beviFamily?.code || document.getElementById('familyCodeInput')?.value || '';
  const name=beviFamily?.name || document.getElementById('familyNameInput')?.value || 'Família BEVI';
  if(!code){ alert('Nenhum Código BEVI disponível.'); return; }
  const subject=encodeURIComponent('Código BEVI da família');
  const body=encodeURIComponent(`Sua família foi criada no BEVI.\n\nNome: ${name}\nCódigo BEVI: ${code}\n\nGuarde este código e compartilhe apenas com quem fará parte do controle financeiro.`);
  location.href=`mailto:?subject=${subject}&body=${body}`;
}
function switchFamily(){ beviFamily=null; accessReady=false; showOnlyAccess('family'); updateSessionBar(); }
async function initAccessFlow(){
  document.getElementById('loginForm')?.addEventListener('submit', e=>{ e.preventDefault(); authLogin(); });
  document.getElementById('authSignupBtn')?.addEventListener('click', authSignUp);
  document.getElementById('forgotPasswordBtn')?.addEventListener('click', authForgotPassword);
  document.getElementById('authLogoutBtn')?.addEventListener('click', authLogout);
  document.getElementById('appLogoutBtn')?.addEventListener('click', authLogout);
  document.getElementById('createFamilyBtn')?.addEventListener('click', createFamily);
  document.getElementById('joinFamilyBtn')?.addEventListener('click', joinFamily);
  document.getElementById('copyFamilyCodeBtn')?.addEventListener('click', copyFamilyCode);
  document.getElementById('emailFamilyCodeBtn')?.addEventListener('click', emailFamilyCode);
  document.getElementById('syncNowBtn')?.addEventListener('click', syncRemoteNow);
  document.getElementById('switchFamilyBtn')?.addEventListener('click', switchFamily);
  showOnlyAccess('login');
  if(!beviClient){ setAuthStatus('beviLoginStatus','Supabase indisponível. O app funcionará apenas neste navegador.'); return; }
  try{
    const { data } = await beviClient.auth.getSession();
    beviUser=data?.session?.user || null;
    if(beviUser){ setAccess({ ...getAccess(), email:beviUser.email, userId:beviUser.id }); await afterLogin(); }
    else setAuthStatus('beviLoginStatus','Informe seus dados para acessar.');
  }catch(err){ console.warn(err); setAuthStatus('beviLoginStatus','Não foi possível verificar login.'); }
}

function normalize(s){
  s = s || {};
  if(!s.despesas && s.lancamentos){
    s.despesas = s.lancamentos.filter(x=>x.tipo !== 'Receita').map(x=>({
      ...x, valorPrevisto:Number(x.valor||0), valorPago:x.status==='Pago'?Number(x.valor||0):0,
      status: x.forma === 'Cartão de crédito' && x.status !== 'Recebido' ? 'Pendente' : (x.status || 'Pendente')
    }));
    s.receitas = s.lancamentos.filter(x=>x.tipo === 'Receita').map(x=>({...x, pessoa:x.pagador || x.responsavel || 'Casal', tipo:'Receita avulsa'}));
  }
  const st = {
    ...clone(defaultState), ...s,
    despesas: s.despesas || [], receitas: s.receitas || [], receitasRecorrentes: s.receitasRecorrentes || [], cartoes: s.cartoes || [], metas: s.metas || [], contas: s.contas || [], faturas:s.faturas||[], acertos:s.acertos||[], transferencias:s.transferencias||[], caixinhas:s.caixinhas||[],
    categorias: (s.categorias && s.categorias.length) ? s.categorias.map(c=>typeof c === 'string'?{id:id(),nome:c,ativo:true}:c) : clone(defaultState.categorias),
    terceiros: (s.terceiros || []).map(t=>typeof t === 'string'?{id:id(),nome:t,ativo:true}:t)
  };
  st.despesas.forEach(d=>{
    d.tipo = 'Despesa';
    d.valorPrevisto = num(d.valorPrevisto ?? d.valor);
    d.valorPago = num(d.valorPago);
    d.status = d.status || (d.forma==='Cartão de crédito' ? 'Pendente' : 'Pendente');
    if(d.parcelas>1 && !d.grupoParcelamento) d.grupoParcelamento = d.descricao+'|'+d.data+'|'+d.valorPrevisto+'|'+d.parcelas+'|'+(d.cartao||'');
    if(d.forma==='Cartão de crédito' && !d.fatura) d.fatura = faturaRef(d.data,d.cartao);
  });
  st.faturas.forEach(f=>{ if(!f.id) f.id=id(); if(!f.status) f.status='Pendente'; });
  st.receitas.forEach(r=>{ if(!r.status) r.status='Confirmada'; r.valor=num(r.valor); if(!r.tipo) r.tipo='Avulsa'; if(r.pessoa==='Casal') r.pessoa='Larissa'; });
  st.caixinhas.forEach(c=>{ if(!c.id) c.id=id(); c.saldo=num(c.saldo); if(c.ativo===undefined) c.ativo=true; });
  st.acertos.forEach(a=>{ if(!a.id) a.id=id(); a.valor=num(a.valor); a.valorPago=num(a.valorPago); if(!a.status) a.status='Pendente'; });
  st.transferencias.forEach(t=>{ if(!t.id) t.id=id(); t.valor=num(t.valor); if(!t.status) t.status='Confirmada'; if(!t.tipo) t.tipo=t.acertoId?'Repasse':'Transferência'; t.recorrente=!!t.recorrente || t.recorrente==='on' || t.recorrente==='SIM'; if(!t.recorrenteId && t.recorrente) t.recorrenteId=t.id; });
  st.metas.forEach(m=>{ m.objetivo=num(m.objetivo); m.destinado=num(m.destinado); m.retiradaMensal=num(m.retiradaMensal); delete m.classificacao; });
  st.receitasRecorrentes.forEach(r=>{ r.valorPrevisto=num(r.valorPrevisto); if(r.ativo===undefined) r.ativo=true; });
  return st;
}
function loadState(){
  try {
    const fresh=localStorage.getItem(storeKey); if(fresh) return normalize(JSON.parse(fresh));
    for(const k of oldKeys){ const old=localStorage.getItem(k); if(old) return normalize(JSON.parse(old)); }
    return clone(defaultState);
  } catch { return clone(defaultState); }
}

function syncThirdPartyLinks(){
  state.despesas.forEach(d=>{
    if(d.responsavel !== 'Terceiro') return;
    if(!d.terceiro) return;
    let r = d.terceiroReceitaId ? state.receitas.find(x=>x.id===d.terceiroReceitaId) : state.receitas.find(x=>x.linkedDespesaId===d.id);
    if(!r){
      r = {id:id(), createdAt:today, linkedDespesaId:d.id, origem:'Terceiro', data:d.data, descricao:`A receber - ${d.descricao}`, valor:num(d.valorPrevisto), pessoa:['Larissa','Davi'].includes(d.pagador)?d.pagador:'Larissa', tipo:'Reembolso de terceiro', status:'Pendente', terceiro:d.terceiro};
      state.receitas.push(r); d.terceiroReceitaId = r.id;
    } else {
      d.terceiroReceitaId = r.id; r.linkedDespesaId = d.id; r.origem='Terceiro'; r.terceiro=d.terceiro; r.tipo='Reembolso de terceiro';
      if(r.status !== 'Confirmada'){
        r.data=d.data; r.descricao=`A receber - ${d.descricao}`; r.valor=num(d.valorPrevisto); r.pessoa=['Larissa','Davi'].includes(d.pagador)?d.pagador:'Larissa';
      }
      d.recebimentoTerceiroStatus = r.status === 'Confirmada' ? 'Recebido' : 'Pendente';
      d.valorRecebidoTerceiro = r.status === 'Confirmada' ? num(r.valor) : 0;
    }
  });
  state.receitas.filter(r=>r.linkedDespesaId).forEach(r=>{
    const d=state.despesas.find(x=>x.id===r.linkedDespesaId);
    if(!d){ r.linkedDespesaId=''; r.observacao='Despesa vinculada removida'; return; }
    d.terceiroReceitaId=r.id; d.recebimentoTerceiroStatus = r.status === 'Confirmada' ? 'Recebido' : 'Pendente'; d.valorRecebidoTerceiro = r.status === 'Confirmada' ? num(r.valor) : 0;
  });
}
function save(){ syncThirdPartyLinks(); localStorage.setItem(storeKey, JSON.stringify(state)); scheduleRemoteSave(); render(); }


function init(){
  initAccessFlow();
  document.querySelectorAll('input[type="date"]').forEach(i => i.value = today);
  if(typeof dashMes !== 'undefined') dashMes.value=currentYm;
  if(typeof dashInicio !== 'undefined') dashInicio.value=currentYm+'-01';
  if(typeof dashFim !== 'undefined') dashFim.value=clampDay(currentYm,31);
  fluxoInicio.value=addMonths(currentYm+'-01',-3).slice(0,7); fluxoFim.value=addMonths(currentYm+'-01',5).slice(0,7);
  [typeof dashMes!=='undefined'?dashMes:null, typeof dashInicio!=='undefined'?dashInicio:null, typeof dashFim!=='undefined'?dashFim:null, fluxoInicio, fluxoFim].filter(Boolean).forEach(el=>el.addEventListener('change', render));
  if(typeof histInicio!=='undefined'){ histInicio.value=addMonths(currentYm+'-01',-3); histFim.value=clampDay(addMonths(currentYm+'-01',5).slice(0,7),31); [histInicio,histFim,histTipo].forEach(el=>el.addEventListener('change', render)); }
  document.querySelectorAll('#filtroStatusDespesas input, #filtroStatusReceitas input').forEach(el=>el.addEventListener('change', render));
  document.addEventListener('click', e => { const btn=e.target.closest('.collapse-btn'); if(!btn) return; const card=btn.closest('.card'); card?.classList.toggle('collapsed'); btn.textContent=card?.classList.contains('collapsed')?'▸':'▾'; });
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab,.screen').forEach(el => el.classList.remove('active'));
    btn.classList.add('active'); document.getElementById(btn.dataset.screen).classList.add('active');
  }));
  formaDespesa.addEventListener('change', applyPaymentDefaults);
  formDespesa.addEventListener('submit', saveDespesa);
  formReceita.addEventListener('submit', saveReceita);
  formReceitaRecorrente.addEventListener('submit', saveReceitaRecorrente);
  gerarReceitasBtn.addEventListener('click', gerarReceitas);
  formConta.addEventListener('submit', saveConta);
  formCartao.addEventListener('submit', saveCartao);
  formMeta.addEventListener('submit', e => { e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); state.metas.push({...data,id:id(),createdAt:today,objetivo:num(data.objetivo),retiradaMensal:num(data.retiradaMensal),destinado:0}); e.target.reset(); save(); });
  formCategoria.addEventListener('submit', e => { e.preventDefault(); const nome=new FormData(e.target).get('nome').trim(); if(nome && !state.categorias.some(c=>c.nome.toLowerCase()===nome.toLowerCase())) state.categorias.push({id:id(),nome,ativo:true,createdAt:today}); e.target.reset(); save(); });
  formTerceiro.addEventListener('submit', e => { e.preventDefault(); const nome=new FormData(e.target).get('nome').trim(); if(nome && !state.terceiros.some(t=>t.nome.toLowerCase()===nome.toLowerCase())) state.terceiros.push({id:id(),nome,ativo:true,createdAt:today}); e.target.reset(); save(); });
  if(typeof formContaConjunta!=='undefined') formContaConjunta.addEventListener('submit', saveContaConjunta);
  if(typeof recorrenteContaConjunta!=='undefined') recorrenteContaConjunta.addEventListener('change', e=>{ const st=formContaConjunta?.querySelector('[name="status"]'); if(st && e.target.checked){ st.value='Pendente'; } });
  gerarProvisoesBtn.addEventListener('click', gerarProvisoes);
  formSimulador.addEventListener('submit', e => { e.preventDefault(); simulate(Object.fromEntries(new FormData(e.target))); });
 if (typeof seedBtn !== 'undefined' && seedBtn) {
  seedBtn.addEventListener('click', seed);
}
  clearBtn.addEventListener('click', () => { if(confirm('Apagar todos os dados do BEVI?')){ state=clone(defaultState); selectedFaturaKey=''; save(); }});
  exportBtn.addEventListener('click', exportData);
  if(typeof exportCsvBtn !== 'undefined') exportCsvBtn.addEventListener('click', exportCsvData);
  if(typeof templateCsvBtn !== 'undefined') templateCsvBtn.addEventListener('click', downloadCsvTemplate);
  importFile.addEventListener('change', importData);
  applyPaymentDefaults(); setupCollapsibleCards(); render();
}
function saveReceita(e){ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); state.receitas.push({...data,id:id(),createdAt:today,tipo:'Avulsa',valor:num(data.valor),status:data.status||'Confirmada'}); e.target.reset(); e.target.data.value=today; save(); }
function saveReceitaRecorrente(e){ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); state.receitasRecorrentes.push({...data,id:id(),createdAt:today,ativo:true,valorPrevisto:num(data.valorPrevisto)}); e.target.reset(); save(); }

function saveContaConjunta(e){
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.target));
  const newId=id(); state.transferencias.push({id:newId,createdAt:today,tipo:'Conta conjunta',data:data.data,descricao:data.descricao||'Transferência para conta conjunta',de:data.de,para:'Casa',paraCaixinha:data.paraCaixinha||'Casa',valor:num(data.valor),status:data.recorrente?'Pendente':(data.status||'Confirmada'),recorrente:!!data.recorrente,recorrenteId:newId});
  e.target.reset(); e.target.data.value=today; save();
}

function saveConta(e){ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); state.contas.push({...data,id:id(),createdAt:today,ativo:true,valorPrevisto:num(data.valorPrevisto)}); e.target.reset(); save(); }
function saveCartao(e){ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); state.cartoes.push({...data,id:id(),createdAt:today,ativo:true,fecha:num(data.fecha),vence:num(data.vence)}); e.target.reset(); save(); }
function applyPaymentDefaults(){ statusDespesa.value = formaDespesa.value === 'Cartão de crédito' ? 'Pendente' : 'Pago'; }

function faturaKey(cartao, ref){ return `${cartao}|${ref}`; }
function getCard(nome){ return state.cartoes.find(c=>c.nome===nome); }
function faturaRef(dataStr, cartaoNome){
  const card = getCard(cartaoNome); if(!card || !dataStr) return ym(dataStr);
  const d = new Date(dataStr+'T00:00:00');
  if(d.getDate() > Number(card.fecha || 31)) d.setMonth(d.getMonth()+1);
  return d.toISOString().slice(0,7);
}
function vencimentoFatura(cartao, ref){ const card=getCard(cartao); return card ? clampDay(ref, card.vence) : clampDay(ref, 10); }
function getFaturaRecord(cartao, ref, create=false){
  let f=state.faturas.find(x=>x.cartao===cartao && x.ref===ref);
  if(!f && create){ f={id:id(),cartao,ref,status:'Pendente',dataPagamento:'',valorPago:0}; state.faturas.push(f); }
  return f;
}
function isFaturaPaga(cartao, ref){ return getFaturaRecord(cartao,ref)?.status === 'Pago'; }

function saveDespesa(e){
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const parcelas = Math.max(1, num(data.parcelas || 1));
  const total = num(data.valor);
  if(data.forma === 'Cartão de crédito') data.status = 'Pendente';
  if(data.responsavel === 'Terceiro') data.status = data.forma==='Cartão de crédito' ? 'Pendente' : (data.status || 'Pendente');
  const novos=[]; const grupoParcelamento = parcelas>1 ? id() : '';
  for(let i=1;i<=parcelas;i++){
    const dtStr = addMonths(data.data, i-1);
    const ref = data.forma==='Cartão de crédito'?faturaRef(dtStr,data.cartao):'';
    if(data.forma==='Cartão de crédito'){
      if(!data.cartao){ alert('Selecione o cartão de crédito.'); return; }
      if(isFaturaPaga(data.cartao, ref)){ alert(`A fatura ${data.cartao} ${ref} já está paga. Reabra a fatura para incluir essa despesa.`); return; }
      getFaturaRecord(data.cartao, ref, true);
    }
    novos.push({
      id:id(), createdAt:today, tipo:'Despesa', data:dtStr, descricao:data.descricao, valorPrevisto:total/parcelas, valorPago:data.status==='Pago'?total/parcelas:0,
      categoria:data.categoria, responsavel:data.responsavel, pagador:data.pagador, forma:data.forma, cartao:data.cartao,
      terceiro:data.terceiro, parcelas, parcelaAtual:i, grupoParcelamento, status:data.status, fatura:ref, dataPagamento:data.status==='Pago'?dtStr:''
    });
  }
  state.despesas.push(...novos);
  e.target.reset(); e.target.data.value=today; e.target.parcelas.value=1; applyPaymentDefaults(); save();
}

function dashboardMonth(){ return (typeof dashMes !== 'undefined' && dashMes.value) ? dashMes.value : currentYm; }
function inMonth(dateStr, ref=dashboardMonth()){ return ym(dateStr)===ref; }
function inRange(dateStr){ return dateStr<=clampDay(currentYm,31); }
function ownerShare(d, person){
  const v=num(d.valorPago || d.valorPrevisto);
  if(d.responsavel==='Terceiro') return 0;
  if(d.responsavel===person) return v;
  if(d.responsavel==='Casal') return v/2;
  return 0;
}
function casalOnlyValue(d){ return d.responsavel==='Casal' ? num(d.valorPago || d.valorPrevisto) : 0; }
function acertoForDespesa(d){ return state.acertos.find(a=>a.expenseId===d.id); }
function contribuicaoCasal(d){
  const total=num(d.valorPago||d.valorPrevisto); const half=total/2;
  if(d.responsavel!=='Casal' || d.status!=='Pago') return {Larissa:0,Davi:0,total:0};
  if(d.pagador==='Casal') return {Larissa:half,Davi:half,total};
  const ac=acertoForDespesa(d); const repassePago=ac ? Math.min(half, num(ac.valorParcial ?? ac.valorPago ?? 0)) : 0;
  if(d.pagador==='Larissa') return {Larissa:total-repassePago,Davi:repassePago,total};
  if(d.pagador==='Davi') return {Larissa:repassePago,Davi:total-repassePago,total};
  return {Larissa:half,Davi:half,total};
}
function totalDestinadoMetas(){ return state.metas.reduce((s,m)=>s+num(m.destinado),0); }
function totalRetiradaMensalMetas(){ return state.metas.reduce((s,m)=>s+num(m.retiradaMensal),0); }
function despesasPendentesCasa(ref=dashboardMonth()){ return state.despesas.filter(d=>d.responsavel==='Casal' && d.status!=='Pago' && inMonth(d.data,ref)).reduce((s,d)=>s+num(d.valorPrevisto),0); }
function saldoCasaReal(){
  let saldo = 0;
  // O saldo da Casa é gerenciado pela aba Conta Conjunta (transferências confirmadas).
  // Depósitos/transferências confirmadas para a conta conjunta ou caixinhas da Casa
  state.transferencias.filter(t=>!t.acertoId && (t.status||'Confirmada')!=='Pendente' && (t.para==='Casa'||t.paraCaixinha)).forEach(t=>saldo+=num(t.valor));
  // Quando a própria Casa é a pagadora, o valor sai do saldo da conta conjunta.
  state.despesas.filter(d=>d.status==='Pago' && d.responsavel==='Casal' && d.pagador==='Casal').forEach(d=>saldo-=num(d.valorPago||d.valorPrevisto));
  return saldo;
}
function materializarTransferenciasRecorrentes(ref=dashboardMonth()){
  const criadas=[];
  state.transferencias.filter(t=>t.recorrente && !t.acertoId).forEach(t=>{
    const data=clampDay(ref, Number((t.data||today).slice(8,10)) || 1);
    const exists=state.transferencias.some(x=>x.recorrenteId===t.recorrenteId && ym(x.data)===ref && x.id!==t.id);
    if(ym(t.data)!==ref && !exists){
      criadas.push({...t,id:id(),createdAt:today,data,status:'Pendente',recorrente:false,origemRecorrente:true});
    }
  });
  if(criadas.length) state.transferencias.push(...criadas);
}
function transferenciasRecorrentesPrevistas(ref){
  return state.transferencias.filter(t=>t.recorrente && !t.acertoId).filter(t=>!state.transferencias.some(x=>x.recorrenteId===t.recorrenteId && ym(x.data)===ref && x.id!==t.id)).reduce((s,t)=>s+num(t.valor),0);
}
function calcMonth(ref=dashboardMonth()){
  const rec = {Casa:0,Larissa:0,Davi:0};
  const recPendente = {Casa:0,Larissa:0,Davi:0};
  state.receitas.filter(r=>inMonth(r.data,ref)).forEach(r=>{
    const pessoa = ['Larissa','Davi'].includes(r.pessoa) ? r.pessoa : 'Larissa';
    const bucket = r.status === 'Pendente' ? recPendente : rec;
    bucket[pessoa] = (bucket[pessoa]||0)+num(r.valor);
  });
  const desp = {Casa:0,Larissa:0,Davi:0};
  const despesasPagas = state.despesas.filter(d=>d.status==='Pago' && inMonth(d.dataPagamento||d.data,ref) && d.responsavel!=='Terceiro');
  despesasPagas.forEach(d=>{
    if(d.responsavel==='Casal'){
      const c=contribuicaoCasal(d);
      rec.Casa += c.total; // contribuição automática para a Casa antes do pagamento
      desp.Casa += c.total;
      desp.Larissa += c.Larissa;
      desp.Davi += c.Davi;
    } else if(d.responsavel==='Larissa') desp.Larissa += num(d.valorPago||d.valorPrevisto);
    else if(d.responsavel==='Davi') desp.Davi += num(d.valorPago||d.valorPrevisto);
  });
  // transferências manuais para Casa/caixinhas também entram no saldo da Casa e saem do responsável
  state.transferencias.filter(t=>inMonth(t.data,ref) && !t.acertoId && (t.status||'Confirmada')!=='Pendente').forEach(t=>{
    if(t.de==='Larissa') desp.Larissa += num(t.valor);
    if(t.de==='Davi') desp.Davi += num(t.valor);
    if(t.para==='Casa' || t.paraCaixinha) rec.Casa += num(t.valor);
  });
  const receber=state.receitas.filter(r=>r.origem==='Terceiro' && r.status==='Pendente' && inMonth(r.data,ref)).reduce((s,r)=>s+num(r.valor),0);
  return {rec, recPendente, desp, saldoLarissa:rec.Larissa-desp.Larissa, saldoDavi:rec.Davi-desp.Davi, saldoCasal:rec.Casa-desp.Casa, aReceber:receber};
}
function faturaGroups(){
  const map={};
  state.despesas.filter(d=>d.forma==='Cartão de crédito').forEach(d=>{
    const k=faturaKey(d.cartao,d.fatura); const rec=getFaturaRecord(d.cartao,d.fatura,true);
    if(!map[k]) map[k]={cartao:d.cartao,ref:d.fatura,total:0,count:0,status:rec.status,dataPagamento:rec.dataPagamento,valorPago:rec.valorPago,vencimento:vencimentoFatura(d.cartao,d.fatura),casal:0,larissa:0,davi:0,terceiro:0};
    map[k].total+=num(d.valorPrevisto); map[k].count++;
    map[k].casal += d.responsavel==='Casal' ? num(d.valorPrevisto) : 0;
    map[k].larissa += ownerShare(d,'Larissa'); map[k].davi += ownerShare(d,'Davi'); if(d.responsavel==='Terceiro') map[k].terceiro += num(d.valorPrevisto);
  });
  return Object.values(map).sort((a,b)=>(a.ref+a.cartao).localeCompare(b.ref+b.cartao));
}

function render(){
  renderSelects(); renderDashboard(); renderDespesas(); renderReceitas(); renderReceitasRecorrentes(); renderContas(); renderCartoes(); renderFaturas(); renderDetalheFatura(); renderMetas(); renderCadastros(); renderContaConjunta(); renderHistorico();
}
function optionList(items, empty='Selecione') { return `<option value="">${empty}</option>` + [...items].sort(byName).map(x=>`<option>${x.nome}</option>`).join(''); }
function renderSelects(){
  const cats=state.categorias.filter(c=>c.ativo).sort(byName); const terc=state.terceiros.filter(t=>t.ativo).sort(byName);
  categoriaDespesa.innerHTML=optionList(cats,'Selecione'); categoriaConta.innerHTML=optionList(cats,'Selecione');
  terceiroDespesa.innerHTML=optionList(terc,'Não se aplica');
  cartaoDespesa.innerHTML='<option value="">Não se aplica</option>'+state.cartoes.filter(c=>c.ativo!==false).sort(byName).map(c=>`<option>${c.nome}</option>`).join('');
  if(typeof destinoContaConjunta!=='undefined') destinoContaConjunta.innerHTML='<option value="Casa">Conta conjunta da Casa</option>';
}
function renderDashboard(){
  const ref=dashboardMonth(); materializarTransferenciasRecorrentes(ref); const c=calcMonth(ref);
  const casaTotal=saldoCasaReal(); const metas=totalDestinadoMetas(); const casaDisponivel=casaTotal-metas; const pendCasa=despesasPendentesCasa(ref);
  if(typeof saldoDisponivelCasa!=='undefined') saldoDisponivelCasa.textContent=money(casaDisponivel);
  if(typeof pendenteCasaDisponivel!=='undefined') pendenteCasaDisponivel.textContent=money(pendCasa);
  if(typeof saldoDestinadoMetas!=='undefined') saldoDestinadoMetas.textContent=money(metas);
  if(typeof saldoCasaComMetas!=='undefined') saldoCasaComMetas.textContent=money(casaTotal);
  saldoLarissaMes.textContent=money(c.saldoLarissa); saldoDaviMes.textContent=money(c.saldoDavi);
  receitaRecebidaLarissa.textContent=money(c.rec.Larissa); receitaRecebidaDavi.textContent=money(c.rec.Davi);
  receitaPendenteLarissa.textContent=money(c.recPendente.Larissa); receitaPendenteDavi.textContent=money(c.recPendente.Davi);
  aReceber.textContent=money(c.aReceber); if(typeof receitaPendente !== 'undefined') receitaPendente.textContent=money(c.recPendente.Casa+c.recPendente.Larissa+c.recPendente.Davi);
  renderReceitasAConfirmar(); renderDepositosPendentes(); renderContasHojeAtraso(); renderFaturasResumoMes(ref); renderAcertos(); renderDespesasStatus(ref); renderCategoriaChart(ref); renderLinhaTempo();
}

function renderReceitasAConfirmar(){
  const ini='1900-01-01'; const fim=clampDay(currentYm,31);
  const arr=state.receitas.filter(r=>r.status==='Pendente' && r.data>=ini && r.data<=fim).sort((a,b)=>a.data.localeCompare(b.data));
  receitasAConfirmar.innerHTML=arr.length?arr.map(r=>`<div class="item ${r.data<today?'overdue':(r.data===today?'today-due':'')}"><div><strong>${r.descricao}</strong><small>${dateBR(r.data)} • ${r.pessoa} • ${r.tipo}</small></div><div class="right"><span class="amount">${money(r.valor)}</span><button class="primary" onclick="confirmarReceita('${r.id}')">Confirmar</button></div></div>`).join(''):'Nenhuma receita pendente no período selecionado.';
}
function gerarReceitas(){
  const ref=dashboardMonth(); let count=0;
  state.receitasRecorrentes.filter(r=>r.ativo!==false).forEach(r=>{
    const data=clampDay(ref,r.vencimento); const desc=r.nome;
    const exists=state.receitas.some(x=>x.recorrenteId===r.id && ym(x.data)===ref);
    if(!exists){ state.receitas.push({id:id(),recorrenteId:r.id,data,descricao:desc,valor:num(r.valorPrevisto),pessoa:r.pessoa,tipo:r.tipo,status:'Pendente'}); count++; }
  });
  alert(count?`${count} receita(s) prevista(s) gerada(s).`:'Nenhuma nova receita prevista para gerar.'); save();
}
function renderReceitasRecorrentes(){
  listaReceitasRecorrentes.innerHTML=state.receitasRecorrentes.length?[...state.receitasRecorrentes].sort(byName).map(r=>`<div class="item"><div><strong>${r.nome}</strong><small>${r.tipo} • previsto ${money(r.valorPrevisto)} • dia ${r.vencimento} • ${r.pessoa} • ${r.ativo?'Ativa':'Inativa'}</small></div><button class="ghost" onclick="toggleReceitaRecorrente('${r.id}')">${r.ativo?'Inativar':'Ativar'}</button></div>`).join(''):'Nenhuma receita recorrente cadastrada.';
}
function toggleReceitaRecorrente(i){ const r=state.receitasRecorrentes.find(x=>x.id===i); if(r){r.ativo=!r.ativo; save();} }


function renderDepositosPendentes(){
  if(typeof depositosPendentes==='undefined') return;
  const ini='1900-01-01'; const fim=clampDay(currentYm,31);
  const arr=state.transferencias.filter(t=>!t.acertoId && (t.status||'Confirmada')==='Pendente' && t.data>=ini && t.data<=fim).sort((a,b)=>a.data.localeCompare(b.data));
  depositosPendentes.innerHTML=arr.length?arr.map(t=>`<div class="item ${t.data<today?'overdue':(t.data===today?'today-due':'')}"><div><strong>${t.descricao||'Depósito conta conjunta'}</strong><small>${dateBR(t.data)} • ${t.de} → ${t.paraCaixinha||'Casa'} • ${t.data<today?'EM ATRASO':(t.data===today?'PARA HOJE':'PLANEJADO')}</small></div><div class="right"><span class="amount">${money(t.valor)}</span><button class="primary" onclick="confirmarTransferenciaConta('${t.id}')">Confirmar</button><button class="ghost" onclick="editarTransferenciaConta('${t.id}')">Ajustar</button></div></div>`).join(''):'Nenhum depósito pendente no período selecionado.';
}

function renderContasHojeAtraso(){
  const due=[];
  const ini='1900-01-01'; const fim=clampDay(currentYm,31);
  const inDashPeriod = d => d>=ini && d<=fim;
  state.despesas.filter(d=>d.status==='Pendente' && d.forma!=='Cartão de crédito' && inDashPeriod(d.data)).forEach(d=>due.push({tipo:'Despesa',data:d.data,desc:d.descricao,valor:num(d.valorPrevisto),id:d.id}));
  faturaGroups().filter(f=>f.status!=='Pago' && inDashPeriod(f.vencimento)).forEach(f=>due.push({tipo:'Fatura',data:f.vencimento,desc:`${f.cartao} - ${f.ref}`,valor:f.total,id:faturaKey(f.cartao,f.ref)}));
  const rank=x=>x.data<today?0:(x.data===today?1:2);
  due.sort((a,b)=>(rank(a)-rank(b)) || a.data.localeCompare(b.data));
  const label=x=>x.data<today?'EM ATRASO':(x.data===today?'VENCE HOJE':'PRÓXIMO PAGAMENTO');
  contasHojeAtraso.innerHTML = due.length ? due.map(x=>`<div class="item ${x.data<today?'overdue':(x.data===today?'today-due':'')}"><div><strong>${x.desc}</strong><small>${x.tipo} • ${dateBR(x.data)} • ${label(x)}</small></div><div class="right"><span class="amount">${money(x.valor)}</span>${x.tipo==='Fatura'?`<button class="primary" onclick="pagarFaturaByKey('${x.id}')">Baixar fatura</button>`:`<button class="primary" onclick="baixarDespesa('${x.id}')">Baixar</button>`}</div></div>`).join('') : 'Nenhuma conta a pagar no período selecionado.';
}
function renderFaturasResumoMes(ref){
  const arr=faturaGroups().filter(f=>f.ref===ref && f.status!=='Pago');
  const cas=arr.reduce((s,f)=>s+f.casal,0), lar=arr.reduce((s,f)=>s+f.larissa,0), dav=arr.reduce((s,f)=>s+f.davi,0);
  faturasResumoMes.innerHTML = arr.length ? `<div class="mini-table"><div class="mini-row"><strong>Total pendente casal</strong><span>${money(cas)}</span></div><div class="mini-row"><strong>Larissa</strong><span>${money(lar)}</span></div><div class="mini-row"><strong>Davi</strong><span>${money(dav)}</span></div></div>` + arr.map(f=>`<div class="item"><div><strong>${f.cartao}</strong><small>${f.count} lançamento(s) • vence ${dateBR(f.vencimento)}</small></div><div class="right"><span class="amount">${money(f.total)}</span><button class="ghost" onclick="selectFatura('${faturaKey(f.cartao,f.ref)}')">Detalhar</button></div></div>`).join('') : 'Nenhuma fatura pendente no mês selecionado.';
}
let detalheCasalAberto=false;
function toggleDetalheCasal(){ detalheCasalAberto=!detalheCasalAberto; renderDespesasStatus(dashboardMonth()); }
function renderDespesasStatus(ref){
  const base=state.despesas.filter(d=>d.responsavel!=='Terceiro' && (inMonth(d.data,ref)||inMonth(d.dataPagamento,ref)));
  const paid=base.filter(d=>d.status==='Pago').reduce((s,d)=>s+num(d.valorPago||d.valorPrevisto),0);
  const pend=base.filter(d=>d.status!=='Pago').reduce((s,d)=>s+num(d.valorPrevisto),0);
  const casalPaidItems=base.filter(d=>d.status==='Pago' && d.responsavel==='Casal');
  const casalPendItems=base.filter(d=>d.status!=='Pago' && d.responsavel==='Casal');
  const casalPaid=casalPaidItems.reduce((s,d)=>s+num(d.valorPago||d.valorPrevisto),0);
  const indPaid=paid-casalPaid;
  const casalPend=casalPendItems.reduce((s,d)=>s+num(d.valorPrevisto),0);
  const indPend=pend-casalPend;
  const contrib=casalPaidItems.reduce((acc,d)=>{ const c=contribuicaoCasal(d); acc.Larissa+=c.Larissa; acc.Davi+=c.Davi; acc.total+=c.total; return acc; },{Larissa:0,Davi:0,total:0});
  const pendHalf=casalPend/2;
  const detalhe = detalheCasalAberto ? `<div class="mini-table"><div class="mini-row"><strong>Contribuição realizada Larissa</strong><span>${money(contrib.Larissa)}</span></div><div class="mini-row"><strong>Contribuição realizada Davi</strong><span>${money(contrib.Davi)}</span></div><div class="mini-row"><strong>Pendente previsto Larissa</strong><span>${money(pendHalf)}</span></div><div class="mini-row"><strong>Pendente previsto Davi</strong><span>${money(pendHalf)}</span></div></div>` : '';
  despesasStatusResumo.innerHTML=`<div class="mini-table"><div class="mini-row"><strong>Pagas - casal</strong><span>${money(casalPaid)}</span></div><div class="mini-row"><strong>Pagas - individual</strong><span>${money(indPaid)}</span></div><div class="mini-row"><strong>Pendentes - casal</strong><span>${money(casalPend)}</span></div><div class="mini-row"><strong>Pendentes - individual</strong><span>${money(indPend)}</span></div></div><button class="ghost" onclick="toggleDetalheCasal()">${detalheCasalAberto?'Ocultar':'Expandir'} contribuição do casal</button>${detalhe}`;
}
function renderCategoriaChart(ref){
  const groups={};
  state.despesas.filter(d=>d.responsavel!=='Terceiro' && (inMonth(d.data,ref)||inMonth(d.dataPagamento,ref))).forEach(d=>{ groups[d.categoria||'Sem categoria']=(groups[d.categoria||'Sem categoria']||0)+num(d.valorPago||d.valorPrevisto); });
  const arr=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,10); const max=Math.max(...arr.map(x=>x[1]),1);
  graficoCategorias.innerHTML=arr.length?`<div class="vertical-bars">${arr.map(([cat,val])=>`<div class="vcol"><div class="vcol-bar"><span style="height:${Math.max(4,val/max*100)}%"></span></div><strong>${money(val)}</strong><small>${cat}</small></div>`).join('')}</div>`:'Sem despesas no mês.';
}
function fluxoMonth(ref){
  // Meses passados e mês atual: realizado. Meses futuros: previsto.
  return ref <= currentYm ? actualMonthFlow(ref) : projectedMonth(ref);
}
function actualMonthFlow(ref){
  const itens=[];
  state.receitas.filter(r=>r.status==='Confirmada' && inMonth(r.dataRecebimento||r.data,ref)).forEach(r=>itens.push({tipo:'Receita recebida',descricao:r.descricao,data:r.dataRecebimento||r.data,valor:num(r.valor),sinal:1,responsavel:r.pessoa||'-',status:r.status||'Confirmada'}));
  state.despesas.filter(d=>d.status==='Pago' && d.responsavel!=='Terceiro' && inMonth(d.dataPagamento||d.data,ref)).forEach(d=>itens.push({tipo:'Despesa paga',descricao:d.descricao,data:d.dataPagamento||d.data,valor:num(d.valorPago||d.valorPrevisto),sinal:-1,responsavel:d.responsavel||'-',status:d.status||'Pago'}));
  state.transferencias.filter(t=>!t.acertoId && (t.status||'Confirmada')!=='Pendente' && inMonth(t.dataPagamento||t.data,ref)).forEach(t=>{
    itens.push({tipo:'Transferência conta conjunta',descricao:t.descricao||'Depósito na conta conjunta',data:t.dataPagamento||t.data,valor:num(t.valor),sinal:0,responsavel:`${t.de||'-'} → Casa`,status:'Confirmada'});
  });
  const retiradas=totalRetiradaMensalMetas();
  if(retiradas) itens.push({tipo:'Retirada mensal de metas',descricao:'Valores destinados às metas no mês',data:clampDay(ref,1),valor:retiradas,sinal:-1,responsavel:'Casa',status:'Prevista'});
  const total=itens.reduce((s,i)=>s+(i.sinal*num(i.valor)),0);
  return {total,itens,modo:'Realizado'};
}
function projectedMonth(ref){
  const c=calcMonth(ref);
  const itens=[];
  const receitasPrev=state.receitasRecorrentes.filter(r=>r.ativo!==false && !state.receitas.some(x=>(x.recorrenteId===r.id || x.origemReceita===r.id) && ym(x.data)===ref)).reduce((s,r)=>{ const v=num(r.valorPrevisto); itens.push({tipo:'Receita recorrente prevista',descricao:r.nome,data:clampDay(ref,r.vencimento),valor:v,sinal:1,responsavel:r.pessoa||'-',status:'Prevista'}); return s+v; },0);
  const receitasLancadasPendentes=state.receitas.filter(r=>r.status==='Pendente' && inMonth(r.data,ref)).reduce((s,r)=>{ const v=num(r.valor); itens.push({tipo:'Receita pendente lançada',descricao:r.descricao,data:r.data,valor:v,sinal:1,responsavel:r.pessoa||'-',status:'Pendente'}); return s+v; },0);
  const despesasPrev=state.contas.filter(cn=>cn.ativo!==false && !state.despesas.some(d=>d.origemConta===cn.id && ym(d.data)===ref)).reduce((s,cn)=>{ const v=num(cn.valorPrevisto); itens.push({tipo:'Conta recorrente prevista',descricao:cn.nome,data:clampDay(ref,cn.vencimento),valor:v,sinal:-1,responsavel:cn.responsavel||'Casal',status:'Prevista'}); return s+v; },0);
  const despesasPendentesLancadas=state.despesas.filter(d=>d.status!=='Pago' && d.responsavel!=='Terceiro' && inMonth(d.data,ref)).reduce((s,d)=>{ const v=num(d.valorPrevisto); itens.push({tipo:'Despesa pendente lançada',descricao:d.descricao,data:d.data,valor:v,sinal:-1,responsavel:d.responsavel||'-',status:d.status||'Pendente'}); return s+v; },0);
  const faturasPend=faturaGroups().filter(f=>f.status!=='Pago' && f.ref===ref).reduce((s,f)=>{ const v=num(f.total); itens.push({tipo:'Fatura pendente',descricao:`${f.cartao} - ${f.ref}`,data:f.vencimento,valor:v,sinal:-1,responsavel:f.cartao,status:f.status}); return s+v; },0);
  const retiradaMetas=totalRetiradaMensalMetas();
  if(retiradaMetas) itens.push({tipo:'Retirada mensal de metas',descricao:'Valores destinados às metas no mês',data:clampDay(ref,1),valor:retiradaMetas,sinal:-1,responsavel:'Casa',status:'Prevista'});
  const transferenciasPrev=transferenciasRecorrentesPrevistas(ref);
  if(transferenciasPrev) itens.push({tipo:'Transferência recorrente conta conjunta',descricao:'Depósitos recorrentes previstos',data:clampDay(ref,1),valor:transferenciasPrev,sinal:0,responsavel:'Larissa/Davi → Casa',status:'Pendente'});
  const total=c.saldoCasal+c.saldoLarissa+c.saldoDavi+receitasPrev+receitasLancadasPendentes-despesasPrev-despesasPendentesLancadas-faturasPend-retiradaMetas;
  return {total, receitasPrev, despesasPrev, faturasPend, retiradaMetas, transferenciasPrev, itens, modo:'Previsto'};
}
function renderLinhaTempo(){
  const ini=fluxoInicio.value || addMonths(currentYm+'-01',-3).slice(0,7), fim=fluxoFim.value || addMonths(currentYm+'-01',5).slice(0,7);
  const ms=monthsBetween(ini,fim); const vals=ms.map(ref=>fluxoMonth(ref).total); const max=Math.max(...vals.map(v=>Math.abs(v)),1);
  linhaTempo.innerHTML=ms.length?`<div class="vertical-bars fluxo-bars">${ms.map((ref,i)=>{ const saldo=vals[i]; const h=Math.max(4,Math.abs(saldo)/max*100); const selected=selectedFluxoMes===ref?' selected':''; const mode=ref<=currentYm?'Realizado':'Previsto'; return `<button type="button" class="vcol fluxo-col${selected}" onclick="toggleFluxoMes('${ref}')"><div class="vcol-bar ${saldo<0?'negative':''}"><span style="height:${h}%"></span></div><strong>${money(saldo)}</strong><small>${monthName(ref)}</small><em>${mode}</em></button>`; }).join('')}</div>`:'';
  renderDetalheFluxo();
}
function toggleFluxoMes(ref){ selectedFluxoMes = selectedFluxoMes===ref ? '' : ref; renderLinhaTempo(); }
function renderDetalheFluxo(){
  if(typeof detalheFluxo==='undefined') return;
  if(!selectedFluxoMes){ detalheFluxo.textContent='Clique em um mês para ver as movimentações que formam o saldo.'; return; }
  const data=fluxoMonth(selectedFluxoMes); const itens=(data.itens||[]).sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  detalheFluxo.innerHTML=`<div class="item selected-summary"><div><strong>${monthName(selectedFluxoMes)} — ${data.modo}</strong><small>Total demonstrado no fluxo: ${money(data.total)}. Clique no mês novamente para remover a seleção.</small></div></div>` + (itens.length?itens.map(i=>`<div class="item"><div><strong>${i.tipo}: ${i.descricao}</strong><small>${dateBR(i.data)} • ${i.responsavel||'-'} • ${i.status||'-'}</small></div><div class="right"><span class="amount ${i.sinal<0?'negative-text':''}">${i.sinal<0?'- ':i.sinal>0?'+ ':''}${money(i.valor)}</span></div></div>`).join(''):'<p class="muted">Nenhuma movimentação detalhada encontrada para este mês.</p>');
}
function selectedStatuses(containerId){ return [...document.querySelectorAll(`#${containerId} input:checked`)].map(x=>x.value); }
function renderDespesas(){
  const statuses=selectedStatuses('filtroStatusDespesas');
  const sorted=[...state.despesas].filter(d=>statuses.includes(d.status||'Pendente')).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  listaDespesas.innerHTML='';
  if(!sorted.length){listaDespesas.textContent='Nenhuma despesa ainda.'; return;}
  const printed=new Set();
  sorted.forEach(x=>{
    if(x.parcelas>1 && x.grupoParcelamento){
      if(printed.has(x.grupoParcelamento)) return; printed.add(x.grupoParcelamento);
      const itens=state.despesas.filter(d=>d.grupoParcelamento===x.grupoParcelamento).sort((a,b)=>a.parcelaAtual-b.parcelaAtual);
      const pendentes=itens.filter(d=>d.status!=='Pago' && d.status!=='Recebido');
      const atual=pendentes[0] || itens[itens.length-1];
      const totalPendente=pendentes.reduce((s,d)=>s+num(d.valorPrevisto),0);
      const status = pendentes.length ? 'pend' : 'ok';
      const labelStatus = pendentes.length ? 'Pendente' : 'Quitado';
      const actions = `<button class="ghost" onclick="expandirParcelas('${x.grupoParcelamento}')">Ver parcelas</button><button class="ghost" onclick="editarDespesa('${atual.id}')">Editar parcela</button>`;
      listaDespesas.insertAdjacentHTML('beforeend',`<div class="item"><div><strong>${x.descricao}</strong><small>Parcelado • parcela ${atual.parcelaAtual}/${x.parcelas} • valor da parcela ${money(atual.valorPrevisto)} • total pendente ${money(totalPendente)} • ${x.categoria||'Sem categoria'} • resp.: ${x.responsavel} • ${x.forma}${x.cartao?` • ${x.cartao}`:''}</small></div><div class="right"><span class="amount">${money(totalPendente)}</span><span class="badge ${status}">${labelStatus}</span>${actions}</div></div>`);
      return;
    }
    const status = x.status==='Pago'?'ok':'pend';
    const recInfo = x.responsavel==='Terceiro' ? ` • recebimento: ${x.recebimentoTerceiroStatus==='Recebido'?'Recebido':'Pendente em Receitas'}` : '';
    const actions = `${x.status!=='Pago'&&x.responsavel!=='Terceiro'&&x.forma!=='Cartão de crédito'?`<button class="ghost" onclick="baixarDespesa('${x.id}')">Baixar</button>`:''}<button class="ghost" onclick="editarDespesa('${x.id}')">Ajustar</button><button class="ghost" onclick="removeDespesa('${x.id}')">Excluir</button>`;
    listaDespesas.insertAdjacentHTML('beforeend',`<div class="item"><div><strong>${x.descricao}</strong><small>${dateBR(x.data)} • ${x.categoria||'Sem categoria'} • resp.: ${x.responsavel}${x.terceiro?` • terceiro: ${x.terceiro}`:''} • pagador: ${x.pagador} • ${x.forma}${x.cartao?` • ${x.cartao} • fatura ${x.fatura}`:''}${recInfo}</small></div><div class="right"><span class="amount">${money(x.valorPrevisto)}</span><span class="badge ${status}">${x.status}</span>${actions}</div></div>`);
  });
}
function expandirParcelas(grupo){
  const itens=state.despesas.filter(d=>d.grupoParcelamento===grupo).sort((a,b)=>a.parcelaAtual-b.parcelaAtual);
  alert(itens.map(d=>`${d.parcelaAtual}/${d.parcelas} - ${dateBR(d.data)} - ${money(d.valorPrevisto)} - ${d.status}${d.fatura?' - fatura '+d.fatura:''}`).join('\n'));
}
function renderReceitas(){ const statuses=selectedStatuses('filtroStatusReceitas'); const arr=[...state.receitas].filter(r=>statuses.includes(r.status||'Confirmada')).sort((a,b)=>(b.data||'').localeCompare(a.data||'')); listaReceitas.innerHTML=arr.length?arr.map(r=>{ const vinc=r.linkedDespesaId?' • vinculada à despesa':''; const terc=r.terceiro?` • terceiro: ${r.terceiro}`:''; return `<div class="item"><div><strong>${r.descricao}</strong><small>${dateBR(r.data)} • ${r.pessoa} • ${r.tipo||'Avulsa'} • ${r.status||'Confirmada'}${terc}${vinc}</small></div><div class="right"><span class="amount">${money(r.valor)}</span>${r.status==='Pendente'?`<button class="ghost" onclick="confirmarReceita('${r.id}')">Confirmar recebimento</button>`:''}<button class="ghost" onclick="editarReceita('${r.id}')">Ajustar</button><button class="ghost" onclick="removeReceita('${r.id}')">Excluir</button></div></div>`; }).join(''):'Nenhuma receita neste filtro.'; }
function renderContas(){ listaContas.innerHTML=state.contas.length?[...state.contas].sort(byName).map(c=>`<div class="item"><div><strong>${c.nome}</strong><small>${c.tipo} • previsto ${money(c.valorPrevisto)} • vence dia ${c.vencimento} • ${c.categoria} • ${c.ativo?'Ativa':'Inativa'}</small></div><button class="ghost" onclick="toggleConta('${c.id}')">${c.ativo?'Inativar':'Ativar'}</button></div>`).join(''):'Nenhuma conta recorrente cadastrada.'; }
function renderCartoes(){ listaCartoes.innerHTML=state.cartoes.length?[...state.cartoes].sort(byName).map(c=>`<div class="item"><div><strong>${c.nome}</strong><small>Dono: ${c.dono} • fecha dia ${c.fecha} • vence dia ${c.vence} • ${c.ativo===false?'Inativo':'Ativo'}</small></div><button class="ghost" onclick="toggleCartao('${c.id}')">${c.ativo===false?'Ativar':'Inativar'}</button></div>`).join(''):'Nenhum cartão cadastrado.'; }
function renderFaturas(){
  const arr=faturaGroups();
  listaFaturas.innerHTML=arr.length?arr.map(f=>`<div class="item ${f.status==='Pago'?'locked':''}"><div><strong>${f.cartao} - ${f.ref}</strong><small>${f.count} lançamento(s) • vencimento ${dateBR(f.vencimento)} • ${f.status}${f.status==='Pago'?` em ${dateBR(f.dataPagamento)}`:''}</small></div><div class="right"><span class="amount">${money(f.total)}</span><button class="ghost" onclick="selectFatura('${faturaKey(f.cartao,f.ref)}')">Detalhar</button>${f.status==='Pago'?`<button class="danger" onclick="reabrirFatura('${faturaKey(f.cartao,f.ref)}')">Reabrir</button>`:`<button class="primary" onclick="pagarFaturaByKey('${faturaKey(f.cartao,f.ref)}')">Baixar fatura</button>`}</div></div>`).join(''):'Nenhuma fatura.';
}
function renderDetalheFatura(){
  if(!selectedFaturaKey){ detalheFatura.textContent='Clique em “Detalhar” em uma fatura.'; return; }
  const [cartao,ref]=selectedFaturaKey.split('|'); const f=getFaturaRecord(cartao,ref,true); const itens=state.despesas.filter(d=>d.cartao===cartao && d.fatura===ref).sort((a,b)=>a.data.localeCompare(b.data));
  if(!itens.length){ detalheFatura.textContent='Nenhum lançamento nesta fatura.'; return; }
  const total=itens.reduce((s,d)=>s+num(d.valorPrevisto),0);
  detalheFatura.innerHTML=`<div class="item"><div><strong>${cartao} - ${ref}</strong><small>Status: ${f.status} • vencimento ${dateBR(vencimentoFatura(cartao,ref))}</small></div><div class="right"><span class="amount">${money(total)}</span>${f.status==='Pago'?`<button class="danger" onclick="reabrirFatura('${selectedFaturaKey}')">Reabrir</button>`:`<button class="primary" onclick="pagarFaturaByKey('${selectedFaturaKey}')">Baixar fatura</button>`}</div></div>` + itens.map(d=>`<div class="item"><div><strong>${d.descricao}</strong><small>${dateBR(d.data)} • ${d.categoria} • resp.: ${d.responsavel}${d.terceiro?` • terceiro: ${d.terceiro}`:''}${d.parcelas>1?` • ${d.parcelaAtual}/${d.parcelas}`:''}</small></div><div class="right"><span class="amount">${money(d.valorPrevisto)}</span><span class="badge ${d.status==='Pago'?'ok':'pend'}">${d.status}</span>${f.status!=='Pago'?`<button class="ghost" onclick="editarDespesa('${d.id}')">Ajustar</button>`:''}</div></div>`).join('');
}
function renderMetas(){
  const casaReal=saldoCasaReal(); const destinado=totalDestinadoMetas(); const disponivel=casaReal-destinado;
  if(typeof painelDestinacaoMetas!=='undefined') painelDestinacaoMetas.innerHTML=state.metas.length?`<div class="mini-table"><div class="mini-row"><strong>Saldo da Casa disponível para destinar</strong><span>${money(disponivel)}</span></div><div class="mini-row"><strong>Total destinado às metas</strong><span>${money(destinado)}</span></div></div>` + [...state.metas].sort(byName).map(m=>`<div class="item"><div><strong>${m.nome}</strong><small>Destinado ${money(m.destinado)} • objetivo ${money(m.objetivo)} • disponível casa ${money(disponivel)}</small></div><div class="right"><button class="primary" onclick="destinarMeta('${m.id}')">Destinar saldo</button><button class="ghost" onclick="retirarMeta('${m.id}')">Retirar</button></div></div>`).join(''):'Nenhuma meta cadastrada.';
  listaMetas.innerHTML=state.metas.length?[...state.metas].sort(byName).map(m=>{ const objetivo=num(m.objetivo), destinado=num(m.destinado); const pct=objetivo?Math.min(100,destinado/objetivo*100):0; return `<div class="item"><div><strong>${m.nome}</strong><small>prazo ${dateBR(m.prazo)} • prioridade ${m.prioridade} • retirada mensal ${money(m.retiradaMensal)} • destinado ${money(destinado)} de ${money(objetivo)} • ${pct.toFixed(0)}%</small><div class="bar"><span style="width:${pct}%"></span></div></div><div class="right"><button class="ghost" onclick="editarMeta('${m.id}')">Ajustar</button><button class="ghost" onclick="removeMeta('${m.id}')">Excluir</button></div></div>`; }).join(''):'Nenhuma meta cadastrada.';
}



function renderContaConjunta(){
  if(typeof listaContaConjunta==='undefined') return;
  materializarTransferenciasRecorrentes(dashboardMonth());
  const confirmadas=state.transferencias.filter(t=>!t.acertoId && (t.status||'Confirmada')!=='Pendente');
  const pendentes=state.transferencias.filter(t=>!t.acertoId && (t.status||'Confirmada')==='Pendente');
  const saldoCasa=saldoCasaReal();
  const lar=confirmadas.filter(t=>t.de==='Larissa').reduce((s,t)=>s+num(t.valor),0);
  const dav=confirmadas.filter(t=>t.de==='Davi').reduce((s,t)=>s+num(t.valor),0);
  const pend=pendentes.reduce((s,t)=>s+num(t.valor),0);
  resumoContaConjunta.innerHTML=`<div class="mini-table"><div class="mini-row"><strong>Saldo confirmado da Casa</strong><span>${money(saldoCasa)}</span></div><div class="mini-row"><strong>Transferido por Larissa</strong><span>${money(lar)}</span></div><div class="mini-row"><strong>Transferido por Davi</strong><span>${money(dav)}</span></div><div class="mini-row"><strong>Depósitos pendentes</strong><span>${money(pend)}</span></div></div>`;
  const arr=[...state.transferencias].filter(t=>!t.acertoId).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  listaContaConjunta.innerHTML=arr.length?arr.map(t=>`<div class="item"><div><strong>${t.descricao||'Transferência para conta conjunta'}</strong><small>${dateBR(t.data)} • ${t.de} → ${t.paraCaixinha||'Casa'} • ${t.status||'Confirmada'}${t.recorrente?' • recorrente mensal':''}${t.origemRecorrente?' • gerada de recorrência':''}</small></div><div class="right"><span class="amount">${money(t.valor)}</span>${(t.status||'Confirmada')==='Pendente'?`<button class="primary" onclick="confirmarTransferenciaConta('${t.id}')">Confirmar</button>`:''}<button class="ghost" onclick="editarTransferenciaConta('${t.id}')">Ajustar</button><button class="ghost" onclick="removeTransferenciaConta('${t.id}')">Excluir</button></div></div>`).join(''):'Nenhuma transferência cadastrada.';
}


function activeFirstByName(a,b){
  const aa = a.ativo === false ? 1 : 0;
  const bb = b.ativo === false ? 1 : 0;
  if(aa !== bb) return aa - bb;
  return byName(a,b);
}
function renderCadastros(){
  if(typeof listaCategorias !== 'undefined'){
    listaCategorias.innerHTML = state.categorias.length ? [...state.categorias].sort(activeFirstByName).map(c=>`<div class="item"><div><strong>${c.nome}</strong><small>${c.ativo===false?'Inativa':'Ativa'}</small></div><div class="right"><button class="ghost" onclick="toggleCategoria('${c.id}')">${c.ativo===false?'Ativar':'Inativar'}</button></div></div>`).join('') : 'Nenhuma categoria cadastrada.';
  }
  if(typeof listaTerceiros !== 'undefined'){
    listaTerceiros.innerHTML = state.terceiros.length ? [...state.terceiros].sort(activeFirstByName).map(t=>`<div class="item"><div><strong>${t.nome}</strong><small>${t.ativo===false?'Inativo':'Ativo'}</small></div><div class="right"><button class="ghost" onclick="toggleTerceiro('${t.id}')">${t.ativo===false?'Ativar':'Inativar'}</button></div></div>`).join('') : 'Nenhum terceiro cadastrado.';
  }
}

function setupCollapsibleCards(){
  document.querySelectorAll('.card > h2').forEach(h=>{
    if(h.querySelector('.collapse-btn')) return;
    const btn=document.createElement('button'); btn.type='button'; btn.className='collapse-btn'; btn.textContent='▾'; btn.title='Ocultar/minimizar seção';
    h.prepend(btn);
  });
}
function getAcertoForExpense(expenseId){ return state.acertos.find(a=>a.expenseId===expenseId); }
function acertoBaseForDespesa(d){
  const paidBy = d.pagador;
  const resp = d.responsavel;
  const total = num(d.valorPago || d.valorPrevisto);
  if(d.status !== 'Pago' || !['Larissa','Davi'].includes(paidBy)) return null;
  if(resp === 'Casal'){
    return { valor: total/2, de: paidBy === 'Larissa' ? 'Davi' : 'Larissa', para: paidBy, motivo:'Despesa do casal paga por um' };
  }
  if(['Larissa','Davi'].includes(resp) && resp !== paidBy){
    return { valor: total, de: resp, para: paidBy, motivo:`Despesa individual de ${resp} paga por ${paidBy}` };
  }
  return null;
}
function pendingAcertos(){
  const arr=[];
  state.despesas.filter(d=>d.status==='Pago' && ['Casal','Larissa','Davi'].includes(d.responsavel)).forEach(d=>{
    const base = acertoBaseForDespesa(d);
    if(!base) return;
    const ac=getAcertoForExpense(d.id);
    if(ac && ac.status!=='Pendente') return;
    const remaining= ac ? Math.max(0, num(base.valor) - num(ac.valorPago)) : num(base.valor);
    if(remaining<=0) return;
    arr.push({expenseId:d.id,descricao:d.descricao,data:d.dataPagamento||d.data,valor:remaining,valorOriginal:base.valor,de:base.de,para:base.para,motivo:base.motivo});
  });
  return arr.sort((a,b)=>a.de.localeCompare(b.de)||a.data.localeCompare(b.data));
}

function histDate(x){ return x.createdAt || x.dataLancamento || x.data || x.dataPagamento || x.dataRecebimento || today; }
function renderHistorico(){
  if(typeof listaHistorico==='undefined') return;
  const ini = histInicio?.value || '1900-01-01';
  const fim = histFim?.value || '2999-12-31';
  const tipoFiltro = histTipo?.value || 'Todos';
  const rows=[];
  state.despesas.forEach(d=>{
    rows.push({tipo:'Despesa', descricao:d.descricao, pessoa:d.responsavel, valor:num(d.valorPago||d.valorPrevisto), status:d.status||'Pendente', lancamento:histDate(d), vencimento:d.forma==='Cartão de crédito'?vencimentoFatura(d.cartao,d.fatura):d.data, pagamento:d.dataPagamento||'', detalhe:`${d.categoria||'Sem categoria'} • pagador: ${d.pagador||'-'}${d.cartao?` • ${d.cartao} • fatura ${d.fatura}`:''}${d.terceiro?` • terceiro: ${d.terceiro}`:''}`});
  });
  state.receitas.forEach(r=>{
    rows.push({tipo:'Receita', descricao:r.descricao, pessoa:r.pessoa, valor:num(r.valor), status:r.status||'Confirmada', lancamento:histDate(r), vencimento:r.data, pagamento:r.dataRecebimento || (r.status==='Confirmada'?r.data:''), detalhe:`${r.tipo||'Avulsa'}${r.terceiro?` • terceiro: ${r.terceiro}`:''}${r.linkedDespesaId?' • vinculada à despesa':''}`});
  });
  faturaGroups().forEach(f=>{
    rows.push({tipo:'Fatura', descricao:`${f.cartao} - ${f.ref}`, pessoa:f.cartao, valor:num(f.valorPago||f.total), status:f.status, lancamento:f.ref+'-01', vencimento:f.vencimento, pagamento:f.dataPagamento||'', detalhe:`${f.count} lançamento(s) • casal ${money(f.casal)} • Larissa ${money(f.larissa)} • Davi ${money(f.davi)} • terceiros ${money(f.terceiro)}`});
  });
  state.transferencias.forEach(t=>{
    rows.push({tipo:'Transferência', descricao:t.descricao||'Transferência/repasse', pessoa:`${t.de||'-'} → ${t.paraCaixinha||t.para||'-'}`, valor:num(t.valor), status:(t.status==='Pendente'?'Pendente':'Executada'), lancamento:histDate(t), vencimento:t.data, pagamento:(t.status==='Pendente'?'':(t.dataPagamento||t.data)), detalhe:t.acertoId?'Repasse vinculado':'Conta conjunta/Casa'});
  });
  const filtered=rows.filter(r=>(tipoFiltro==='Todos'||r.tipo===tipoFiltro) && r.lancamento>=ini && r.lancamento<=fim).sort((a,b)=>(b.lancamento+b.tipo).localeCompare(a.lancamento+a.tipo));
  listaHistorico.innerHTML=filtered.length?filtered.map(r=>`<div class="item"><div><strong>${r.tipo}: ${r.descricao}</strong><small>Data lançamento: ${dateBR(r.lancamento)} • Vencimento: ${dateBR(r.vencimento)} • Pagamento/recebimento: ${dateBR(r.pagamento)} • ${r.pessoa||'-'}</small><small>${r.detalhe}</small></div><div class="right"><span class="amount">${money(r.valor)}</span><span class="badge ${['Pago','Confirmada','Executada','Recebido'].includes(r.status)?'ok':'pend'}">${r.status}</span></div></div>`).join(''):'Nenhuma movimentação no período selecionado.';
}

function renderAcertos(){
  const arr=pendingAcertos();
  if(typeof listaAcertos==='undefined') return;
  listaAcertos.innerHTML=arr.length?arr.map(a=>`<div class="item"><div><strong>${a.de} precisa repassar para ${a.para}</strong><small>${a.descricao} • ${a.motivo||'Repasse'} • ${dateBR(a.data)} • valor pendente ${money(a.valor)}</small></div><div class="right"><span class="amount">${money(a.valor)}</span><button class="primary" onclick="pagarAcerto('${a.expenseId}')">Pagar</button><button class="ghost" onclick="assumirAcerto('${a.expenseId}')">Assumir</button><button class="ghost" onclick="pagarParcialAcerto('${a.expenseId}')">Pagar parcial</button></div></div>`).join(''):'Nenhum repasse pendente entre Larissa e Davi.';
}
function ensureAcerto(expenseId){
  const d=state.despesas.find(x=>x.id===expenseId); if(!d) return null;
  const base = acertoBaseForDespesa(d); if(!base) return null;
  let ac=getAcertoForExpense(expenseId);
  const valor=num(base.valor);
  if(!ac){
    ac={id:id(),expenseId,descricao:d.descricao,data:today,de:base.de,para:base.para,valor,valorPago:0,status:'Pendente',motivo:base.motivo};
    state.acertos.push(ac);
  } else if(ac.status==='Pendente'){
    ac.descricao=d.descricao; ac.de=base.de; ac.para=base.para; ac.valor=valor; ac.motivo=base.motivo;
  }
  return ac;
}
function pagarAcerto(expenseId){
  const ac=ensureAcerto(expenseId); if(!ac) return;
  const restante=Math.max(0,num(ac.valor)-num(ac.valorPago));
  state.transferencias.push({id:id(),createdAt:today,data:today,descricao:`Repasse: ${ac.descricao}`,de:ac.de,para:ac.para,valor:restante,acertoId:ac.id});
  ac.valorPago=num(ac.valor); ac.status='Pago'; ac.dataConclusao=today; save();
}
function assumirAcerto(expenseId){
  const ac=ensureAcerto(expenseId); if(!ac) return;
  ac.status='Assumido'; ac.dataConclusao=today; save();
}
function pagarParcialAcerto(expenseId){
  const ac=ensureAcerto(expenseId); if(!ac) return;
  const restante=Math.max(0,num(ac.valor)-num(ac.valorPago));
  const val=prompt('Qual valor será repassado? A diferença será assumida.', restante.toFixed(2)); if(val===null) return;
  const pago=Math.min(restante,num(val));
  if(pago>0) state.transferencias.push({id:id(),createdAt:today,data:today,descricao:`Repasse parcial: ${ac.descricao}`,de:ac.de,para:ac.para,valor:pago,acertoId:ac.id});
  ac.valorPago=num(ac.valor); ac.valorParcial=pago; ac.valorAssumido=restante-pago; ac.status='Parcial + assumido'; ac.dataConclusao=today; save();
}



function confirmarTransferenciaConta(i){
  const t=state.transferencias.find(x=>x.id===i); if(!t) return;
  const val=prompt('Confirme o valor transferido:', num(t.valor).toFixed(2)); if(val===null) return;
  t.valor=num(val); t.status='Confirmada'; t.dataPagamento=today; save();
}
function editarTransferenciaConta(i){
  const t=state.transferencias.find(x=>x.id===i); if(!t) return;
  const descricao=askField('Descrição:', t.descricao||'Transferência para conta conjunta'); if(descricao===null) return;
  const data=askField('Data (AAAA-MM-DD):', t.data); if(data===null) return;
  const valor=askField('Valor:', num(t.valor).toFixed(2)); if(valor===null) return;
  const de=askField('Quem transfere (Larissa/Davi):', t.de||'Larissa'); if(de===null) return;
  const destino=askField('Destino (Casa ou nome da caixinha):', t.paraCaixinha||'Casa'); if(destino===null) return;
  const status=askField('Status (Confirmada/Pendente):', t.status||'Confirmada'); if(status===null) return;
  const recorrente=askField('Recorrente mensal? (SIM/NÃO):', t.recorrente?'SIM':'NÃO'); if(recorrente===null) return;
  t.descricao=descricao; t.data=data; t.valor=num(valor); t.de=de==='Davi'?'Davi':'Larissa'; t.para='Casa'; t.paraCaixinha=destino||'Casa'; t.recorrente=String(recorrente).trim().toUpperCase().startsWith('S'); t.status=t.recorrente?'Pendente':(status==='Pendente'?'Pendente':'Confirmada'); if(t.recorrente && !t.recorrenteId) t.recorrenteId=t.id; if(t.status==='Pendente') t.dataPagamento=''; else t.dataPagamento=t.dataPagamento||today; save();
}
function removeTransferenciaConta(i){ if(confirm('Excluir esta transferência?')){ state.transferencias=state.transferencias.filter(t=>t.id!==i); save(); } }

function baixarDespesa(i){ const d=state.despesas.find(x=>x.id===i); if(!d) return; const val=prompt('Confirme o valor pago:', num(d.valorPrevisto).toFixed(2)); if(val===null) return; d.valorPago=num(val); d.status='Pago'; d.dataPagamento=today; save(); }
function askField(label, current){ const v=prompt(label, current ?? ''); return v===null ? null : v; }
function editarDespesa(i){
  const d=state.despesas.find(x=>x.id===i); if(!d) return;
  if(d.forma==='Cartão de crédito' && isFaturaPaga(d.cartao,d.fatura)){ alert('Esta fatura está paga. Reabra a fatura para alterar qualquer informação do lançamento.'); return; }
  const descricao=askField('Descrição:', d.descricao); if(descricao===null) return;
  const data=askField('Data da despesa (AAAA-MM-DD):', d.data); if(data===null) return;
  const valor=askField('Valor previsto:', num(d.valorPrevisto).toFixed(2)); if(valor===null) return;
  const status=askField('Status (Pago/Pendente/A receber/Recebido):', d.status||'Pendente'); if(status===null) return;
  const categoria=askField('Categoria:', d.categoria||''); if(categoria===null) return;
  const responsavel=askField('Responsável (Casal/Larissa/Davi/Terceiro):', d.responsavel||'Casal'); if(responsavel===null) return;
  const pagador=askField('Quem pagou/pagará (Larissa/Davi/Casal):', d.pagador||'Larissa'); if(pagador===null) return;
  d.descricao=descricao; d.data=data; d.valorPrevisto=num(valor); d.status=status; d.categoria=categoria; d.responsavel=responsavel; d.pagador=pagador;
  if(status==='Pago'){ const vp=askField('Valor pago:', num(d.valorPago||d.valorPrevisto).toFixed(2)); if(vp===null) return; d.valorPago=num(vp); d.dataPagamento=d.dataPagamento||today; }
  else { d.valorPago=0; d.dataPagamento=''; }
  if(d.forma==='Cartão de crédito') d.fatura=faturaRef(d.data,d.cartao);
  if(d.responsavel==='Terceiro') syncThirdPartyLinks();
  save();
}
function editarReceita(i){
  const r=state.receitas.find(x=>x.id===i); if(!r) return;
  const d=r.linkedDespesaId ? state.despesas.find(x=>x.id===r.linkedDespesaId) : null;
  if(d && d.forma==='Cartão de crédito' && isFaturaPaga(d.cartao,d.fatura)){ alert('Esta receita está vinculada a uma despesa de fatura paga. Para alterar informações vinculadas, reabra a fatura. Você ainda pode confirmar o recebimento pela ação de confirmação.'); return; }
  const descricao=askField('Descrição:', r.descricao); if(descricao===null) return;
  const data=askField('Data da receita (AAAA-MM-DD):', r.data); if(data===null) return;
  const valor=askField('Valor:', num(r.valor).toFixed(2)); if(valor===null) return;
  const pessoa=askField('Pessoa (Larissa/Davi):', ['Larissa','Davi'].includes(r.pessoa)?r.pessoa:'Larissa'); if(pessoa===null) return;
  const status=askField('Status (Confirmada/Pendente):', r.status||'Confirmada'); if(status===null) return;
  r.descricao=descricao; r.data=data; r.valor=num(valor); r.pessoa=pessoa==='Davi'?'Davi':'Larissa'; r.status=status;
  if(d){ d.valorPrevisto=r.valor; if(d.status==='Pago') d.valorPago=r.valor; d.data=r.data; d.terceiro=r.terceiro; }
  save();
}
function selectFatura(key){ selectedFaturaKey=key; renderDetalheFatura(); document.querySelector('[data-screen="cartoes"]').click(); }
function pagarFaturaByKey(key){ const [cartao,ref]=key.split('|'); pagarFatura(cartao,ref); }
function pagarFatura(cartao, ref){
  const f=getFaturaRecord(cartao,ref,true); if(f.status==='Pago'){ alert('Fatura já está paga.'); return; }
  const itens=state.despesas.filter(d=>d.cartao===cartao && d.fatura===ref && d.status!=='Pago'); if(!itens.length) return;
  const total=itens.reduce((s,d)=>s+num(d.valorPrevisto),0); const val=prompt(`Confirmar pagamento da fatura ${cartao} ${ref}:`, total.toFixed(2)); if(val===null) return;
  const pago=num(val)||total; const fator=total?pago/total:1; itens.forEach(d=>{ d.status='Pago'; d.valorPago=num(d.valorPrevisto)*fator; d.dataPagamento=today; });
  f.status='Pago'; f.valorPago=pago; f.dataPagamento=today; save();
}
function reabrirFatura(key){ const [cartao,ref]=key.split('|'); const f=getFaturaRecord(cartao,ref,true); if(!confirm(`Reabrir a fatura ${cartao} ${ref}? Isso permitirá incluir/editar lançamentos novamente.`)) return; f.status='Pendente'; f.valorPago=0; f.dataPagamento=''; state.despesas.filter(d=>d.cartao===cartao && d.fatura===ref).forEach(d=>{ d.status='Pendente'; d.valorPago=0; d.dataPagamento=''; }); save(); }
function gerarProvisoes(){
  const ref=dashboardMonth(); const created=[];
  state.contas.filter(c=>c.ativo!==false).forEach(c=>{
    const data=clampDay(ref,c.vencimento); const exists=state.despesas.some(d=>d.origemConta===c.id && ym(d.data)===ref);
    if(!exists){ state.despesas.push({id:id(),createdAt:today,tipo:'Despesa',origemConta:c.id,data,descricao:c.nome,valorPrevisto:num(c.valorPrevisto),valorPago:0,categoria:c.categoria,responsavel:c.responsavel,pagador:c.pagador,forma:'Pix/Débito',cartao:'',terceiro:'',parcelas:1,parcelaAtual:1,status:'Pendente'}); created.push(c.nome); }
  });
  alert(created.length?`Provisões geradas: ${created.join(', ')}`:'As provisões deste mês já foram geradas.'); save();
}
function toggleCategoria(i){ const x=state.categorias.find(c=>c.id===i); if(x){x.ativo=!x.ativo; save();} }
function toggleTerceiro(i){ const x=state.terceiros.find(t=>t.id===i); if(x){x.ativo=!x.ativo; save();} }
function toggleConta(i){ const x=state.contas.find(c=>c.id===i); if(x){x.ativo=!x.ativo; save();} }
function toggleCartao(i){ const x=state.cartoes.find(c=>c.id===i); if(x){x.ativo=x.ativo===false; save();} }
function toggleCaixinha(i){ const x=state.caixinhas.find(c=>c.id===i); if(x){x.ativo=!x.ativo; save();} }
function removeDespesa(i){ const d=state.despesas.find(x=>x.id===i); if(!d) return; if(d.forma==='Cartão de crédito' && isFaturaPaga(d.cartao,d.fatura)){ alert('Esta fatura está paga. Reabra a fatura para excluir/ajustar o lançamento.'); return; } if(confirm('Excluir despesa?')){ state.despesas=state.despesas.filter(x=>x.id!==i); state.receitas=state.receitas.filter(r=>r.linkedDespesaId!==i); save(); } }
function confirmarReceita(i){ const r=state.receitas.find(x=>x.id===i); if(r){ const val=prompt('Confirme o valor recebido:', num(r.valor).toFixed(2)); if(val===null) return; r.valor=num(val); r.status='Confirmada'; r.dataRecebimento=today; const d=r.linkedDespesaId?state.despesas.find(x=>x.id===r.linkedDespesaId):null; if(d){ d.recebimentoTerceiroStatus='Recebido'; d.valorRecebidoTerceiro=r.valor; } save(); } }
function removeReceita(i){ const r=state.receitas.find(x=>x.id===i); if(!r) return; if(r.linkedDespesaId && !confirm('Esta receita está vinculada a uma despesa de terceiro. Excluir mesmo assim?')) return; state.receitas=state.receitas.filter(x=>x.id!==i); const d=r.linkedDespesaId?state.despesas.find(x=>x.id===r.linkedDespesaId):null; if(d){ d.terceiroReceitaId=''; d.recebimentoTerceiroStatus='Pendente'; } save(); }
function removeMeta(i){ if(confirm('Excluir esta meta? O saldo destinado volta a ficar disponível.')){ state.metas=state.metas.filter(x=>x.id!==i); save(); } }
function editarMeta(i){
  const m=state.metas.find(x=>x.id===i); if(!m) return;
  const nome=askField('Nome da meta:', m.nome); if(nome===null) return;
  const objetivo=askField('Valor objetivo:', num(m.objetivo).toFixed(2)); if(objetivo===null) return;
  const retiradaMensal=askField('Retirada mensal:', num(m.retiradaMensal).toFixed(2)); if(retiradaMensal===null) return;
  const prazo=askField('Prazo desejado (AAAA-MM-DD):', m.prazo||''); if(prazo===null) return;
  const prioridade=askField('Prioridade (Alta/Média/Baixa):', m.prioridade||'Média'); if(prioridade===null) return;
  m.nome=nome; m.objetivo=num(objetivo); m.retiradaMensal=num(retiradaMensal); m.prazo=prazo; m.prioridade=prioridade; save();
}
function destinarMeta(i){ const m=state.metas.find(x=>x.id===i); if(!m) return; const disponivel=saldoCasaReal()-totalDestinadoMetas(); const val=prompt(`Quanto deseja destinar para ${m.nome}? Disponível: ${money(disponivel)}`, '0,00'); if(val===null) return; const v=Math.max(0,num(val)); if(v>disponivel){ alert('Valor maior que o saldo disponível da Casa.'); return; } m.destinado=num(m.destinado)+v; save(); }
function retirarMeta(i){ const m=state.metas.find(x=>x.id===i); if(!m) return; const val=prompt(`Quanto deseja retirar da meta ${m.nome}? Destinado: ${money(m.destinado)}`, num(m.destinado).toFixed(2)); if(val===null) return; m.destinado=Math.max(0,num(m.destinado)-num(val)); save(); }

function simulate(data){ const parcelas=num(data.parcelas), parcela=num(data.valorParcela), extras=num(data.extras), entrada=num(data.entrada); const start=dashboardMonth(); const end=addMonths(start+'-01', Math.min(Math.max(parcelas,1),24)-1).slice(0,7); const meses=monthsBetween(start,end); let html=`<div class="card"><h2>Resultado: ${data.nome}</h2><p class="big-note">A simulação usa receitas, despesas lançadas, faturas e recorrências cadastradas. Novo compromisso mensal: <strong>${money(parcela+extras)}</strong>. Entrada: <strong>${money(entrada)}</strong>.</p>`; let menor=Infinity, negativo=false; meses.forEach((ref,i)=>{ const base=projectedMonth(ref).total; const impacto=(i===0?entrada:0)+parcela+extras; const saldo=base-impacto; menor=Math.min(menor,saldo); if(saldo<0) negativo=true; const pct=Math.max(3,Math.min(100,50+saldo/100)); html+=`<div class="month-row"><strong>${monthName(ref)}</strong><div class="bar"><span style="width:${pct}%"></span></div><span class="${saldo<0?'badge pend':''}">${money(saldo)}</span></div>`; }); resultadoSimulador.innerHTML=html+`<p class="big-note">${negativo?'⚠️ Em pelo menos um mês o fluxo projetado fica negativo.':'✅ Pela projeção atual, a simulação cabe no fluxo.'} Menor saldo projetado: <strong>${money(menor)}</strong>.</p></div>`; }
function seed(){
  state=normalize({
    cartoes:[{id:id(),nome:'Cartão Davi',dono:'Davi',fecha:5,vence:12,ativo:true},{id:id(),nome:'Nubank Larissa',dono:'Larissa',fecha:18,vence:25,ativo:true}],
    terceiros:[{id:id(),nome:'Amiga Larissa',ativo:true},{id:id(),nome:'Mãe do Davi',ativo:true}], categorias:clone(defaultState.categorias),
    contas:[{id:id(),nome:'Energia',tipo:'Variável',valorPrevisto:280,vencimento:10,categoria:'Moradia',responsavel:'Casal',pagador:'Larissa',ativo:true},{id:id(),nome:'Internet',tipo:'Fixa',valorPrevisto:120,vencimento:15,categoria:'Moradia',responsavel:'Casal',pagador:'Davi',ativo:true}],
    metas:[{id:id(),nome:'Reforma',objetivo:60000,destinado:0,retiradaMensal:1500,prazo:'2026-12-31',prioridade:'Alta'},{id:id(),nome:'Reserva de emergência',objetivo:20000,destinado:0,retiradaMensal:500,prazo:'2026-12-31',prioridade:'Alta'}],
    receitas:[{id:id(),data:today,descricao:'Salário Larissa',valor:4000,pessoa:'Larissa',tipo:'Salário CLT',status:'Confirmada'},{id:id(),data:today,descricao:'Salário Davi',valor:3500,pessoa:'Davi',tipo:'Salário CLT',status:'Confirmada'},{id:id(),data:today,descricao:'Serviço avulso previsto',valor:800,pessoa:'Larissa',tipo:'Prestação de serviço',status:'Pendente'}],
    transferencias:[{id:id(),createdAt:today,tipo:'Conta conjunta',data:today,descricao:'Depósito planejado para conta da Casa',de:'Larissa',para:'Casa',paraCaixinha:'Casa',valor:500,status:'Pendente'}],
    despesas:[{id:id(),tipo:'Despesa',data:today,descricao:'Mercado',valorPrevisto:420,valorPago:420,categoria:'Alimentação',responsavel:'Casal',pagador:'Larissa',forma:'Pix/Débito',status:'Pago',dataPagamento:today,parcelas:1,parcelaAtual:1},{id:id(),tipo:'Despesa',data:today,descricao:'Conta individual Larissa paga por Davi',valorPrevisto:90,valorPago:90,categoria:'Outros',responsavel:'Larissa',pagador:'Davi',forma:'Pix/Débito',status:'Pago',dataPagamento:today,parcelas:1,parcelaAtual:1},{id:id(),tipo:'Despesa',data:today,descricao:'Parcela mãe do Davi',valorPrevisto:180,valorPago:0,categoria:'Terceiros',responsavel:'Terceiro',pagador:'Davi',forma:'Cartão de crédito',cartao:'Cartão Davi',terceiro:'Mãe do Davi',status:'Pendente',fatura:faturaRef(today,'Cartão Davi'),parcelas:1,parcelaAtual:1}]
  }); save();
}

function exportData(){ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='bevi-financas-backup-v16.json'; a.click(); }

const csvHeaders = ['tipo_registro','id','data','data_vencimento','data_pagamento','descricao','valor','valor_pago','status','responsavel','pagador','pessoa','categoria','forma','cartao','fatura','terceiro','parcelas','parcela_atual','tipo_conta','vencimento_dia','dono','fecha_dia','vence_dia','ativo','nome','objetivo','guardado','mensal','prioridade','de','para','recorrente','observacao'];
const templateRows = [
  {tipo_registro:'categoria',nome:'Alimentação',ativo:'SIM'},
  {tipo_registro:'terceiro',nome:'Mãe do Davi',ativo:'SIM'},
  {tipo_registro:'cartao',nome:'Nubank Larissa',dono:'Larissa',fecha_dia:'18',vence_dia:'25',ativo:'SIM'},
  {tipo_registro:'conta_recorrente_despesa',nome:'Energia',tipo_conta:'Variável',valor:'250,00',vencimento_dia:'10',categoria:'Moradia',responsavel:'Casal',pagador:'Larissa',ativo:'SIM'},
  {tipo_registro:'receita_recorrente',descricao:'Salário Larissa',valor:'4000,00',vencimento_dia:'5',pessoa:'Larissa',ativo:'SIM'},
  {tipo_registro:'despesa',data:'2026-07-10',data_vencimento:'2026-07-10',descricao:'Mercado',valor:'250,00',valor_pago:'0',status:'Pendente',responsavel:'Casal',pagador:'Larissa',categoria:'Alimentação',forma:'Pix/Débito',parcelas:'1'},
  {tipo_registro:'receita',data:'2026-07-05',descricao:'Serviço avulso',valor:'800,00',status:'Pendente',pessoa:'Larissa'},
  {tipo_registro:'conta_conjunta',data:'2026-07-05',descricao:'Depósito para Casa',valor:'500,00',status:'Pendente',de:'Larissa',para:'Casa',recorrente:'NÃO'},
  {tipo_registro:'meta',nome:'Reforma',objetivo:'60000,00',guardado:'5000,00',mensal:'1500,00',prioridade:'Alta'}
];
function csvEscape(v){ v = v ?? ''; v = String(v); return /[";\n\r]/.test(v) ? '"'+v.replaceAll('"','""')+'"' : v; }
function toCsv(rows){ return csvHeaders.join(';')+'\n'+rows.map(r=>csvHeaders.map(h=>csvEscape(r[h])).join(';')).join('\n'); }
function downloadText(name, text, type='text/csv;charset=utf-8'){ const blob=new Blob(['\ufeff'+text],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); }
function exportCsvData(){
  const rows=[];
  state.categorias.forEach(x=>rows.push({tipo_registro:'categoria',id:x.id,nome:x.nome,ativo:x.ativo===false?'NÃO':'SIM'}));
  state.terceiros.forEach(x=>rows.push({tipo_registro:'terceiro',id:x.id,nome:x.nome,ativo:x.ativo===false?'NÃO':'SIM'}));
  state.cartoes.forEach(x=>rows.push({tipo_registro:'cartao',id:x.id,nome:x.nome,dono:x.dono,fecha_dia:x.fecha,vence_dia:x.vence,ativo:x.ativo===false?'NÃO':'SIM'}));
  state.contas.forEach(x=>rows.push({tipo_registro:'conta_recorrente_despesa',id:x.id,nome:x.nome,tipo_conta:x.tipo,valor:x.valorPrevisto,vencimento_dia:x.vencimento,categoria:x.categoria,responsavel:x.responsavel,pagador:x.pagador,ativo:x.ativo===false?'NÃO':'SIM'}));
  state.receitasRecorrentes.forEach(x=>rows.push({tipo_registro:'receita_recorrente',id:x.id,descricao:x.descricao,valor:x.valorPrevisto,vencimento_dia:x.vencimento,pessoa:x.pessoa,ativo:x.ativo===false?'NÃO':'SIM'}));
  state.despesas.forEach(x=>rows.push({tipo_registro:'despesa',id:x.id,data:x.data,data_vencimento:x.data,data_pagamento:x.dataPagamento,descricao:x.descricao,valor:x.valorPrevisto,valor_pago:x.valorPago,status:x.status,responsavel:x.responsavel,pagador:x.pagador,categoria:x.categoria,forma:x.forma,cartao:x.cartao,fatura:x.fatura,terceiro:x.terceiro,parcelas:x.parcelas,parcela_atual:x.parcelaAtual,observacao:x.observacao}));
  state.receitas.forEach(x=>rows.push({tipo_registro:'receita',id:x.id,data:x.data,data_pagamento:x.dataRecebimento,descricao:x.descricao,valor:x.valor,status:x.status,pessoa:x.pessoa,terceiro:x.terceiro,observacao:x.observacao}));
  state.transferencias.forEach(x=>rows.push({tipo_registro:x.tipo==='Conta conjunta'?'conta_conjunta':'transferencia',id:x.id,data:x.data,data_pagamento:x.status==='Confirmada'?x.data:'',descricao:x.descricao,valor:x.valor,status:x.status,de:x.de,para:x.para,recorrente:x.recorrente?'SIM':'NÃO',observacao:x.observacao}));
  state.metas.forEach(x=>rows.push({tipo_registro:'meta',id:x.id,nome:x.nome,objetivo:x.objetivo,guardado:x.guardado,mensal:x.mensal,prioridade:x.prioridade}));
  downloadText('bevi-financas-dados-v15.csv', toCsv(rows));
}
function downloadCsvTemplate(){ downloadText('modelo-importacao-bevi-financas.csv', toCsv(templateRows)); }
function parseCsv(text){
  text = text.replace(/^\ufeff/, ''); const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i], next=text[i+1];
    if(q){ if(ch==='"' && next==='"'){cur+='"'; i++;} else if(ch==='"'){q=false;} else cur+=ch; }
    else { if(ch==='"') q=true; else if(ch===';'){row.push(cur); cur='';} else if(ch==='\n'){row.push(cur); rows.push(row); row=[]; cur='';} else if(ch!=='\r') cur+=ch; }
  }
  if(cur || row.length){ row.push(cur); rows.push(row); }
  const headers=(rows.shift()||[]).map(h=>h.trim());
  return rows.filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}
function boolCsv(v){ return !['não','nao','false','0','inativo'].includes(String(v||'SIM').toLowerCase()); }
function importCsv(text){
  const rows=parseCsv(text); if(!rows.length) throw new Error('CSV vazio'); let count=0;
  rows.forEach(r=>{
    const tipo=(r.tipo_registro||'').toLowerCase(); if(!tipo) return; count++;
    if(tipo==='categoria') upsert(state.categorias,{id:r.id||id(),nome:r.nome,ativo:boolCsv(r.ativo)});
    else if(tipo==='terceiro') upsert(state.terceiros,{id:r.id||id(),nome:r.nome,ativo:boolCsv(r.ativo)});
    else if(tipo==='cartao') upsert(state.cartoes,{id:r.id||id(),nome:r.nome,dono:r.dono,fecha:num(r.fecha_dia),vence:num(r.vence_dia),ativo:boolCsv(r.ativo)});
    else if(tipo==='conta_recorrente_despesa') upsert(state.contas,{id:r.id||id(),nome:r.nome,tipo:r.tipo_conta||'Variável',valorPrevisto:num(r.valor),vencimento:num(r.vencimento_dia),categoria:r.categoria,responsavel:r.responsavel||'Casal',pagador:r.pagador||'Larissa',ativo:boolCsv(r.ativo)});
    else if(tipo==='receita_recorrente') upsert(state.receitasRecorrentes,{id:r.id||id(),descricao:r.descricao||r.nome,valorPrevisto:num(r.valor),vencimento:num(r.vencimento_dia),pessoa:r.pessoa||'Larissa',ativo:boolCsv(r.ativo)});
    else if(tipo==='despesa'){
      const d={id:r.id||id(),createdAt:today,tipo:'Despesa',data:r.data||today,descricao:r.descricao,valorPrevisto:num(r.valor),valorPago:num(r.valor_pago),categoria:r.categoria,responsavel:r.responsavel||'Casal',pagador:r.pagador||'Larissa',forma:r.forma||'Pix/Débito',cartao:r.cartao,terceiro:r.terceiro,parcelas:num(r.parcelas)||1,parcelaAtual:num(r.parcela_atual)||1,status:r.status||'Pendente',dataPagamento:r.data_pagamento||'',observacao:r.observacao||''};
      if(d.forma==='Cartão de crédito'){ d.fatura=r.fatura||faturaRef(d.data,d.cartao); getFaturaRecord(d.cartao,d.fatura,true); if(isFaturaPaga(d.cartao,d.fatura)) throw new Error(`Fatura paga bloqueia importação: ${d.cartao} ${d.fatura}`); }
      upsert(state.despesas,d);
    }
    else if(tipo==='receita') upsert(state.receitas,{id:r.id||id(),createdAt:today,data:r.data||today,descricao:r.descricao,valor:num(r.valor),pessoa:r.pessoa||'Larissa',status:r.status||'Pendente',dataRecebimento:r.data_pagamento||'',terceiro:r.terceiro,observacao:r.observacao||'',tipo:'Avulsa'});
    else if(tipo==='conta_conjunta' || tipo==='transferencia') { const rec=boolCsv(r.recorrente||'NÃO'); upsert(state.transferencias,{id:r.id||id(),createdAt:today,tipo:tipo==='conta_conjunta'?'Conta conjunta':'Transferência',data:r.data||today,descricao:r.descricao||'Transferência',de:r.de||'Larissa',para:'Casa',paraCaixinha:'Casa',valor:num(r.valor),status:rec?'Pendente':(r.status||'Pendente'),recorrente:rec,recorrenteId:rec?(r.id||id()):'',observacao:r.observacao||''}); }
    else if(tipo==='meta') upsert(state.metas,{id:r.id||id(),nome:r.nome,objetivo:num(r.objetivo),guardado:num(r.guardado),mensal:num(r.mensal),prioridade:r.prioridade});
  });
  alert(`Importação CSV concluída: ${count} linhas processadas.`); save();
}
function upsert(arr, obj){ const idx=obj.id?arr.findIndex(x=>x.id===obj.id):-1; if(idx>=0) arr[idx]={...arr[idx],...obj}; else arr.push(obj); }
function importData(e){ const file=e.target.files[0]; if(!file) return; const r=new FileReader(); r.onload=()=>{ try{ if(file.name.toLowerCase().endsWith('.csv')) importCsv(r.result); else { state=normalize(JSON.parse(r.result)); save(); } }catch(err){ alert('Arquivo inválido: '+(err.message||err)); } e.target.value=''; }; r.readAsText(file); }

init();
