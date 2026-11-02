// 测试：填号 + 点登录，观察滑块加载是否触发崩溃
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});ws.addEventListener('close',()=>console.log('  [ws closed]'));await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function check(tag){ try{ await get('http://127.0.0.1:9222/json/version'); console.log(`[${tag}] 9222 存活`); return true; }catch(e){ console.log(`[${tag}] 9222 崩溃: ${e.message}`); return false; } }

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  await sleep(2000);

  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'hermes_login', grantUniveralAccess:true});
  const ctxId = w.executionContextId;
  console.log('ctxId:', ctxId);

  async function evalCtx(expr){
    const r = await c.send('Runtime.evaluate',{contextId:ctxId, expression:expr, returnByValue:true});
    return r && r.result ? r.result.value : undefined;
  }

  // 填账号密码
  const fill = `(function(){
    var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    var acc=document.querySelector('#fm-login-id');
    var pwd=document.querySelector('#fm-login-password');
    if(!acc||!pwd) return 'nf:'+(!acc?'no-acc':'no-pwd');
    ns.call(acc,'嘉裕工艺品'); acc.dispatchEvent(new Event('input',{bubbles:true})); acc.dispatchEvent(new Event('change',{bubbles:true}));
    ns.call(pwd,'Alcz8283103'); pwd.dispatchEvent(new Event('input',{bubbles:true})); pwd.dispatchEvent(new Event('change',{bubbles:true}));
    return 'filled acc='+acc.value.length+' pwd='+pwd.value.length;
  })()`;
  console.log('填号结果:', await evalCtx(fill));
  await check('填号后');
  await sleep(1000);

  // 点登录
  const clickLogin = `(function(){
    var btns=document.querySelectorAll('button');
    for(var i=0;i<btns.length;i++){
      var t=(btns[i].textContent||'').trim();
      if(t==='登录'||t.indexOf('登录')>=0){
        btns[i].click(); btns[i].dispatchEvent(new MouseEvent('click',{bubbles:true}));
        return 'clicked: '+t;
      }
    }
    return 'nf';
  })()`;
  console.log('点登录:', await evalCtx(clickLogin));
  // 观察滑块 + 崩溃
  for(let i=1;i<=8;i++){
    await sleep(1500);
    const alive = await check(`点登录后${Math.round(i*1.5)}s`);
    if(!alive) break;
    // 检查滑块是否出现
    try{
      const hasNc = await evalCtx(`(function(){return !!document.querySelector('#nc_1_n1z')||!!document.querySelector('[id*=nc_1]')||document.body.innerHTML.indexOf('nc_1')>0;})()`);
      if(hasNc) console.log('  滑块已出现 (nc_1)');
    }catch(e){ console.log('  evalCtx 异常:', e.message); }
  }
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
