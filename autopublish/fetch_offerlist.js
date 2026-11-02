// 1688 店铺全量商品采集（offerlist）：Node MD5 sign + 页面 context fetch mtop 接口分页拉全量
// 用法：node fetch_offerlist.js <prefix> [输出目录] [CDP端口]
// stdout 最后一行打印 JSON：{prefix, title, url, items:[{offer_id,title,price,offer_url,image,image_thumb,gmtCreate}]}
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PREFIX = process.argv[2];
const OUTDIR = process.argv[3] || 'C:\\tmp\\pdd-publish\\offerlist';
const PORT = process.argv[4] || '9238';
const COUNT = parseInt(process.argv[5] || '30', 10);     // 每页条数（接口上限约30）
const MAX_PAGES = parseInt(process.argv[6] || '30', 10); // 最大翻页数
if(!PREFIX){console.error('用法: node fetch_offerlist.js <prefix> [输出目录] [CDP端口]');process.exit(1);}
if(!fs.existsSync(OUTDIR))fs.mkdirSync(OUTDIR,{recursive:true});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})}).on('error',rej)})}
async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{p.delete(mid);rej(new Error('CDP send 超时'))},30000);p.set(mid,{res:(v)=>{clearTimeout(to);res(v)},rej:(e)=>{clearTimeout(to);rej(e)}});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}

function normImg(u){ if(!u) return ''; u=String(u).trim(); if(u.indexOf('//')===0) return 'https:'+u; if(u.indexOf('http')===0) return u; return 'https://cbu01.alicdn.com/'+u; }
function pickImg(o){ var oi=o.offerImages; if(Array.isArray(oi)&&oi.length){ var f=oi[0]; if(f&&typeof f==='object'){ var u=f.imageURI||f.imageUrl||''; if(typeof u==='string'&&u) return normImg(u); } } return ''; }
function pickThumb(o){ var oi=o.offerImages; if(Array.isArray(oi)&&oi.length){ var f=oi[0]; if(f&&typeof f==='object'){ var u=f.size310x310ImageURI||''; if(typeof u==='string'&&u) return normImg(u); } } return pickImg(o); }

// 从响应 JSON walk 提取 offer 对象（subject + 数字 id）
function extractOffers(json){
  const out = [];
  (function walk(o,d){
    if(!o || d>15 || out.length>5000) return;
    if(typeof o==='object'){
      if(o.subject && /^\d{10,}$/.test(String(o.id||''))){ out.push(o); return; }
      for(const k in o){ try{ walk(o[k], d+1); }catch(e){} }
    }
  })(json, 0);
  return out;
}

