// 验证：native setter 填值（fillByType 方式）+ Enter，看搜索是否触发
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',()=>res(null))})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = process.argv[2] || '9232';
const KW = process.argv[3] || '果盘';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page' && /mms\.pinduoduo/.test(t.url||''));
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});
    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    // native setter 填值（模拟 fillByType）
    const fill = await send('Runtime.evaluate',{expression:`(function(){
      var inp=document.querySelector('input[placeholder*="分类"]');
      if(!inp) return 'NO_INPUT';
      inp.scrollIntoView({block:'center'}); inp.click(); inp.focus();
      var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(inp, ${JSON.stringify(KW)});
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      return 'value='+inp.value;
    })()`, returnByValue:true});
    console.log('native setter 填值:', fill.result.value);
    await sleep(500);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await sleep(4500);

    const r = await send('Runtime.evaluate',{expression:`(function(){
      var items=[];
      var seen=new Set();
      document.querySelectorAll('*').forEach(function(e){
        if(e.children.length>0) return;
        var t=(e.textContent||'').trim().replace(/\\s+/g,' ');
        if(t.length<2||t.length>80) return;
        if(t.indexOf('果盆')<0 && t.indexOf('果盘')<0 && t.indexOf('果篮')<0) return;
        var key=e.tagName+'|'+(e.className||'')+'|'+t;
        if(seen.has(key)) return; seen.add(key);
        items.push(e.tagName+' :: '+(typeof e.className==='string'?e.className.slice(0,40):'')+' :: '+t);
      });
      return JSON.stringify(items);
    })()`, returnByValue:true});
    console.log('=== native setter + Enter 后结果 ===');
    try{ JSON.parse(r.result.value).forEach(t=>console.log('  '+t)); }catch(e){ console.log('原始:', String(r.result.value).slice(0,400)); }
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
