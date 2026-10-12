// 测试：普通店用 MaterialModalButton selector 上传主图，观察是否生效 + 如何验证
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9234';
const IMGS = [
  'C:\\tmp\\pdd-publish\\task_10\\img_1.jpg',
  'C:\\tmp\\pdd-publish\\task_10\\img_2.jpg',
  'C:\\tmp\\pdd-publish\\task_10\\img_3.jpg',
];
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const g = tabs.filter(t=>t.type==='page').find(t=>/goods_add\/index/.test(t.url||''));
  if(!g){ console.log('无发布页 tab'); process.exit(1); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 上传前：主图区（MaterialModalButton）状态
  const before = await ev(c, `(()=>{
    const inps=[...document.querySelectorAll('[class*="MaterialModalButton"] input[type="file"][accept*="image"]')];
    const boxes=[...document.querySelectorAll('[class*="MaterialModalButton"]')];
    const imgs=boxes.reduce((n,e)=>n+(e.querySelectorAll?[...e.querySelectorAll('img')].length:0),0);
    return {inputCount:inps.length, imgCount:imgs, hasNM:/\(\d+\/\d+\)/.test(document.body.innerText)};
  })()`);
  console.log('[1] 上传前 MaterialModalButton:', JSON.stringify(before));

  // 用 MaterialModalButton selector 上传
  const docF = await c.send('DOM.getDocument',{depth:3});
  const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId, selector:'[class*="MaterialModalButton"] input[type="file"][accept*="image"]'});
  console.log('[2] MaterialModalButton image input 定位:', qi && qi.nodeId ? 'OK' : '未找到');
  if(qi && qi.nodeId){
    try{
      const r = await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:IMGS});
      console.log('[3] setFileInputFiles 返回:', JSON.stringify(r));
    }catch(e){ console.log('[3] 异常:', e.message); }
  }

  // 轮询观察
  for(let i=0;i<6;i++){
    await sleep(2500);
    const st = await ev(c, `(()=>{
      const boxes=[...document.querySelectorAll('[class*="MaterialModalButton"]')];
      const imgs=boxes.reduce((n,e)=>n+(e.querySelectorAll?[...e.querySelectorAll('img')].length:0),0);
      const bgs=boxes.filter(e=>(e.getAttribute('style')||'').includes('background-image')).length;
      // 找 (N/M) 文字
      const nm=(document.body.innerText.match(/\(\d+\/\d+\)/)||[''])[0];
      return {imgs, bgs, nm};
    })()`);
    console.log(`    轮询${i+1}:`, JSON.stringify(st));
  }

  // dump 主图区 MaterialModalButton 容器的 innerHTML（看缩略图渲染）
  const html = await ev(c, `(()=>{
    const b=document.querySelector('[class*="MaterialModalButton"]');
    return b?b.innerHTML.slice(0,1500):'no box';
  })()`);
  console.log('[4] MaterialModalButton innerHTML(截断):');
  console.log(html);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
