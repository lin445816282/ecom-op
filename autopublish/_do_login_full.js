// 完整登录：切「密码登录」tab → 填号 → 点登录 → 检查滑块
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  await sleep(1000);
  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'login_full', grantUniveralAccess:true});
  const ctxId = w.executionContextId;
  async function evalCtx(expr){ const r = await c.send('Runtime.evaluate',{contextId:ctxId, expression:expr, returnByValue:true}); return r && r.result ? r.result.value : undefined; }

  // 1. 切「密码登录」tab
  const switchTab = `(function(){
    var els=document.querySelectorAll('a,div,span,li,button');
    for(var i=0;i<els.length;i++){
      var t=(els[i].textContent||'').trim();
      if(t==='密码登录'){ els[i].click(); els[i].dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'switched'; }
    }
    return 'nf';
  })()`;
  console.log('切密码登录tab:', await evalCtx(switchTab));
  await sleep(1500);

  // 2. 检查账号框
  const accState = await evalCtx(`(function(){var a=document.querySelector('#fm-login-id');var p=document.querySelector('#fm-login-password');return JSON.stringify({acc:!!a,pwd:!!p});})()`);
  console.log('账号框状态:', accState);

  // 3. 填号
  const fill = `(function(){
    var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    var a=document.querySelector('#fm-login-id');
    var p=document.querySelector('#fm-login-password');
    if(!a||!p) return 'nf';
    ns.call(a,'嘉裕工艺品'); a.dispatchEvent(new Event('input',{bubbles:true})); a.dispatchEvent(new Event('change',{bubbles:true}));
    ns.call(p,'Alcz8283103'); p.dispatchEvent(new Event('input',{bubbles:true})); p.dispatchEvent(new Event('change',{bubbles:true}));
    return 'acc='+a.value.length+' pwd='+p.value.length;
  })()`;
  console.log('填号:', await evalCtx(fill));
  await sleep(800);

  // 4. 点登录
  const click = `(function(){
    var b=document.querySelector('.fm-button.fm-submit.password-login');
    if(!b){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if((bs[i].textContent||'').trim()==='登录'){b=bs[i];break;}}}
    if(!b) return 'no_btn';
    b.click();
    return 'clicked';
  })()`;
  console.log('点登录:', await evalCtx(click));
  await sleep(4000);

  // 5. 检查滑块
  const ncState = await evalCtx(`(function(){
    var n1z=document.querySelector('#nc_1_n1z');
    var n1t=document.querySelector('#nc_1_n1t');
    var n1=document.querySelector('#nc_1');
    return JSON.stringify({
      hasN1: !!n1,
      n1z: n1z?{w:n1z.getBoundingClientRect().width,h:n1z.getBoundingClientRect().height,display:getComputedStyle(n1z).display}:null,
      n1t: n1t?{w:n1t.getBoundingClientRect().width,h:n1t.getBoundingClientRect().height}:null,
      body: document.body.innerText.slice(0,200)
    });
  })()`);
  console.log('滑块状态:', ncState);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
