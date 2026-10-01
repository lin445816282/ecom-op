// 查询拼多多类目树：搜索指定关键词，dump 类目搜索结果
// 用法：node query_category.js <port> <关键词1> <关键词2> ...
const http = require('http');
const PORT = process.argv[2] || '9234';
const KWS = process.argv.slice(3);
if (!KWS.length) { console.log('用法: node query_category.js <port> <关键词...>'); process.exit(1); }

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
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {});

  // 导航到类目页
  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/goods/category' });
  await sleep(6000);

  for (const kw of KWS) {
    // 填搜索框（Input.insertText 真实键盘输入，触发 React onChange）
    await ev(c, `(()=>{const inp=document.querySelector('input[placeholder="请输入关键词搜索分类"]');if(!inp)return 'no input';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
    await sleep(300);
    await c.send('Input.insertText', { text: kw });
    await sleep(4000);
    const res = await ev(c, `(()=>{
      const cands=[...document.querySelectorAll('.choose-category,[class*="searchItem"],[class*="categoryItem"]')];
      const list=cands.map(e=>(e.textContent||'').trim()).filter(t=>t&&t.length>1);
      return JSON.stringify(list.slice(0,30));
    })()`);
    console.log('### 搜索词: ' + kw);
    try { const arr = JSON.parse(res || '[]'); arr.forEach((t, i) => console.log('  ' + t)); if (!arr.length) console.log('  (无结果)'); } catch (e) { console.log('  原始:', String(res).slice(0, 300)); }
    await sleep(1500);
  }
  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
