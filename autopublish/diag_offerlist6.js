// 诊断 offerlist 页商品卡片 DOM 结构
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const PREFIX = process.argv[2] || 'chidangy';
  const PORT = process.argv[3] || '9238';
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  if(!tabs || !tabs.length){ console.log(JSON.stringify({error:'CDP无实例'})); process.exit(1); }
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws=new WebSocket(g.webSocketDebuggerUrl);
  let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{});
  await send('Page.navigate',{url:`https://${PREFIX}.1688.com/page/offerlist.htm`});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/offerlist/.test(f||''))break;}
  await sleep(3000);
  for(let i=0;i<5;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  const r = await ev(`(()=>{
    const out = {};
    // 找价格元素，向上 4 层拿卡片结构
    const prices = [...document.querySelectorAll('div,span,a')].filter(e=>e.children.length<=1 && /¥\\d/.test(e.textContent.trim())).slice(0,2);
    out.price_samples = prices.map(e=>{
      let chain = [];
      let cur = e;
      for(let i=0;i<4 && cur;i++){ chain.push(cur.tagName + '.' + (cur.className||'').toString().split(' ').slice(0,2).join('.')); cur=cur.parentElement; }
      return {text: e.textContent.trim().slice(0,30), chain};
    });
    // 商品标题：长文本叶子元素
    const titles = [...document.querySelectorAll('div,span,a,h3')].filter(e=>e.children.length===0 && e.textContent.trim().length>15).slice(0,3);
    out.title_samples = titles.map(e=>({text:e.textContent.trim().slice(0,40), tag:e.tagName, cls:(e.className||'').toString().slice(0,60), href:e.getAttribute&&e.getAttribute('href')||''}));
    // 所有 offerId 形式的 data 属性
    const offerEls = [...document.querySelectorAll('[data-offer-id],[data-offerid],[data-id],[offerid]')].filter(e=>/\\d{10,}/.test((e.getAttribute('data-offer-id')||e.getAttribute('data-offerid')||e.getAttribute('data-id')||e.getAttribute('offerid')||''))).slice(0,5);
    out.offer_els = offerEls.map(e=>e.outerHTML.slice(0,200));
    // body 里 a 标签带 offer 的（含 onclick 跳转的）
    const allA = [...document.querySelectorAll('a')].filter(a=>a.href||a.onclick).map(a=>({href:a.href, cls:(a.className||'').slice(0,50), onclick:(a.getAttribute('onclick')||'').slice(0,50)})).filter(x=>x.href||x.onclick);
    out.all_a = allA.slice(0,20);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
