// 测试 auto_login 关键步骤：getFrameTree + createIsolatedWorld + 填号（不点登录）
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});ws.addEventListener('close',()=>console.log('  [ws closed]'));await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function check(tag){ try{ await get('http://127.0.0.1:9222/json/version'); console.log(`[${tag}] 9222 存活`); return true; }catch(e){ console.log(`[${tag}] 9222 崩溃: ${e.message}`); return false; } }

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  if(!loginTab){ console.log('无 loginmyseller tab'); process.exit(0); }
  console.log('连接:', loginTab.url.slice(0,60));
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  await sleep(2000);

  console.log('=== getFrameTree 找 havanalogin ===');
  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  console.log('  havanalogin frameId:', hid || '未找到');
  await check('getFrameTree后');

  if(hid){
    console.log('=== createIsolatedWorld ===');
    try{
      const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'hermes_login', grantUniveralAccess:true});
      const ctxId = w.executionContextId;
      console.log('  executionContextId:', ctxId);
      await check('createIsolatedWorld后');
    }catch(e){ console.log('  createIsolatedWorld 异常:', e.message); }
  }
  await sleep(1000);
  await check('最终');
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
