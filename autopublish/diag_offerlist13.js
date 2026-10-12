// 拦截所有 mtop 响应，找含 offer 数据的（offerList / offerId）
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
  const bodies = [];
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',async ev=>{
    const m=JSON.parse(ev.data);
    if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}
    else if(m.method==='Network.responseReceived'){
      const url = m.params.response.url;
      if(/h5api\.m\.1688\.com/.test(url) && bodies.length<15){
        const rid = m.params.requestId;
        try{
          const r = await send('Network.getResponseBody',{requestId:rid});
          const body = r && r.body ? r.body : '';
          if(/offer|subject|image|price|商品/i.test(body)){
            bodies.push({api: (url.match(/api=([^&]+)/)||[])[1]||'', body: body.slice(0,1500)});
          }
        }catch(e){}
      }
    }
  });
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{}); await send('Network.enable',{});
  await send('Page.navigate',{url:`https://${PREFIX}.1688.com/page/offerlist.htm`});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/offerlist/.test(f||''))break;}
  await sleep(3000);
  for(let i=0;i<5;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  await sleep(1500);
  console.log(JSON.stringify({bodies}, null, 1));
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
