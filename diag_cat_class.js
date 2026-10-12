// 诊断：搜索"果盘"后 dump 结果项的真实 DOM 结构（tag/class/text），找正确选择器
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = process.argv[2] || '9234';
const KW = process.argv[3] || '果盘';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    if(!tabs || !tabs.length){ console.log('NO_TABS / json 返回空'); return; }
    console.log('tabs 数:', tabs.length, '类型:', tabs.map(t=>t.type).join(','));
    let page = tabs.find(t=>t.type==='page' && /goods\/category|mms\.pinduoduo/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    console.log('当前 page url:', (page.url||'').slice(0,80));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    // 如果在发布页，先导航回类目页；否则直接搜索
    await send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    await sleep(7000);

    // 搜索
    const fill = await send('Runtime.evaluate',{expression:`(function(){
      var inp=document.querySelector('input[placeholder*="搜索"], input[placeholder*="分类"]');
      if(!inp) return 'NO_INPUT';
      var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(inp, ${JSON.stringify(KW)});
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      inp.focus();
      return 'OK placeholder='+inp.placeholder;
    })()`, returnByValue:true});
    console.log('填搜索:', fill.result.value);
    await sleep(4500);

    // dump：所有文本含关键词的叶子元素的 tag/class/text
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var kw=${JSON.stringify(KW)};
      var out=[];
      var all=document.querySelectorAll('*');
      var seen=new Set();
      for(var i=0;i<all.length;i++){
        var e=all[i];
        if(e.children.length>0) continue; // 只要叶子
        var t=(e.textContent||'').trim();
        if(t.length<2||t.length>80) continue;
        if(t.indexOf(kw)<0 && t.indexOf('餐具')<0 && t.indexOf('餐饮')<0) continue;
        var key=e.tagName+'.'+(e.className||'').slice(0,60)+'|'+t;
        if(seen.has(key)) continue; seen.add(key);
        out.push(e.tagName+' :: '+(typeof e.className==='string'?e.className.slice(0,60):'(svg)')+' :: '+t);
        if(out.length>=30) break;
      }
      return JSON.stringify(out);
    })()`, returnByValue:true});
    console.log('=== 含「'+KW+'/餐具/餐饮」的叶子元素 ===');
    try{ JSON.parse(r.result.value).forEach(t=>console.log('  '+t)); }catch(e){ console.log('原始:', String(r.result.value).slice(0,500)); }

    // dump body 全文前 2000 字
    const r2 = await send('Runtime.evaluate',{expression:`document.body.innerText.slice(0,2000)`, returnByValue:true});
    console.log('=== body 全文 ===');
    console.log(r2.result.value);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
