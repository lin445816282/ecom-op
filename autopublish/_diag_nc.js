// 检查 iframe 内滑块验证码容器状态：为什么 #nc_1_n1z 是 0x0
const http = require('http');
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{});
  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  if(!hid){ console.log('无 havanalogin'); process.exit(0); }
  const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'diag_nc', grantUniveralAccess:true});
  const ctxId = w.executionContextId;

  const info = await c.send('Runtime.evaluate',{contextId:ctxId, expression:`(()=>{
    var out = {};
    var acc = document.querySelector('#fm-login-id');
    var pwd = document.querySelector('#fm-login-password');
    out.accVal = acc ? acc.value : null;
    out.pwdLen = pwd ? pwd.value.length : null;
    // nc_1 相关元素
    var nc1 = document.querySelector('#nc_1');
    var n1z = document.querySelector('#nc_1_n1z');
    var n1t = document.querySelector('#nc_1_n1t');
    out.nc1 = nc1 ? {display:getComputedStyle(nc1).display, visible:nc1.getBoundingClientRect().width+','+nc1.getBoundingClientRect().height} : null;
    out.n1z = n1z ? {display:getComputedStyle(n1z).display, w:n1z.getBoundingClientRect().width, h:n1z.getBoundingClientRect().height} : null;
    out.n1t = n1t ? {w:n1t.getBoundingClientRect().width, h:n1t.getBoundingClientRect().height} : null;
    // 错误提示
    var err = document.querySelector('.fm-error, .errloading, [class*=error], [class*=Error]');
    out.error = err ? err.textContent.trim().slice(0,100) : null;
    // iframe body 全文本
    out.body = document.body.innerText.slice(0,300);
    // iframe 尺寸
    out.iframeSize = window.innerWidth + 'x' + window.innerHeight;
    return JSON.stringify(out);
  })()`, returnByValue:true});
  console.log('iframe 详情:', info.result.value);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
