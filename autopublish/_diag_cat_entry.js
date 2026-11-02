// dump「以图发品」「搜索发品」元素精确结构，找可点击入口
const http = require('http');
const PORT = '9222';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const cat = tabs.filter(t=>t.type==='page').find(t=>/item\.upload\.taobao\.com|category\.htm/.test(t.url||''));
  const c = await conn(cat.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  const info = await ev(c, `(()=>{
    function describe(el){
      if(!el) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName, cls: (el.className||'').toString().slice(0,60),
        txt: (el.textContent||'').trim().slice(0,40),
        w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
        visible: r.width>0 && r.height>0,
        html: el.outerHTML.slice(0,200)
      };
    }
    // 所有文本含「以图发品」的元素
    const arr = [];
    document.querySelectorAll('*').forEach(e=>{
      const t = (e.textContent||'').trim();
      if(t==='以图发品' || t==='搜索发品') arr.push(describe(e));
    });
    // 所有可见的 button
    const btns = [];
    document.querySelectorAll('button').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width>0&&r.height>0) btns.push(describe(e));});
    return JSON.stringify({match: arr, visibleButtons: btns.slice(0,30)}, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
