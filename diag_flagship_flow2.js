// 诊断旗舰店完整流程：上传主图+填标题 → 点"下一步" → dump 类目选择 UI
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

async function dump(c, tag) {
  console.log(`\n########## ${tag} ##########`);
  console.log('URL:', await ev(c, 'location.href'));
  const txt = await ev(c, 'document.body.innerText');
  console.log('--- 文本（前 1600 字）---');
  console.log(String(txt||'').slice(0, 1600));
  const inps = await ev(c, `(()=>JSON.stringify([...document.querySelectorAll('input')].map(e=>({ph:e.placeholder||'',cls:String(e.className).slice(0,40),type:e.type}))))()`);
  console.log('--- input ---');
  try { JSON.parse(inps||'[]').forEach((x,i)=>console.log(`  [${i}] type=${x.type} ph="${x.ph}" ${x.cls}`)); } catch(e){}
  const btns = await ev(c, `(()=>JSON.stringify([...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim().replace(/\\s+/g,' ')).filter(t=>t&&t.length<40).slice(0,40)))()`);
  console.log('--- 按钮 ---');
  try { JSON.parse(btns||'[]').forEach((t,i)=>console.log(`  [${i}] ${t}`)); } catch(e){}
}

(async () => {
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let page = tabs.find(t => t.type === 'page' && /mms\.pinduoduo/.test(t.url || '')) || tabs.find(t => t.type === 'page');
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {}); await c.send('DOM.enable', {});

  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/goods/category' });
  await sleep(7000);

  // 上传主图
  const doc = await c.send('DOM.getDocument', { depth: 3 });
  const qimg = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  console.log('file input nodeId:', qimg.nodeId || 'NONE');
  if (qimg.nodeId) {
    await c.send('DOM.setFileInputFiles', { nodeId: qimg.nodeId, files: [IMG] });
    console.log('已上传图片', IMG);
    await sleep(8000);
  }

  // 填标题
  await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="商品标题组成"]');if(!i)return 'no input';i.scrollIntoView({block:'center'});i.click();i.focus();return 'ok'})()`);
  await sleep(300);
  await c.send('Input.insertText', { text: '测试类目选择流程专用商品' });
  await sleep(500);

  await dump(c, '填完主图+标题后（点下一步前）');

  // 点"下一步"
  const clicked = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('下一步'));if(!b)return 'no btn';b.click();return 'clicked'})()`);
  console.log('\n点击"下一步":', clicked);
  await sleep(6000);

  await dump(c, '点"下一步"后');

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
