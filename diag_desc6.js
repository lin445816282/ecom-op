
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get('http://127.0.0.1:9238/json');
    const page = tabs.find(t=>t.type==='page'&&/detail\.1688\.com\/offer/.test(t.url||''))||tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Runtime.enable',{}); await send('Page.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    // 模拟 scrape.js：滚动到底 5 次
    for(let i=0;i<5;i++){ await ev('window.scrollTo(0,document.body.scrollHeight)'); await sleep(800); }
    await ev('window.scrollTo(0,0)');

    // 检查 v-detail-k 状态（滚动后）
    const before = await ev(`(()=>{
      const v=document.querySelector('v-detail-k.html-description')||document.querySelector('v-detail-k');
      if(!v) return 'no v-detail-k';
      return JSON.stringify({hasShadow:!!v.shadowRoot, shadowImgs: v.shadowRoot? v.shadowRoot.querySelectorAll('img').length : -1});
    })()`);
    console.log('滚动后 v-detail-k 状态:', before);

    // 点击 collapse-header
    const click = await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 'clicked';}return 'no module';})()`);
    console.log('点击 collapse-header:', click);
    await sleep(3000);

    // 点击后再检查
    const after = await ev(`(()=>{
      const v=document.querySelector('v-detail-k.html-description')||document.querySelector('v-detail-k');
      if(!v) return 'no v-detail-k';
      return JSON.stringify({hasShadow:!!v.shadowRoot, shadowImgs: v.shadowRoot? v.shadowRoot.querySelectorAll('img').length : -1});
    })()`);
    console.log('点击后 v-detail-k 状态:', after);

    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
