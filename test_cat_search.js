// 测试：在 9234 类目页搜索"气球"，dump 返回的类目
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const KW = process.argv[2] || '气球';
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

    // 填搜索词
    await send('Runtime.evaluate',{expression:`(function(){
      var inp = document.querySelector('input[placeholder*="分类"]');
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
    await sleep(5000);

    // dump 搜索结果
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out = [];
      var cands = document.querySelectorAll('.choose-category,[class*="searchItem"]');
      for(var i=0;i<cands.length;i++){
        var t = (cands[i].textContent||'').trim().replace(/\\s+/g,' ');
        if(t.length >= 2 && t.length <= 80) out.push(t);
        if(out.length >= 30) break;
      }
      // 也 dump 可能的类目树结构
      var tree = [];
      document.querySelectorAll('[class*="category"]').forEach(function(e){
        var t = (e.textContent||'').trim().replace(/\\s+/g,' ');
        if(t.length >= 2 && t.length <= 60 && tree.indexOf(t)<0) tree.push(t);
        if(tree.length >= 20) return;
      });
      return JSON.stringify({cands: out, categoryTree: tree.slice(0,20)});
    })()`, returnByValue:true});
    console.log(r.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
