// 检查页面 context 的 mtop 对象，测试能否直接调用拉商品
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
  const r = await ev(`(()=>{
    const out = {};
    // 找 mtop 对象
    const mtops = Object.keys(window).filter(k=>/mtop|lib/i.test(k)).slice(0,20);
    out.mtop_keys = mtops;
    for(const k of mtops.slice(0,5)){
      try{ const v = window[k]; out[k] = typeof v==='function'?'[function]':(typeof v==='object'?(v?Object.keys(v).slice(0,15):'null'):String(v).slice(0,60)); }catch(e){}
    }
    // _m_h5_tk cookie
    out.m_h5_tk = document.cookie.match(/_m_h5_tk=([^;]+)/)?.[1]?.slice(0,80) || '无';
    // 分页器探测
    const pager = document.querySelector('[class*="pagination"],[class*="pager"],.next-btn,[class*="next"]');
    out.pager = pager ? pager.outerHTML.slice(0,300) : '无分页器';
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
