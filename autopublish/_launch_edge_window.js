// 用计划任务启动有窗口的 Edge 9222（绕过 WSL GUI 限制）
const { spawnSync } = require('child_process');
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARGS = '--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-allow-origins=* --no-first-run --no-default-browser-check --user-data-dir=C:\\tmp\\edge-cdp-taobao https://myseller.taobao.com/sell/seller/on_sale.htm';

function ps(args) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', args.join(' ')]);
  return (r.stdout || '') + (r.stderr || '');
}

(async () => {
  // 1. 杀残留进程
  ps(['Get-CimInstance Win32_Process -Filter "name=\'msedge.exe\'" | Where-Object {$_.CommandLine -like \'*edge-cdp-taobao*\'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }']);
  console.log('已清理残留进程');
  await sleep(2000);

  // 2. 用计划任务启动（在用户桌面会话，有窗口）
  const launch = ps([
    "$action = New-ScheduledTaskAction -Execute '"+EDGE+"' -Argument '"+ARGS+"'",
    "$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)",
    "Register-ScheduledTask -TaskName 'Edge9222Launch' -Action $action -Trigger $trigger -Force | Out-Null",
    "Start-ScheduledTask -TaskName 'Edge9222Launch'",
    "Start-Sleep -Seconds 8",
    "Unregister-ScheduledTask -TaskName 'Edge9222Launch' -Confirm:$false -ErrorAction SilentlyContinue",
    "Write-Host 'launched'"
  ]);
  console.log('计划任务启动结果:', launch.trim().slice(0,100) || '(空)');

  // 3. 检查端口 + 窗口
  await sleep(3);
  const portOk = await new Promise(res => {
    http.get('http://127.0.0.1:9222/json/version', r => { r.resume(); r.on('end', () => res(true)); }).on('error', () => res(false));
  });
  console.log('9222 端口:', portOk ? '存活' : '未启动');

  const win = ps(['Get-Process msedge | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object Id,MainWindowTitle | ConvertTo-Json -Compress']);
  console.log('有窗口的 msedge:', win.trim() || '(无)');
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
