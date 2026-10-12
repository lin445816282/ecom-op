// 诊断：dump 发布页主图上传区的真实 DOM 结构，定位 uploadImgEnter 是否失效
// 用法：node diag_mainimg_dom.js [port]
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.argv[2] || '9228';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  const cur = await ev(c,'location.href');
  console.log('[1] 当前URL:', cur);
  if(!/goods\/category/.test(cur||'')){
    await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
    for(let i=0;i<12;i++){await sleep(1000);const f=await ev(c,'location.href');if(/goods\/category/.test(f||''))break;}
    await sleep(4000);
    console.log('[1] 已导航 goods/category');
  }

  // dump：所有 file input 的详细信息
  const inputs = await ev(c, `(()=>{
    const list=[...document.querySelectorAll('input[type="file"]')];
    return list.map((inp,i)=>{
      let chain=[]; let el=inp; let depth=0;
      while(el && depth<5){ chain.push(el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').slice(0,3).join('.'):'')); el=el.parentElement; depth++; }
      return {i, accept:inp.accept||'', class:(inp.className||'').slice(0,80), parent:chain.slice(1).join(' > ')};
    });
  })()`);
  console.log('[2] file input 列表:', inputs.length, '个');
  if(inputs) inputs.forEach(x=>console.log('    ', JSON.stringify(x)));

  // uploadImgEnter 是否还存在？
  const hasOld = await ev(c, `document.querySelectorAll('[class*="uploadImgEnter"]').length`);
  console.log('[3] uploadImgEnter 容器数量:', hasOld);

  // dump 主图上传区：找含「上传图片」「轮播图」「主图」文字附近的 DOM
  const area = await ev(c, `(()=>{
    const out=[];
    // 找文字节点含「上传图片」或「主图」或「轮播图」的叶子
    const leaves=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.textContent||'').trim()&&/上传图片|主图|轮播图|上传商品图片/.test(x.textContent));
    leaves.slice(0,6).forEach(x=>{
      let chain=[]; let el=x; let d=0;
      while(el&&d<6){chain.push(el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').slice(0,3).join('.'):''));el=el.parentElement;d++;}
      out.push({text:(x.textContent||'').trim().slice(0,40), chain:chain.join(' > ')});
    });
    return out;
  })()`);
  console.log('[4] 主图相关文字节点定位:');
  if(area) area.forEach(x=>console.log('    ', JSON.stringify(x)));

  // dump 上传组件容器（含 file input 的祖先容器 class）
  const containers = await ev(c, `(()=>{
    const out=[];
    const inputs=[...document.querySelectorAll('input[type="file"]')];
    inputs.slice(0,8).forEach((inp,i)=>{
      let el=inp; let found=null;
      while(el){ const cn=(el.className&&typeof el.className==='string')?el.className:''; if(/upload|image|img|pic|photo|banner|carousel/i.test(cn)){found={tag:el.tagName.toLowerCase(),class:cn.split(' ').slice(0,5).join('.')};break;} el=el.parentElement; }
      out.push({i, accept:inp.accept||'', nearestUploadClass:found});
    });
    return out;
  })()`);
  console.log('[5] 上传容器 class 匹配:');
  if(containers) containers.forEach(x=>console.log('    ', JSON.stringify(x)));

  c.ws.close();
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
