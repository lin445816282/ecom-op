// CDP 实例重启：杀监听端口的进程树 → 用 profile 启动 Edge → 等端口就绪
// 用法：node cdp_restart.js [port] [profile] [target]
// 在 Windows 侧运行（node.exe），用 netstat/taskkill/msedge，避开 PowerShell Get-NetTCPConnection 卡死。
const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const port = process.argv[2];
const profile = process.argv[3];
const target = process.argv[4] || 'https://mms.pinduoduo.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findPid(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8', timeout: 8000 });
    const line = out.split('\n').find(l => l.includes('LISTENING'));
    if (!line) return null;
    const m = line.trim().match(/\s(\d+)\s*$/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

(async () => {
  // 1. 杀监听该端口的进程树
  let killed = false;
  const pid = findPid(port);
  if (pid) {
    try { execSync(`taskkill /F /T /PID ${pid}`, { timeout: 15000 }); killed = true; } catch (e) {}
  }
  await sleep(2000);

  // 2. 启动 Edge（独立 user-data-dir 保留登录态）
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  let edge = null;
  for (const p of edgePaths) { try { if (fs.existsSync(p)) { edge = p; break; } } catch (e) {} }
  if (!edge) { console.log(JSON.stringify({ ok: false, port, error: 'no msedge' })); process.exit(1); }

  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=0.0.0.0',
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    target,
  ];
  try { spawn(edge, args, { detached: true, stdio: 'ignore' }).unref(); } catch (e) {}

  // 3. 等端口就绪（最多 12 秒）
  let alive = false;
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    try {
      const ok = await new Promise((res) => {
        const req = http.get(`http://127.0.0.1:${port}/json`, r => { r.resume(); r.on('end', () => res(true)); });
        req.on('error', () => res(false));
        req.setTimeout(2000, () => { req.destroy(); res(false); });
      });
      if (ok) { alive = true; break; }
    } catch (e) {}
  }

  console.log(JSON.stringify({ ok: true, port, killed, alive }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ ok: false, port, error: e.message })); process.exit(1); });
