// 诊断 offerlist 页 components 结构 + offer 数据位置
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
  const url = `https://${PREFIX}.1688.com/page/offerlist.htm`;
  await send('Page.navigate',{url});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/offerlist/.test(f||''))break;}
  await sleep(3000);
  for(let i=0;i<4;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  const r = await ev(`(()=>{
    const out = {};
    const pd = window.pageData || {};
    // pageData JSON 里的 12 位数字（offerId 候选）
    const s = JSON.stringify(pd);
    out.digit12 = [...new Set((s.match(/\\d{12,}/g)||[]))].slice(0,15);
    out.digit12_count = (s.match(/\\d{12,}/g)||[]).length;
    // components 结构（递归找含 offer/商品 的字段名）
    out.components_keys = pd.components ? Object.keys(pd.components) : [];
    // DOM 里商品卡片：找含 offer 链接的任意元素
    const allA = [...document.querySelectorAll('a')].map(a=>a.href).filter(h=>h);
    out.all_a_count = allA.length;
    out.offer_a = allA.filter(h=>/offer/.test(h)).slice(0,10);
    // DOM 里 data-offer 属性
    const dataOffers = [...document.querySelectorAll('[data-offer-id],[data-offerid],[data-id]')].slice(0,10).map(e=>e.outerHTML.slice(0,120));
    out.dataOffer = dataOffers;
    // 找商品链接的通用方式：href 含 offer 或 detail
    out.detail_links = allA.filter(h=>/detail\\.1688|offer/.test(h)).slice(0,10);
    // 全局对象探测
    out.globals = Object.keys(window).filter(k=>/offer|data|page|init/i.test(k)).slice(0,30);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
