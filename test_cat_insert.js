// 验证 publish.js 的 fillByType 方式（insertText 不按Enter）能否触发搜索
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    const page = tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    // 模拟 publish.js 的 fillByType：click + focus + insertText（不按 Enter）
    await send('Runtime.evaluate',{expression:`(()=>{const inp=document.querySelector('input[placeholder="请输入关键词搜索分类"]');if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`, returnByValue:true});
    await sleep(250);
    await send('Input.insertText',{text:'气球'});
    await sleep(4000);

    // dump 结果（publish.js 的 selector）
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var cands = [...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
      var norm = e => (e.textContent||'').trim();
      var list = cands.map(norm).slice(0, 10);
      var inp = document.querySelector('input[placeholder="请输入关键词搜索分类"]');
      return JSON.stringify({inputVal: inp ? inp.value : null, cands: list});
    })()`, returnByValue:true});
    console.log(r.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
