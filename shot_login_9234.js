// 截图闲时来9234登录页二维码
const http = require('http');
const fs = require('fs');
const PORT = '9234';
function get(u) { return new Promise((res, rej) => { http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(null); } }); }).on('error', rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function conn(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const p = new Map();
  const send = (m, pa) => new Promise((res, rej) => { const mid = ++id; p.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method: m, params: pa })); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); } });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('ws timeout')), 8000); ws.addEventListener('open', () => { clearTimeout(t); res(); }); });
  return { ws, send };
}

(async () => {
  const tabs = await get(`http://127.0.0.1:${PORT}/json`);
  let page = tabs.find(t => t.type === 'page' && /mms\.pinduoduo/.test(t.url || '')) || tabs.find(t => t.type === 'page');
  const c = await conn(page.webSocketDebuggerUrl);
  await c.send('Page.enable', {}); await c.send('Runtime.enable', {});

  // 确保在登录页，切到扫码登录 tab（默认可能是账号登录）
  await c.send('Page.navigate', { url: 'https://mms.pinduoduo.com/login/' });
  await sleep(5000);

  // 尝试点击"扫码登录"tab
  const clickScan = await c.send('Runtime.evaluate', { expression: `(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').trim()==='扫码登录'&&e.getBoundingClientRect().width>0);if(els[0]){els[0].click();return 'clicked'}return 'not found'})()`, returnByValue: true });
  console.log('扫码tab:', clickScan.result ? clickScan.result.value : clickScan);
  await sleep(3000);

  // 截图
  const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(shot.data, 'base64');
  fs.writeFileSync('C:\\tmp\\xianshi_login.png', buf);
  console.log('截图已保存 C:\\tmp\\xianshi_login.png , 大小', buf.length);

  c.ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
