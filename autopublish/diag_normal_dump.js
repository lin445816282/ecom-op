// 只读诊断：dump 9234 普通店发布页主图上传区完整结构
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

  // dump 每个 uploadImgEnter 容器的：class、文字标签、innerText 前50字、是否含 (N/M)
  const r1 = await ev(c, `(()=>{
    const boxes=[...document.querySelectorAll('[class*="uploadImgEnter"]')];
    return boxes.map((b,i)=>{
      const t=(b.innerText||'').replace(/\\s+/g,' ').slice(0,60);
      const hasNM=/\\(\\d+\\/\\d+\\)/.test(b.innerText||'');
      // 向上找 3 层的文字标签
      let label=''; let el=b; let d=0;
      while(el&&d<4){ const prev=el.previousElementSibling; if(prev&&(prev.innerText||'').trim()){label=(prev.innerText||'').trim().slice(0,20);break;} el=el.parentElement; d++; }
      return {i, class:b.className.slice(0,50), label, text:t, hasNM};
    });
  })()`);
  console.log('[1] uploadImgEnter 容器（共', (r1||[]).length, '个）:');
  (r1||[]).forEach(x=>console.log('    ', JSON.stringify(x)));

  // dump 主图上传区（第一个 uploadImgEnter）的完整 HTML（截断）
  const r2 = await ev(c, `(()=>{
    const b=document.querySelector('[class*="uploadImgEnter"]');
    return b?b.innerHTML.slice(0,2000):'no box';
  })()`);
  console.log('[2] 第1个 uploadImgEnter innerHTML:');
  console.log(r2);

  // 找所有含「上传图片」「主图」「轮播」文字的叶子节点链
  const r3 = await ev(c, `(()=>{
    const leaves=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.textContent||'').trim()&&/(上传图片|主图|轮播|白底|长图)/.test(x.textContent));
    return leaves.slice(0,10).map(x=>({text:(x.textContent||'').trim().slice(0,30), cls:(x.className||'').toString().slice(0,50)}));
  })()`);
  console.log('[3] 主图相关文字叶子:');
  (r3||[]).forEach(x=>console.log('    ', JSON.stringify(x)));

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
