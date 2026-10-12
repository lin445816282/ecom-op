// 诊断 offerlist 页的 AJAX 接口：performance 拿所有请求 + 拦截含商品数据的响应
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
    const res = performance.getEntriesByType('resource').map(e=>e.name);
    out.res_count = res.length;
    out.api_urls = res.filter(u=>/offer|ajax|api|list|search/i.test(u) && !/\\.(png|jpg|jpeg|webp|css|js|woff|svg|ico)/i.test(u)).slice(0,30);
    // DOM 里商品卡片探测：找含 ¥ 价格的元素，向上找卡片结构
    const priceEls = [...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /^¥\\d/.test(e.textContent.trim())).slice(0,3);
    out.price_el_samples = priceEls.map(e=>e.outerHTML.slice(0,200));
    // 找商品标题元素（长文本 + 含 offer 相关父级）
    out.dom_html = document.querySelector('.offer-list, .offerlist, [class*="offer"], .component').outerHTML.slice(0,500);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
