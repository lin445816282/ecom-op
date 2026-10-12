// 只读诊断：9234 普通店发布页主图上传区结构（确认 goodsCarousel_selected 是否存在）
const http = require('http');
const PORT = '9234';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const g = tabs.filter(t=>t.type==='page').find(t=>/goods_add\/index/.test(t.url||''));
  if(!g){ console.log('无发布页 tab'); process.exit(1); }
  console.log('[0] 发布页:', g.url.slice(0,90));
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // 检查 goodsCarousel_selected 是否存在 + 内容
  const r1 = await ev(c, `(()=>{
    const sel=document.querySelector('[class*="goodsCarousel_selected"]');
    if(!sel) return {exists:false};
    const txt=(sel.innerText||sel.textContent||'').trim();
    return {exists:true, text:txt, class:sel.className};
  })()`);
  console.log('[1] goodsCarousel_selected:', JSON.stringify(r1));

  // 用方案1表达式读数量
  const r2 = await ev(c, `(()=>{
    const sel=document.querySelector('[class*="goodsCarousel_selected"]');
    if(!sel) return 0;
    const txt=(sel.innerText||sel.textContent||'').trim();
    const a=txt.indexOf('(');
    const slash=txt.indexOf('/');
    const b=txt.indexOf(')');
    if(a<0||slash<0||b<0||a>=slash||slash>=b) return 0;
    const n=parseInt(txt.slice(a+1,slash));
    return isNaN(n)?0:n;
  })()`);
  console.log('[2] 方案1解析数量:', r2);

  // uploadImgEnter 容器是否存在
  const r3 = await ev(c, `document.querySelectorAll('[class*="uploadImgEnter"]').length`);
  console.log('[3] uploadImgEnter 容器数:', r3);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
