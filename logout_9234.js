// 9234 退出当前账号 + 截图登录二维码
const http = require('http');
const fs = require('fs');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = '9234';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  try{
    const tabs = await get(`http://127.0.0.1:${PORT}/json`);
    const page = tabs.find(t=>t.type==='page');
    if(!page){ console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('ws timeout')),6000);ws.addEventListener('open',()=>{clearTimeout(t);res()})});
    let id=0; const p=new Map();
    function send(m,pa){return new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method:m,params:pa}))})}
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});
    await send('Page.enable',{});
    await send('Runtime.enable',{});

    // 1. 确认当前店铺名
    const r0 = await send('Runtime.evaluate',{expression:`(function(){
      var b = document.body ? document.body.innerText : '';
      var m = b.match(/[\\u4e00-\\u9fa5A-Za-z·]{2,20}(旗舰店|专营店|专卖店)/);
      return JSON.stringify({shop: m ? m[0] : '未识别', url: location.href.slice(0,60)});
    })()`, returnByValue:true});
    console.log('当前店铺:', r0.result.value);

    // 2. 找"退出当前账号"元素
    const r1 = await send('Runtime.evaluate',{expression:`(function(){
      var els = document.querySelectorAll('a,button,div,span,li');
      var out = [];
      for(var i=0;i<els.length;i++){
        var t = (els[i].textContent||'').trim();
        if(t === '退出当前账号' || t === '退出' || t === '退出登录'){
          var b = els[i].getBoundingClientRect();
          out.push({tag: els[i].tagName, txt: t, x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2), w: Math.round(b.width), h: Math.round(b.height)});
        }
      }
      return JSON.stringify(out);
    })()`, returnByValue:true});
    const btns = JSON.parse(r1.result.value);
    console.log('退出按钮:', JSON.stringify(btns));

    // 3. 点击退出按钮
    if(btns.length > 0){
      const b = btns[0];
      await send('Input.dispatchMouseEvent',{type:'mouseMoved', x: b.x, y: b.y});
      await sleep(200);
      await send('Input.dispatchMouseEvent',{type:'mousePressed', x: b.x, y: b.y, button:'left', clickCount:1});
      await sleep(80);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased', x: b.x, y: b.y, button:'left', clickCount:1});
      await sleep(3000);

      // 4. 处理可能的确认弹窗
      const r2 = await send('Runtime.evaluate',{expression:`(function(){
        var btns = [...document.querySelectorAll('button')];
        var confirm = btns.find(b => /确定|确认|退出/.test((b.textContent||'').trim()));
        if(confirm){ confirm.click(); return 'clicked: ' + confirm.textContent.trim(); }
        return 'no confirm';
      })()`, returnByValue:true});
      console.log('确认弹窗:', r2.result.value);
      await sleep(4000);
    }

    // 5. 截图
    const shot = await send('Page.captureScreenshot',{format:'png'});
    const buf = Buffer.from(shot.data, 'base64');
    const outPath = 'D:\\电商运营\\运营工作台\\pdd_login_qr.png';
    fs.writeFileSync(outPath, buf);
    console.log('截图已保存:', outPath, buf.length, 'bytes');

    // 6. 确认当前页面状态
    const r3 = await send('Runtime.evaluate',{expression:`(function(){
      return JSON.stringify({url: location.href.slice(0,80), title: document.title, hasQr: !!(document.querySelector('img[class*="qr"], canvas, [class*="qrcode"], [class*="QR"]'))});
    })()`, returnByValue:true});
    console.log('退出后状态:', r3.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
