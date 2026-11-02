// 定位登录按钮在 iframe 内的坐标 + iframe 在主页面坐标，用 CDP 真实点击登录
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  await sleep(1000);

  // iframe 主页面坐标
  const iframeRect = await c.send('Runtime.evaluate',{expression:`(()=>{var f=document.querySelector('iframe');if(!f)return null;var r=f.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,src:f.src});})()`, returnByValue:true});
  console.log('iframe rect:', iframeRect.result.value);

  // iframe 内登录按钮坐标
  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'real_click', grantUniveralAccess:true});
  const ctxId = w.executionContextId;
  const btnRect = await c.send('Runtime.evaluate',{contextId:ctxId, expression:`(()=>{
    var b=document.querySelector('.fm-button.fm-submit.password-login');
    if(!b){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if((bs[i].textContent||'').trim()==='登录'){b=bs[i];break;}}}
    if(!b) return 'no_btn';
    var r=b.getBoundingClientRect();
    return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,text:b.textContent.trim()});
  })()`, returnByValue:true});
  console.log('登录按钮 iframe 内 rect:', btnRect.result.value);

  // 计算绝对坐标 + CDP 真实点击
  const ifr = JSON.parse(iframeRect.result.value);
  const btn = JSON.parse(btnRect.result.value);
  const absX = ifr.x + btn.x + btn.w/2;
  const absY = ifr.y + btn.y + btn.h/2;
  console.log('绝对坐标:', absX, absY);

  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:absX,y:absY});
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:absX,y:absY,button:'left',clickCount:1});
  await sleep(120);
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:absX,y:absY,button:'left',clickCount:1});
  console.log('已 CDP 真实点击登录按钮');
  await sleep(5000);

  // 检查结果
  const after = await c.send('Runtime.evaluate',{contextId:ctxId, expression:`(()=>{
    var n1=document.querySelector('#nc_1');
    var n1z=document.querySelector('#nc_1_n1z');
    return JSON.stringify({hasN1:!!n1, n1zW:n1z?n1z.getBoundingClientRect().width:0, body:document.body.innerText.slice(0,200)});
  })()`, returnByValue:true});
  console.log('点击后 iframe 状态:', after.result.value);

  // 主页面 URL 是否跳转
  const mainUrl = await c.send('Runtime.evaluate',{expression:'location.href.slice(0,70)', returnByValue:true});
  console.log('主页面 URL:', mainUrl.result.value);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
