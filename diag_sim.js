
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
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    // 模拟 scrape.js 导航
    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    let final='';
    for(let i=0;i<20;i++){await sleep(1000);final=(await ev('location.href'))||'';if(/detail\.1688\.com\/offer\//.test(final))break;}
    await sleep(3000);

    // 检查详情模块
    const modCheck = await ev(`(()=>{
      const m=document.querySelector('.module-od-product-description');
      return JSON.stringify({hasModule:!!m, htmlHasItemcdn: (document.documentElement.outerHTML||'').includes('itemcdn')});
    })()`);
    console.log('导航后 sleep3s:', modCheck);

    // 点击 collapse-header
    const clickRes = await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 'clicked';}return 'no module';})()`);
    console.log('点击结果:', clickRes);
    await sleep(3000);

    // 再检查
    const afterCheck = await ev(`(()=>{
      const m=document.querySelector('.module-od-product-description');
      const html=document.documentElement.outerHTML||'';
      const mm=html.match(/itemcdn\.tmall\.com\/1688offer\/([A-Za-z0-9]+)/);
      return JSON.stringify({hasModule:!!m, htmlHasItemcdn: html.includes('itemcdn'), detailId: mm?mm[1]:null});
    })()`);
    console.log('点击后 sleep3s:', afterCheck);

    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
