// 定位商品标题元素，dump 祖先链找 offerId/链接
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
  for(let i=0;i<4;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  const r = await ev(`(()=>{
    const out = {};
    // 找含"圆盘铁艺"或"烛台鸟笼"标题的元素
    const kw = ['圆盘铁艺','烛台鸟笼','金属托盘'];
    for(const k of kw){
      const el = [...document.querySelectorAll('div,span,a,h3,p')].find(e=>e.children.length===0 && e.textContent.includes(k));
      if(el){
        let chain = [];
        let cur = el;
        for(let i=0;i<8 && cur;i++){
          const attrs = {};
          for(const a of cur.attributes||[]){ if(/offer|href|data|click|link|url|id|spm/i.test(a.name)) attrs[a.name]=a.value.slice(0,80); }
          chain.push({tag:cur.tagName, cls:(cur.className||'').toString().slice(0,80), attrs});
          cur = cur.parentElement;
        }
        out[k] = {text: el.textContent.trim().slice(0,40), chain};
      }
    }
    // 商品卡片容器探测
    const card = document.querySelector('[class*="offer"],[class*="card"],[class*="item"]');
    out.card_sample = card ? card.outerHTML.slice(0,600) : '无';
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
