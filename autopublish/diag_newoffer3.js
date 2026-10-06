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
    // 找长文本标题元素（≥6字），向上找卡片容器，dump 属性
    const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim().length>=10);
    const title=leaves.find(e=>/铁艺|花|庭院|壁挂|花园/.test(e.textContent||''));
    if(!title) return 'no title';
    let card=title;
    const chain=[];
    for(let i=0;i<6&&card;i++){
      const attrs=[...card.attributes].map(a=>a.name+'='+(a.value||'').slice(0,50)).join(' ');
      chain.push({tag:card.tagName, cls:(card.className||'').toString().slice(0,50), attrs:attrs.slice(0,120)});
      card=card.parentElement;
    }
    // 也找 onclick / data-offer
    const onclickEl=[...document.querySelectorAll('[onclick], [data-offer], [data-id], [data-goods]')].slice(0,10).map(e=>({tag:e.tagName, cls:(e.className||'').toString().slice(0,40), attrs:[...e.attributes].map(a=>a.name+'='+(a.value||'').slice(0,40)).join(' ').slice(0,100)}));
    return JSON.stringify({titleTxt:(title.textContent||'').trim().slice(0,30), chain, onclickEl}, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
