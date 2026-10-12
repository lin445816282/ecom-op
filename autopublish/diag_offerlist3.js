// 诊断 __TURBO_DATA__ 里的 offer 数据结构
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
    const td = window.__TURBO_DATA__;
    out.has_turbo = !!td;
    const s = JSON.stringify(td||{});
    out.turbo_len = s.length;
    out.turbo_keys = td ? Object.keys(td).slice(0,30) : [];
    // 找 offer 对象：walk turbo，找含 offerId 的对象并 dump 字段
    const found = [];
    function walk(o, d){
      if(!o || d>12 || found.length>=3) return;
      if(typeof o==='object'){
        if(o.offerId && /\\d{10,}/.test(String(o.offerId))){
          found.push(o); return;
        }
        for(const k in o){ try{ walk(o[k], d+1); }catch(e){} }
      }
    }
    walk(td, 0);
    out.offer_objs = found.map(o=>{
      const keys = Object.keys(o).slice(0,30);
      const sample = {};
      keys.forEach(k=>{ const v=o[k]; sample[k]= typeof v==='object' ? (Array.isArray(v)?'[arr '+(v.length||0)+']':'[obj]') : String(v).slice(0,50); });
      return sample;
    });
    // 也 walk pageData 找 offerId
    const pd = window.pageData;
    const found2 = [];
    function walk2(o,d){ if(!o||d>12||found2.length>=3) return; if(typeof o==='object'){ if(o.offerId && /\\d{10,}/.test(String(o.offerId))){found2.push(o);return;} for(const k in o){try{walk2(o[k],d+1)}catch(e){}} } }
    walk2(pd, 0);
    out.offer_objs_pd = found2.map(o=>({keys:Object.keys(o).slice(0,25)}));
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
