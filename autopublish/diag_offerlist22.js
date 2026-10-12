// 拦截商品列表响应体，解析 JSON walk 找 offer 对象字段结构
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
  const reqIds = new Set();
  let fullBody = '';
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',async ev=>{
    const m=JSON.parse(ev.data);
    if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}
    else if(m.method==='Network.requestWillBeSent'){
      const url = m.params.request.url;
      let pd = m.params.request.postData || '';
      try{ if(pd.startsWith('data=')) pd = decodeURIComponent(pd.slice(5)); }catch(e){}
      if(/ModuleAsyncService/.test(url) && /offerlist/i.test(pd) && !fullBody){
        reqIds.add(m.params.requestId);
      }
    }
    else if(m.method==='Network.responseReceived'){
      if(reqIds.has(m.params.requestId) && !fullBody){
        try{
          const r = await send('Network.getResponseBody',{requestId:m.params.requestId});
          fullBody = r && r.body ? r.body : '';
        }catch(e){}
      }
    }
  });
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{}); await send('Network.enable',{});
  await send('Page.navigate',{url:`https://${PREFIX}.1688.com/page/offerlist.htm`});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/offerlist/.test(f||''))break;}
  await sleep(4000);
  for(let i=0;i<3;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  await sleep(1500);
  // 解析响应体，walk 找 offer 对象
  const result = {len: fullBody.length};
  try{
    const json = JSON.parse(fullBody);
    const found = [];
    function walk(o, d){
      if(!o || d>15 || found.length>=2) return;
      if(typeof o==='object'){
        const keys = Object.keys(o);
        if(keys.some(k=>/offerId|offer_id/i.test(k))){
          found.push(o); return;
        }
        for(const k in o){ try{ walk(o[k], d+1); }catch(e){} }
      }
    }
    walk(json, 0);
    if(found.length){
      result.offer_objs = found.map(o=>{
        const sample = {};
        Object.keys(o).slice(0,40).forEach(k=>{
          const v = o[k];
          sample[k] = typeof v==='object' ? (Array.isArray(v)?'[arr '+v.length+']':'[obj]') : String(v).slice(0,80);
        });
        return sample;
      });
    } else {
      // 没找到 offerId 字段，dump 顶层 data.content 的 keys
      const c = json.data && json.data.content ? json.data.content : {};
      result.content_keys = Object.keys(c);
      // 找数字 id 的对象
      const nums = [];
      function walk2(o,d){ if(!o||d>12||nums.length>=2)return; if(typeof o==='object'){ const ks=Object.keys(o); if(ks.includes('id') && /^\d{10,}$/.test(String(o.id))){ nums.push(o); return; } for(const k in o){try{walk2(o[k],d+1)}catch(e){}} } }
      walk2(json, 0);
      result.id_objs = nums.map(o=>{ const s={}; Object.keys(o).slice(0,40).forEach(k=>{const v=o[k]; s[k]=typeof v==='object'?(Array.isArray(v)?'[arr '+v.length+']':'[obj]'):String(v).slice(0,80)}); return s; });
    }
  }catch(e){ result.parse_err = e.message; result.head = fullBody.slice(0,1000); }
  console.log(JSON.stringify(result, null, 1));
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
