// 深挖「一口价」输入框的 fiber onChange 链路，找正确的 state 更新方法
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
    try{
      // 找「一口价」input
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
      var k=Object.keys(inp).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
      var out={};
      out.inputId = inp.id;
      out.inputCls = (inp.className||'').toString().slice(0,60);
      if(k){
        var fb=inp[k];
        out.onChangeSrc = fb && fb.memoizedProps && fb.memoizedProps.onChange ? fb.memoizedProps.onChange.toString().slice(0,500) : 'no-onChange';
        out.name = fb && fb.memoizedProps ? fb.memoizedProps.name : null;
        // 向上遍历 fiber 找含 price 的 stateNode
        var chain=[];
        var f=fb;
        for(var j=0;j<12 && f;j++){
          var sn=f.stateNode;
          var tag = f.tag;
          var typeName = typeof f.type==='function'? f.type.name : (typeof f.type==='string'? f.type : '?');
          var mp = f.memoizedProps||{};
          var mpKeys = Object.keys(mp).slice(0,10);
          chain.push({tag, typeName, mpKeys, hasValue: 'value' in mp});
          if(sn && sn.state && typeof sn.state==='object'){
            var stKeys = Object.keys(sn.state);
            if(stKeys.some(x=>/price|Price/i.test(x))) { out.stateWithPrice = {typeName, stateKeys: stKeys.slice(0,15)}; }
          }
          f=f.return;
        }
        out.fiberChain = chain;
      }
      // 读 formValues 里是否有 price 相关（可能在 sale-card 或 base-card 里，需要看完整）
      var e=__SELL_STATE__.getState().engine;
      var fv=e.getModels().formValues;
      out.baseCardFull = JSON.stringify(fv['base-card']);
      out.saleCardFull = JSON.stringify(fv['sale-card']);
      return JSON.stringify(out, null, 1);
    }catch(err){return 'err:'+err.message;}
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
