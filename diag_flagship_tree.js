// dump 旗舰店类目弹窗树形导航的 DOM 结构（class + 层级 + 文本）
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

  // dump 树形导航 DOM：找弹窗容器，递归输出子孙元素（class + tag + 文本 + 层级）
  const tree = await ev(c, `(()=>{
    // 找"选择商品分类"弹窗容器
    const title=[...document.querySelectorAll('*')].find(e=>e.children.length>0&&(e.textContent||'').includes('选择商品分类')&&(e.textContent||'').includes('确认'));
    if(!title) return 'NO_MODAL';
    // 找最小的包含"确认"和"取消"的容器
    let modal=null;
    const all=[...document.querySelectorAll('div')];
    for(const e of all){
      const t=e.textContent||'';
      if(t.includes('确认')&&t.includes('取消')&&t.includes('选择商品分类')&&t.length<3000){
        if(!modal || t.length<(modal.textContent||'').length) modal=e;
      }
    }
    if(!modal) return 'NO_MODAL2';
    // 输出 modal 的 class 和直接子元素结构
    function walk(el, depth, out){
      if(depth>6) return;
      const t=(el.textContent||'').trim().replace(/\\s+/g,' ');
      const children=[...el.children];
      // 只输出叶子或关键节点（文本短且有内容）
      if(children.length===0 && t && t.length<30){
        out.push('  '.repeat(depth)+'<'+el.tagName.toLowerCase()+' class="'+String(el.className).slice(0,35)+'"> '+t);
      } else if(children.length>0){
        out.push('  '.repeat(depth)+'<'+el.tagName.toLowerCase()+' class="'+String(el.className).slice(0,35)+'"> [children:'+children.length+']');
        for(const ch of children) walk(ch, depth+1, out);
      }
    }
    const out=[];
    out.push('MODAL class='+String(modal.className).slice(0,50));
    walk(modal, 0, out);
    return JSON.stringify(out.slice(0,150));
  })()`);
  console.log('=== 弹窗 DOM 结构 ===');
  try { JSON.parse(tree||'[]').forEach(l=>console.log(l)); } catch(e){ console.log(String(tree).slice(0,800)); }

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
