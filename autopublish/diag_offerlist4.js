// 诊断 pageData 里 13 位数字的字段名 + components 里 offer 数据位置
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
    const s = JSON.stringify(window.pageData||{});
    // 找 13 位数字的字段名上下文（前后 60 字符）
    const ctx = [];
    const re = /.{0,60}\\d{12,}.{0,60}/g;
    let m; let cnt=0;
    while((m=re.exec(s)) && cnt<8){ ctx.push(m[0].replace(/\\n/g,'')); cnt++; }
    out.digit_ctx = ctx;
    // 递归找含 offerId/offer/title/subject 字段的对象
    const hits = [];
    function walk(o, path, d){
      if(!o || d>15 || hits.length>=5) return;
      if(typeof o==='object'){
        const keys = Object.keys(o);
        if(keys.some(k=>/offerId|offerID|offer_id/i.test(k))){
          hits.push({path, keys: keys.slice(0,20)}); return;
        }
        for(const k in o){ try{ walk(o[k], path+'.'+k, d+1); }catch(e){} }
      }
    }
    walk(window.pageData, 'pd', 0);
    out.offer_hits = hits;
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(r);
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
