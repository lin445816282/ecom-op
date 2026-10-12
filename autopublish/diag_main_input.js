// 只读诊断：定位普通店发布页「商品轮播图/主轮播图」的主图 file input
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

  // 所有 file input 的 accept + class + 父链
  const r1 = await ev(c, `(()=>{
    const list=[...document.querySelectorAll('input[type="file"]')];
    return list.map((inp,i)=>{
      let chain=[]; let el=inp; let d=0;
      while(el&&d<6){chain.push(el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').slice(0,3).join('.'):''));el=el.parentElement;d++;}
      return {i, accept:inp.accept||'', class:(inp.className||'').slice(0,60), chain:chain.join(' > ')};
    });
  })()`);
  console.log('[1] file input 列表（共', (r1||[]).length, '个）:');
  (r1||[]).forEach(x=>console.log('    ', JSON.stringify(x)));

  // 定位「主轮播图」/「商品轮播图」文字附近的 file input（向上找）
  const r2 = await ev(c, `(()=>{
    const targets=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&/主轮播图|商品轮播图/.test(x.textContent||''));
    return targets.map(x=>{
      // 向上找含 file input 的祖先
      let el=x; let found=null; let d=0;
      while(el&&d<8){ const inp=el.querySelector&&el.querySelector('input[type="file"]'); if(inp){found={accept:inp.accept||'', cls:(inp.className||'').slice(0,60)};break;} el=el.parentElement; d++; }
      return {label:(x.textContent||'').trim().slice(0,20), found};
    });
  })()`);
  console.log('[2] 主图文字→file input 定位:');
  (r2||[]).forEach(x=>console.log('    ', JSON.stringify(x)));

  // 找「主轮播图」/「商品轮播图」所在 Form item 的完整 file input（含 MaterialModalButton）
  const r3 = await ev(c, `(()=>{
    // 找含 MaterialModalButton 且含「主轮播图」或「商品轮播图」的容器
    const all=[...document.querySelectorAll('*')];
    const forms=all.filter(x=>/主轮播图|商品轮播图/.test(x.textContent||'') && x.querySelectorAll && x.querySelectorAll('input[type="file"]').length>0);
    return forms.slice(0,5).map(f=>{
      const inps=[...f.querySelectorAll('input[type="file"]')].map(inp=>({accept:inp.accept||'', cls:(inp.className||'').slice(0,70)}));
      return {tag:f.tagName, cls:(f.className||'').toString().slice(0,60), inps};
    });
  })()`);
  console.log('[3] 主图容器 + 其 file input:');
  console.log(JSON.stringify(r3, null, 1));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
