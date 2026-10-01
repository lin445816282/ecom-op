// 旗舰店弹窗内搜索"摆件"，dump 搜索结果元素结构
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

  // 在弹窗搜索框里搜"摆件"
  await ev(c, `(()=>{const inp=document.querySelector('[class*="keywordsSearch"] input');if(!inp)return 'no';inp.click();inp.focus();return 'ok'})()`);
  await sleep(300);
  await c.send('Input.insertText', { text: '摆件' });
  await sleep(4000);

  // dump 搜索结果（类目候选）
  const r = await ev(c, `(()=>{
    const sels=['.choose-category','[class*="searchItem"]','[class*="categoryItem"]','[class*="cate"]','[class*="search"]','[class*="result"]'];
    const seen=new Set(); const out=[];
    for(const s of sels){
      for(const e of document.querySelectorAll(s)){
        const t=(e.textContent||'').trim().replace(/\\s+/g,' ');
        if(!t||t.length<2||t.length>80)continue;
        const k=String(e.className).slice(0,40)+'|'+t;
        if(seen.has(k))continue; seen.add(k);
        out.push({sel:s,cls:String(e.className).slice(0,45),text:t});
      }
    }
    return JSON.stringify(out.slice(0,40));
  })()`);
  console.log('=== 搜索"摆件"后候选 ===');
  try { JSON.parse(r||'[]').forEach((x,i)=>console.log(`  [${i}] ${x.sel} | ${x.cls} | ${x.text}`)); } catch(e){ console.log(String(r).slice(0,600)); }

  // 弹窗内完整文本（搜索后）
  const txt = await ev(c, `(()=>{const m=document.querySelector('[class*="cate-select-modal"]');return m?(m.innerText||'').replace(/\\s+/g,' ').slice(0,600):'NO_MODAL'})()`);
  console.log('=== 弹窗文本（搜索后）===');
  console.log(String(txt));

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
