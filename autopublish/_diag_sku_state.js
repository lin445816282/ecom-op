// 诊断 V2 页 SKU 抽屉当前状态：是否还开着、有没有「确认创建」按钮
const http = require('http');
const PORT = '9222';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  if(!v2){ console.log('无 publish.htm tab'); process.exit(0); }
  console.log('TAB:', v2.title.slice(0,30), '|', v2.url.slice(0,70));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  const info = await ev(c, `(()=>{
    var out = {};
    // 找所有可见的「确认创建」「确认」「下一步」「完成」按钮
    var btns = [];
    document.querySelectorAll('button').forEach(function(b){
      var r = b.getBoundingClientRect();
      if(r.width>0 && r.height>0){
        var t = (b.textContent||'').trim();
        if(t) btns.push({t:t.slice(0,20), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), disabled:b.disabled, cls:(b.className||'').toString().slice(0,50)});
      }
    });
    out.visibleButtons = btns;
    // SKU 抽屉相关元素
    out.hasSkuTable = !!document.querySelector('[class*=sku],[class*=Sku]');
    out.drawerText = (function(){
      var d = document.querySelector('.next-drawer, [class*=drawer], [class*=Drawer]');
      return d ? (d.innerText||'').slice(0,300) : 'no-drawer';
    })();
    // body 里「确认创建」出现次数
    var btxt = document.body.innerText || '';
    out.confirmCount = (btxt.match(/确认创建/g)||[]).length;
    // 截图 body 末尾文本
    out.bodyTail = btxt.slice(-500);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
