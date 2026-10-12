// 确认 3 个 MaterialModalButton image input 分别对应什么（主轮播图/白底图/其他）
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

  // 对每个 MaterialModalButton 容器，向上找 Form item 的 label（商品轮播图/白底图/等）
  const r = await ev(c, `(()=>{
    const inps=[...document.querySelectorAll('[class*="MaterialModalButton"] input[type="file"][accept*="image"]')];
    return inps.map((inp,i)=>{
      // 向上找 Form item label（含「图」字的 Form_itemLabelContent）
      let el=inp; let label=''; let d=0;
      while(el&&d<10){
        const lbl=el.querySelector&&el.querySelector('[class*="Form_itemLabelContent"], [class*="imageRemark"], [class*="label"]');
        if(lbl && (lbl.innerText||'').trim()){ label=(lbl.innerText||'').trim().slice(0,15); }
        el=el.parentElement; d++;
      }
      // 找 input 所在 MaterialModalButton 容器的 remark 文字
      let rm=''; let e2=inp; let d2=0;
      while(e2&&d2<6){ const r=e2.querySelector&&e2.querySelector('[class*="imageRemark"], [class*="remark"]'); if(r&&(r.innerText||'').trim()){rm=(r.innerText||'').trim().slice(0,15);} e2=e2.parentElement; d2++; }
      return {i, accept:inp.accept||'', label, remark:rm};
    });
  })()`);
  console.log('MaterialModalButton image input 定位:');
  (r||[]).forEach(x=>console.log('    ', JSON.stringify(x)));

  // 直接读「商品轮播图」Form item 的完整 label + 第一个 image input 的 selector 特征
  const r2 = await ev(c, `(()=>{
    // 找含「商品轮播图」文字的最小 Form item 容器
    const labels=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.textContent||'').trim()==='商品轮播图');
    if(!labels.length) return 'no 商品轮播图 label';
    const lbl=labels[0];
    // 向上找 Form item 容器（含 file input 的）
    let form=null; let el=lbl; let d=0;
    while(el&&d<12){ if(el.querySelector&&el.querySelector('input[type="file"][accept*="image"]')){form=el;break;} el=el.parentElement; d++; }
    if(!form) return 'no form with image input';
    const inp=form.querySelector('input[type="file"][accept*="image"]');
    // 找 inp 的最近 MaterialModalButton 祖先
    let mm=inp; let mmd=0;
    while(mm&&mmd<8){ if((mm.className||'').toString().indexOf('MaterialModalButton')>=0) break; mm=mm.parentElement; mmd++; }
    return {
      formTag: form.tagName, formCls: (form.className||'').toString().slice(0,60),
      inpClass: (inp.className||'').slice(0,60),
      mmClass: mm?(mm.className||'').toString().slice(0,70):'(none)',
    };
  })()`);
  console.log('[商品轮播图] Form item 结构:', JSON.stringify(r2, null, 1));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
