// 填号 + 点登录（脚本 auto_login 方式：nativeSetter + 单次 .click()）
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  if(!loginTab){ console.log('无 loginmyseller tab'); process.exit(0); }
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});
  await sleep(2000);

  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  console.log('havanalogin:', hid || '未找到');
  if(!hid){ process.exit(0); }
  const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'hermes_login', grantUniveralAccess:true});
  const ctxId = w.executionContextId;
  async function evalCtx(expr){
    const r = await c.send('Runtime.evaluate',{contextId:ctxId, expression:expr, returnByValue:true});
    return r && r.result ? r.result.value : undefined;
  }

  // 填号（nativeSetter + input/change）
  const fill = `(function(){
    var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    var acc=document.querySelector('#fm-login-id');
    var pwd=document.querySelector('#fm-login-password');
    if(!acc||!pwd) return 'nf';
    ns.call(acc,'嘉裕工艺品'); acc.dispatchEvent(new Event('input',{bubbles:true})); acc.dispatchEvent(new Event('change',{bubbles:true}));
    ns.call(pwd,'Alcz8283103'); pwd.dispatchEvent(new Event('input',{bubbles:true})); pwd.dispatchEvent(new Event('change',{bubbles:true}));
    return 'filled acc='+acc.value.length+' pwd='+pwd.value.length;
  })()`;
  console.log('填号:', await evalCtx(fill));
  await sleep(1000);

  // 点登录（单次 .click()，脚本 auto_login 方式）
  const click = `(function(){
    var btn=document.querySelector('.fm-button.fm-submit.password-login');
    if(!btn){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if((bs[i].textContent||'').trim()==='登录'){btn=bs[i];break;}}}
    if(!btn) return 'no_btn';
    btn.click();
    return 'clicked';
  })()`;
  console.log('点登录:', await evalCtx(click));
  await sleep(5000);

  // 检查状态（重新 evaluate 主页面）
  const state = await c.send('Runtime.evaluate',{expression:'JSON.stringify({title:document.title,url:location.href.slice(0,60)})',returnByValue:true});
  console.log('点登录后主页面:', state.result.value);
  // 检查 iframe 内是否触发滑块/非法请求
  const iframeState = await evalCtx('JSON.stringify({body:document.body.innerText.slice(0,150),hasNc:document.body.innerHTML.indexOf("nc_1")>0})');
  console.log('iframe 内:', iframeState);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
