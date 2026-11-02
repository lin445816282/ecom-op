// 抓嘉裕(9232)登录二维码：连接 login tab → 点扫码登录 → 抓二维码 img src 下载
const http = require('http');
const fs = require('fs');
const https = require('https');
const PORT = '9232';

function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)})}

async function conn(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const p=new Map();
  const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;const to=setTimeout(()=>{p.delete(mid);rej(new Error('timeout '+m))},15000);p.set(mid,{res,rej,to});ws.send(JSON.stringify({id:mid,method:m,params:pa}))});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);clearTimeout(q.to);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
  await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});
  return {ws,send};
}

(async()=>{
  const tabs=await get(`http://127.0.0.1:${PORT}/json`);
  const loginTab=tabs.find(t=>t.type==='page'&&/login/.test(t.url))||tabs.find(t=>t.type==='page');
  console.log('用 tab:', loginTab.url.slice(0,80));
  const c=await conn(loginTab.webSocketDebuggerUrl);
  await c.send('Page.enable',{});
  await c.send('Runtime.enable',{});
  // 点「扫码登录」切换 tab
  const r=await c.send('Runtime.evaluate',{expression:`(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='扫码登录');if(els[0]){els[0].click();return 'clicked'}return 'no_scan_tab'})()`,returnByValue:true});
  console.log('扫码登录tab:', r.result.value);
  await new Promise(r=>setTimeout(r,3000));
  // 抓大 img (二维码)
  const q=await c.send('Runtime.evaluate',{expression:`(()=>{const imgs=[...document.querySelectorAll('img')].filter(e=>{const r=e.getBoundingClientRect();return r.width>80&&r.height>80});return imgs.map(e=>e.src).filter(s=>s&&s.length>10).slice(0,5)})()`,returnByValue:true});
  console.log('二维码候选:', JSON.stringify(q.result.value,null,2));
  const srcs=(q.result.value||[]).filter(s=>/pddpic|qrcode|qr|funimg/i.test(s));
  if(srcs.length){
    const url=srcs[0];
    console.log('下载二维码:', url.slice(0,100));
    https.get(url,res=>{
      const buf=[];res.on('data',c=>buf.push(c));res.on('end',()=>{
        fs.writeFileSync('C:/tmp/pdd_qr_9232.png', Buffer.concat(buf));
        console.log('QR_SAVED C:/tmp/pdd_qr_9232.png');
        process.exit(0);
      });
    }).on('error',e=>{console.log('下载失败:',e.message);process.exit(1)});
  } else {
    // 兜底：整页截图
    const shot=await c.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('C:/tmp/pdd_qr_9232.png', Buffer.from(shot.data,'base64'));
    console.log('QR_SAVED(截图) C:/tmp/pdd_qr_9232.png');
    process.exit(0);
  }
})().catch(e=>{console.log('ERR:',e.message);process.exit(1)});
