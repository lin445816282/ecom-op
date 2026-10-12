// 诊断：1688 商品主图数量（gallery vs SKU 过滤前后）
// 用法：node diag_mainimg_count.js <offer_id> [端口]
const http = require('http');
const PORT = process.argv[3] || '9238';
const OFFER = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r&&r.result&&r.result.value!==undefined)return r.result.value;if(r&&r.exceptionDetails)return 'EXC';return undefined;}

(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  if(!g){console.log(JSON.stringify({error:'no tab'}));process.exit(1);}
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{});await c.send('Runtime.enable',{});
  await c.send('Page.navigate',{url:`https://detail.1688.com/offer/${OFFER}.html`});
  await sleep(6000);
  // 滚动触发懒加载
  for(let i=0;i<4;i++){await ev(c,'window.scrollTo(0,document.body.scrollHeight)');await sleep(1200);}
  await ev(c,'window.scrollTo(0,0)');await sleep(2000);

  const result = await ev(c, `(()=>{
    const isAl=s=>s&&(s.includes('alicdn')||s.includes('1688'));
    const oid=s=>(s.match(/O1CN[0-9A-Za-z]+/)||[''])[0];
    const gallery=[],skuThumbs=[],allImgs=[];
    const seenG=new Set(),seenS=new Set(),seenA=new Set();
    for(const i of document.querySelectorAll('img')){
      const src=i.src;
      if(!isAl(src))continue;
      const nw=i.naturalWidth||0, nh=i.naturalHeight||0;
      // 记录所有大图
      if(nw>=400 && !seenA.has(src)){seenA.add(src);allImgs.push({src,nw,nh});}
      let el=i,inSku=false,inGallery=false;
      for(let k=0;k<6&&el;k++){
        const tag=((el.className||'')+'').toLowerCase()+'|'+((el.id||'')+'').toLowerCase();
        if(/feature-item|expand-view|sku/.test(tag)){inSku=true;break;}
        if(/gallery|preview-img|od-picture/.test(tag)){inGallery=true;}
        el=el.parentElement;
      }
      if(inSku){if(!seenS.has(src)){seenS.add(src);skuThumbs.push(src);}}
      else if(inGallery&&nw>=400){if(!seenG.has(src)){seenG.add(src);gallery.push(src);}}
    }
    const skuOids=new Set(skuThumbs.map(s=>oid(s)).filter(Boolean));
    const main=gallery.filter(g=>{const o=oid(g);return !o||!skuOids.has(o);});
    return JSON.stringify({
      galleryCount: gallery.length,
      gallery: gallery.map(s=>({oid:oid(s), w:(allImgs.find(x=>x.src===s)||{}).nw, h:(allImgs.find(x=>x.src===s)||{}).nh})),
      skuThumbsCount: skuThumbs.length,
      skuThumbs: skuThumbs.map(s=>oid(s)),
      mainCount: main.length,
      main: main.map(s=>oid(s)),
      allBigImgs: allImgs.length
    });
  })()`);
  console.log(result);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1)});
