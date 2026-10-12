
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
    const reqs=[];
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{
      const m=JSON.parse(ev.data);
      if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);if(m.error)q.rej(new Error(m.error.message));else q.res(m.result);return;}
      if(m.method==='Network.requestWillBeSent'){
        const u=m.params.request.url||'';
        if(/desc|detail|offer|sku|pic|image|goods/i.test(u)) reqs.push(u.slice(0,130));
      }
    });
    await send('Runtime.enable',{}); await send('Page.enable',{}); await send('Network.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    await sleep(8000);
    await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
    await sleep(5000);

    console.log('=== 详情/图片相关请求 ('+reqs.length+') ===');
    reqs.forEach(u=>console.log('  '+u));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
