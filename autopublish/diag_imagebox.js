// 精确统计主图缩略图数量：MaterialModalButton_v2_imageBox（带 background-image）
const http = require('http');
const PORT = '9234';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const g = tabs.filter(t=>t.type==='page').find(t=>/goods_add\/index/.test(t.url||''));
  if(!g){ console.log('无发布页 tab'); process.exit(1); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  const r = await ev(c, `(()=>{
    // imageBox 是上传缩略图的容器（class 含 imageBox）
    const imageBoxes=[...document.querySelectorAll('[class*="imageBox"]')];
    const withBg=imageBoxes.filter(x=>(x.getAttribute('style')||'').includes('background-image'));
    const imgWrappers=[...document.querySelectorAll('[class*="imageWrapper"]')];
    return {
      imageBoxTotal: imageBoxes.length,
      imageBoxWithBg: withBg.length,
      imageWrapperTotal: imgWrappers.length,
      // 精确统计 imageBox 内的 background-image 图片
      bgUrls: withBg.map(x=>{const m=(x.getAttribute('style')||'').match(/url\(/);return m?'bg':'';}).length,
    };
  })()`);
  console.log('统计:', JSON.stringify(r));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
