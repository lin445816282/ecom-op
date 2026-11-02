// 诊断 SKU 表格：价格/库存输入框的 id、坐标、当前值
const http = require('http');
const PORT = '9222';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  const info = await ev(c, `(()=>{
    var out = {priceTds:[], stockTds:[]};
    for(var i=0;i<8;i++){
      var p = document.getElementById(i+'-skuPrice');
      if(p){ var inp = p.querySelector('input'); var r = inp?inp.getBoundingClientRect():null; out.priceTds.push({id:i+'-skuPrice', hasInput:!!inp, val:inp?inp.value:null, coord: r?{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}:null}); }
      var s = document.getElementById(i+'-skuStock');
      if(s){ var inp2 = s.querySelector('input'); var r2 = inp2?inp2.getBoundingClientRect():null; out.stockTds.push({id:i+'-skuStock', hasInput:!!inp2, val:inp2?inp2.value:null, coord: r2?{x:Math.round(r2.x+r2.width/2),y:Math.round(r2.y+r2.height/2)}:null}); }
    }
    // 兜底：所有含 skuPrice/skuStock 的元素
    out.anyPrice = document.querySelectorAll('[id*=skuPrice]').length;
    out.anyStock = document.querySelectorAll('[id*=skuStock]').length;
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
