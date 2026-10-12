
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
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    await send('Page.navigate',{url:'https://qr.1688.com/s/yD0hfeAD'});
    let final='';
    for(let i=0;i<20;i++){await sleep(1000);final=(await ev('location.href'))||'';if(/detail\.1688\.com\/offer\//.test(final))break;}
    await sleep(3000);

    const check = ()=>ev(`(()=>{
      const v=document.querySelector('v-detail-k.html-description')||document.querySelector('v-detail-k');
      const m=document.querySelector('.module-od-product-description');
      const cb=m?m.querySelector('.collapse-body'):null;
      return JSON.stringify({hasVdk:!!v, shadowImgs:(v&&v.shadowRoot)?v.shadowRoot.querySelectorAll('img').length:-1, hasCollapseBody:!!cb, cbHasVdk: cb? (cb.innerHTML||'').includes('v-detail-k'):false});
    })()`);

    // 滚动到底 4 次 + 回顶（复现 diag_img_struct.js）
    for(let i=0;i<4;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
    await ev('window.scrollTo(0,0)'); await sleep(1000);
    console.log('滚动后:', await check());

    // 点击 collapse-header（复现 diag_desc2.js）
    await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
    await sleep(3000);
    console.log('点击后:', await check());

    // 轮询 20 秒
    for(let t=1;t<=4;t++){
      await sleep(5000);
      console.log(`轮询 ${t*5}s:`, await check());
    }

    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
