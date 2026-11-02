// 查 + 杀 edge-cdp-taobao 残留进程
const { execSync, spawnSync } = require('child_process');
const ps = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000 });
  return (r.stdout || '') + (r.stderr || '');
};

(async () => {
  // 查所有 msedge.exe 的命令行，找含 edge-cdp-taobao 的 PID
  const out = ps('powershell', [
    '-NoProfile', '-Command',
    'Get-CimInstance Win32_Process -Filter "name=\'msedge.exe\'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
  ]);
  let procs = [];
  try { procs = JSON.parse(out.trim()); } catch(e) { console.log('解析失败:', out.slice(0,300)); process.exit(1); }
  if (!Array.isArray(procs)) procs = [procs];
  const targets = procs.filter(p => (p.CommandLine || '').includes('edge-cdp-taobao'));
  console.log('edge-cdp-taobao 进程数:', targets.length);
  const pids = targets.map(p => p.ProcessId);
  console.log('PIDs:', pids.join(','));
  if (pids.length) {
    const killOut = ps('taskkill', ['/F', '/T', '/PID', pids.join(' ')].flat());
    // taskkill 不支持多 PID 一次，逐个杀
  }
  // 逐个杀
  for (const pid of pids) {
    const r = ps('taskkill', ['/F', '/T', '/PID', String(pid)]);
    console.log('  杀', pid, ':', r.trim().slice(0,60));
  }
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
