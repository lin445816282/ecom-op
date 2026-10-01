// dump 拼多多类目页的一级类目树结构（含 class 名，便于写展开脚本）
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(9000);

    // dump 所有可能的类目元素（含 class 和文本）
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out = {body: (document.body?document.body.innerText:'').slice(0, 800)};
      // 找类目相关的可点击元素
      var items = [];
      var sels = ['.choose-category', '[class*="searchItem"]', '[class*="category-item"]', '[class*="cate"]', '[class*="Cate"]', '[class*="tree"]', '[class*="node"]'];
      var seen = new Set();
      sels.forEach(function(s){
        document.querySelectorAll(s).forEach(function(e){
          var t = (e.textContent||'').trim().replace(/\\s+/g,' ');
          if(t.length < 2 || t.length > 50 || seen.has(t)) return;
          seen.add(t);
          items.push({sel: s, cls: (e.className||'').slice(0,40), tag: e.tagName, txt: t.slice(0,40)});
        });
      });
      out.items = items.slice(0, 40);
      return JSON.stringify(out);
    })()`, returnByValue:true});
    const d = JSON.parse(r.result.value);
    console.log('=== body ===');
    console.log(d.body.replace(/\\n/g, '\n'));
    console.log('=== 类目元素 ===');
    d.items.forEach(it=>console.log(' ['+it.sel+'] '+it.tag+'.'+it.cls+' => '+it.txt));
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
