// 1688 店铺新品专区采集：从 pageData 提取商品 offer 数据（id+标题+价格+日期+详情URL）
// 用法：node fetch_newoffer.js <prefix> [输出目录] [CDP端口]
// stdout 最后一行打印 JSON：{prefix, title, url, items:[{offer_id,title,price,offer_url,date,month,gmtCreate}]}
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
  await sleep(2500);
  // 滚动触发懒加载
  for(let i=0;i<4;i++){ await ev(c,'window.scrollTo(0,document.body.scrollHeight)'); await sleep(1500); }
  await sleep(1500);
  const title = await ev(c,'document.title');
  // 从 pageData 提取商品列表（offer 对象含 id(13位)+subject 字段）
  const itemsRaw = await ev(c, `(()=>{
    const pd = window.pageData;
    const found = [];
    function walk(o, depth){
      if(!o || depth>8 || found.length>=200) return;
      if(typeof o==='object'){
        if(o.id && /^\\d{12,}$/.test(String(o.id)) && o.subject){
          found.push(o);
        }
        for(const k in o){ try{ walk(o[k], depth+1); }catch(e){} }
      }
    }
    walk(pd, 0);
    // 按 id 去重（保序）
    const seen=new Set(); const uniq=[];
    for(const o of found){ if(!seen.has(o.id)){ seen.add(o.id); uniq.push(o); } }
    return JSON.stringify(uniq.map(o=>{
      const gc = String(o.gmtCreate || '');
      const m = gc.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
      const date = m ? (parseInt(m[2],10)+'月'+parseInt(m[3],10)+'日') : '';
      const month = m ? (parseInt(m[2],10)+'月') : '';
      function normImg(u){ if(!u) return ''; u=String(u).trim(); if(u.indexOf('//')===0) u='https:'+u; return u; }
      function pickImg(o){
        var sk=['image','imgUrl','picUrl','mainImage','imageUrl','thumbnail','thumb','img'];
        for(var i=0;i<sk.length;i++){ var v=o[sk[i]]; if(typeof v==='string'&&v) return normImg(v); }
        var ak=['images','imageList','picList','imgList','thumbnails','pics'];
        for(var j=0;j<ak.length;j++){ var a=o[ak[j]]; if(Array.isArray(a)&&a.length){ var f=a[0];
          if(typeof f==='string') return normImg(f);
          if(f&&typeof f==='object'){ var kk=['url','image','imgUrl','picUrl','src']; for(var k=0;k<kk.length;k++){ if(typeof f[kk]==='string'&&f[kk]) return normImg(f[kk]); } }
        } }
        return '';
      }
      return {
        offer_id: String(o.id),
        title: o.subject || '',
        image: pickImg(o),
        price: o.offerPrice || '',
        offer_url: 'https://detail.1688.com/offer/' + o.id + '.html',
        date: date,
        month: month,
        gmtCreate: gc
      };
    }));
  })()`);
  let items = [];
  try{ items = JSON.parse(itemsRaw || '[]'); }catch(e){ items = []; }
  const result = {prefix:PREFIX, title:title||'', url:final||URL, items:items};
  // 写文件供人工查看
  try{
    const txt = items.map(it=>`${it.date||''}\t${it.title}\t¥${it.price}\t${it.offer_url}`).join('\n');
    fs.writeFileSync(path.join(OUTDIR,`newoffer_${PREFIX}.txt`), txt, 'utf8');
  }catch(e){}
  console.log(JSON.stringify(result));
  c.ws.close();
  process.exit(0);
})();
