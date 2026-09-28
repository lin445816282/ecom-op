// 1688 商品抓取（登录实例，默认 9238）→ 输出 product.json + 下载主图 + stdout 打印 JSON 摘要
// 用法：node scrape.js <1688链接> <输出目录> [CDP端口]
// 输出：<输出目录>/product.json（标题/价格/规格文本/主图路径），主图下载到 <输出目录>/img_N.jpg
// stdout 最后一行打印 JSON 摘要，供后端 _run_node_script 解析
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SRC_URL = process.argv[2];
const OUTDIR = process.argv[3] || 'C:\\tmp\\pdd-publish\\scraped';
const PORT = process.argv[4] || '9238';
if(!SRC_URL){console.error('用法: node scrape.js <1688链接> [输出目录] [CDP端口]');process.exit(1);}
if(!fs.existsSync(OUTDIR))fs.mkdirSync(OUTDIR,{recursive:true});

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

function download(url, savePath){
  return new Promise((res,rej)=>{
    const u=new URL(url);
    const lib=u.protocol==='https:'?https:http;
    const req=lib.get(url,{headers:{'Referer':'https://detail.1688.com/','User-Agent':'Mozilla/5.0 Edg/149.0.0.0'}},r=>{
      const chunks=[];
      r.on('data',c=>chunks.push(c));
      r.on('end',()=>{fs.writeFileSync(savePath,Buffer.concat(chunks));res(Buffer.concat(chunks).length)});
    });
    req.on('error',rej);
  });
}

(async()=>{
  // 1. 连接 CDP（1688 登录实例）
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  if(!tabs || !tabs.length){
    console.log(JSON.stringify({error:`CDP 端口 ${PORT} 无实例（1688 未登录？）`}));
    process.exit(1);
  }
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{});
  await c.send('Runtime.enable',{});

  // 2. 导航（短链自动跳转）
  await c.send('Page.navigate',{url:SRC_URL});
  let final='';
  for(let i=0;i<20;i++){await sleep(1000);final=await ev(c,'location.href');if(/detail\.1688\.com\/offer\//.test(final))break;}
  const offerId=(final.match(/offer\/(\d+)/)||[])[1]||'';
  if(!offerId){
    console.log(JSON.stringify({error:`未跳转到 1688 详情页，当前 URL: ${final}`}));
    process.exit(1);
  }
  await sleep(3000);

  // 3. 抓标题
  const title=await ev(c,'document.title.split("-")[0].trim()');

  // 4. 抓 body 文本（价格+规格）
  const text=await ev(c,'document.body.innerText');

  // 5. 抓主图 URL（去重，天然尺寸>=400）
  const imgs=await ev(c,`JSON.stringify([...new Set([...document.querySelectorAll('img[src*="alicdn"]')].filter(i=>(i.naturalWidth||0)>=400).map(i=>i.src))])`);
  const imgUrls=JSON.parse(imgs||'[]');

  // 6. 下载主图（剥 _.webp 后缀）
  const imgPaths=[];
  for(let i=0;i<imgUrls.length && i<10;i++){
    const clean=imgUrls[i].replace(/\._.*$/,'');
    const savePath=path.join(OUTDIR,`img_${i+1}.jpg`);
    try{
      await download(clean, savePath);
      imgPaths.push(savePath);
    }catch(e){/* 忽略单张下载失败 */}
  }

  // 7. 写 product.json（供 AI 环节 / 人工查看）
  const product={
    offerId,
    sourceUrl:final,
    title,
    bodyText:text.slice(0,12000),
    images:imgPaths,
  };
  fs.writeFileSync(path.join(OUTDIR,'product.json'),JSON.stringify(product,null,2),'utf8');

  // 8. stdout 打印 JSON 摘要（后端解析用）
  const summary={offerId, title, images:imgPaths, bodyTextLength:text.length};
  console.log(JSON.stringify(summary));

  c.ws.close();
})().catch(e=>{console.log(JSON.stringify({error:String(e.message||e)}));process.exit(1)});
