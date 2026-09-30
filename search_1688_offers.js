// 1688 搜索商品列表采集：匹配 offerId 链接，长度过滤旺旺等短链接
// 用法: node search_1688_offers.js <port> <关键词> [数量]
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
const KW = process.argv[3] || '';
const LIMIT = parseInt(process.argv[4] || '25', 10);

(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    const page = tabs.find(t=>t.type==='page');
    if(!page){ console.log(JSON.stringify({error:'NO_PAGE'})); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    const url = 'https://s.1688.com/selloffer/offer_search.htm?keywords=' + encodeURIComponent(KW);
    await send('Page.navigate',{url});
    await new Promise(r=>setTimeout(r,7000));
    for(let i=0;i<5;i++){
      await send('Runtime.evaluate',{expression:'window.scrollTo(0,'+((i+1)*1500)+')'});
      await new Promise(r=>setTimeout(r,1200));
    }
    await new Promise(r=>setTimeout(r,2000));

    const r = await send('Runtime.evaluate',{expression:`(function(){
      var out=[]; var seen={};
      var links = document.querySelectorAll('a[href*="offerId="]');
      for (var i=0;i<links.length;i++){
        var href = links[i].href || '';
        var m = href.match(/offerId=(\\d+)/);
        var oid = m ? m[1] : '';
        if(!oid || seen[oid]) continue;
        var txt = (links[i].textContent||'').replace(/\\s+/g,' ').trim();
        // 过滤旺旺等短链接（"旺旺在线"仅4字符），商品链接含标题+价格>10字符
        if(txt.length < 10) continue;
        seen[oid] = 1;
        out.push({oid: oid, url: 'https://detail.1688.com/offer/'+oid+'.html', txt: txt.slice(0,220)});
        if(out.length >= ${LIMIT}) break;
      }
      return JSON.stringify(out);
    })()`,returnByValue:true});

    console.log((r && r.result && r.result.value) || JSON.stringify([]));
    ws.close();
    process.exit(0);
  }catch(e){ console.log(JSON.stringify({error:e.message})); process.exit(1); }
})();
