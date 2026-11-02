// 诊断 V2 表单 tbExtractWay / catProp 当前状态
const http = require('http');
const PORT = '9222';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  if(!v2){ console.log('无 publish.htm tab'); process.exit(0); }
  console.log('TAB:', v2.title.slice(0,30), '|', v2.url.slice(0,80));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  const info = await ev(c, `(()=>{
    var out = {};
    try{
      var gs = (window.__SELL_STATE__ && __SELL_STATE__.getState) ? __SELL_STATE__.getState() : null;
      var m = gs && gs.engine && gs.engine.getModels ? gs.engine.getModels() : {};
      var fe = m.formError || {};
      out.formErrorKeys = Object.keys(fe);
      out.formError = JSON.stringify(fe);
      var fv = m.formValues || {};
      out.tbExtractWay = JSON.stringify(fv.tbExtractWay);
      out.catProp = JSON.stringify(fv.catProp);
      out.shippingArea = JSON.stringify(fv.shippingArea);
      out.mainImagesGroup = JSON.stringify(fv.mainImagesGroup);
    }catch(e){ out.err = e.message; }
    // body 硬错误「错误 (N)」
    var b = document.body.innerText || '';
    out.bodyHasError = /错误\\s*\\(?\\d/.test(b);
    // 提取方式 checkbox
    var chks = [];
    document.querySelectorAll('input[type=checkbox]').forEach(function(ch){
      var r = ch.getBoundingClientRect();
      if(r.width>0 && r.height>0) chks.push({v:ch.value, checked:ch.checked, txt:(ch.parentElement&&ch.parentElement.textContent||'').trim().slice(0,30)});
    });
    out.checkboxes = chks;
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
