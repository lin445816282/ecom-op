// 验证 SKU 价格 CDP 键盘法 + 定位物流重量输入框
const http = require('http');
const PORT = '9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(8000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r&&r.result?r.result.value:undefined;}
async function key(c,type,key,code,vk,mod){ await c.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,modifiers:mod||0}); }

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const v2 = tabs.filter(t=>t.type==='page').find(t=>/publish\.htm/.test(t.url||''));
  const c = await conn(v2.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // 1. SKU 价格：td#0-skuPrice 里的 input，CDP 键盘法填
  const skuCoord = await ev(c, `(()=>{var td=document.getElementById('0-skuPrice');if(!td)return 'nf';var inp=td.querySelector('input');if(!inp)return 'nf:noinput';inp.scrollIntoView({block:'center'});var r=inp.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`);
  console.log('0-skuPrice input坐标:', skuCoord);
  if(skuCoord.startsWith('{')){
    await sleep(400);
    const sp = JSON.parse(skuCoord);
    await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:sp.x,y:sp.y,button:'left',clickCount:1});
    await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:sp.x,y:sp.y,button:'left',clickCount:1});
    await sleep(300);
    await key(c,'keyDown','a','KeyA',65,2); await key(c,'keyUp','a','KeyA',65,2);
    await key(c,'keyDown','Backspace','Backspace',8); await key(c,'keyUp','Backspace','Backspace',8);
    await c.send('Input.insertText',{text:'57.3'});
    await sleep(500);
    await key(c,'keyDown','Tab','Tab',9); await key(c,'keyUp','Tab','Tab',9);
    await sleep(600);
    const skuErr = await ev(c, `(()=>{var fe=__SELL_STATE__.getState().engine.getModels().formError||{};return JSON.stringify(fe.sku);})()`);
    console.log('SKU价格填后 formError.sku:', skuErr.slice(0,200));
  }

  // 2. 找「重量」输入框：搜索所有含「重」的文本元素
  const weightSearch = await ev(c, `(()=>{
    var res=[];
    document.querySelectorAll('*').forEach(function(e){
      var t=(e.textContent||'').trim();
      if(/^重量|^包裹重量|^物流重量|重量\*/.test(t) && t.length<20){
        var inp=e.querySelector('input')||(e.parentElement&&e.parentElement.querySelector('input'));
        if(inp){var r=inp.getBoundingClientRect();res.push({label:t.slice(0,15), val:inp.value, ph:(inp.placeholder||'').slice(0,10), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)});}
      }
    });
    // 备选：找「重量」二字单独的元素（可能在 label）
    if(res.length===0){
      document.querySelectorAll('label,span,div').forEach(function(e){
        var t=(e.textContent||'').trim();
        if(t==='重量' && e.children.length<=2){
          var inp=e.querySelector('input');
          if(inp){var r=inp.getBoundingClientRect();res.push({label:'重量', val:inp.value, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)});}
        }
      });
    }
    return JSON.stringify(res);
  })()`);
  console.log('重量输入框搜索结果:', weightSearch);
  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
