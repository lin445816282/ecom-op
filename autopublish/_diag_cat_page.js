// 诊断：拼多多类目页搜索框现状（如若月下店 CDP 9230）
const http = require('http');
const PORT = process.argv[2] || '9230';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{
  const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});
  req.on('error',rej);req.setTimeout(5000,()=>{req.destroy();rej(new Error('HTTP超时'))});
})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m))}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

function newTab(url){return new Promise((res,rej)=>{
  const req=http.request(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});
  req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))});req.end();
})}

(async()=>{
  // 新建 tab 导航到类目页
  const t = await newTab('https://mms.pinduoduo.com/goods/category');
  const wsUrl = t.webSocketDebuggerUrl;
  const c = await conn(wsUrl);
  await sleep(8000);
  const href = await ev(c,'location.href');
  console.log('href:', href);

  // 1. 所有 input 的 placeholder
  const inputs = await ev(c, `(()=>JSON.stringify([...document.querySelectorAll('input')].map(i=>({ph:i.placeholder||'',type:i.type}))))()`);
  console.log('=== 所有 input placeholder ===');
  try{ JSON.parse(inputs).forEach((x,i)=>console.log(`  [${i}] type=${x.type} ph="${x.ph}"`)); }catch(e){ console.log(inputs); }

  // 2. 是否命中 publish.js 的选择器
  const sel1 = await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="分类"]');return i?('FOUND: '+i.placeholder):'NOT FOUND'})()`);
  console.log('input[placeholder*="分类"]:', sel1);

  // 3. 是否有「确认发布该类商品」按钮
  const btn = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('确认发布该类商品'));return b?'FOUND':'NOT FOUND'})()`);
  console.log('确认发布该类商品按钮:', btn);

  // 4. 是否有「下一步」按钮
  const next = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('下一步'));return b?'FOUND':'NOT FOUND'})()`);
  console.log('下一步按钮:', next);

  // 5. body 前 500 字
  const body = await ev(c, `(()=>(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,500))()`);
  console.log('=== body 前500字 ===');
  console.log(body);

  c.ws.close();
  process.exit(0);
})().catch(e=>{ console.error('ERROR:', e.message); process.exit(1); });
