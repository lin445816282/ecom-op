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
  await sleep(2000);
  for(let i=0;i<3;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  const r = await ev(`(()=>{
    const all=[...document.querySelectorAll('a')];
    const hrefs=all.map(a=>(a.href||a.getAttribute('href')||'')).slice(0,36);
    // 找含 ¥ 的元素，向上找卡片容器
    const priceEl=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/^¥\\s*[\\d.]+$/.test((e.textContent||'').trim()));
    let card=priceEl;
    for(let i=0;i<8&&card;i++){ if((card.className||'').toString().match(/offer|goods|item|card|list|detail/i)) break; card=card.parentElement; }
    return JSON.stringify({
      hrefs: hrefs.filter(h=>h),
      priceParent: priceEl?priceEl.parentElement.className:'无',
      cardCls: card?(card.className||'').toString().slice(0,60):'无',
      cardHTML: card?card.outerHTML.slice(0,1200):'无'
    }, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
