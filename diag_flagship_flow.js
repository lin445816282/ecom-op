// 诊断旗舰店发布流程：导航 → 观察"下一步"前的页面 → 点"下一步" → 观察类目选择在哪
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

async function dumpPage(c, tag) {
  const url = await ev(c, 'location.href');
  const txt = await ev(c, 'document.body.innerText');
  console.log(`\n########## ${tag} ##########`);
  console.log('URL:', url);
  console.log('--- 文本（前 1800 字）---');
  console.log(String(txt||'').slice(0, 1800));
  const inps = await ev(c, `(()=>JSON.stringify([...document.querySelectorAll('input')].map(e=>({ph:e.placeholder||'',cls:String(e.className).slice(0,40)}))))()`);
  console.log('--- input ---');
  try { JSON.parse(inps||'[]').forEach((x,i)=>console.log(`  [${i}] ph="${x.ph}" ${x.cls}`)); } catch(e){}
  const btns = await ev(c, `(()=>JSON.stringify([...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim().replace(/\\s+/g,' ')).filter(t=>t&&t.length<40).slice(0,40)))()`);
  console.log('--- 按钮 ---');
  try { JSON.parse(btns||'[]').forEach((t,i)=>console.log(`  [${i}] ${t}`)); } catch(e){}
}

(async () => {
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let page = tabs.find(t => t.type === 'page' && /mms\.pinduoduo/.test(t.url || '')) || tabs.find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); console.log(JSON.stringify((tabs||[]).map(t=>t.url).slice(0,10))); process.exit(1); }
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {});

  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/goods/category' });
  await sleep(7000);
  await dumpPage(c, '导航 /goods/category 后');

  // 点"下一步, 完善商品信息"
  const clicked = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('下一步'));if(!b)return 'no btn';b.click();return 'clicked'})()`);
  console.log('\n点击"下一步"结果:', clicked);
  await sleep(5000);
  await dumpPage(c, '点"下一步"后');

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
