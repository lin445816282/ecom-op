// 验证：通用主图计数表达式（旗舰店 goodsCarousel_selected / 普通店 MaterialModalButton background-image）
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

  const expr = `(()=>{
    const sel=document.querySelector('[class*="goodsCarousel_selected"]');
    if(sel){const t=(sel.innerText||sel.textContent||'').trim();const a=t.indexOf('(');const s=t.indexOf('/');const b=t.indexOf(')');if(a>=0&&s>a&&b>s){const n=parseInt(t.slice(a+1,s));if(!isNaN(n))return n;}}
    const boxes=[...document.querySelectorAll('[class*="MaterialModalButton"]')];
    let n=0;
    boxes.forEach(function(box){if(!box.querySelectorAll)return;[...box.querySelectorAll('*')].forEach(function(x){if(x.getAttribute&&(x.getAttribute('style')||'').includes('background-image'))n++;});});
    return n;
  })()`;
  const r = await ev(c, expr);
  console.log('通用主图计数结果:', r, '(应为 3，刚才上传了 3 张)');

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
