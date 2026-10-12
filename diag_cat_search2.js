// 诊断：搜索"餐具"后 dump 类目页 body 全文 + 搜索框状态
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = process.argv[2] || '9234';
const KW = process.argv[3] || '餐具';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});
    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(7000);
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var inp=document.querySelector('input[placeholder*="搜索"]');
      var info = {url: location.href, hasSearchInput: !!inp, searchPlaceholder: inp?inp.placeholder:''};
      // 找所有 input
      var inputs=[...document.querySelectorAll('input')].map(i=>({ph:i.placeholder||'', val:i.value||''})).slice(0,10);
      info.inputs = inputs;
      return JSON.stringify(info);
    })()`, returnByValue:true});
    console.log('=== 页面信息 ===');
    console.log(r.result.value);
    // 填搜索框
    const fill = await send('Runtime.evaluate',{expression:`(function(){
      var inp=document.querySelector('input[placeholder*="搜索"]');
      if(!inp) return 'no input';
      inp.scrollIntoView({block:'center'}); inp.click(); inp.focus();
      return 'ok';
    })()`, returnByValue:true});
    console.log('fill focus:', fill.result.value);
    await sleep(300);
    await send('Input.insertText',{text:KW});
    await sleep(5000);
    // dump body 全文
    const r2 = await send('Runtime.evaluate',{expression:`(function(){
      return document.body.innerText.slice(0, 2500);
    })()`, returnByValue:true});
    console.log('=== 搜索「'+KW+'」后 body ===');
    console.log(r2.result.value);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
