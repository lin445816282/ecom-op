// 逐步测试 CDP 9222 稳定性，定位崩溃点
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});ws.addEventListener('close',()=>{console.log('  [ws closed]');});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

async function check9222(tag){
  try{ await get('http://127.0.0.1:9222/json/version'); console.log(`[${tag}] 9222 存活`); return true; }
  catch(e){ console.log(`[${tag}] 9222 崩溃: ${e.message}`); return false; }
}

(async()=>{
  console.log('=== 步骤0：初始状态 ===');
  await check9222('初始');
  const tabs = await get('http://127.0.0.1:9222/json');
  const pages = tabs.filter(t=>t.type==='page');
  console.log('page tabs:', pages.map(t=>t.url.slice(0,50)));

  // 找一个 loginmyseller tab
  const loginTab = pages.find(t=>/loginmyseller/.test(t.url||'')) || pages[0];
  if(!loginTab){ console.log('无 page tab'); process.exit(0); }
  console.log('连接 tab:', loginTab.url.slice(0,60));

  console.log('=== 步骤1：ws_connect + enable ===');
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); console.log('  Page.enable ok');
  await c.send('Runtime.enable',{}); console.log('  Runtime.enable ok');
  await c.send('DOM.enable',{}); console.log('  DOM.enable ok');
  await check9222('enable后');
  await sleep(2000);

  console.log('=== 步骤2：Runtime.evaluate title ===');
  try{
    const r = await c.send('Runtime.evaluate',{expression:'document.title',returnByValue:true});
    console.log('  title =', r.result && r.result.value);
  }catch(e){ console.log('  evaluate 异常:', e.message); }
  await check9222('evaluate后');
  await sleep(1000);

  console.log('=== 步骤3：Page.getFrameTree ===');
  try{
    const ft = await c.send('Page.getFrameTree',{});
    const tree = ft.frameTree;
    console.log('  frameTree 顶层 url:', tree.frame && tree.frame.url.slice(0,60));
    console.log('  childFrames:', (tree.childFrames||[]).length);
    // 递归找 havanalogin
    function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
    const hid = findHavana(tree);
    console.log('  havanalogin frameId:', hid || '未找到');
  }catch(e){ console.log('  getFrameTree 异常:', e.message); }
  await check9222('getFrameTree后');

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
