// 精确点击"节庆用品/礼品"一级类目，展开二级
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});

    // 精确找 span.cate 文本 === '节庆用品/礼品'
    const r1 = await send('Runtime.evaluate',{expression:`(function(){
      var els = [...document.querySelectorAll('span.cate')];
      var el = els.find(e=>(e.textContent||'').trim() === '节庆用品/礼品');
      if(!el) return JSON.stringify({found:false, count: els.length, samples: els.map(e=>(e.textContent||'').trim()).slice(0,5)});
      el.scrollIntoView({block:'center'});
      el.click();
      return JSON.stringify({found:true, clicked: (el.textContent||'').trim()});
    })()`, returnByValue:true});
    console.log('点击结果:', r1.result.value);
    await sleep(4000);

    // dump 展开后的二级类目（精确找 span.cate 之外的新元素）
    const r2 = await send('Runtime.evaluate',{expression:`(function(){
      var out = [];
      var seen = new Set();
      // 二级类目可能是 li/a/div，找文本含" > "或短文本的可点击项
      document.querySelectorAll('span, li, a, div').forEach(function(e){
        if(e.children.length > 0) return;  // 只取叶子
        var t = (e.textContent||'').trim().replace(/\\s+/g,' ');
        if(t.length < 2 || t.length > 40 || seen.has(t)) return;
        seen.add(t);
        out.push(t);
      });
      return JSON.stringify(out.slice(0, 60));
    })()`, returnByValue:true});
    const l2 = JSON.parse(r2.result.value);
    console.log('=== 展开后叶子文本 ===');
    l2.forEach(t=>console.log(' -', t));
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
