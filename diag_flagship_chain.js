// dump 类目弹窗关键元素：摆件/家居饰品/确认/取消 等元素的 tag+class+父级链
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

  // 找关键词元素，输出 tag + class + 父级链（3层）+ 文本
  const r = await ev(c, `(()=>{
    const kws=['家居饰品','摆件','确认','取消','选择商品分类','祈福摆件','收纳摆件'];
    const out=[];
    for(const kw of kws){
      const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()===kw);
      for(const e of els){
        // 父级链
        let chain=[]; let p=e; let n=0;
        while(p && n<5){ chain.push(p.tagName.toLowerCase()+(p.className?'.'+String(p.className).slice(0,30):'')); p=p.parentElement; n++; }
        out.push({kw, tag:e.tagName, cls:String(e.className).slice(0,40), chain:chain.join(' <- ')});
      }
    }
    return JSON.stringify(out.slice(0,60));
  })()`);
  console.log('=== 关键元素（tag + class + 父级链）===');
  try { JSON.parse(r||'[]').forEach((x,i)=>console.log(`  [${i}] "${x.kw}" <${x.tag}> cls="${x.cls}"\n      链: ${x.chain}`)); } catch(e){ console.log(String(r).slice(0,600)); }

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
