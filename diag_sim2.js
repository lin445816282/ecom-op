
const http = require('http');
const https = require('https');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get('http://127.0.0.1:9238/json');
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>{return {raw:r, val:r&&r.result?r.result.value:undefined};});

    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    let final='';
    for(let i=0;i<20;i++){await sleep(1000);final=(await ev('location.href')).val||'';if(/detail\.1688\.com\/offer\//.test(final))break;}
    await sleep(3000);

    // 点击 collapse-header
    const click = await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
    console.log('点击结果:', JSON.stringify(click.val));
    await sleep(3000);

    // 提取 detailId（和 scrape.js 一样）
    const detailId = await ev(`(()=>{
      const html=document.documentElement.outerHTML||'';
      const i=html.indexOf('1688offer/');
      if(i<0)return '';
      const seg=html.slice(i+11);
      const mm=seg.match(/[A-Za-z0-9]+/);
      return mm?mm[0]:'';
    })()`);
    console.log('detailId:', JSON.stringify(detailId.val), '| raw result:', JSON.stringify(detailId.raw && detailId.raw.result ? detailId.raw.result : detailId.raw));

    if(detailId.val){
      const detailTxt=await new Promise((res,rej)=>{
        https.get('https://itemcdn.tmall.com/1688offer/'+detailId.val,{headers:{'Referer':'https://detail.1688.com/','User-Agent':'Mozilla/5.0'}},r=>{
          let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));
        }).on('error',()=>res(''));
      });
      console.log('响应长度:', detailTxt.length);
      const imgs=[...detailTxt.matchAll(/src=\\"([^"]+cib\.jpg)/g)].map(x=>x[1]);
      console.log('详情图数:', imgs.length);
    }
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