(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  if(!tabs || !tabs.length){ console.log(JSON.stringify({error:`CDP 端口 ${PORT} 无实例`})); process.exit(1); }
  const g=tabs.find(t=>t.type==='page'&&/1688/.test(t.url))||tabs.find(t=>t.type==='page');
  const c=await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{});

  const base = `https://${PREFIX}.1688.com/page/offerlist.htm`;
  await c.send('Page.navigate',{url:base});
  let final='';
  for(let i=0;i<20;i++){await sleep(1000);const r=await c.send('Runtime.evaluate',{expression:'location.href',returnByValue:true});final=r&&r.result?r.result.value:undefined;if(/offerlist/.test(final||''))break;}
  await sleep(3000);

  // 拿 token + memberId
  const infoR = await c.send('Runtime.evaluate',{expression:`(()=>{return JSON.stringify({token:(document.cookie.match(/_m_h5_tk=([^_]+)/)||[])[1]||'', memberId:(window.shopPageDataApi||'').match(/sellerMemberId=([^&]+)/)?.[1]||''});})()`,returnByValue:true});
  const info = JSON.parse((infoR && infoR.result ? infoR.result.value : '{}') || '{}');
  let token = info.token || '';
  let memberId = info.memberId || '';
  if(!token || !memberId){ console.log(JSON.stringify({error:'缺 token/memberId（未登录或页面未就绪）'})); process.exit(1); }

  const appKey = '12574478';
  const all = [];
  const seen = new Set();
  let emptyPages = 0;

  for(let pageNum=1; pageNum<=MAX_PAGES; pageNum++){
    // 翻页前重新导航重置限流：1688 对「同一页面连续 offerlist 请求」限流（第二次请求挂起无响应），
    // 但每次导航后第一次 offerlist 请求总是成功（diag_page2 实测），故每页重新导航只发一次请求。
    if(pageNum>1){
      await c.send('Page.navigate',{url:base});
      for(let i=0;i<20;i++){await sleep(1000);const r=await c.send('Runtime.evaluate',{expression:'location.href',returnByValue:true});const f=r&&r.result?r.result.value:undefined;if(/offerlist/.test(f||''))break;}
      await sleep(3000);
      const infoR2 = await c.send('Runtime.evaluate',{expression:`(()=>{return JSON.stringify({token:(document.cookie.match(/_m_h5_tk=([^_]+)/)||[])[1]||'', memberId:(window.shopPageDataApi||'').match(/sellerMemberId=([^&]+)/)?.[1]||''});})()`,returnByValue:true});
      const info2 = JSON.parse((infoR2 && infoR2.result ? infoR2.result.value : '{}') || '{}');
      token = info2.token || token;
      memberId = info2.memberId || memberId;
    }
    const params = JSON.stringify({memberId, appdata:{sortType:'wangpu_score',sellerRecommendFilter:false,mixFilter:false,tradenumFilter:false,quantityBegin:null,pageNum:pageNum,count:COUNT}});
    const data = JSON.stringify({componentKey:'Wp_pc_common_offerlist', params});
    const t = Date.now();
    const sign = crypto.createHash('md5').update(token + '&' + t + '&' + appKey + '&' + data).digest('hex');
    const url = 'https://h5api.m.1688.com/h5/mtop.alibaba.alisite.cbu.server.moduleasyncservice/1.0/?jsv=2.7.5&appKey='+appKey+'&t='+t+'&sign='+sign+'&api=mtop.alibaba.alisite.cbu.server.ModuleAsyncService&v=1.0&type=json&valueType=string&dataType=jsonp&timeout=10000';
    // 启动 async fetch，结果写 window.__ol，轮询读（避免 awaitPromise 在页面卡死）
    const expr = `(async()=>{try{const r=await fetch(${JSON.stringify(url)}, {method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(${JSON.stringify(data)})});window.__ol=await r.text();}catch(e){window.__ol='ERR:'+e.message;}})()`;
    let text = '';
    for(let _retry=0; _retry<3 && !text; _retry++){
      if(_retry>0){ console.error('[fetch_offerlist] page '+pageNum+' 无响应，重试 '+(_retry+1)+'/3'); await sleep(5000); }
      try{
        await c.send('Runtime.evaluate',{expression:'window.__ol=null;'+expr});
        for(let _pi=0; _pi<25; _pi++){
          const rr = await c.send('Runtime.evaluate',{expression:'window.__ol',returnByValue:true});
          const v = rr && rr.result ? rr.result.value : undefined;
          if(v){ text = v; break; }
          await sleep(1000);
        }
      }catch(e){
        console.error('[fetch_offerlist] page '+pageNum+' fetch 异常: '+e.message);
      }
    }
    if(!text){ console.error('[fetch_offerlist] page '+pageNum+' 采空，保留已采 '+all.length+' 条'); break; }
    let json = null;
    try{ json = JSON.parse(text.replace(/^mtopjsonp\d+\(/,'').replace(/\)$/,'')); }catch(e){ try{ json = JSON.parse(text); }catch(e2){} }
    if(!json){
      if(pageNum===1 && /ERR:|x5sec|punish/i.test(text)){ console.log(JSON.stringify({error:'被风控/请求失败: '+text.slice(0,120)})); process.exit(1); }
      break;
    }
    // 风控检测
    if(JSON.stringify(json).indexOf('FAIL_SYS')>=0 || /x5sec|punish|captcha/.test(text)){ console.log(JSON.stringify({error:'风控拦截: '+text.slice(0,150)})); process.exit(1); }
    const offers = extractOffers(json);
    let added = 0;
    for(const o of offers){
      const oid = String(o.id);
      if(seen.has(oid)) continue;
      seen.add(oid);
      const gc = String(o.gmtCreate || '');
      let date = '', month = '';
      const m = gc.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if(m){ date = parseInt(m[2],10)+'月'+parseInt(m[3],10)+'日'; month = parseInt(m[2],10)+'月'; }
      else if(/^\d{13}$/.test(gc)){ const d = new Date(parseInt(gc)); date = (d.getMonth()+1)+'月'+d.getDate()+'日'; month = (d.getMonth()+1)+'月'; }
      all.push({
        offer_id: oid,
        title: o.subject || '',
        image: pickImg(o),
        image_thumb: pickThumb(o),
        price: o.offerPrice || o.handPrice || '',
        offer_url: 'https://detail.1688.com/offer/' + oid + '.html',
        date: m ? (parseInt(m[2],10)+'月'+parseInt(m[3],10)+'日') : '',
        month: m ? (parseInt(m[2],10)+'月') : '',
        gmtCreate: gc
      });
      added++;
    }
    // 停止条件：连续 2 页无新增则停（翻页到底）
    if(added === 0){ emptyPages++; if(emptyPages >= 2) break; }
    else emptyPages = 0;
    await sleep(2000);
  }

  const result = {prefix:PREFIX, title:'', url:final||base, items:all};
  try{
    const txt = all.map(it=>`${it.title}\t¥${it.price}\t${it.offer_url}`).join('\n');
    fs.writeFileSync(path.join(OUTDIR,`offerlist_${PREFIX}.txt`), txt, 'utf8');
  }catch(e){}
  console.log(JSON.stringify(result));
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log(JSON.stringify({error:e.message}));process.exit(1);});
