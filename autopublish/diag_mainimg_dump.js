// dump 上传成功后 uploadImgEnter 容器 innerHTML，找缩略图真实渲染方式
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 当前页面应该还是 goods/category（上一轮已上传5张）
  const cur = await ev(c,'location.href');
  console.log('[1] URL:', cur);

  // dump uploadImgEnter 容器完整 innerHTML（截断）
  const html = await ev(c, `(()=>{
    const box=document.querySelector('[class*="uploadImgEnter"]');
    if(!box) return 'no box';
    return box.innerHTML.slice(0, 3000);
  })()`);
  console.log('[2] uploadImgEnter innerHTML:');
  console.log(html);

  // 统计各种可能的缩略图元素
  const stats = await ev(c, `(()=>{
    const box=document.querySelector('[class*="uploadImgEnter"]');
    if(!box) return null;
    return {
      img: box.querySelectorAll('img').length,
      canvas: box.querySelectorAll('canvas').length,
      svg: box.querySelectorAll('svg').length,
      picture: box.querySelectorAll('picture').length,
      div: box.querySelectorAll('div').length,
      // 带 style 的 div
      styleDiv: [...box.querySelectorAll('div')].filter(d=>(d.getAttribute('style')||'').length>0).length,
      // 找 data-src / background 相关
      dataSrc: box.querySelectorAll('[data-src]').length,
      bgStyle: [...box.querySelectorAll('*')].filter(e=>/background/.test(e.getAttribute&&e.getAttribute('style')||'')).length,
    };
  })()`);
  console.log('[3] 元素统计:', JSON.stringify(stats));

  // 文字计数方式验证
  const textCnt = await ev(c, `(()=>{const t=(document.body.innerText||'').replace(/\\s+/g,' ');const m=t.match(/上传图片\\s*\\(\\s*(\\d+)\\s*\\/\\s*(\\d+)\\)/);return m?{cur:m[1],max:m[2]}:null})()`);
  console.log('[4] 文字计数:', JSON.stringify(textCnt));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
