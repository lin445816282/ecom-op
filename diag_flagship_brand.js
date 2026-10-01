// 诊断旗舰店品牌选择 UI：填主图标题 → 点"查看可用品牌" → dump
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

  // 品牌区结构 + 点"查看可用品牌"
  const brandArea = await ev(c, `(()=>{
    // 找品牌相关的元素
    const out=[];
    for(const e of document.querySelectorAll('*')){
      if(e.children.length===0 && /品牌|资质|无品牌/.test((e.textContent||'').trim()) && (e.textContent||'').trim().length<30){
        out.push((e.textContent||'').trim());
      }
    }
    return JSON.stringify(out.slice(0,20));
  })()`);
  console.log('=== 品牌相关叶子文本 ===');
  try { JSON.parse(brandArea||'[]').forEach(t=>console.log('  ',t)); } catch(e){}

  const clicked = await ev(c, `(()=>{const b=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='查看可用品牌');if(!b)return 'no btn';b.click();return 'clicked'})()`);
  console.log('点"查看可用品牌":', clicked);
  await sleep(4000);

  const txt = await ev(c, 'document.body.innerText');
  console.log('=== 页面文本（点品牌后，前 1500 字）===');
  console.log(String(txt||'').slice(0, 1500));

  // 品牌候选（弹窗/下拉里的品牌项）
  const brandOpts = await ev(c, `(()=>{
    const out=[];
    for(const e of document.querySelectorAll('*')){
      if(e.children.length===0){
        const t=(e.textContent||'').trim();
        if(t && t.length<30 && (/品牌|旗舰店|专卖店|旗舰|无品牌|自有/.test(t)) && e.getBoundingClientRect().width>0){
          out.push({t, cls:String(e.className).slice(0,35), tag:e.tagName});
        }
      }
    }
    return JSON.stringify(out.slice(0,30));
  })()`);
  console.log('=== 品牌候选元素 ===');
  try { JSON.parse(brandOpts||'[]').forEach((x,i)=>console.log(`  [${i}] <${x.tag}> .${x.cls} | ${x.t}`)); } catch(e){ console.log(String(brandOpts).slice(0,500)); }

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
