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
  for(let i=0;i<4;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  // 精确找商品标题（含「爆款」或「外贸」或「花园」，排除店铺名）
  const r = await ev(`(()=>{
    const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim().length>=12);
    const t=leaves.find(e=>{const x=(e.textContent||'').trim();return (x.includes('爆款')||x.includes('外贸')||x.includes('花园'))&&!x.includes('九湖')&&!x.includes('尼西')&&!x.includes('铁艺馆');});
    if(!t) return JSON.stringify({err:'no product title', sample: leaves.slice(0,20).map(e=>(e.textContent||'').trim().slice(0,30))});
    let card=t;
    const chain=[];
    for(let i=0;i<7&&card;i++){chain.push({tag:card.tagName,cls:(card.className||'').toString().slice(0,45),attrs:[...card.attributes].filter(a=>/href|data|onclick|offer|id/.test(a.name)).map(a=>a.name+'='+(a.value||'').slice(0,45)).join(' ').slice(0,100)});card=card.parentElement;}
    return JSON.stringify({title:(t.textContent||'').trim().slice(0,40), chain}, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
