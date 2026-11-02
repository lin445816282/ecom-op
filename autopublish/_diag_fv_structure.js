// dump formValues 的 base-card / sale-card / deliver-card 完整结构，定位 price / deliverWeight / skuPrice 正确字段
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
    var out = {};
    try{
      var gs = (window.__SELL_STATE__ && __SELL_STATE__.getState) ? __SELL_STATE__.getState() : null;
      var m = gs && gs.engine && gs.engine.getModels ? gs.engine.getModels() : {};
      var fv = m.formValues || {};
      out.baseCard = JSON.stringify(fv['base-card']);
      out.saleCard = JSON.stringify(fv['sale-card']);
      out.deliverCard = JSON.stringify(fv['deliver-card']);
      out.globalStock = JSON.stringify(fv.globalStock);
      out.quantity = JSON.stringify(fv.quantity);
      // 完整 sku 第一项
      out.skuFirst = JSON.stringify((fv.sku||[])[0]);
      out.skuLen = (fv.sku||[]).length;
    }catch(e){ out.err = e.message; }
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
