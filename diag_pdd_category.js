// 诊断拼多多类目页：搜索关键词，dump 实际返回的类目
// 用法: node diag_pdd_category.js <port> <搜索词>
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9234';
const KW = process.argv[3] || '气球';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
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
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(6000);

    // 找搜索框并填入关键词
    await send('Runtime.evaluate',{expression:`(function(){
      var inp = document.querySelector('input[placeholder*="搜索"], input[placeholder*="分类"]');
      if(!inp) return 'NO_INPUT';
      var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, ${JSON.stringify(KW)});
      inp.dispatchEvent(new Event('input', {bubbles:true}));
      inp.dispatchEvent(new Event('change', {bubbles:true}));
      inp.focus();
      return 'OK';
    })()`, returnByValue:true});
    await send('Input.dispatchKeyEvent',{type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
    await sleep(4000);

    // dump 类目搜索结果
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out = {url: location.href.slice(0,80), items: []};
      var cands = document.querySelectorAll('.choose-category,[class*="searchItem"],[class*="category"]');
      var seen = new Set();
      for (var i=0;i<cands.length;i++){
        var t = (cands[i].textContent||'').trim().replace(/\\s+/g,' ');
        if(t.length < 2 || t.length > 60 || seen.has(t)) continue;
        seen.add(t);
        out.items.push(t);
        if(out.items.length >= 40) break;
      }
      return JSON.stringify(out);
    })()`, returnByValue:true});
    console.log(r.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
