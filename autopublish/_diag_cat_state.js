// 诊断 category.htm tab 当前状态：停在 AI 发品三步哪一步
const http = require('http');
const PORT = '9222';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const cat = tabs.filter(t=>t.type==='page').find(t=>/item\.upload\.taobao\.com|category\.htm/.test(t.url||''));
  if(!cat){ console.log('无 category.htm tab'); process.exit(0); }
  console.log('TAB:', cat.title, '|', cat.url.slice(0,80));
  const c = await conn(cat.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  const info = await ev(c, `(()=>{
    const body = document.body.innerText || '';
    const btns = [...document.querySelectorAll('button,a,div,span')].map(e=>(e.textContent||'').trim()).filter(t=>t==='开启'||t==='以图发品'||t==='搜索发品'||t==='下一步'||t.indexOf('确认')>=0||t.indexOf('下一步')>=0);
    const fi = document.querySelectorAll('input[type=file]').length;
    const up = document.querySelectorAll('[class*=upload],[class*=Upload]').length;
    return JSON.stringify({
      title: document.title,
      url: location.href.slice(0,90),
      fileInput: fi,
      uploadEls: up,
      keyBtns: [...new Set(btns)].slice(0,20),
      bodyHead: body.slice(0,400),
      bodyTail: body.slice(-300)
    });
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
