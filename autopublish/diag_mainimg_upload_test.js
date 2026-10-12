// 测试：主图真实上传（9228 旗舰店 goods/category 发布页），观察上传后图片数量是否生效
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMGS = [
  'C:\\tmp\\pdd-publish\\task_10\\img_1.jpg',
  'C:\\tmp\\pdd-publish\\task_10\\img_2.jpg',
  'C:\\tmp\\pdd-publish\\task_10\\img_3.jpg',
  'C:\\tmp\\pdd-publish\\task_10\\img_4.jpg',
  'C:\\tmp\\pdd-publish\\task_10\\img_5.jpg',
];
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
  }

  // 上传前：统计 uploadImgEnter 容器内的 img 数量 + 文字「上传图片(N/M)」
  const beforeText = await ev(c, `(()=>{const t=(document.body.innerText||'').replace(/\\s+/g,' ');const m=t.match(/上传图片\\s*\\(\\s*(\\d+)\\s*\\//);return m?m[1]:'(无文字)'})()`);
  const beforeImg = await ev(c, `(()=>{const box=[...document.querySelectorAll('[class*="uploadImgEnter"]')];const imgs=box.reduce((n,e)=>n+(e.querySelectorAll?[...e.querySelectorAll('img')].length:0),0);const bgs=box.filter(e=>(e.getAttribute('style')||'').includes('background-image')).length;return {imgs,bgs,total:imgs+bgs}})()`);
  console.log('[2] 上传前: 文字计数=', beforeText, ' img/bg=', JSON.stringify(beforeImg));

  // 用新 selector 定位 file input（含 MmsUiUploadPicVideoButton 组件的 input）
  const docF = await c.send('DOM.getDocument',{depth:3});
  let qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'[class*="uploadImgEnter"] input[type="file"][accept*="image"]'});
  console.log('[3] selector(uploadImgEnter+accept image) 定位:', qi && qi.nodeId ? 'OK nodeId='+qi.nodeId : '未找到');
  if(!qi || !qi.nodeId){
    qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'input[type="file"][accept*="image"]'});
    console.log('[3b] 宽松 selector(任意 accept image) 定位:', qi && qi.nodeId ? 'OK nodeId='+qi.nodeId : '未找到');
  }

  if(qi && qi.nodeId){
    try{
      const r = await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:IMGS});
      console.log('[4] setFileInputFiles 返回:', JSON.stringify(r));
    }catch(e){ console.log('[4] setFileInputFiles 异常:', e.message); }
  }

  // 轮询观察上传后数量
  for(let i=0;i<8;i++){
    await sleep(2500);
    const txt = await ev(c, `(()=>{const t=(document.body.innerText||'').replace(/\\s+/g,' ');const m=t.match(/上传图片\\s*\\(\\s*(\\d+)\\s*\\/\\s*(\\d+)\\)/);return m?m[1]+'/'+m[2]:'(无文字)'})()`);
    const img = await ev(c, `(()=>{const box=[...document.querySelectorAll('[class*="uploadImgEnter"]')];const imgs=box.reduce((n,e)=>n+(e.querySelectorAll?[...e.querySelectorAll('img')].length:0),0);const bgs=box.filter(e=>(e.getAttribute('style')||'').includes('background-image')).length;return {imgs,bgs,total:imgs+bgs}})()`);
    console.log(`    轮询${i+1}: 文字=${txt} img/bg=`, JSON.stringify(img));
  }

  // 最终：dump 上传组件内部结构（看是否有缩略图生成）
  const finalDom = await ev(c, `(()=>{
    const box=document.querySelector('[class*="uploadImgEnter"]');
    if(!box) return 'no box';
    // 找 box 内的缩略图 img / 带背景的 div
    const imgs=[...box.querySelectorAll('img')].map(i=>({src:(i.src||'').slice(0,60), class:(i.className||'').slice(0,40)}));
    const bgDivs=[...box.querySelectorAll('*')].filter(e=>(e.getAttribute&&(e.getAttribute('style')||'').includes('background-image'))).map(e=>({class:(e.className||'').slice(0,60), style:(e.getAttribute('style')||'').slice(0,120)}));
    return JSON.stringify({imgCount:imgs.length, imgs:imgs.slice(0,3), bgDivCount:bgDivs.length, bgDivs:bgDivs.slice(0,3)});
  })()`);
  console.log('[5] 最终上传组件内部:', finalDom);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
