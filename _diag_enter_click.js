const http = require('http');
const PORT = '9232';
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)})}
(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const cat=tabs.find(t=>t.type==='page'&&/goods\/category/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws=new WebSocket(cat.webSocketDebuggerUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>rej(new Error('to')),10000);p.set(mid,{res,rej,to});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')console.log('  [CONSOLE ERROR]',String(m.params.args.map(a=>a.value||a.description||'').join(' ')).slice(0,150));
    if(m.method==='Runtime.exceptionThrown')console.log('  [EXCEPTION]',String(m.params.exceptionDetails.text||'').slice(0,150));
    if(m.id&&p.has(m.id)){const q=p.get(m.id);clearTimeout(q.to);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  await send('Runtime.enable',{});
  await send('Network.enable',{});
  console.log('=== 点击前 URL ===');
  const u1=await send('Runtime.evaluate',{expression:'location.href',returnByValue:true});
  console.log(' ',u1.result.value);
  // 找到按钮，用键盘 Enter 方式（先 focus 再 Enter，绕过鼠标事件层）
  console.log('=== 尝试 focus + Enter 点击 ===');
  await send('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('确认发布该类商品'));if(!b)return 'NO_BTN';b.focus();return 'focused'})()`,returnByValue:true});
  await new Promise(r=>setTimeout(r,500));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  console.log('已按 Enter，观察 6 秒');
  for(let i=1;i<=6;i++){
    await new Promise(r=>setTimeout(r,1000));
    const u=await send('Runtime.evaluate',{expression:'location.href',returnByValue:true});
    console.log(`  ${i}s ${u.result.value.slice(0,70)}`);
  }
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});
