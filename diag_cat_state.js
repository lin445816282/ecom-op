// 诊断：判断当前"发布新商品"页是草稿续填还是全新，类目显示在哪
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

  // 商品标题输入框的值
  const title = await ev(c, `(()=>{const inp=document.querySelector('input[placeholder*="商品标题"]');return inp?inp.value:'(no title input)'})()`);
  console.log('商品标题输入框值:', JSON.stringify(title));

  // 所有按钮文本
  const btns = await ev(c, `(()=>JSON.stringify([...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim().replace(/\\s+/g,' ')).filter(t=>t&&t.length<30).slice(0,40)))()`);
  console.log('=== 所有按钮 ===');
  try { JSON.parse(btns||'[]').forEach((t,i)=>console.log(`  [${i}] ${t}`)); } catch(e){ console.log(String(btns).slice(0,500)); }

  // 页面顶部 1200 字文本（找类目显示位置）
  const txt = await ev(c, `document.body.innerText`);
  console.log('=== 页面文本（前 1500 字，含换行结构）===');
  console.log(String(txt||'').slice(0, 1500));

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
