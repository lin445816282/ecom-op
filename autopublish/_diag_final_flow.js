// 最终验证：hover 展开菜单 → setFileInputFiles → 观察缩略图/N/M 变化
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMGS = ['C:/tmp/pdd-publish/task_2522/img_1.jpg','C:/tmp/pdd-publish/task_2522/img_2.jpg','C:/tmp/pdd-publish/task_2522/img_3.jpg','C:/tmp/pdd-publish/task_2522/img_4.jpg'];
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

// 全面读图片状态
const readState = (c) => ev(c, `(()=>{
  const t=(document.body.innerText||'').replace(/\\s+/g,' ');
  const m=t.match(/上传图片[^(（]*[（(]\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*[)）]/);
  const sel=document.querySelector('[class*="goodsCarousel_selected"]');
  const selTxt=sel?(sel.innerText||'').trim():'(无sel)';
  const carousel=document.querySelector('[class*="goodsCarousel"]');
  const imgs=carousel?carousel.querySelectorAll('img').length:0;
  const bgDivs=carousel?[...carousel.querySelectorAll('*')].filter(e=>((e.getAttribute&&e.getAttribute('style'))||'').includes('background-image')).length:0;
  return {textCnt:m?m[1]+'/'+m[2]:'(无文字)', selTxt, imgs, bgDivs};
})()`);

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 导航干净页面
  await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
  for(let i=0;i<12;i++){ await sleep(1000); const f=await ev(c,'location.href'); if(/goods\/category/.test(f||'')) break; }
  await sleep(5000);

  console.log('[初始状态]', JSON.stringify(await readState(c)));

  // hover 展开菜单
  const pt = await ev(c, `(()=>{const o=document.querySelector('[class*="goodsCarousel_originEnter"]');if(!o)return null;const r=o.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  if(pt){
    await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
    await sleep(1500);
    const btnsDisp = await ev(c, `(()=>{const b=document.querySelector('[class*="goodsCarousel_btns"]');return b?getComputedStyle(b).display:'no';})()`);
    console.log('[hover后 btns display]', btnsDisp);
  }

  // setFileInputFiles（正斜杠路径）
  const docF = await c.send('DOM.getDocument',{depth:-1});
  const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'[class*="uploadImgEnter"] input[type="file"][accept*="image"]'});
  console.log('[file input]', qi && qi.nodeId ? 'nodeId='+qi.nodeId : '未找到');
  if(qi && qi.nodeId){
    try{
      const r = await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:IMGS});
      console.log('[setFileInputFiles]', JSON.stringify(r));
    }catch(e){ console.log('[setFileInputFiles 异常]', e.message); }
    for(let i=0;i<6;i++){
      await sleep(3000);
      console.log('  轮询'+(i+1)+':', JSON.stringify(await readState(c)));
    }
  }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
