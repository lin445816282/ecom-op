// 精确 dump 9234 首页店铺名（顶部 + 账号区域）
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var b = document.body ? document.body.innerText : '';
      var lines = b.split('\\n').map(s=>s.trim()).filter(s=>s.length>0 && s.length<40);
      // 找含"店"或"铺"的行
      var shopLines = lines.filter(s => /店|铺|旗|专营|工厂/.test(s));
      return JSON.stringify({head: lines.slice(0, 40), shopLines: shopLines.slice(0, 20)});
    })()`, returnByValue:true});
    const v = JSON.parse(r.result.value);
    console.log('=== 顶部 40 行 ===');
    console.log(v.head.join(' | '));
    console.log('=== 含店铺名的行 ===');
    console.log(v.shopLines.join(' | ') || '(无)');
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
