const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const tabs=await get('http://127.0.0.1:9238/json');
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws=new WebSocket(g.webSocketDebuggerUrl);
  let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{});
  await send('Page.navigate',{url:'https://nixityg.1688.com/page/newofferlist.htm'});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/newofferlist/.test(f||''))break;}
  await sleep(2500);
  for(let i=0;i<3;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  // 找商品图片 img（在 commodityZoneContainer 里）
  const r0 = await ev(`(()=>{
    const zone=document.querySelector('#commodityZoneContainer');
    const imgs=[...zone.querySelectorAll('img')].filter(i=>i.getBoundingClientRect().width>50);
    if(!imgs.length) return 'no img';
    const im=imgs[0];
    im.scrollIntoView({block:'center'});
    const rc=im.getBoundingClientRect();
    return JSON.stringify({x:Math.round(rc.x+rc.width/2),y:Math.round(rc.y+rc.height/2),w:Math.round(rc.width),h:Math.round(rc.height)});
  })()`);
  console.log('商品图:', r0);
  if(r0!=='no img'){
    const pp=JSON.parse(r0);
    await sleep(500);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pp.x-60,y:pp.y}); await sleep(200);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pp.x,y:pp.y}); await sleep(400);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pp.x,y:pp.y,button:'left',clickCount:1}); await sleep(100);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pp.x,y:pp.y,button:'left',clickCount:1});
  }
  await sleep(4000);
  const r1 = await ev('location.href');
  console.log('点击后 URL:', r1);
  // 查是否有新标签
  const tabs2=await get('http://127.0.0.1:9238/json');
  console.log('tabs:', tabs2.filter(t=>t.type==='page').map(t=>t.url.slice(0,80)));
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
