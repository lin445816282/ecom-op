// 1688 店铺新品专区采集：抓 newofferlist.htm 的 bodyText（商品标题+价格+日期）
// 用法：node fetch_newoffer.js <prefix> <输出目录> [CDP端口]
// stdout 最后一行打印 JSON：{prefix, title, url, text}
const http = require('http');
const fs = require('fs');
const path = require('path');

const PREFIX = process.argv[2];
const OUTDIR = process.argv[3] || 'C:\\tmp\\pdd-publish\\newoffer';
const PORT = process.argv[4] || '9238';
if(!PREFIX){console.error('用法: node fetch_newoffer.js <prefix> [输出目录] [CDP端口]');process.exit(1);}
if(!fs.existsSync(OUTDIR))fs.mkdirSync(OUTDIR,{recursive:true});
const URL = `https://${PREFIX}.1688.com/page/newofferlist.htm`;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  if(!tabs || !tabs.length){ console.log(JSON.stringify({error:`CDP 端口 ${PORT} 无实例`})); process.exit(1); }
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{});
  await c.send('Page.navigate',{url:URL});
  let final='';
  for(let i=0;i<20;i++){await sleep(1000);final=await ev(c,'location.href');if(/newofferlist/.test(final||''))break;}
  await sleep(2000);
  // 滚动触发懒加载
  for(let i=0;i<4;i++){ await ev(c,'window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  await sleep(1500);
  const title = await ev(c,'document.title');
  const text = await ev(c,'document.body.innerText');
  const result = {prefix:PREFIX, title:title||'', url:final||URL, text:(text||'').slice(0,20000)};
  // 写文件供人工查看
  try{ fs.writeFileSync(path.join(OUTDIR,`newoffer_${PREFIX}.txt`), result.text, 'utf8'); }catch(e){}
  console.log(JSON.stringify(result));
  c.ws.close();
  process.exit(0);
})();
