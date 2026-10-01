// 诊断 v2：设值(native setter+input事件) → 真实点击按钮 → 观察跳转
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
const KW = process.argv[3] || '万圣节装饰';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{});

    // 1. 设值 + 找按钮坐标
    const f1 = await send('Runtime.evaluate',{expression:`(function(){
      var ta = document.getElementById('alisearch-input');
      if(!ta) return JSON.stringify({found:false});
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(KW)});
      ta.dispatchEvent(new Event('input', {bubbles:true}));
      ta.dispatchEvent(new Event('change', {bubbles:true}));
      var btn = document.querySelector('.searchBtn--bnk9giWe, [class*="searchBtn"]');
      var bb = btn ? btn.getBoundingClientRect() : null;
      return JSON.stringify({found:true, val: ta.value, btnX: bb?Math.round(bb.x+bb.width/2):null, btnY: bb?Math.round(bb.y+bb.height/2):null});
    })()`, returnByValue:true});
    const info = JSON.parse(f1.result.value);
    console.log('1. 设值+按钮:', JSON.stringify(info));

    // 2. 真实点击按钮
    if(info.btnX){
      await send('Input.dispatchMouseEvent',{type:'mouseMoved', x: info.btnX, y: info.btnY});
      await sleep(200);
      await send('Input.dispatchMouseEvent',{type:'mousePressed', x: info.btnX, y: info.btnY, button:'left', clickCount:1});
      await sleep(80);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased', x: info.btnX, y: info.btnY, button:'left', clickCount:1});
      await sleep(5000);
    }

    // 3. 观察 tab 变化
    const tabs2 = await get(`http://127.0.0.1:${PORT}/json`);
    console.log('3. 点击后 tabs:');
    tabs2.forEach(t=>{ if(t.type==='page') console.log('   -', (t.url||'').slice(0,110), '|', (t.title||'').slice(0,40)); });

    // 4. 当前 tab URL
    const cur = await send('Runtime.evaluate',{expression:'location.href', returnByValue:true});
    console.log('4. 当前tab URL:', cur.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
