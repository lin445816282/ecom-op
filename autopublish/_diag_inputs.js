// dump 所有可见 input 的详细信息：找价格/库存/重量/一口价输入框的正确选择器
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
    var out = [];
    document.querySelectorAll('input').forEach(function(inp){
      var r = inp.getBoundingClientRect();
      if(r.width<=0 || r.height<=0) return;
      // 找最近的 label 或父文本
      var label = '';
      var p = inp;
      for(var k=0;k<4 && p;k++){ p = p.parentElement; if(p){ var t=(p.getAttribute&&p.getAttribute('data-label'))||''; if(t){label=t;break;} } }
      // 找同行文本
      var row = inp.closest('tr, [class*=row], [class*=Row], .next-table-row') || inp.parentElement;
      var rowTxt = (row && row.textContent || '').trim().slice(0,40);
      var fiberKey = Object.keys(inp).find(function(k){return k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance');});
      var hasOnChange = false;
      if(fiberKey){ var fb=inp[fiberKey]; hasOnChange = !!(fb && fb.memoizedProps && fb.memoizedProps.onChange); }
      out.push({
        id: inp.id || '-',
        cls: (inp.className||'').toString().slice(0,50),
        ph: (inp.placeholder||'').slice(0,25),
        val: inp.value,
        type: inp.type,
        rowTxt: rowTxt,
        hasOnChange: hasOnChange
      });
    });
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(info);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
