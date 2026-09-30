// 1688 首页搜索框搜索（textarea#alisearch-input + form.submit）+ 零反斜杠提取 offerId
// 用法: node search_1688_home.js <port> <关键词> [数量]
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
const KW = process.argv[3] || '';
const LIMIT = parseInt(process.argv[4] || '20', 10);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page' && !/punish/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    if(!page){ console.log(JSON.stringify({error:'NO_PAGE'})); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    // 确保在首页
    const cur = await send('Runtime.evaluate',{expression:'location.href', returnByValue:true});
    const curUrl = cur.result.value || '';
    if(!/1688\.com/.test(curUrl) || /punish|x5sec/.test(curUrl)){
      await send('Page.navigate',{url:'https://www.1688.com/'});
      await sleep(7000);
    }

    // 设值 + form.submit（target 改 _self 避免 popup）
    await send('Runtime.evaluate',{expression:`(function(){
      var ta = document.getElementById('alisearch-input');
      if(!ta) return 'NO_TA';
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(KW)});
      ta.dispatchEvent(new Event('input', {bubbles:true}));
      ta.dispatchEvent(new Event('change', {bubbles:true}));
      var form = document.getElementById('alisearch-form');
      if(form){ form.target = '_self'; form.submit(); return 'SUBMITTED'; }
      return 'NO_FORM';
    })()`, returnByValue:true});
    await sleep(6000);

    // 检查风控 + 结果
    const rUrl = await send('Runtime.evaluate',{expression:'location.href', returnByValue:true});
    const nowUrl = rUrl.result.value || '';
    if(/punish|x5sec/.test(nowUrl)){ console.log(JSON.stringify({error:'BLOCKED', url: nowUrl.slice(0,90)})); ws.close(); process.exit(0); return; }
    if(!/offer_search|selloffer|keywords=/.test(nowUrl)){ console.log(JSON.stringify({error:'NO_JUMP', url: nowUrl.slice(0,90)})); ws.close(); process.exit(0); return; }

    // 滚动加载
    for(let i=0;i<4;i++){
      await send('Runtime.evaluate',{expression:'window.scrollTo(0,'+((i+1)*1200)+')'});
      await sleep(900);
    }
    await sleep(1200);

    // 零反斜杠提取：indexOf + 字符比较
    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out=[]; var seen={};
      var links = document.querySelectorAll('a[href*="offerId="]');
      for (var i=0;i<links.length;i++){
        var href = links[i].href || '';
        var idx = href.indexOf('offerId=');
        if(idx < 0) continue;
        var rest = href.slice(idx + 8);
        var oid = '';
        for(var j=0;j<rest.length;j++){
          var c = rest.charAt(j);
          if(c >= '0' && c <= '9'){ oid += c; } else { break; }
        }
        if(!oid || seen[oid]) continue;
        var txt = (links[i].textContent || '').trim();
        if(txt.length < 10) continue;
        seen[oid] = 1;
        out.push({oid: oid, url: 'https://detail.1688.com/offer/' + oid + '.html', txt: txt.slice(0, 220)});
        if(out.length >= ${LIMIT}) break;
      }
      return JSON.stringify(out);
    })()`, returnByValue:true});

    const items = JSON.parse((r && r.result && r.result.value) || '[]');
    console.log(JSON.stringify({ok:true, url: nowUrl.slice(0,80), count: items.length, items: items}));
    ws.close();
    process.exit(0);
  }catch(e){ console.log(JSON.stringify({error:e.message})); process.exit(1); }
})();
