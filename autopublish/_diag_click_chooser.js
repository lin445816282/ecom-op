// 最终测试：hover → input.click() 触发 fileChooser → setFileInputFiles
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMGS = ['C:/tmp/pdd-publish/task_2522/img_1.jpg'];
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const events=[];const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}else if(m.method){events.push(m)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send,events};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  await c.send('Page.setInterceptFileChooserDialog',{enabled:true});

  // hover 展开菜单
  const pt = await ev(c, `(()=>{const o=document.querySelector('[class*="goodsCarousel_originEnter"]');if(!o)return null;const r=o.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  if(pt){ await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y}); await sleep(1500); }

  // 直接对 file input 执行 click（JS 合成），看是否触发 fileChooser
  c.events.length = 0;
  const clickResult = await ev(c, `(()=>{
    const inp=document.querySelector('[class*="uploadImgEnter"] input[type="file"][accept*="image"]');
    if(!inp) return 'no input';
    inp.click();
    return 'clicked';
  })()`);
  console.log('[input.click()]', clickResult);
  await sleep(2000);
  const chooser = c.events.find(e=>e.method==='Page.fileChooserOpened');
  console.log('[fileChooserOpened]', chooser ? '触发！backendNodeId='+chooser.params.backendNodeId : '无');

  if(chooser){
    // 用 fileChooserOpened 的 backendNodeId setFileInputFiles
    try{
      await c.send('DOM.setFileInputFiles',{nodeId:chooser.params.backendNodeId, files:IMGS});
      console.log('[setFileInputFiles via chooser] OK');
    }catch(e){ console.log('[setFileInputFiles 异常]', e.message); }
    for(let i=0;i<4;i++){
      await sleep(3000);
      const st = await ev(c, `(()=>{const sel=document.querySelector('[class*="goodsCarousel_selected"]');const t=(document.body.innerText||'').replace(/\\s+/g,' ');const m=t.match(/上传图片[^(（]*[（(]\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*[)）]/);return {sel:sel?(sel.innerText||'').trim():'(无sel)', cnt:m?m[1]+'/'+m[2]:'(无)'};})()`);
      console.log('  轮询'+(i+1)+':', JSON.stringify(st));
    }
  }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
