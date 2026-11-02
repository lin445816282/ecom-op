// 诊断嘉裕(9232) goods/category 页「确认发布该类商品」按钮点击后行为
const http = require('http');
const PORT = '9232';

function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)})}

async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{p.delete(mid);rej(new Error('timeout'))},15000);p.set(mid,{res,rej,to});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);
    if(m.method==='Network.requestWillBeSent'){console.log('  [REQ]',m.params.request.url.slice(0,90))}
    if(m.id&&p.has(m.id)){const q=p.get(m.id);clearTimeout(q.to);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}

(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const cat=tabs.find(t=>t.type==='page'&&/goods\/category/.test(t.url));
  if(!cat){console.log('无 goods/category tab，现有 tab:');tabs.filter(t=>t.type==='page').forEach(t=>console.log('  '+t.url));process.exit(0)}
  console.log('连接:', cat.url.slice(0,80));
  const c=await conn(cat.webSocketDebuggerUrl);
  await c.send('Page.enable',{});
  await c.send('Runtime.enable',{});
  await c.send('Network.enable',{});
  // 按钮状态
  const btnInfo=await c.send('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('确认发布该类商品'));if(!b)return 'NO_BTN';const r=b.getBoundingClientRect();return JSON.stringify({text:b.textContent.trim(),disabled:b.disabled,w:r.width,h:r.height,x:r.x,y:r.y,visible:r.width>0})})()`,returnByValue:true});
  console.log('按钮状态:', btnInfo.result.value);
  console.log('当前URL:', await (await c.send('Runtime.evaluate',{expression:'location.href',returnByValue:true})).result.value);
  // 真实轨迹点击
  console.log('=== 点击「确认发布该类商品」===');
  const pos=await c.send('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('确认发布该类商品'));if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,returnByValue:true});
  if(!pos.result.value){console.log('找不到按钮坐标');process.exit(1)}
  const {x,y}=pos.result.value;
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x-60,y});
  await new Promise(r=>setTimeout(r,200));
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await new Promise(r=>setTimeout(r,400));
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,150));
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  console.log('已点击，观察 8 秒...');
  for(let i=1;i<=8;i++){
    await new Promise(r=>setTimeout(r,1000));
    const url=await c.send('Runtime.evaluate',{expression:'location.href',returnByValue:true});
    const body=await c.send('Runtime.evaluate',{expression:'document.body.innerText.slice(0,200).replace(/\\n/g," ")',returnByValue:true});
    console.log(`  ${i}s URL=${url.result.value.slice(0,70)}`);
    if(i===3||i===6) console.log(`      body: ${(body.result.value||'').slice(0,100)}`);
  }
  process.exit(0);
})().catch(e=>{console.log('ERR:',e.message);process.exit(1)});
