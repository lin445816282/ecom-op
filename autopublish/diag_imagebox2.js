// 精确统计：主图缩略图 = imageBox 且 style 含 background-image（零正则零转义）
const http = require('http');
const PORT = '9234';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const g = tabs.filter(t=>t.type==='page').find(t=>/goods_add\/index/.test(t.url||''));
  if(!g){ console.log('无发布页 tab'); process.exit(1); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // 零正则零转义：数 imageBox 带 background-image
  const r1 = await ev(c, `(()=>{
    const boxes=[...document.querySelectorAll('[class*="imageBox"]')];
    let n=0;
    boxes.forEach(function(x){const s=x.getAttribute?x.getAttribute('style')||'':'';if(s.indexOf('background-image')>=0)n++;});
    return n;
  })()`);
  console.log('[imageBox带bg] 数量:', r1);

  // 统计 MaterialModalButton 容器内的缩略图（imageWrapper）
  const r2 = await ev(c, `(()=>{
    const wrappers=[...document.querySelectorAll('[class*="imageWrapper"]')];
    return wrappers.length;
  })()`);
  console.log('[imageWrapper] 数量:', r2);

  // 主图区（第一个 MaterialModalButton 容器）的 imageBox 数量
  const r3 = await ev(c, `(()=>{
    const mm=document.querySelector('[class*="MaterialModalButton"]');
    if(!mm)return 0;
    const boxes=[...mm.querySelectorAll('[class*="imageBox"]')];
    let n=0;
    boxes.forEach(function(x){const s=x.getAttribute?x.getAttribute('style')||'':'';if(s.indexOf('background-image')>=0)n++;});
    return n;
  })()`);
  console.log('[第一个MaterialModalButton容器内imageBox带bg] 数量:', r3);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
