// 测试：点击「上传图片」展开菜单 → 再 setFileInputFiles 上传
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

  // 点击「上传图片」按钮（goodsCarousel_originEnter）
  const clicked = await ev(c, `(()=>{
    const btn=document.querySelector('[class*="goodsCarousel_originEnter"]') || document.querySelector('[class*="goodsCarousel_uploadImgEnter"] > div');
    if(!btn) return 'no btn';
    btn.click();
    return 'clicked';
  })()`);
  console.log('[点击上传图片]', clicked);
  await sleep(2000);

  // 观察菜单是否展开（goodsCarousel_btns display 状态）
  const menuState = await ev(c, `(()=>{
    const btns=document.querySelector('[class*="goodsCarousel_btns"]');
    if(!btns) return 'no btns';
    const cs=getComputedStyle(btns);
    return {display: cs.display, inline: btns.getAttribute('style')};
  })()`);
  console.log('[菜单状态]', JSON.stringify(menuState));

  // 再 setFileInputFiles 上传
  const docF = await c.send('DOM.getDocument',{depth:3});
  const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'[class*="uploadImgEnter"] input[type="file"][accept*="image"]'});
  console.log('[file input]', qi && qi.nodeId ? 'OK nodeId='+qi.nodeId : '未找到');
  if(qi && qi.nodeId){
    try{
      await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:[IMG]});
      console.log('[setFileInputFiles] OK');
    }catch(e){ console.log('[setFileInputFiles 异常]', e.message); }
    for(let i=0;i<5;i++){
      await sleep(3000);
      const cnt = await ev(c, `(()=>{const sel=document.querySelector('[class*="goodsCarousel_selected"]');if(sel){const t=(sel.innerText||sel.textContent||'').trim();const m=t.match(/\\((\\d+)\\/(\\d+)\\)/);if(m)return m[1]+'/'+m[2];}return '(无)';})()`);
      const imgs = await ev(c, `(()=>[...document.querySelectorAll('[class*="goodsCarousel"] img')].length)`);
      console.log('  轮询'+(i+1)+': N/M='+cnt+' img数='+imgs);
    }
  }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
