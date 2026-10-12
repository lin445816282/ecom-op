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

// 读 JPEG 尺寸（从文件头 SOF 标记），用于详情图过滤（剔除店铺 logo/主图混入的正方形图）
function readJpegSize(filePath){
  try{
    const buf=fs.readFileSync(filePath);
    let i=2;
    while(i<buf.length){
      if(buf[i]!==0xFF){i++;continue;}
      const marker=buf[i+1];
      if(marker>=0xC0 && marker<=0xCF && marker!==0xC4 && marker!==0xC8 && marker!==0xCC){
        const h=buf.readUInt16BE(i+5);
        const w=buf.readUInt16BE(i+7);
        return {w,h};
      }
      const len=buf.readUInt16BE(i+2);
      i+=2+len;
    }
  }catch(e){}
  return null;
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
  let _blocked='';
  for(let i=0;i<20;i++){
    await sleep(1000);
    final=await ev(c,'location.href');
    // x5sec 反爬风控：punish 页 URL 形如 detail.1688.com//offer/xxx.html/_____tmd_____/punish?x5secdata=...
    // 仍匹配 /detail.1688.com\/offer\// 正则（含 offer），必须优先检测 punish/x5sec，否则误判「已跳详情页」
    if(/punish|x5sec/i.test(final)){ _blocked='x5sec'; break; }
    if(/detail\.1688\.com\/offer\//.test(final))break;
  }
  if(_blocked==='x5sec'){
    console.log(JSON.stringify({error:'1688 反爬风控（x5sec 滑块验证码），批量抓取过频触发，请冷却后重试或手动完成滑块验证'}));
    process.exit(1);
  }
  const offerId=(final.match(/offer\/(\d+)/)||[])[1]||'';
  if(!offerId){
    console.log(JSON.stringify({error:`未跳转到 1688 详情页，当前 URL: ${final}`}));
    process.exit(1);
  }
  await sleep(3000);

  // 2.5 抓详情长图：1688 详情长图是服务端渲染在 HTML 里的 script 标签
  // <script src="//itemcdn.tmall.com/1688offer/{ID}"></script>，响应为 var offer_details={"content":"<div>...<img>...</div>"}。
  // 从 HTML 提取 ID → Node https 请求接口（带 Referer，页面 fetch 会跨域失败）→ 正则提 img URL。
  // ⚠️ 详情描述 script 标签（itemcdn）要点击 collapse-header 展开后才渲染进 HTML，先点展开再提取。
  await ev(c,`(()=>{const m=document.querySelector('.module-od-product-description');if(m){const h=m.querySelector('.collapse-header')||m;h.scrollIntoView({block:'center'});h.click();return 1;}return 0;})()`);
  await sleep(3000);
  const detailId=await ev(c,`(()=>{
    const html=document.documentElement.outerHTML||'';
    const i=html.indexOf('1688offer/');
    if(i<0)return '';
    const seg=html.slice(i+'1688offer/'.length);
    const mm=seg.match(/[A-Za-z0-9]+/);
    return mm?mm[0]:'';
  })()`);
  let shadowDetailUrls=[];
  if(detailId){
    const detailTxt=await new Promise((res,rej)=>{
      const url='https://itemcdn.tmall.com/1688offer/'+detailId;
      const req=https.get(url,{headers:{'Referer':'https://detail.1688.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}},r=>{
        let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));
      });
      req.on('error',()=>res(''));
    });
    // 直接匹配 src="xxx.jpg"（JSON 里转义为 src=\"xxx.jpg\"），避开 content 边界
    shadowDetailUrls=[...detailTxt.matchAll(/src=\\"([^"]+cib\.jpg)/g)].map(x=>x[1]);
  }
  console.log('[scrape] 详情长图:', shadowDetailUrls.length, '张');

  // 3. 抓标题
  const title=await ev(c,'document.title.split("-")[0].trim()');

  // 3.5 抓 1688 货源店铺名 + 店铺前缀（上架列表按店铺搜索 + 新品专区定位用）
  const supplierName = await ev(c, `(()=>{
    const el=document.querySelector('.company-name')||document.querySelector('[class*="company"]');
    return el?(el.textContent||'').trim().replace(/\\s+/g,' '):'';
  })()`) || '';
  const supplierPrefix = await ev(c, `(()=>{
    const a=[...document.querySelectorAll('a[href]')].find(x=>{
      const h=(x.href||'');
      return /^https?:\\/\\/[a-z0-9-]+\\.1688\\.com\\//i.test(h) && !/detail\\.1688\\.com/i.test(h) && !/login\\.1688\\.com/i.test(h);
    });
    if(!a)return '';
    const m=(a.href||'').match(/^https?:\\/\\/([^.]+)\\.1688\\.com\\//i);
    return m?m[1]:'';
  })()`) || '';
  console.log('[scrape] 店铺:', supplierName || '(未识别)', '| 前缀:', supplierPrefix || '(无)');

  // 4. 抓 body 文本（价格+规格）
  let text=await ev(c,'document.body.innerText');

  // 4.1 检测 1688 验证码拦截（反爬滑块）：被拦截时 title/bodyText 变成验证提示、图 0 张，
  //    不能把「验证码拦截」当商品标题继续上架（task_601/605/606/609 教训）。
  if(/验证码|拖动滑块|请按照说明进行验证|安全防护|人机验证|点我反馈/.test((title||'')+' '+(text||''))){
    console.log(JSON.stringify({error:'1688 验证码拦截（反爬滑块），请手动完成验证后重试'}));
    process.exit(1);
  }

  // 4.2 检测短链跳转失败落到首页/搜索页：title「阿里1688首页」、bodyText 是首页导航（找商品/找工厂/频道），
  //    不能把首页当商品详情抓（task_632/635 教训：抓到「阿里1688首页 图0张」导致上架失败）。
  if(/阿里1688首页|1688首页/.test((title||'')) || /找商品[\s\S]*?找工厂/.test((text||''))){
    console.log(JSON.stringify({error:'1688 短链跳转失败（落到首页/搜索页），请检查链接有效性或稍后重试'}));
    process.exit(1);
  }

  // 4.5 抓每个 SKU 的价格（body.innerText 里「起价」不含分 SKU 价，DOM 里「SKU名¥价库存N」才有）
  //     task_549 教训：多规格商品 AI 统一用「起价」导致 8寸/9寸 价格全错，必须从 DOM 抓分 SKU 价。
  const skuPriceText = await ev(c, `(()=>{
    const leaves=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^¥[\\d.]+$/.test((e.textContent||'').trim()));
    const seen=new Set(); const arr=[];
    for(const e of leaves){
      const parentText=(e.parentElement?(e.parentElement.textContent||''):'').replace(/\\s+/g,'');
      const price=(e.textContent||'').trim().replace('¥','');
      const m=parentText.match(/^(.{2,30}?)¥[\\d.]+(?:库存(\\d+))?/);
      if(m && m[1] && !seen.has(m[1]) && /寸|款|色|尺|型|号/.test(m[1])){
        seen.add(m[1]);
        arr.push(m[1]+'='+price+'元'+(m[2]?('(库存'+m[2]+')'):''));
      }
    }
    return arr.join('；');
  })()`);
  if(skuPriceText){ text += '\nSKU价格明细：' + skuPriceText; }

  // 5. 滚动触发主图/SKU图懒加载
  for(let _s=0;_s<5;_s++){
    await ev(c,'window.scrollTo(0, document.body.scrollHeight)');
    await sleep(1200);
  }
  await ev(c,'window.scrollTo(0, 0)');
  await sleep(800);
  // 等所有候选图加载完成（最多 8 秒）
  for(let i=0;i<8;i++){
    const ready=await ev(c,`[...document.querySelectorAll('img')].filter(i=>i.src&&(i.src.includes('alicdn')||i.src.includes('1688'))&&(i.naturalWidth||0)>=400).length`);
    if(ready>=3)break;
    await sleep(1000);
  }
  // 抓图：区分主图（gallery）、SKU 图（feature-item 缩略图→去 _sum 得大图）、详情图（长图）
  // task_554 教训：SKU 图容器是 feature-item（不是 sku 关键词），且 SKU 大图 = 缩略图 URL 去掉 _sum 后缀。
  // 1688 结构：gallery 大图 = 主图(前几张) + SKU 大图(后 N 张)，feature-item 缩略图 = SKU 缩略版。
  const imgsRaw=await ev(c,`(()=>{
    const isAl=s=>s&&(s.includes('alicdn')||s.includes('1688'));
    const oid=s=>(s.match(/O1CN[0-9A-Za-z]+/)||[''])[0];
    const gallery=[],skuThumbs=[],detail=[];
    const seenG=new Set(),seenS=new Set(),seenD=new Set();
    for(const i of document.querySelectorAll('img')){
      const src=i.src;
      if(!isAl(src))continue;
      const nw=i.naturalWidth||0, nh=i.naturalHeight||0;
      let el=i,inSku=false,inGallery=false;
      for(let k=0;k<6&&el;k++){
        const tag=((el.className||'')+'').toLowerCase()+'|'+((el.id||'')+'').toLowerCase();
        if(/feature-item|expand-view|sku/.test(tag)){inSku=true;break;}
        if(/gallery|preview-img|od-picture/.test(tag)){inGallery=true;}
        el=el.parentElement;
      }
      if(inSku){if(!seenS.has(src)){seenS.add(src);skuThumbs.push(src);}}
      else if(nh>nw*1.2&&nw>=400){if(!seenD.has(src)){seenD.add(src);detail.push(src);}}
      else if(inGallery&&nw>=400){if(!seenG.has(src)){seenG.add(src);gallery.push(src);}}
    }
    // SKU 大图 = 缩略图去 _sum 后缀（xxx.jpg_sum.jpg → xxx.jpg 高清原图）
    const sku=skuThumbs.map(s=>s.replace(/_sum.*$/,''));
    // 主图 = gallery 里 O1CN ID 不在 SKU 缩略图集合里的（前几张整体展示图）。
    // 注意：新版 1688 部分主图 URL 无 O1CN 前缀，oid() 返回空字符串——空 oid 无法匹配 SKU，应保留，
    // 否则「无 O1CN 主图」会被误判成 SKU 图全删掉（task_2225 教训：9 张主图只剩 1 张）。
    const skuOids=new Set(skuThumbs.map(s=>oid(s)).filter(Boolean));
    const main=gallery.filter(g=>{const o=oid(g);return !o||!skuOids.has(o);});
    return JSON.stringify({main,sku,detail});
  })()`);
  let mainUrls=[],skuUrls=[],detailUrls=[];
  try{const o=JSON.parse(imgsRaw||'{}');mainUrls=o.main||[];skuUrls=o.sku||[];detailUrls=(o.detail||[]).concat(shadowDetailUrls);}catch(e){}
  const imgUrls=mainUrls;

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

  // 6.5 下载 SKU 图（SKU 变体图，供 previewImages 精确对应）
  const skuPaths=[];
  for(let i=0;i<skuUrls.length && i<40;i++){
    const clean=skuUrls[i].replace(/\._.*$/,'');
    const savePath=path.join(OUTDIR,`sku_${i+1}.jpg`);
    try{
      await download(clean, savePath);
      skuPaths.push(savePath);
    }catch(e){/* 忽略单张下载失败 */}
  }

  // 6.6 下载详情图（商品详情长图，供拼多多商详装修上传）
  // 剔除前 2 张（店铺宣传图）：1688 详情描述开头通常是店铺 logo/横幅/促销图，
  // 不是商品详情图，混入商详装修会暴露货源店铺信息。第 3 张起才是商品详情图。
  const detailPaths=[];
  // 仙居县赤丹工艺品：详情图末尾 4 张是无关图（店铺信息/二维码等），额外剔除后 4 张
  const _isChidangy = /仙居县赤丹工艺/.test(supplierName || '');
  const _detailTotal = detailUrls.length;
  for(let i=0;i<detailUrls.length && i<50;i++){
    if(i<2){
      console.log('[scrape] 剔除前2张店铺宣传图: 第'+(i+1)+'张');
      continue;
    }
    if(_isChidangy && i >= _detailTotal - 4){
      console.log('[scrape] 仙居县赤丹 剔除后4张无关图: 第'+(i+1)+'张');
      continue;
    }
    const clean=detailUrls[i].replace(/\._.*$/,'');
    const savePath=path.join(OUTDIR,`detail_${i+1}.jpg`);
    try{
      await download(clean, savePath);
      detailPaths.push(savePath);
    }catch(e){/* 忽略单张下载失败 */}
  }

  // 7. 写 product.json（供 AI 环节 / 人工查看）
  const product={
    offerId,
    sourceUrl:final,
    title,
    bodyText:text.slice(0,12000),
    images:imgPaths,
    skuImages:skuPaths,
    detailImages:detailPaths,
    supplierName:supplierName||'',
    supplierPrefix:supplierPrefix||'',
  };
  fs.writeFileSync(path.join(OUTDIR,'product.json'),JSON.stringify(product,null,2),'utf8');

  // 8. stdout 打印 JSON 摘要（后端解析用）
  const summary={offerId, title, images:imgPaths, skuImages:skuPaths, detailImages:detailPaths, bodyTextLength:text.length, supplierName:supplierName||'', supplierPrefix:supplierPrefix||''};
  console.log(JSON.stringify(summary));

  c.ws.close();
})().catch(e=>{console.log(JSON.stringify({error:String(e.message||e)}));process.exit(1)});
