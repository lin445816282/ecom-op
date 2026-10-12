// 验证：零转义表达式能否正确读出主图上传数量 (5/10)
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // 方案1：读 goodsCarousel_selected 元素文字 (N/M)
  const expr1 = `(()=>{
    const sel=document.querySelector('[class*="goodsCarousel_selected"]');
    if(!sel) return 0;
    const txt=(sel.innerText||sel.textContent||'').trim();
    const a=txt.indexOf('(');
    const slash=txt.indexOf('/');
    const b=txt.indexOf(')');
    if(a<0||slash<0||b<0||a>=slash||slash>=b) return 0;
    const n=parseInt(txt.slice(a+1,slash));
    return isNaN(n)?0:n;
  })()`;
  const r1 = await ev(c, expr1);
  console.log('[方案1] goodsCarousel_selected 解析:', r1);

  // 方案2：读 uploadImgEnter 容器 innerText 的 (N/M)
  const expr2 = `(()=>{
    const box=document.querySelector('[class*="uploadImgEnter"]');
    if(!box) return 0;
    const txt=(box.innerText||'').replace(/ /g,'').replace(/\n/g,'').replace(/\t/g,'');
    const a=txt.indexOf('(');
    const slash=txt.indexOf('/');
    const b=txt.indexOf(')');
    if(a<0||slash<0||b<0||a>=slash||slash>=b) return 0;
    const n=parseInt(txt.slice(a+1,slash));
    return isNaN(n)?0:n;
  })()`;
  const r2 = await ev(c, expr2);
  console.log('[方案2] uploadImgEnter 容器解析:', r2);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
