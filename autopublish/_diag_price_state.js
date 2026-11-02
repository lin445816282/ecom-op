// 全面诊断 V2 表单：一口价 / SKU价格库存 / 物流重量 的实际 state 值
const http = require('http');
const PORT = '9222';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  if(!v2){ console.log('无 publish.htm tab'); process.exit(0); }
  console.log('TAB:', v2.url.slice(0,70));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  const info = await ev(c, `(()=>{
    var out = {};
    try{
      var gs = (window.__SELL_STATE__ && __SELL_STATE__.getState) ? __SELL_STATE__.getState() : null;
      var m = gs && gs.engine && gs.engine.getModels ? gs.engine.getModels() : {};
      var fv = m.formValues || {};
      out.formError = JSON.stringify(m.formError || {});
      // 一口价相关字段（枚举可能的 key）
      var priceKeys = {};
      Object.keys(fv).forEach(function(k){
        if(/price|Price|一口|priceBy|skuPrice|sellPrice|reservePrice/i.test(k)){
          priceKeys[k] = JSON.stringify(fv[k]).slice(0,150);
        }
      });
      out.priceFields = priceKeys;
      // 物流重量
      out.deliverCard = JSON.stringify(fv['deliver-card']);
      out.weight = JSON.stringify(fv['deliver-card'] && fv['deliver-card'].weight);
      // SKU 结构（saleProp / sku）
      out.saleProp = JSON.stringify(fv.saleProp).slice(0,300);
      out.sku = JSON.stringify(fv.sku).slice(0,500);
      // formValues 顶层所有 key
      out.fvKeys = Object.keys(fv);
    }catch(e){ out.err = e.message; }
    // DOM 层面：一口价 input 的实际 value
    var priceInputs = [];
    document.querySelectorAll('input').forEach(function(inp){
      var r = inp.getBoundingClientRect();
      var t = (inp.parentElement && inp.parentElement.textContent || '').trim().slice(0,20);
      if(r.width>0 && r.height>0 && (/价/.test(t) || inp.className.indexOf('price')>=0)){
        priceInputs.push({val:inp.value, t:t, ph:(inp.placeholder||'').slice(0,20)});
      }
    });
    out.domPriceInputs = priceInputs;
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
