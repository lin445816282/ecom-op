// 检查文件存在性 + 测试 setFileInputFiles 到新建的可见 input
const fs = require('fs');
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMG_BS = 'C:\\tmp\\pdd-publish\\task_2522\\img_1.jpg';  // 反斜杠
const IMG_FS = 'C:/tmp/pdd-publish/task_2522/img_1.jpg';    // 正斜杠

console.log('[文件存在性]');
console.log('  反斜杠 C:\\tmp\\...:', fs.existsSync(IMG_BS));
console.log('  正斜杠 C:/tmp/...:', fs.existsSync(IMG_FS));

function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 在页面里新建一个可见的 file input，测试 setFileInputFiles
  await ev(c, `(()=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.id='test_file_input';
    inp.style.cssText='position:fixed;top:0;left:0;z-index:99999;';
    document.body.appendChild(inp);
    return 'created';
  })()`);
  await sleep(500);
  const docF = await c.send('DOM.getDocument',{depth:-1});
  const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'#test_file_input'});
  console.log('[测试 input nodeId]', qi && qi.nodeId ? qi.nodeId : '未找到');
  if(qi && qi.nodeId){
    for(const [label, path] of [['反斜杠', IMG_BS], ['正斜杠', IMG_FS]]){
      try{
        await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:[path]});
        const n = await ev(c, `(()=>{const i=document.querySelector('#test_file_input');return i&&i.files?i.files.length:-1;})()`);
        console.log(`  [${label}] setFileInputFiles 后 files.length = ${n}`);
      }catch(e){ console.log(`  [${label}] 异常:`, e.message); }
    }
  }

  // 清理测试 input
  await ev(c, `(()=>{const i=document.querySelector('#test_file_input');if(i)i.remove();return 'removed';})()`);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
