// 全面诊断：shopPageDataApi + 全局变量 + 商品卡片图片URL 里的 offerId
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
    // 商品卡片图片 URL（含 offerId 线索）
    const img = document.querySelector('p[title*="圆盘铁艺"]');
    let cardImg = null;
    if(img){
      let cur = img;
      for(let i=0;i<8 && cur;i++){ cur = cur.parentElement; if(cur && cur.querySelector && cur.querySelector('img')){ cardImg = cur.querySelector('img'); break; } }
    }
    out.card_img = cardImg ? {src: cardImg.src.slice(0,150), dataSrc: cardImg.getAttribute('data-src'), attrs: [...cardImg.attributes].map(a=>a.name+'='+a.value.slice(0,60)).slice(0,15)} : '未找到img';
    // shopPageDataApi
    const api = window.shopPageDataApi;
    out.shopPageDataApi = api ? {type: typeof api, keys: Object.keys(api).slice(0,20), sample: JSON.stringify(api).slice(0,800)} : '无';
    // 全局变量里含 offer 的
    const offerGlobals = Object.keys(window).filter(k=>/offer/i.test(k)).slice(0,20);
    out.offer_globals = offerGlobals;
    for(const k of offerGlobals.slice(0,3)){
      try{ const v = window[k]; out[k] = typeof v==='string' ? v.slice(0,200) : (v?JSON.stringify(v).slice(0,300):'null'); }catch(e){}
    }
    // body 里所有 img 的 src 含 offerId（13位）的
    const imgs = [...document.querySelectorAll('img')].map(i=>i.src||i.getAttribute('data-src')||'').filter(s=>s);
    out.img_with_offerid = imgs.filter(s=>/\\d{12,}/.test(s)).slice(0,5).map(s=>s.slice(0,150));
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
