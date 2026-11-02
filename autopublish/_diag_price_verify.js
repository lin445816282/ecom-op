// 验证 0-skuPrice 位置/可见性 + 一口价/重量 输入框精确选择器
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
    function infoEl(el){
      if(!el) return null;
      var r = el.getBoundingClientRect();
      var key = Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
      var hasOnChange = false;
      if(key){ var fb=el[key]; hasOnChange = !!(fb && fb.memoizedProps && fb.memoizedProps.onChange); }
      return {visible: r.width>0&&r.height>0, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), val:el.value, hasOnChange, display: getComputedStyle(el).display, vis: getComputedStyle(el).visibility};
    }
    out['0-skuPrice'] = infoEl(document.getElementById('0-skuPrice'));
    out['1-skuPrice'] = infoEl(document.getElementById('1-skuPrice'));
    out['0-skuStock'] = infoEl(document.getElementById('0-skuStock'));
    // 一口价输入框：找文本「一口价」最近的 input
    out.一口价Input = (function(){
      var all = document.querySelectorAll('*');
      for(var i=0;i<all.length;i++){
        var t=(all[i].textContent||'').trim();
        if(t.indexOf('一口价')===0 && t.length<30){
          var inp = all[i].querySelector('input') || (all[i].parentElement && all[i].parentElement.querySelector('input'));
          if(inp) return infoEl(inp);
        }
      }
      return null;
    })();
    // 滚动到底部找「重量」输入框
    var weightInputs = [];
    document.querySelectorAll('input').forEach(function(inp){
      var p = inp.parentElement; var pt = p?(p.textContent||'').trim():'';
      var pp = p&&p.parentElement? (p.parentElement.textContent||'').trim():'';
      if(/重量|kg|克/.test(pt+pp)) weightInputs.push(infoEl(inp));
    });
    out.weightInputs = weightInputs.slice(0,5);
    // 页面里所有含「重量」文本的元素
    var weightText = [];
    document.querySelectorAll('*').forEach(function(e){
      var t=(e.textContent||'').trim();
      if(t==='重量' || t.indexOf('重量')===0 && t.length<10) weightText.push(t.slice(0,20));
    });
    out.weightTextEls = [...new Set(weightText)].slice(0,10);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
