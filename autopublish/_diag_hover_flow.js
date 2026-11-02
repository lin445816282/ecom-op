// 测试：导航到干净页面 → hover/点击「上传图片」→ 观察菜单展开 → 上传
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMG = 'C:/tmp/pdd-publish/task_2522/img_1.jpg';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  // 导航到干净页面
  await c.send('Page.navigate',{url:'https://mms.pinduoduo.com/goods/category'});
  for(let i=0;i<12;i++){ await sleep(1000); const f=await ev(c,'location.href'); if(/goods\/category/.test(f||'')) break; }
  await sleep(5000);

  // 获取 originEnter 精确位置
  const info = await ev(c, `(()=>{
    const box=document.querySelector('[class*="goodsCarousel_uploadImgEnter"]');
    if(!box) return {box:'no'};
    const origin=box.querySelector('[class*="goodsCarousel_originEnter"]');
    const btns=box.querySelector('[class*="goodsCarousel_btns"]');
    const r = origin ? origin.getBoundingClientRect() : null;
    return {
      box: 'ok',
      origin: r?{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}:null,
      btnsDisplay: btns?getComputedStyle(btns).display:'no btns',
    };
  })()`);
  console.log('[初始]', JSON.stringify(info));

  const pt = info && info.origin;
  if(pt){
    // hover（mouseMoved 不点击）
    await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
    await sleep(1500);
    const st1 = await ev(c, `(()=>{const b=document.querySelector('[class*="goodsCarousel_btns"]');return b?getComputedStyle(b).display:'no';})()`);
    console.log('[hover后 btns display]', st1);

    // 点击
    await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:pt.x,y:pt.y,button:'left',clickCount:1});
    await sleep(100);
    await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x,y:pt.y,button:'left',clickCount:1});
    await sleep(2000);
    const st2 = await ev(c, `(()=>{const b=document.querySelector('[class*="goodsCarousel_btns"]');return b?getComputedStyle(b).display:'no';})()`);
    console.log('[点击后 btns display]', st2);

    // 读 btns 里「本地上传」按钮位置（如果展开了）
    const localBtn = await ev(c, `(()=>{
      const b=[...document.querySelectorAll('[class*="goodsCarousel_btns"] button')].find(x=>(x.textContent||'').includes('本地上传'));
      if(!b) return null;
      const r=b.getBoundingClientRect();
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),display:getComputedStyle(b).display, vis:r.width>0&&r.height>0};
    })()`);
    console.log('[本地上传按钮]', JSON.stringify(localBtn));

    if(localBtn && localBtn.vis){
      // 点击本地上传按钮（触发 file input）
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:localBtn.x,y:localBtn.y});
      await sleep(200);
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:localBtn.x,y:localBtn.y,button:'left',clickCount:1});
      await sleep(100);
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:localBtn.x,y:localBtn.y,button:'left',clickCount:1});
      await sleep(1500);
      console.log('[点击本地上传后] 可能弹出文件对话框');
    }
  }

  // 无论菜单是否展开，尝试 setFileInputFiles（用正斜杠路径）
  const docF = await c.send('DOM.getDocument',{depth:-1});
  const qi = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:'[class*="uploadImgEnter"] input[type="file"][accept*="image"]'});
  if(qi && qi.nodeId){
    await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:[IMG]});
    const n = await ev(c, `(()=>{const i=document.querySelector('[class*="uploadImgEnter"] input[type="file"][accept*="image"]');return i&&i.files?i.files.length:-1;})()`);
    console.log('[setFileInputFiles 后 files.length]', n);
    await sleep(3000);
    const cnt = await ev(c, `(()=>{const s=document.querySelector('[class*="goodsCarousel_selected"]');return s?(s.innerText||'').trim():'(无)';})()`);
    console.log('[3s后 selected]', cnt);
  }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
