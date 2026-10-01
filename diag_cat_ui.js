// 诊断：dump 页面所有含"类目/分类"文本的元素 + 上下文，判断类目选择 UI 现状
const http = require('http');
const PORT = process.argv[2] || '9228';
function get(u) { return new Promise((res, rej) => { http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(null); } }); }).on('error', rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function conn(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const p = new Map();
  const send = (m, pa) => new Promise((res, rej) => { const mid = ++id; p.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method: m, params: pa })); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); } });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('ws timeout')), 8000); ws.addEventListener('open', () => { clearTimeout(t); res(); }); });
  return { ws, send };
}
async function ev(c, expr) { const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r && r.result ? r.result.value : undefined; }

(async () => {
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let page = tabs.find(t => t.type === 'page' && /mms\.pinduoduo/.test(t.url || '')) || tabs.find(t => t.type === 'page');
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {});

  console.log('当前 URL:', page.url);

  // 找所有含"类目/分类"文本的叶子元素
  const r1 = await ev(c, `(()=>{
    const out=[];
    const els=[...document.querySelectorAll('*')];
    for(const e of els){
      if(e.children.length>0) continue;
      const t=(e.textContent||'').trim();
      if(!t) continue;
      if(/类目|分类/.test(t)){
        const cls=String(e.className).slice(0,50);
        const tag=e.tagName;
        out.push({tag,cls,text:t.slice(0,80)});
      }
    }
    return JSON.stringify(out.slice(0,40));
  })()`);
  console.log('=== 含"类目/分类"的元素 ===');
  try { JSON.parse(r1||'[]').forEach((x,i)=>console.log(`  [${i}] <${x.tag}> ${x.cls} | ${x.text}`)); } catch(e){ console.log(String(r1).slice(0,500)); }

  // 找所有 input 元素（看有哪些输入框）
  const r2 = await ev(c, `(()=>{
    const out=[...document.querySelectorAll('input')].map(e=>({ph:e.placeholder||'', cls:String(e.className).slice(0,40), type:e.type}));
    return JSON.stringify(out.slice(0,30));
  })()`);
  console.log('=== 所有 input ===');
  try { JSON.parse(r2||'[]').forEach((x,i)=>console.log(`  [${i}] ph="${x.ph}" type=${x.type} cls=${x.cls}`)); } catch(e){ console.log(String(r2).slice(0,500)); }

  // 页面是否有弹窗/抽屉（modal/drawer）
  const r3 = await ev(c, `(()=>{
    const out=[];
    for(const s of ['[class*="modal"]','[class*="drawer"]','[class*="dialog"]','[class*="popup"]','[class*="overlay"]','[class*="mask"]']){
      const els=[...document.querySelectorAll(s)];
      for(const e of els){
        const t=(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,80);
        if(t) out.push({sel:s,text:t});
      }
    }
    return JSON.stringify(out.slice(0,20));
  })()`);
  console.log('=== 弹窗/抽屉 ===');
  try { JSON.parse(r3||'[]').forEach((x,i)=>console.log(`  [${i}] ${x.sel} | ${x.text}`)); } catch(e){ console.log(String(r3).slice(0,500)); }

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
