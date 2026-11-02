// 测试：不同 depth + setFileInputFiles 后立即读 files.length
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

  for(const depth of [3, 5, -1]){
    const docF = await c.send('DOM.getDocument',{depth});
    const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'[class*="uploadImgEnter"] input[type="file"][accept*="image"]'});
    const found = qi && qi.nodeId;
    console.log(`[depth=${depth}] file input:`, found ? 'nodeId='+qi.nodeId : '未找到');
    if(found){
      try{
        await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:[IMG]});
        const finfo = await ev(c, `(()=>{const inp=document.querySelector('[class*="uploadImgEnter"] input[type="file"][accept*="image"]');return inp&&inp.files?inp.files.length:-1;})()`);
        console.log(`   setFileInputFiles 后 files.length = ${finfo}`);
        await sleep(1500);
        const finfo2 = await ev(c, `(()=>{const inp=document.querySelector('[class*="uploadImgEnter"] input[type="file"][accept*="image"]');return inp&&inp.files?inp.files.length:-1;})()`);
        console.log(`   1.5s后 files.length = ${finfo2}`);
      }catch(e){ console.log('   setFileInputFiles 异常:', e.message); }
    }
  }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
