// 实验：测试三个字段的正确填法，读回 state 验证
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

  // 实验1：物流重量字段名（deliverWeight vs weight）
  const exp1 = await ev(c, `(()=>{
    try{
      var e=__SELL_STATE__.getState().engine;
      var fv=JSON.parse(JSON.stringify(e.getModels().formValues));
      fv['deliver-card']=fv['deliver-card']||{};
      fv['deliver-card'].deliverWeight='3.0';
      e.updateModels({formValues:fv});
      var fe=e.getModels().formError||{};
      return JSON.stringify({afterInject: JSON.stringify(fv['deliver-card']), deliverWeightErr: JSON.stringify(fe.deliverWeight)});
    }catch(err){return 'err:'+err.message;}
  })()`);
  console.log('实验1 物流重量(deliverWeight字段):', exp1);

  // 实验2：一口价 —— 找「一口价」标签旁 input，用 fiber onChange 填
  const exp2 = await ev(c, `(()=>{
    try{
      var all=document.querySelectorAll('*');
      var inp=null;
      for(var i=0;i<all.length;i++){
        var t=(all[i].textContent||'').trim();
        if(t.indexOf('一口价')===0 && t.length<40){
          inp = all[i].querySelector('input') || (all[i].parentElement && all[i].parentElement.querySelector('input'));
          if(inp) break;
        }
      }
      if(!inp) return 'no-input';
      var ns=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      ns.call(inp,'57.3');
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      var k=Object.keys(inp).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
      if(k){var fb=inp[k]; if(fb.memoizedProps&&fb.memoizedProps.onChange) fb.memoizedProps.onChange({target:inp}); }
      var fe=__SELL_STATE__.getState().engine.getModels().formError||{};
      return JSON.stringify({priceErr: JSON.stringify(fe.price), inpVal: inp.value});
    }catch(err){return 'err:'+err.message;}
  })()`);
  console.log('实验2 一口价:', exp2);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
