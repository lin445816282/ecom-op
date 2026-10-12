// 验证内联 MD5 是否正确：页面算 "abc" 的 MD5 对比 Node
const http = require('http');
const crypto = require('crypto');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 从 fetch_offerlist.js 提取内联 md5 函数
const src = require('fs').readFileSync('D:\\电商运营\\运营工作台\\autopublish\\fetch_offerlist.js','utf8');
const md5Start = src.indexOf('var md5 = function (string) {');
const md5End = src.indexOf('function normImg', md5Start);
const md5Fn = src.slice(md5Start, md5End);
(async()=>{
  const PREFIX = process.argv[2] || 'chidangy';
  const PORT = process.argv[3] || '9238';
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const ws=new WebSocket(g.webSocketDebuggerUrl);
  let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  const ev=(expr)=>send('Runtime.evaluate',{expression:expr,returnByValue:true}).then(r=>r&&r.result?r.result.value:undefined);
  await send('Page.enable',{}); await send('Runtime.enable',{});
  await send('Page.navigate',{url:`https://${PREFIX}.1688.com/page/offerlist.htm`});
  for(let i=0;i<15;i++){await sleep(1000);const f=await ev('location.href');if(/offerlist/.test(f||''))break;}
  await sleep(2000);
  // 页面算 md5
  const inline = await ev(`(()=>{
    ${md5Fn}
    return JSON.stringify({
      abc: md5('abc'),
      test: md5('test'),
      hello: md5('hello')
    });
  })()`);
  const inlineObj = JSON.parse(inline);
  const nodeObj = {
    abc: crypto.createHash('md5').update('abc').digest('hex'),
    test: crypto.createHash('md5').update('test').digest('hex'),
    hello: crypto.createHash('md5').update('hello').digest('hex'),
  };
  console.log(JSON.stringify({inline: inlineObj, node: nodeObj, match: JSON.stringify(inlineObj)===JSON.stringify(nodeObj)}, null, 1));
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
