// 诊断 offerlist 页结构：dump pageData keys + offer 提取来源
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
  // 滚动几次触发懒加载
  for(let i=0;i<3;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  const r = await ev(`(()=>{
    const out = {};
    out.title = document.title;
    out.href = location.href;
    out.has_pageData = !!window.pageData;
    out.pageData_keys = window.pageData ? Object.keys(window.pageData).slice(0,40) : [];
    out.has_INIT = !!window.__INIT_DATA__;
    // 页面里所有 offer 链接
    const links = [...document.querySelectorAll('a[href*="offer"],a[href*="offerId"]')].map(a=>a.href).filter(h=>/\\d{10,}/.test(h));
    out.offer_links_count = links.length;
    out.offer_links_sample = [...new Set(links)].slice(0,8);
    // 全局对象里找 offerId
    const s = JSON.stringify(window.pageData||{});
    const offerIds = [...new Set((s.match(/"(?:offerId|offer_id|id)"\\s*:\\s*"?\\d{10,}/g)||[]))].slice(0,10);
    out.offerIds_in_pageData = offerIds;
    // 是否有 subject 字段
    out.has_subject = s.includes('subject');
    // body 文本片段
    out.bodyText = document.body.innerText.slice(0,300);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
