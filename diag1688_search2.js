// 深挖 1688 首页搜索框
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    const page = tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out = {inputs: [], btnParent: null};
      // 所有 input（不过滤）
      document.querySelectorAll('input').forEach(function(i){
        var b = i.getBoundingClientRect();
        out.inputs.push({tag:'INPUT', id: i.id, cls: (i.className||'').slice(0,50), ph: i.placeholder, type: i.type, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)});
      });
      // contenteditable
      document.querySelectorAll('[contenteditable="true"]').forEach(function(i){
        var b = i.getBoundingClientRect();
        out.inputs.push({tag:'EDITABLE', id: i.id, cls: (i.className||'').slice(0,50), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)});
      });
      // 搜索按钮的父容器结构（往上 3 层）
      var btn = document.querySelector('.searchBtn--bnk9giWe, [class*="searchBtn"]');
      if(btn){
        var chain = [];
        var el = btn;
        for(var k=0;k<4 && el;k++){
          chain.push({tag: el.tagName, cls: (el.className||'').slice(0,50), html: (el.outerHTML||'').slice(0,200)});
          el = el.parentElement;
        }
        out.btnParent = chain;
      }
      return JSON.stringify(out);
    })()`, returnByValue:true});
    console.log((r && r.result && r.result.value) || '无');
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
