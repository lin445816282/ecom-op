// 实验：scrollIntoView 一口价输入框后，CDP 真实键盘输入填值
const http = require('http');
const PORT = '9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}
async function key(c,type,key,code,vk,mod){ await c.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,modifiers:mod||0}); }

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // scrollIntoView 一口价 input 并取坐标
  const coord = await ev(c, `(()=>{var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var t=(all[i].textContent||'').trim();if(t.indexOf('一口价')===0&&t.length<40){var inp=all[i].querySelector('input')||(all[i].parentElement&&all[i].parentElement.querySelector('input'));if(inp){inp.scrollIntoView({block:'center'});var r=inp.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}}}return 'nf';})()`);
  console.log('一口价input坐标:', coord);
  await sleep(500);
  const p = JSON.parse(coord);

  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
  await sleep(300);
  await key(c,'keyDown','a','KeyA',65,2); await key(c,'keyUp','a','KeyA',65,2);
  await key(c,'keyDown','Backspace','Backspace',8); await key(c,'keyUp','Backspace','Backspace',8);
  await c.send('Input.insertText',{text:'57.3'});
  await sleep(500);
  await key(c,'keyDown','Tab','Tab',9); await key(c,'keyUp','Tab','Tab',9);
  await sleep(800);

  const after = await ev(c, `(()=>{var e=__SELL_STATE__.getState().engine;var fe=e.getModels().formError||{};var fv=e.getModels().formValues;return JSON.stringify({priceErr:JSON.stringify(fe.price), baseCard:JSON.stringify(fv['base-card']), saleCard:JSON.stringify(fv['sale-card'])});})()`);
  console.log('CDP键盘输入后:', after);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
