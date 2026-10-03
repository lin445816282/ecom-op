// 诊断闲时来9234：查当前URL(登录态)、搜索框、类目页状态
const http = require('http');
const PORT = '9234';
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
  if (!page) { console.log('NO_PAGE'); return; }
  console.log('当前URL:', page.url);
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {});

  const url = await ev(c, 'location.href');
  console.log('location.href:', url);

  // 是否登录跳转
  if (/login|sso/.test(url || '')) { console.log('❌ 已跳到登录页，登录失效'); }

  // 搜索框存在？
  const inp = await ev(c, `(()=>{const i=document.querySelector('input[placeholder="请输入关键词搜索分类"]');return i?'有搜索框':'无搜索框'})()`);
  console.log('类目搜索框:', inp);

  // 页面关键文本
  const txt = await ev(c, 'document.body.innerText');
  console.log('=== 页面文本前800字 ===');
  console.log(String(txt || '').slice(0, 800));

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
