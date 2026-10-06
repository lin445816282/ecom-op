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
  // 找商品标题，点击它
  const r0 = await ev(`(()=>{
    const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim().length>=12);
    const t=leaves.find(e=>{const x=(e.textContent||'').trim();return (x.includes('爆款')||x.includes('外贸')||x.includes('花园'))&&!x.includes('九湖')&&!x.includes('尼西')&&!x.includes('铁艺馆');});
    if(!t) return 'no';
    t.scrollIntoView({block:'center'});
    const rc=t.getBoundingClientRect();
    return JSON.stringify({x:Math.round(rc.x+rc.width/2),y:Math.round(rc.y+rc.height/2),txt:(t.textContent||'').trim().slice(0,20)});
  })()`);
  console.log('标题:', r0);
  if(r0!=='no'){
    const pp=JSON.parse(r0);
    await sleep(500);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pp.x-30,y:pp.y}); await sleep(150);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pp.x,y:pp.y}); await sleep(300);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pp.x,y:pp.y,button:'left',clickCount:1}); await sleep(80);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pp.x,y:pp.y,button:'left',clickCount:1});
  }
  await sleep(4000);
  // 看跳转
  const r1 = await ev(`(()=>{
    return JSON.stringify({url:location.href, tabs_opened: performance.getEntriesByType('navigation').length});
  })()`);
  console.log('点击后 URL:', r1);
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
