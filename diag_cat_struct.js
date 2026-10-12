// 诊断：dump 类目页所有 input placeholder + 类目相关可点击元素（含 class），学习嘉裕成功经验
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',()=>res(null))})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = process.argv[2] || '9232';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page' && /mms\.pinduoduo/.test(t.url||''));
    if(!page){ console.log('NO_PAGE'); return; }
    console.log('当前 page url:', (page.url||'').slice(0,80));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});
    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out={url:location.href.slice(0,70)};
      // 所有 input placeholder
      out.inputs=[...document.querySelectorAll('input')].map(i=>i.placeholder||'').filter(p=>p);
      // 类目相关可点击元素（含 class）
      var items=[];
      var seen=new Set();
      document.querySelectorAll('*').forEach(function(e){
        var t=(e.textContent||'').trim().replace(/\\s+/g,' ');
        if(t.length<2||t.length>60) return;
        if(/果盘|果篮|果盆|餐饮具|餐具|收纳|摆件|最近使用|选择分类|家居生活/.test(t)){
          var key=e.tagName+'.'+(e.className||'')+'|'+t;
          if(seen.has(key)) return; seen.add(key);
          items.push(e.tagName+' :: '+(typeof e.className==='string'?e.className.slice(0,50):'(svg)')+' :: '+t);
        }
      });
      out.items=items.slice(0,50);
      return JSON.stringify(out);
    })()`, returnByValue:true});
    const d = JSON.parse(r.result.value);
    console.log('=== url ===', d.url);
    console.log('=== input placeholders ===');
    d.inputs.forEach(p=>console.log('  ['+p+']'));
    console.log('=== 类目相关元素 ===');
    d.items.forEach(t=>console.log('  '+t));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
