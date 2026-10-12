// 连接 9234 login 页，切到「扫码登录」tab，截图二维码
const http = require('http');
const fs = require('fs');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',()=>res(null))})}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = process.argv[2] || '9234';
const OUT = process.argv[3] || '/mnt/c/tmp/pdd-login-9234.png';
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    let page = tabs.find(t=>t.type==='page' && /login/.test(t.url||'')) || tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    console.log('page url:', (page.url||'').slice(0,70));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    // 确保扫码登录 tab 激活：点「扫码登录」文字
    const click = await send('Runtime.evaluate',{expression:`(function(){
      var els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='扫码登录');
      if(els.length){ els[0].click(); return 'clicked 扫码登录'; }
      return 'no 扫码登录 tab';
    })()`, returnByValue:true});
    console.log('切换扫码登录:', click.result.value);
    await sleep(3000);

    // dump 二维码 img
    const qr = await send('Runtime.evaluate',{expression:`(function(){
      var imgs=[...document.querySelectorAll('img')].filter(i=>{var r=i.getBoundingClientRect();return r.width>100&&r.height>100;});
      return JSON.stringify(imgs.map(i=>({src:(i.src||'').slice(0,80), w:i.getBoundingClientRect().width, h:i.getBoundingClientRect().height})));
    })()`, returnByValue:true});
    console.log('大图 img:', qr.result.value);

    // 截图整页
    const shot = await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('SAVED', OUT);
    ws.close(); process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
