// 批量搜索多个关键词，dump 每个词的类目搜索结果
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const KWS = (process.argv[2] || '装饰,摆件,灯,节日').split(',');
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:9234/json`);
    let page = tabs.find(t=>t.type==='page' && /goods\/category/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(8000);

    for(const KW of KWS){
      // 清空 + 填入搜索词
      await send('Runtime.evaluate',{expression:`(()=>{const inp=document.querySelector('input[placeholder="请输入关键词搜索分类"]');if(!inp)return 'no';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`, returnByValue:true});
      await sleep(250);
      // 清空现有值
      await send('Runtime.evaluate',{expression:`(()=>{const inp=document.querySelector('input[placeholder="请输入关键词搜索分类"]');if(!inp)return 'no';var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(inp,'');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()`, returnByValue:true});
      await sleep(200);
      await send('Input.insertText',{text: KW});
      await sleep(4000);

      const r = await send('Runtime.evaluate',{expression:`(function(){
        var cands = [...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
        var norm = e => (e.textContent||'').trim();
        return JSON.stringify(cands.map(norm).filter(t=>t.length>=4 && t.length<=70));
      })()`, returnByValue:true});
      const list = JSON.parse(r.result.value);
      console.log('搜索「'+KW+'」→', list.length, '条:');
      list.forEach(t=>console.log('   -', t));
    }
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
