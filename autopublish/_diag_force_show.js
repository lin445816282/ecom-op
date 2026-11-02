// 测试：setFileInputFiles 后读 input.files，判断文件是否真的设置进去 + 尝试强制显示容器
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMG = 'C:\\tmp\\pdd-publish\\task_2522\\img_1.jpg';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 强制显示 btns 容器
  const forceShow = await ev(c, `(()=>{
    const btns=document.querySelector('[class*="goodsCarousel_btns"]');
    if(!btns) return 'no btns';
    btns.style.display='block';
    return 'forced block';
  })()`);
  console.log('[强制显示 btns]', forceShow);

  // setFileInputFiles
  const docF = await c.send('DOM.getDocument',{depth:3});
  const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'[class*="uploadImgEnter"] input[type="file"][accept*="image"]'});
  if(qi && qi.nodeId){
    await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:[IMG]});
    console.log('[setFileInputFiles] OK');
    await sleep(2000);
    // 读 input.files
    const finfo = await ev(c, `(()=>{
      const inp=document.querySelector('[class*="uploadImgEnter"] input[type="file"][accept*="image"]');
      if(!inp) return 'no input';
      return {files: inp.files ? inp.files.length : -1, value: inp.value || '(空)'};
    })()`);
    console.log('[input.files]', JSON.stringify(finfo));
    // 读 N/M
    const cnt = await ev(c, `(()=>{const sel=document.querySelector('[class*="goodsCarousel_selected"]');if(sel){const t=(sel.innerText||sel.textContent||'').trim();return t;}return '(无)';})()`);
    console.log('[selected 文本]', cnt);
    await sleep(5000);
    const cnt2 = await ev(c, `(()=>{const sel=document.querySelector('[class*="goodsCarousel_selected"]');if(sel){const t=(sel.innerText||sel.textContent||'').trim();return t;}return '(无)';})()`);
    console.log('[5s后 selected 文本]', cnt2);
  } else { console.log('[file input 未找到]'); }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
