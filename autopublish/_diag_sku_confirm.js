// 点「确认创建」按钮，验证能否关闭 SKU 抽屉
const http = require('http');
const PORT = '9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // 定位「确认创建」未 disabled 按钮坐标
  const coord = await ev(c, `(()=>{var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){var t=(bs[i].textContent||'').trim();if(t==='确认创建'&&!bs[i].disabled){var r=bs[i].getBoundingClientRect();if(r.width>0&&r.height>0)return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});}}return 'nf';})()`);
  console.log('确认创建坐标:', coord);
  if(coord==='nf'){ console.log('无确认创建按钮'); process.exit(0); }
  const c2 = JSON.parse(coord);
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:c2.x,y:c2.y,button:'left',clickCount:1});
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:c2.x,y:c2.y,button:'left',clickCount:1});
  console.log('已点击确认创建，等待 3s...');
  await sleep(3000);

  const after = await ev(c, `(()=>{
    var d = document.querySelector('.sku-decouple-drawer-container, [class*=drawer], [class*=Drawer]');
    var drawerVisible = d ? (d.getBoundingClientRect().width>0 && d.getBoundingClientRect().height>0) : false;
    var confirmBtns = 0;
    document.querySelectorAll('button').forEach(function(b){if((b.textContent||'').trim()==='确认创建'&&!b.disabled)confirmBtns++;});
    // SKU 表格行数
    var skuRows = document.querySelectorAll('.sell-new-sku-table-content tr, [class*=sku-table] tr, [class*=skuTable] tr').length;
    return JSON.stringify({drawerVisible, confirmBtns, skuRows});
  })()`);
  console.log('点击后状态:', after);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
