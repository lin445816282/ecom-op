// 改进版自动拖拽：人类轨迹（加速-减速 + 末端回拉微调）
const http = require('http');
function get(u){return new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(null)}})}).on('error',rej)})}
const PORT = process.argv[2] || '9238';
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
    await send('Runtime.enable',{});

    const r0 = await send('Runtime.evaluate',{expression:`(function(){
      var s = document.getElementById('nc_1_n1z');
      if(!s) return JSON.stringify({noSlider:true});
      var b = s.getBoundingClientRect();
      var track = document.getElementById('nc_1_n1t');
      var tb = track ? track.getBoundingClientRect() : null;
      return JSON.stringify({x: b.x, y: b.y, w: b.width, h: b.height, trackX: tb?tb.x:null, trackW: tb?tb.width:null});
    })()`, returnByValue:true});
    const info = JSON.parse(r0.result.value);
    if(info.noSlider){ console.log('NO_SLIDER'); return; }

    const sx = info.x + info.w/2;
    const sy = info.y + info.h/2;
    const endX = info.trackX + info.trackW - info.w/2 - 2;
    const dist = endX - sx;

    // 生成轨迹：分 4 段（慢启动→加速→匀速→减速→回拉）
    function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
    const pts = [];
    const seg1 = 8, seg2 = 14, seg3 = 8, seg4 = 6; // 共 36 点
    const total = seg1+seg2+seg3+seg4;
    for(let i=0;i<=total;i++){
      let frac = i/total;               // 0..1
      let x = sx + dist*easeInOutCubic(frac);
      let y = sy + Math.sin(i*0.9)*1.1 + (i%3===0?Math.random()*1:0);
      pts.push({x:Math.round(x), y:Math.round(y)});
    }
    // 末端回拉：到达最右后往回 6px，再回最右
    pts.push({x: Math.round(endX-6), y: Math.round(sy)});
    pts.push({x: Math.round(endX), y: Math.round(sy)});

    console.log('拖拽:', Math.round(sx), '→', Math.round(endX), '共', pts.length, '点');

    await send('Input.dispatchMouseEvent',{type:'mouseMoved', x: sx, y: sy});
    await sleep(300);
    await send('Input.dispatchMouseEvent',{type:'mousePressed', x: sx, y: sy, button:'left', clickCount:1});
    await sleep(150);
    for(let i=0;i<pts.length;i++){
      await send('Input.dispatchMouseEvent',{type:'mouseMoved', x: pts[i].x, y: pts[i].y, button:'left'});
      await sleep(15 + Math.random()*10);
    }
    await sleep(200);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased', x: endX, y: sy, button:'left', clickCount:1});

    // 只等 3 秒就查（避免导航挂起），用短超时
    await sleep(3000);
    const r1 = await send('Runtime.evaluate',{expression:`(function(){
      var s = document.getElementById('nc_1_n1z');
      return JSON.stringify({url: location.href.slice(0,80), sliderGone: !s, title: document.title});
    })()`, returnByValue:true}).catch(()=>({result:{value:'EVAL_TIMEOUT'}}));
    console.log('结果:', r1.result.value);
    ws.close();
    process.exit(0);
  }catch(e){ console.log('ERR:', e.message); process.exit(1); }
})();
