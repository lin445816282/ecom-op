// 验证：用 input 实例自己的 value setter（React tracker）+ dump 完整 formValues 找 price/deliverWeight 字段
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

  // 实验A：用 input 实例自己的 value setter 填一口价
  const expA = await ev(c, `(()=>{
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
      // 方法1：input 实例自己的 value setter
      var ownSetter = Object.getOwnPropertyDescriptor(inp, 'value');
      var protoSetter = Object.getOwnPropertyDescriptor(inp.constructor.prototype, 'value');
      var hasOwn = !!ownSetter && !!ownSetter.set;
      var setter = hasOwn ? ownSetter.set : protoSetter.set;
      setter.call(inp, '57.3');
      inp.dispatchEvent(new Event('input', {bubbles:true}));
      var fe=__SELL_STATE__.getState().engine.getModels().formError||{};
      return JSON.stringify({hasOwnSetter: hasOwn, priceErr: JSON.stringify(fe.price)});
    }catch(err){return 'err:'+err.message;}
  })()`);
  console.log('实验A 一口价(实例value setter):', expA);

  // 实验B：dump 完整 formValues 所有 card，找 price / deliverWeight 字段位置
  const expB = await ev(c, `(()=>{
    try{
      var e=__SELL_STATE__.getState().engine;
      var fv=e.getModels().formValues;
      var out={};
      Object.keys(fv).forEach(function(k){
        var v=fv[k];
        if(v && typeof v==='object'){
          var s=JSON.stringify(v);
          if(/price|Price|weight|Weight|deliver/i.test(s)) out[k]=s.slice(0,200);
        } else if(v!==null && v!==undefined){
          out[k]=String(v);
        }
      });
      // 特别看 formError 完整
      out.__formErrorFull = JSON.stringify(e.getModels().formError||{});
      return JSON.stringify(out, null, 1);
    }catch(err){return 'err:'+err.message;}
  })()`);
  console.log('实验B formValues含price/weight的字段:', expB);

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
