// 截图当前 CDP 9222 登录页 + 检查滑块状态
const http = require('http');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}

(async()=>{
  const tabs = await get('http://127.0.0.1:9222/json');
  const loginTab = tabs.filter(t=>t.type==='page').find(t=>/loginmyseller/.test(t.url||''));
  if(!loginTab){ console.log('无 loginmyseller tab'); process.exit(0); }
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{});
  await sleep(1000);

  // 截图
  const shot = await c.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('C:\\tmp\\taobao_login_now.png', Buffer.from(shot.data,'base64'));
  console.log('截图保存 C:\\tmp\\taobao_login_now.png');

  // 检查滑块状态
  const ft = await c.send('Page.getFrameTree',{});
  function findHavana(n){ if(!n) return null; if((n.frame&&n.frame.url||'').indexOf('havanalogin')>=0) return n.frame.id; for(const cf of (n.childFrames||[])){ const r=findHavana(cf); if(r) return r; } return null; }
  const hid = findHavana(ft.frameTree);
  console.log('havanalogin:', hid || '未找到');
  if(hid){
    const w = await c.send('Page.createIsolatedWorld',{frameId:hid, worldName:'shot_check', grantUniveralAccess:true});
    const r = await c.send('Runtime.evaluate',{contextId:w.executionContextId, expression:'JSON.stringify({hasSlider:!!document.querySelector("#nc_1_n1z"),slider:(function(){var s=document.querySelector("#nc_1_n1z");if(!s)return null;var r=s.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})()})', returnByValue:true});
    console.log('滑块:', r.result.value);
  }
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
