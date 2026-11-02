// 最后诊断：td#0-skuPrice 里 input 的 fiber + 物流重量输入框 + 一口价 fiber state 路径
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
    // 1. td#0-skuPrice 里的 input 详细
    var td = document.getElementById('0-skuPrice');
    if(td){
      var inp = td.querySelector('input');
      if(inp){
        var keys = Object.keys(inp).filter(k=>k.startsWith('__react'));
        out.tdInnerInput = {
          id: inp.id, ph:(inp.placeholder||'').slice(0,15), val: inp.value,
          reactKeys: keys,
          fiberProps: (function(){var k=keys.find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance')); if(!k)return null; var fb=inp[k]; return {hasOnChange: !!(fb&&fb.memoizedProps&&fb.memoizedProps.onChange), memoizedPropsKeys: fb&&fb.memoizedProps?Object.keys(fb.memoizedProps).slice(0,15):null};})()
        };
        out.tdInnerHTML = td.innerHTML.slice(0,200);
      }
    }
    // 2. 滚动到底部，找「重量」或物流重量
    window.scrollTo(0, document.body.scrollHeight);
    // 找物流信息区域
    var wEls = [];
    document.querySelectorAll('*').forEach(function(e){
      var t=(e.textContent||'').trim();
      if(t==='重量' || t==='物流重量' || t==='包裹重量'){
        var inp = e.querySelector('input') || (e.parentElement && e.parentElement.querySelector('input'));
        if(inp){ var r=inp.getBoundingClientRect(); wEls.push({label:t, inpPh:(inp.placeholder||'').slice(0,15), inpVal:inp.value, hasOnChange:(function(){var k=Object.keys(inp).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));return !!(k&&inp[k]&&inp[k].memoizedProps&&inp[k].memoizedProps.onChange);})()}); }
      }
    });
    out.weightEls = wEls.slice(0,5);
    // 3. deliver-card 完整结构（找 deliverWeight）
    try{
      var gs=(window.__SELL_STATE__&&__SELL_STATE__.getState)?__SELL_STATE__.getState():null;
      var m=gs&&gs.engine&&gs.engine.getModels?gs.engine.getModels():{};
      var fv=m.formValues||{};
      out.deliverCardFull = JSON.stringify(fv['deliver-card']);
      out.logisticsMode = JSON.stringify(fv.logisticsMode);
      // 找所有含 weight/Weight 的 fv key
      var wkeys={};
      Object.keys(fv).forEach(function(k){ if(/weight|Weight|deliver/i.test(k)) wkeys[k]=JSON.stringify(fv[k]).slice(0,120); });
      out.weightKeys = wkeys;
    }catch(e){ out.err=e.message; }
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
