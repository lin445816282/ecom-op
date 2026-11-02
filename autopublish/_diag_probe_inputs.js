// 探测当前 9228 页面所有 file input + 上传组件结构，定位主图上传的真实 selector
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  console.log('[URL]', await ev(c,'location.href'));

  // dump 所有 input[type=file]
  const inputs = await ev(c, `(()=>{
    return [...document.querySelectorAll('input[type="file"]')].map((inp,i)=>{
      const cls = inp.className || '';
      const accept = inp.getAttribute('accept') || '';
      // 找最近的带 class 的祖先（最多 5 层）
      let anc = [], p = inp.parentElement;
      for(let k=0;k<5 && p;k++){ anc.push((p.className||'').toString().slice(0,60)); p = p.parentElement; }
      const r = inp.getBoundingClientRect();
      return {i, cls: cls.toString().slice(0,80), accept, visible: r.width>0&&r.height>0, w:Math.round(r.width), h:Math.round(r.height), anc};
    });
  })()`);
  console.log('[file inputs]');
  (inputs||[]).forEach(x=>console.log(' ', JSON.stringify(x)));

  // 找含「上传」文案的可见区域（文字计数）
  const upText = await ev(c, `(()=>{
    const t=(document.body.innerText||'').replace(/\\s+/g,' ');
    const m=t.match(/上传图片[^(（]*[（(]\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*[)）]/);
    return m?{cur:m[1],max:m[2]}:null;
  })()`);
  console.log('[上传文字计数]', JSON.stringify(upText));

  // 找 goodsCarousel_selected / MaterialModalButton / uploadImgEnter 容器是否存在
  const boxes = await ev(c, `(()=>{
    return {
      carousel: !!document.querySelector('[class*="goodsCarousel_selected"]'),
      material: document.querySelectorAll('[class*="MaterialModalButton"]').length,
      uploadImg: !!document.querySelector('[class*="uploadImgEnter"]'),
      imageBox: document.querySelectorAll('[class*="imageBox"]').length,
    };
  })()`);
  console.log('[容器检测]', JSON.stringify(boxes));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
