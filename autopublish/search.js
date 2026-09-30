// 1688 搜索货源脚本 v2 — CDP 输入搜索词（绕过 GBK 乱码），提取商品 offerId+标题+价格
// 用法：node search.js <关键词> [CDP端口] [滚动次数]
// 输出：stdout 最后一行 JSON {keyword, count, items:[{offerId,title,price,url}]}
// ⚠️ URL 参数 keywords 传中文会被 GBK 解码成乱码(鏀剁撼绠)，必须 CDP Input.insertText 输入
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

  // 1. 导航到搜索页（不带 keywords，避免 GBK 乱码）
  await c.send('Page.navigate',{url:'https://s.1688.com/selloffer/offer_search.htm'});
  await sleep(4000);

  // 2. CDP 在搜索框输入关键词（精确定位 name=keywords，placeholder 是商品词残留不是"搜索"）
  const focused=await ev(c,`(function(){var i=document.querySelector('input[name="keywords"]')||document.querySelector('input[name*="key"]');if(!i)return 'no';i.focus();return 'ok'})()`);
  if(focused!=='ok'){console.log(JSON.stringify({error:'搜索框未找到',keyword:KEYWORD}));c.ws.close();process.exit(1);}
  // 清空（Ctrl+A + Backspace）
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2});
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace'});
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace'});
  await sleep(200);
  await c.send('Input.insertText',{text:KEYWORD});
  await sleep(500);
  // 点击"搜索"按钮触发（Enter 键不触发 React 受控组件的 onSubmit）
  await ev(c,`(()=>{var btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='搜索');if(btn){btn.click();return 'ok'}return 'no'})()`);

  // 3. 等待搜索结果
  let loaded=false;
  for(let i=0;i<20;i++){
    await sleep(1000);
    const n=await ev(c,'document.querySelectorAll("a[class*=feedCard]").length');
    if(n>=3){loaded=true;break;}
  }
  if(!loaded){console.log(JSON.stringify({error:'搜索结果未加载',keyword:KEYWORD}));c.ws.close();process.exit(1);}

  // 4. 滚动触发懒加载
  for(let i=0;i<SCROLLS;i++){
    await ev(c,'window.scrollTo(0, document.body.scrollHeight)');
    await sleep(1500);
  }
  await ev(c,'window.scrollTo(0, 0)');
  await sleep(800);

  // 5. 提取：offerId 从 data-aplus-report，标题从 title 元素，价格正则
  const raw=await ev(c,`(function(){
    var cards=document.querySelectorAll('a[class*=feedCard]');
    var out=[];var seen={};
    cards.forEach(function(card){
      var report=card.getAttribute('data-aplus-report')||'';
      var m=report.match(/object_id@(\\d+)/);
      var oid=m?m[1]:'';
      if(!oid){var rk=card.getAttribute('data-renderkey')||'';var seg=rk.split('_');oid=seg[seg.length-1]||'';}
      if(!oid||!/^\\d{9,}$/.test(oid)||seen[oid])return;
      seen[oid]=1;
      var t=card.querySelector('[class*="title"],h3,h2,[class*="Title"]');
      var title=(t?t.innerText:(card.innerText||'').split('\\n')[0]||'').trim();
      var pm=(card.innerText||'').match(/[¥￥]\\s*([\\d.]+)/);
      out.push({offerId:oid,title:title.slice(0,60),price:pm?pm[1]:'',url:'https://detail.1688.com/offer/'+oid+'.html'});
    });
    return JSON.stringify(out.slice(0,30));
  })()`);
  const items=JSON.parse(raw||'[]');
  console.log(JSON.stringify({keyword:KEYWORD,count:items.length,items}));
  c.ws.close();
})().catch(e=>{console.log(JSON.stringify({error:String(e.message||e)}));process.exit(1)});
