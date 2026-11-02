// CDP 实例关闭（停止）：只杀监听端口的进程树，不重启
// 用法：node cdp_stop.js [port]
// 在 Windows 侧运行（node.exe），用 netstat/taskkill，避开 PowerShell 卡死。
const { execSync } = require('child_process');

const port = process.argv[2];

function findPid(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8', timeout: 8000 });
    const line = out.split('\n').find(l => l.includes('LISTENING'));
    if (!line) return null;
    const m = line.trim().match(/\s(\d+)\s*$/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

let killed = false;
const pid = findPid(port);
if (pid) {
  try { execSync(`taskkill /F /T /PID ${pid}`, { timeout: 15000 }); killed = true; } catch (e) {}
}

console.log(JSON.stringify({ ok: true, port, killed }));
process.exit(0);
