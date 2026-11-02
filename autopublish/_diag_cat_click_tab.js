// CDP 真实点击「以图发品」tab，验证能否切换并出现 file input
const http = require('http');
const PORT = '9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}
async function click(c,x,y){
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await sleep(120);
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const cat = tabs.filter(t=>t.type==='page').find(t=>/item\.upload\.taobao\.com|category\.htm/.test(t.url||''));
  const c = await conn(cat.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 取「以图发品」switch-tab 坐标
  const rect = await ev(c, `(()=>{const el=document.querySelector('.item-tab.switch-tab');if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  console.log('switch-tab rect:', JSON.stringify(rect));
  if(!rect){ console.log('无 switch-tab'); process.exit(0); }
  const cx = Math.round(rect.x + rect.w/2), cy = Math.round(rect.y + rect.h/2);
  console.log('点击中心:', cx, cy);
  await click(c, cx, cy);
  await sleep(4000);

  const after = await ev(c, `(()=>{
    const active = document.querySelector('.item-tab.active-tab')?.textContent?.trim() || '';
    const fi = document.querySelectorAll('input[type=file]').length;
    const up = document.querySelectorAll('[class*=upload]').length;
    return JSON.stringify({activeTab: active, fileInput: fi, uploadEls: up});
  })()`);
  console.log('点击后:', after);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
