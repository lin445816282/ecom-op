// 检查主页面 loginmyseller 是否有验证码弹窗（可能在 iframe 外层）
const http = require('http');
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  // 主页面检查
  const mainInfo = await c.send('Runtime.evaluate',{expression:`(()=>{
    var out = {};
    out.bodyText = document.body.innerText.slice(0,500);
    out.hasNc = document.body.innerHTML.indexOf('nc_1')>0;
    // 所有 iframe
    out.iframes = [];
    document.querySelectorAll('iframe').forEach(function(f){
      out.iframes.push({src:(f.src||'').slice(0,80), w:f.getBoundingClientRect().width, h:f.getBoundingClientRect().height, display:getComputedStyle(f).display});
    });
    // 弹窗/遮罩
    out.hasModal = !!document.querySelector('.next-dialog, [class*=modal], [class*=dialog], [class*=mask]');
    return JSON.stringify(out);
  })()`, returnByValue:true});
  console.log('主页面:', mainInfo.result.value);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
