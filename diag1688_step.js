// 分步诊断 1688 搜索：设值→点按钮→观察变化
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

    console.log('当前URL:', (await send('Runtime.evaluate',{expression:'location.href',returnByValue:true})).result.value);

    // 1. 找 textarea
    const f1 = await send('Runtime.evaluate',{expression:`(function(){
      var ta = document.getElementById('alisearch-input');
      if(!ta) return JSON.stringify({found:false});
      var b = ta.getBoundingClientRect();
      return JSON.stringify({found:true, x:Math.round(b.x+b.width/2), y:Math.round(b.y+b.height/2), val: ta.value});
    })()`, returnByValue:true});
    console.log('1. textarea:', f1.result.value);

    // 2. 点击聚焦 + insertText
    const info = JSON.parse(f1.result.value);
    await send('Input.dispatchMouseEvent',{type:'mousePressed', x:info.x, y:info.y, button:'left', clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased', x:info.x, y:info.y, button:'left', clickCount:1});
    await sleep(400);
    await send('Input.insertText',{text: KW});
    await sleep(400);
    const f2 = await send('Runtime.evaluate',{expression:`(function(){
      var ta = document.getElementById('alisearch-input');
      return JSON.stringify({val: ta ? ta.value : null});
    })()`, returnByValue:true});
    console.log('2. 键入后 value:', f2.result.value);

    // 3. 按 Enter
    await send('Input.dispatchKeyEvent',{type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
    await sleep(4000);

    // 4. 枚举所有 tab
    const tabs2 = await get(`http://127.0.0.1:${PORT}/json`);
    console.log('4. Enter 后 tabs:');
    tabs2.forEach(t=>{ if(t.type==='page') console.log('   -', (t.url||'').slice(0,100), '|', (t.title||'').slice(0,40)); });
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
