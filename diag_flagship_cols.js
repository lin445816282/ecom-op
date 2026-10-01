// dump 旗舰店类目弹窗：keywordsSearch 搜索框 + 三级类目列的叶子元素
const http = require('http');
const PORT = process.argv[2] || '9228';
const IMG = 'C:\\tmp\\pdd-publish\\task_175\\img_1.jpg';
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
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {}); await c.send('DOM.enable', {});

  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/goods/category' });
  await sleep(7000);
  const doc = await c.send('DOM.getDocument', { depth: 3 });
  const qimg = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  if (qimg.nodeId) { await c.send('DOM.setFileInputFiles', { nodeId: qimg.nodeId, files: [IMG] }); await sleep(8000); }
  await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="商品标题组成"]');if(!i)return 'no';i.click();i.focus();return 'ok'})()`);
  await sleep(300);
  await c.send('Input.insertText', { text: '阿拉丁神灯锡器摆件' });
  await sleep(500);
  await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('手动选择商品分类'));if(!b)return 'no';b.click();return 'ok'})()`);
  await sleep(5000);

  // 1. keywordsSearch 内部的 input
  const kwInput = await ev(c, `(()=>{const s=document.querySelector('[class*="keywordsSearch"]');if(!s)return 'NO_SEARCH';const inp=s.querySelector('input');return inp?('input placeholder="'+inp.placeholder+'" class="'+String(inp.className).slice(0,40)+'"'):'NO_INPUT'})()`);
  console.log('搜索框:', kwInput);

  // 2. 三个 item-group 的叶子元素（前 30 个）
  const groups = await ev(c, `(()=>{
    const gs=[...document.querySelectorAll('.item-group-container-v4')];
    const out=[];
    gs.forEach((g,gi)=>{
      const leaves=[...g.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim());
      const items=leaves.map(e=>({t:(e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,20), cls:String(e.className).slice(0,30), tag:e.tagName.toLowerCase()})).slice(0,15);
      out.push({group:gi, count:leaves.length, items});
    });
    return JSON.stringify(out);
  })()`);
  console.log('=== 三个类目列 ===');
  try {
    const gs = JSON.parse(groups||'[]');
    gs.forEach(g=>{
      console.log(`--- 列 ${g.group}（叶子 ${g.count} 个）---`);
      g.items.forEach((it,i)=>console.log(`  [${i}] <${it.tag}> .${it.cls} | ${it.t}`));
    });
  } catch(e){ console.log(String(groups).slice(0,800)); }

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
