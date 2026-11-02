const http = require('http');
const PORT = '9232';
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)})}
(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const cat=tabs.find(t=>t.type==='page'&&/goods\/category/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws=new WebSocket(cat.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>rej(new Error('to')),10000);p.set(mid,{res,rej,to});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);clearTimeout(q.to);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  await send('Runtime.enable',{});
  const expr = `(()=>{
    const sel=[...document.querySelectorAll('[class*="check"],[class*="active"],[class*="selected"],[class*="choose"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).map(e=>(e.textContent||'').trim()).filter(t=>t.length>0&&t.length<50);
    const tips=[...document.querySelectorAll('*')].filter(e=>e.children.length===0).map(e=>(e.textContent||'').trim()).filter(t=>/请|选择|分类|类目|提示|错误/.test(t)&&t.length<40);
    return JSON.stringify({sel:sel.slice(0,10), tips:tips.slice(0,10), url:location.href});
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log(r.result.value);
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
