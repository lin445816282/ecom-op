// 1688 搜索货源脚本 — 连 9238 登录实例，搜关键词，滚动加载，提取商品 offerId+标题+价格
// 用法：node search.js <关键词> [CDP端口] [滚动次数]
// 输出：stdout 最后一行打印 JSON {keyword, count, items:[{offerId,title,price,url}]}
// offerId 藏在 data-aplus-report 的 object_id@ 里（1688 新版搜索卡片，A 标签无标准 href）
const http = require('http');

const KEYWORD = process.argv[2];
const PORT = process.argv[3] || '9238';
const SCROLLS = parseInt(process.argv[4] || '3', 10);
if(!KEYWORD){console.error('用法: node search.js <关键词> [端口] [滚动次数]');process.exit(1);}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('ws timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return undefined;return undefined;}

(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  if(!tabs||!Array.isArray(tabs)||!tabs.length){console.log(JSON.stringify({error:`CDP ${PORT} 无实例`}));process.exit(1);}
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{});
  await c.send('Runtime.enable',{});

  const searchUrl='https://s.1688.com/selloffer/offer_search.htm?keywords='+encodeURIComponent(KEYWORD);
  await c.send('Page.navigate',{url:searchUrl});

  // 等待商品卡片渲染（feedCard 是 1688 新版搜索卡片容器）
  let loaded=false;
  for(let i=0;i<25;i++){
    await sleep(1000);
    const n=await ev(c,'document.querySelectorAll("a[class*=feedCard]").length');
    if(n>=3){loaded=true;break;}
  }
  if(!loaded){console.log(JSON.stringify({error:'搜索结果未加载',keyword:KEYWORD}));c.ws.close();process.exit(1);}

  // 滚动触发懒加载
  for(let i=0;i<SCROLLS;i++){
    await ev(c,'window.scrollTo(0, document.body.scrollHeight)');
    await sleep(1500);
  }
  await ev(c,'window.scrollTo(0, 0)');
  await sleep(1000);

  // 提取：offerId 从 data-aplus-report 的 object_id@，标题取卡片内标题元素/首行，价格正则
  const raw=await ev(c,`(function(){
    var cards=document.querySelectorAll('a[class*=feedCard]');
    var out=[];var seen={};
    cards.forEach(function(card){
      var report=card.getAttribute('data-aplus-report')||'';
      var m=report.match(/object_id@(\\d+)/);
      var oid=m?m[1]:'';
      if(!oid){
        // 备选：data-renderkey 最后一段
        var rk=card.getAttribute('data-renderkey')||'';
        var seg=rk.split('_');oid=seg[seg.length-1]||'';
      }
      if(!oid||!/^\\d{9,}$/.test(oid)||seen[oid])return;
      seen[oid]=1;
      var txt=card.innerText||'';
      var lines=txt.split('\\n').map(function(s){return s.trim()}).filter(Boolean);
      // 标题 = 第一行（1688 卡片标题在首行）
      var title=lines[0]||'';
      // 价格 = ¥ 后第一个数字
      var pm=txt.match(/¥\\s*([\\d.]+)/);
      var price=pm?pm[1]:'';
      out.push({offerId:oid,title:title.slice(0,60),price:price,url:'https://detail.1688.com/offer/'+oid+'.html'});
    });
    return JSON.stringify(out.slice(0,30));
  })()`);
  const items=JSON.parse(raw||'[]');
  console.log(JSON.stringify({keyword:KEYWORD,count:items.length,items}));
  c.ws.close();
})().catch(e=>{console.log(JSON.stringify({error:String(e.message||e)}));process.exit(1)});
