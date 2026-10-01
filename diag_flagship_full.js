// 旗舰店完整前半流程验证：主图→标题→弹窗选类目→品牌→下一步，确认进入详情页
const http = require('http');
const PORT = process.argv[2] || '9228';
const IMG = 'C:\\tmp\\pdd-publish\\task_175\\img_1.jpg';
const TITLE = '阿拉丁神灯锡器摆件';
const WANT = '家居饰品 > 摆件 > 摆件';
const KW = '摆件';
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

  console.log('[1] 导航 /goods/category');
  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/goods/category' });
  await sleep(7000);

  console.log('[2] 上传主图');
  const doc = await c.send('DOM.getDocument', { depth: 3 });
  const qimg = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
  if (qimg.nodeId) { await c.send('DOM.setFileInputFiles', { nodeId: qimg.nodeId, files: [IMG] }); await sleep(8000); console.log('  已上传'); }
  else console.log('  ⚠️ 无 file input');

  console.log('[3] 填标题:', TITLE);
  await ev(c, `(()=>{const i=document.querySelector('input[placeholder*="商品标题组成"]');if(!i)return 'no';i.click();i.focus();return 'ok'})()`);
  await sleep(300);
  await c.send('Input.insertText', { text: TITLE });
  await sleep(500);

  console.log('[4] 点"手动选择商品分类"');
  const mc = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('手动选择商品分类'));if(!b)return 'no btn';b.click();return 'ok'})()`);
  console.log('  ', mc);
  await sleep(5000);

  console.log('[5] 弹窗搜索"'+KW+'"并选"'+WANT+'"');
  await ev(c, `(()=>{const inp=document.querySelector('[class*="keywordsSearch"] input');if(!inp)return 'no';inp.click();inp.focus();return 'ok'})()`);
  await sleep(300);
  await c.send('Input.insertText', { text: KW });
  await sleep(4000);
  const sel = await ev(c, `(()=>{
    const want=${JSON.stringify(WANT)};
    const cands=[...document.querySelectorAll('.choose-category,[class*="searchItem"]')];
    const norm=e=>(e.textContent||'').trim();
    let el=cands.find(e=>norm(e)===want);
    if(!el)el=cands.find(e=>norm(e).includes('摆件'));
    if(el){el.scrollIntoView({block:'center'});el.click();return 'ok:'+norm(el);}
    return 'no';
  })()`);
  console.log('  选择:', sel);
  await sleep(1500);

  console.log('[6] 点弹窗"确认"');
  const cf = await ev(c, `(()=>{const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认');if(btn){btn.click();return 'ok';}return 'no confirm'})()`);
  console.log('  ', cf);
  await sleep(2500);

  // 检查类目是否选上（页面文本里"已选分类"或推荐分类变化）
  const catState = await ev(c, `(()=>{const t=document.body.innerText;const m=t.match(/已选分类[^\\n]*/);return m?m[0]:'（无已选分类标记）'})()`);
  console.log('  类目状态:', catState);

  console.log('[7] 点"查看可用品牌"');
  const vb = await ev(c, `(()=>{const b=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='查看可用品牌');if(!b)return 'no btn';b.click();return 'ok'})()`);
  console.log('  ', vb);
  await sleep(4000);

  console.log('[8] 点品牌"OSHIYI/欧世艺"');
  const bp = await ev(c, `(()=>{
    const name=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='OSHIYI/欧世艺'&&e.getBoundingClientRect().width>0);
    if(name.length){name[0].click();return 'ok';}
    // 退而求其次：找包含 OSHIYI/欧世艺 的
    const name2=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim().includes('OSHIYI/欧世艺')&&e.getBoundingClientRect().width>0);
    if(name2.length){name2[0].click();return 'ok2:'+name2[0].textContent.trim();}
    return 'no brand name';
  })()`);
  console.log('  ', bp);
  await sleep(2000);

  console.log('[9] 点"下一步"');
  const nx = await ev(c, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim().replace(/\\s+/g,' ').includes('下一步'));if(!b)return 'no btn';b.click();return 'ok'})()`);
  console.log('  ', nx);
  await sleep(7000);

  console.log('[10] 最终状态');
  console.log('  URL:', await ev(c, 'location.href'));
  const txt = await ev(c, 'document.body.innerText');
  console.log('  文本（前 800 字）:');
  console.log(String(txt||'').slice(0, 800));

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
