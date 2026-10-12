
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
    let itemcdnUrl='';
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',async ev=>{
      const m=JSON.parse(ev.data);
      if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result);return;}
      if(m.method==='Network.requestWillBeSent'){
        const u=m.params.request.url||'';
        if(/itemcdn\.tmall\.com\/1688offer/.test(u)) itemcdnUrl=u;
      }
    });
    await send('Runtime.enable',{}); await send('Page.enable',{}); await send('Network.enable',{});
    const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);

    await send('Page.navigate',{url:'https://detail.1688.com/offer/874253511813.html'});
    for(let i=0;i<20;i++){await sleep(1000);const f=(await ev('location.href'))||'';if(/detail\.1688\.com\/offer\//.test(f))break;}
    await sleep(2000);
    await ev(`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
    await sleep(5000);

    console.log('=== itemcdn 完整 URL ===');
    console.log(itemcdnUrl);

    // 在页面 HTML + 全局变量里找这个 ID 的来源
    const r = await ev(`(function(){
      var html=document.documentElement.outerHTML;
      var id='icoss321896289995efbdbb8a49250c';
      // 找 ID 在 HTML 里的位置
      var idx=html.indexOf(id);
      var ctx='';
      if(idx>=0) ctx=html.slice(idx-200, idx+200);
      // 找 1688offer 相关
      var idx2=html.indexOf('1688offer');
      var ctx2='';
      if(idx2>=0) ctx2=html.slice(idx2-300, idx2+300);
      return JSON.stringify({idInHtml: idx>=0, idCtx: ctx, offerCtx: ctx2});
    })()`);
    const d=JSON.parse(r);
    console.log('=== ID 在 HTML 里?', d.idInHtml, '===');
    if(d.idCtx) console.log(d.idCtx.slice(0,400));
    console.log('=== 1688offer 附近 ===');
    if(d.offerCtx) console.log(d.offerCtx.slice(0,600));
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
