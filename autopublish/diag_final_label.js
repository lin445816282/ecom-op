// 最终定位：主轮播图 / 白底图 各自对应的 MaterialModalButton 容器 + image input 顺序
const http = require('http');
const PORT = '9234';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  const g = tabs.filter(t=>t.type==='page').find(t=>/goods_add\/index/.test(t.url||''));
  if(!g){ console.log('无发布页 tab'); process.exit(1); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Runtime.enable',{});

  // 对每个 MaterialModalButton image input，向上找最近的 imageRemark 文字（图位名称）
  const r = await ev(c, `(()=>{
    const inps=[...document.querySelectorAll('input[type="file"][accept*="image"]')];
    return inps.map((inp,i)=>{
      // 向上逐层找含 imageRemark 的容器
      let el=inp; let name=''; let d=0;
      while(el&&d<12){
        if(el.querySelector){
          const rm=el.querySelector('[class*="imageRemark"]');
          if(rm&&(rm.innerText||'').trim()){name=(rm.innerText||'').trim().slice(0,12);}
        }
        el=el.parentElement; d++;
      }
      // 也找 Form label
      let lbl=''; el=inp; d=0;
      while(el&&d<14){
        if(el.querySelector){
          const fl=el.querySelector('[class*="Form_itemLabelContent"]');
          if(fl&&(fl.innerText||'').trim()){lbl=(fl.innerText||'').trim().slice(0,12);}
        }
        el=el.parentElement; d++;
      }
      return {i, accept:(inp.accept||'').slice(0,20), name, lbl};
    });
  })()`);
  console.log('image input 定位（含图位名称）:');
  (r||[]).forEach(x=>console.log('    ', JSON.stringify(x)));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
