// dump 主图上传按钮完整结构 + 测试点击按钮后是否出现新的上传入口
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // dump 上传按钮组完整结构
  const dump = await ev(c, `(()=>{
    const box=document.querySelector('[class*="goodsCarousel_uploadImgEnter"]') || document.querySelector('[class*="uploadImgEnter"]');
    if(!box) return 'no box';
    return box.outerHTML.slice(0, 2500);
  })()`);
  console.log('[上传按钮组 outerHTML]');
  console.log(dump);

  // 找按钮（可点击的元素）
  const btns = await ev(c, `(()=>{
    const box=document.querySelector('[class*="goodsCarousel_uploadImgEnter"]') || document.querySelector('[class*="uploadImgEnter"]');
    if(!box) return [];
    return [...box.querySelectorAll('button,[role="button"],label,input')].map(e=>({
      tag:e.tagName, type:e.getAttribute('type'), cls:(e.className||'').toString().slice(0,60), text:(e.textContent||e.value||'').trim().slice(0,20),
      visible:(e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0)
    }));
  })()`);
  console.log('[可交互元素]');
  (btns||[]).forEach(b=>console.log(' ', JSON.stringify(b)));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
