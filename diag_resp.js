
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get('http://127.0.0.1:9238/json');
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    const descReqIds=[];
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{
      const m=JSON.parse(ev.data);
      if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result);return;}
      if(m.method==='Network.responseReceived'){
        const u=m.params.response.url||'';
        if(/od\.data\.query/.test(u)) descReqIds.push({id:m.params.requestId, url:u.slice(0,110)});
      }
    });
    await send('Runtime.enable',{}); await send('Page.enable',{}); await send('Network.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    for(let i=0;i<20;i++){await sleep(1000);const f=(await ev('location.href'))||'';if(/detail\.1688\.com\/offer\//.test(f))break;}
    await sleep(2000);
    await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
    await sleep(4000);

    console.log('=== od.data.query 响应 ===');
    for(const r of descReqIds){
      try{
        const body = await send('Network.getResponseBody',{requestId:r.id});
        const txt = body.body||'';
        console.log('URL:', r.url);
        console.log('BODY(前800):', txt.slice(0,800));
      }catch(e){ console.log('  读取失败:', e.message); }
    }
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
