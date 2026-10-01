// 诊断类目搜索：导航到类目页，搜索关键词，dump 页面所有候选元素 class + 文本
// 用法：node diag_cat_search.js <port> <关键词>
const http = require('http');
const PORT = process.argv[2] || '9228';
const KW = process.argv[3] || '摆件';

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
  if (!tabs) { console.log('NO_CDP (端口无响应)'); process.exit(1); }
  let page = tabs.find(t => t.type === 'page' && /mms\.pinduoduo/.test(t.url || '')) || tabs.find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); console.log(JSON.stringify(tabs.map(t => t.url).slice(0, 10))); process.exit(1); }
  console.log('当前页面 URL:', page.url);
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {});

  // 导航到类目页
  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/goods/category' });
  await sleep(6000);
  console.log('导航后 URL:', await ev(c, 'location.href'));

  // 搜索框是否存在
  const hasInput = await ev(c, `(()=>{const inp=document.querySelector('input[placeholder="请输入关键词搜索分类"]');return inp?'yes':'no'})()`);
  console.log('搜索框存在:', hasInput);

  // 输入关键词
  await ev(c, `(()=>{const inp=document.querySelector('input[placeholder="请输入关键词搜索分类"]');if(!inp)return 'no input';inp.scrollIntoView({block:'center'});inp.click();inp.focus();return 'ok'})()`);
  await sleep(500);
  await c.send('Input.insertText', { text: KW });
  await sleep(5000);

  // dump 所有候选元素（不限定 class）
  const dump = await ev(c, `(()=>{
    const sels=['.choose-category','[class*="searchItem"]','[class*="categoryItem"]','[class*="category"]','[class*="tree"]','[class*="search"]'];
    const seen=new Set();
    const out=[];
    for(const s of sels){
      const els=[...document.querySelectorAll(s)];
      for(const e of els){
        const t=(e.textContent||'').trim().replace(/\\s+/g,' ');
        if(!t || t.length<2 || t.length>60) continue;
        const key=e.className;
        if(seen.has(key+'|'+t)) continue;
        seen.add(key+'|'+t);
        out.push({sel:s, cls:String(e.className).slice(0,60), text:t});
      }
    }
    return JSON.stringify(out.slice(0,60));
  })()`);
  console.log('=== 搜索 "' + KW + '" 结果候选元素 ===');
  try {
    const arr = JSON.parse(dump || '[]');
    if (!arr.length) console.log('  (无候选元素)');
    arr.forEach((x, i) => console.log(`  [${i}] sel=${x.sel} cls=${x.cls} | ${x.text}`));
  } catch (e) { console.log('  原始:', String(dump).slice(0, 500)); }

  // 页面整体文本（判断是否有登录墙/错误）
  const bodyTxt = await ev(c, 'document.body.innerText');
  console.log('=== 页面文本前 800 字 ===');
  console.log(String(bodyTxt || '').slice(0, 800));

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
