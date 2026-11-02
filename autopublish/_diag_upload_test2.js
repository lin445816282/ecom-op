// 精准测试：旗舰店主图上传，尝试 setFileInputFiles + dispatch change，观察 (N/M) 变化
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = '9228';
const IMG = 'C:\\tmp\\pdd-publish\\task_2522\\img_1.jpg';
function get(u){return new Promise((res,rej)=>{const req=http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){res(d)}})});req.on('error',rej);req.setTimeout(6000,()=>{req.destroy();rej(new Error('HTTP超时'))})})}
async function conn(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const p=new Map();const send=(m,pa)=>new Promise((res,rej)=>{const mid=++id;p.set(mid,{res,rej});const to=setTimeout(()=>{if(p.has(mid)){p.delete(mid);rej(new Error('CDP超时:'+m));}},60000);ws.send(JSON.stringify({id:mid,method:m,params:pa}))});ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&p.has(m.id)){const q=p.get(m.id);p.delete(m.id);m.error?q.rej(new Error(m.error.message)):q.res(m.result)}});await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(to);res()})});return {ws,send};}
async function ev(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,returnByValue:true});return r&&r.result?r.result.value:undefined;}

const readCnt = (c) => ev(c, `(()=>{
  const sel=document.querySelector('[class*="goodsCarousel_selected"]');
  if(sel){const t=(sel.innerText||sel.textContent||'').trim();const a=t.indexOf('(');const s=t.indexOf('/');const b=t.indexOf(')');if(a>=0&&s>a&&b>s){const n=parseInt(t.slice(a+1,s));if(!isNaN(n))return n;}}
  return -1;
})()`);

(async()=>{
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let g = tabs.filter(t=>t.type==='page').find(t=>/mms\.pinduoduo\.com/.test(t.url||'')) || tabs.filter(t=>t.type==='page')[0];
  if(!g){ console.log('无页面 tab'); process.exit(0); }
  const c = await conn(g.webSocketDebuggerUrl);
  await c.send('Page.enable',{}); await c.send('Runtime.enable',{}); await c.send('DOM.enable',{});

  console.log('[URL]', await ev(c,'location.href'));
  console.log('[上传前 N]', await readCnt(c));

  // 找 file input（多 selector 尝试）
  const docF = await c.send('DOM.getDocument',{depth:3});
  const sels = [
    '[class*="uploadImgEnter"] input[type="file"][accept*="image"]',
    'input[type="file"][accept*="image"]',
    'input[type="file"]',
  ];
  let qi = null, usedSel = '';
  for(const s of sels){
    const q = await c.send('DOM.querySelector',{nodeId:docF.root.nodeId,selector:s});
    if(q && q.nodeId){ qi = q; usedSel = s; break; }
  }
  console.log('[file input]', qi ? ('找到 nodeId='+qi.nodeId+' selector='+usedSel) : '未找到');

  if(qi && qi.nodeId){
    // 1) 直接 setFileInputFiles
    try{
      const r = await c.send('DOM.setFileInputFiles',{nodeId:qi.nodeId, files:[IMG]});
      console.log('[setFileInputFiles]', JSON.stringify(r));
    }catch(e){ console.log('[setFileInputFiles 异常]', e.message); }
    await sleep(4000);
    console.log('[4s后 N]', await readCnt(c));

    // 2) 手动 dispatch change 事件（React 需要）
    const disp = await ev(c, `(()=>{
      const inp=document.querySelector('${usedSel.replace(/\\/g,'\\\\')}');
      if(!inp) return 'no input';
      const evt=new Event('change',{bubbles:true});
      inp.dispatchEvent(evt);
      return 'dispatched';
    })()`);
    console.log('[dispatch change]', disp);
    await sleep(4000);
    console.log('[dispatch后 N]', await readCnt(c));

    // 3) dump 上传组件内部（找缩略图）
    const dump = await ev(c, `(()=>{
      const box=document.querySelector('[class*="uploadImgEnter"]') || document.querySelector('[class*="goodsCarousel"]');
      if(!box) return 'no box';
      const imgs=[...box.querySelectorAll('img')].map(i=>(i.src||'').slice(-50));
      const bgDivs=[...box.querySelectorAll('*')].filter(e=>((e.getAttribute&&e.getAttribute('style'))||'').includes('background-image')).length;
      const allFile=[...document.querySelectorAll('input[type="file"]')].map(i=>i.getAttribute('accept')||'');
      return JSON.stringify({imgs, bgDivs, allFile});
    })()`);
    console.log('[dump]', dump);
  }

  c.ws.close();
  process.exit(0);
})().catch(e=>{console.log('ERR', e.message); process.exit(1)});
