// 诊断 1688 CDP 实例当前页面状态
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    console.log('TAB数:', tabs.length);
    tabs.forEach(t=>console.log(' -', t.type, '|', (t.url||'').slice(0,120), '|', (t.title||'').slice(0,60)));
    const page = tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var b = document.body ? document.body.innerText : '';
      return JSON.stringify({url: location.href, title: document.title, bodyHead: b.slice(0,400)});
    })()`, returnByValue:true});
    console.log('页面状态:', (r && r.result && r.result.value) || '无');
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
