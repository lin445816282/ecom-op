// 1688 详情页推荐商品提取脚本 — 滚雪球找货源（绕过搜索风控）
// 用法：node rec.js <offerId或详情URL> [CDP端口] [滚动次数]
// 输出：stdout 最后一行打印 JSON {offerId, count, items:[{offerId,title,price,url}]}
// 原理：详情页底部"看了又看"推荐模块的商品卡片是 a[href*="detail.1688.com/offer/"]
const http = require('http');

const INPUT = process.argv[2];
const PORT = process.argv[3] || '9238';
const SCROLLS = parseInt(process.argv[4] || '5', 10);
if(!INPUT){console.error('用法: node rec.js <offerId|详情URL> [端口] [滚动次数]');process.exit(1);}

const seedUrl = /^https?:/.test(INPUT) ? INPUT : ('https://detail.1688.com/offer/'+INPUT+'.html');
const seedId = (INPUT.match(/offer\/(\d+)/)||[0,INPUT])[1];

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

  await c.send('Page.navigate',{url:seedUrl});
  await sleep(5000);
  // 滚动到底部触发推荐懒加载
  for(let i=0;i<SCROLLS;i++){
    await ev(c,'window.scrollTo(0, document.body.scrollHeight)');
    await sleep(1500);
  }

  // 提取推荐商品（排除种子自身）
  const raw=await ev(c,`(function(){
    var out=[];var seen={};
    document.querySelectorAll('a[href*="detail.1688.com/offer/"]').forEach(function(a){
      var href=a.getAttribute('href')||'';
      var m=href.match(/offer\\/(\\d+)/);
      if(!m)return;
      var oid=m[1];
      if(oid==='${seedId}'||seen[oid])return;
      var title=(a.getAttribute('title')||a.innerText||'').trim();
      // 标题需有效（过滤纯数字/供应商名）
      if(title.length>=6 && !/^\\d/.test(title) && !/公司|厂|供应链|商行/.test(title.slice(0,12))){
        seen[oid]=1;
        var pm=(a.innerText||'').match(/[¥￥]\\s*([\\d.]+)/);
        out.push({offerId:oid,title:title.slice(0,50),price:pm?pm[1]:'',url:'https://detail.1688.com/offer/'+oid+'.html'});
      }
    });
    return JSON.stringify(out.slice(0,30));
  })()`);
  const items=JSON.parse(raw||'[]');
  console.log(JSON.stringify({offerId:seedId,count:items.length,items}));
  c.ws.close();
})().catch(e=>{console.log(JSON.stringify({error:String(e.message||e)}));process.exit(1)});
