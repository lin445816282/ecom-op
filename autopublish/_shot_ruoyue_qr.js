// 拼多多扫码登录二维码截图（如若月下店 CDP 9230）
const http = require('http');
const fs = require('fs');
const PORT = process.argv[2] || '9230';
const OUT = process.argv[3] || 'C:\\tmp\\ruoyue_login_qr.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
function newTab(url){return new Promise((res,rej)=>{const req=http.request(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`,{method:'PUT'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))});req.end();})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},30000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  // 1. 找已有的 login tab，没有则新建
  let tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let loginTab = tabs.filter(t=>t.type==='page').find(t=>/login/.test(t.url||''));
  if(!loginTab){
    await newTab('https://mms.pinduoduo.com/login/');
    await sleep(8000);
    tabs = await get(`http://127.0.0.1:${PORT}/json`);
    loginTab = tabs.filter(t=>t.type==='page').find(t=>/login/.test(t.url||''));
  }
  if(!loginTab){ console.log('NO_LOGIN_TAB'); process.exit(1); }
  console.log('login tab:', loginTab.url);
  const c = await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{});
  await sleep(2000);

  // 2. 切「扫码登录」tab
  const tabR = await ev(c, `(()=>{const els=[...document.querySelectorAll('div,span,li,label,a,button')].find(x=>(x.textContent||'').trim()==='扫码登录');if(!els)return 'NO_QR_TAB';els.click();return 'CLICKED';})()`);
  console.log('qr tab:', tabR);
  await sleep(4000);

  // 3. 抓二维码大图 src（更清晰）
  const qrImg = await ev(c, `(()=>{const imgs=[...document.querySelectorAll('img')].filter(i=>{const r=i.getBoundingClientRect();return r.width>100&&r.height>100});if(!imgs.length)return '';return imgs[0].src;})()`);
  console.log('QR_IMG_SRC:', qrImg || '(无大图)');

  // 4. 整页截图兜底
  const shot = await c.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(OUT, Buffer.from(shot.data,'base64'));
  console.log('SHOT_SAVED ' + OUT);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.error('ERR:',e.message);process.exit(1)});
