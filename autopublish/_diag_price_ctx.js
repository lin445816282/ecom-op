// 综合诊断：skuPrice/skuStock 上下文 + 一口价 + 物流重量 的正确位置和 fiber
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
    // 1. 有没有 0-skuPrice / 1-skuPrice 等旧 id
    var oldIds = [];
    for(var i=0;i<6;i++){ if(document.getElementById(i+'-skuPrice')) oldIds.push(i+'-skuPrice'); if(document.getElementById(i+'-skuStock')) oldIds.push(i+'-skuStock'); }
    out.oldSkuIds = oldIds;
    // 2. id=skuPrice / skuStock 的上下文
    function ctx(id){
      var el = document.getElementById(id);
      if(!el) return null;
      var p = el.parentElement;
      var pp = p ? p.parentElement : null;
      var r = el.getBoundingClientRect();
      return {
        outer: el.outerHTML.slice(0,200),
        parentCls: p ? (p.className||'').toString().slice(0,80) : '',
        grandParentCls: pp ? (pp.className||'').toString().slice(0,80) : '',
        parentText: p ? (p.textContent||'').trim().slice(0,60) : '',
        pos: {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width)}
      };
    }
    out.skuPriceCtx = ctx('skuPrice');
    out.skuStockCtx = ctx('skuStock');
    // 3. 找含「一口价」「重量」文本的元素附近的 input
    function findInputByText(txt){
      var all = document.querySelectorAll('*');
      var res = [];
      for(var i=0;i<all.length;i++){
        var t = (all[i].textContent||'').trim();
        if(t===txt || t.indexOf(txt)===0){
          // 找它附近/内部的 input
          var inp = all[i].querySelector ? all[i].querySelector('input') : null;
          if(!inp){ inp = all[i].parentElement ? all[i].parentElement.querySelector('input') : null; }
          if(inp){ var r=inp.getBoundingClientRect(); if(r.width>0&&r.height>0) res.push({label:t.slice(0,20), inpId:inp.id, inpPh:(inp.placeholder||'').slice(0,15), inpVal:inp.value, pos:{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}); }
        }
      }
      return res.slice(0,5);
    }
    out.一口价 = findInputByText('一口价');
    out.重量 = findInputByText('重量');
    out.总库存 = findInputByText('总库存');
    // 4. 找所有「元」「件」单位旁的 input（价格/库存）
    var yuanInputs = [];
    document.querySelectorAll('input').forEach(function(inp){
      var r=inp.getBoundingClientRect(); if(r.width<=0||r.height<=0) return;
      var p=inp.parentElement; var pt=p?(p.textContent||'').trim():'';
      if(/^(元|件)$/.test(pt)) yuanInputs.push({id:inp.id,ph:(inp.placeholder||'').slice(0,15),val:inp.val!==undefined?inp.value:'', unit:pt, pos:{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}});
    });
    out.yuanJianInputs = yuanInputs;
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
